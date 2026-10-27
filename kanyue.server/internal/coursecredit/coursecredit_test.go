package coursecredit

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/testkit"
)

type tokens struct {
	admin, finance, plain map[string]string
	adminID               string
}

func setup(t *testing.T) (core.App, http.Handler, tokens) {
	t.Helper()
	app := testkit.NewApp(t)
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	teacher := testkit.Create(t, app, "teachers", map[string]any{"email": "ops@example.com", "password": "admin-pass-1"})
	sign := func(isAdmin bool, capabilities ...string) map[string]string {
		value, _ := signer.Sign(teacher.Id, "T1", "teacher", isAdmin,
			auth.Claims{"scope": auth.OpsScope, "courseCreditCapabilities": capabilities}, auth.OpsTokenTTL)
		return testkit.Bearer(value)
	}
	handler := testkit.Serve(t, app, CatalogModule{Signer: signer}.Register, FollowUpsModule{Signer: signer}.Register)
	return app, handler, tokens{admin: sign(true), finance: sign(false, Finance), plain: sign(false, Academic), adminID: teacher.Id}
}

func with(headers map[string]string, key, value string) map[string]string {
	result := map[string]string{key: value}
	for k, v := range headers {
		result[k] = v
	}
	return result
}

func TestCapabilityDenialIsAuditedWithTrace(t *testing.T) {
	app, handler, tokens := setup(t)
	denied := testkit.Call(t, handler, http.MethodGet, "/ops/course-credits/packages", nil, with(tokens.plain, "X-Trace-Id", " trace-1 "))
	if denied.Code() != 403 || denied.Body["errorCode"] != "COURSE_CREDIT_CAPABILITY_REQUIRED" || denied.Body["traceId"] != "trace-1" {
		t.Fatalf("denied = %v", denied.Body)
	}
	if details, _ := denied.Body["details"].(map[string]any); details["capability"] != Finance {
		t.Fatalf("details = %v", denied.Body["details"])
	}
	rows, err := app.FindRecordsByFilter("ops_audit_logs", `outcome="denied"`, "", 0, 0)
	if err != nil || len(rows) != 1 || rows[0].GetString("action") != "course_credit.get" || rows[0].GetString("resourceId") != "/ops/course-credits/packages" {
		t.Fatalf("denial audit = %v, %v", rows, err)
	}
	if allowed := testkit.Call(t, handler, http.MethodGet, "/ops/course-credits/packages", nil, tokens.finance); allowed.Code() != 10000 {
		t.Fatalf("finance capability = %v", allowed.Body)
	}
}

func TestCatalogQueriesPageFilterAndProject(t *testing.T) {
	app, handler, tokens := setup(t)
	spec := testkit.Create(t, app, "course_specs", map[string]any{"code": "c1", "name": "B 课", "deliveryMode": "group", "durationMinutes": 60, "status": "active"})
	testkit.Create(t, app, "course_specs", map[string]any{"code": "c2", "name": "A 课", "deliveryMode": "group", "durationMinutes": 30, "status": "draft"})
	credit := testkit.Create(t, app, "credit_types", map[string]any{"code": "k", "name": "课点", "kind": "course", "courseSpecId": spec.Id, "status": "active"})
	pkg := testkit.Create(t, app, "packages", map[string]any{"code": "p", "name": "课包", "status": "draft"})
	testkit.Create(t, app, "package_grant_lines", map[string]any{"packageId": pkg.Id, "creditTypeId": credit.Id, "quantity": 4})

	list := testkit.Call(t, handler, http.MethodGet, "/ops/course-credits/catalog/course-specs?perPage=1", nil, tokens.admin).Data()
	items, _ := list["items"].([]any)
	first, _ := items[0].(map[string]any)
	if list["totalItems"] != float64(2) || list["totalPages"] != float64(2) || first["name"] != "A 课" || first["defaultCreditTypeId"] != "" {
		t.Fatalf("course specs = %v", list)
	}
	if _, extra := first["metadata"]; extra || len(first) != 10 {
		t.Fatalf("projection must keep exactly the listed fields: %v", first)
	}
	filtered := testkit.Call(t, handler, http.MethodGet, "/ops/course-credits/catalog/course-specs?status=draft", nil, tokens.admin).Data()
	if filtered["totalItems"] != float64(1) {
		t.Fatalf("status filter = %v", filtered)
	}
	lines := testkit.Call(t, handler, http.MethodGet, "/ops/course-credits/package-grant-lines?creditTypeId="+credit.Id, nil, tokens.admin).Data()
	if lines["totalItems"] != float64(1) {
		t.Fatalf("grant line filter = %v", lines)
	}
	got := testkit.Call(t, handler, http.MethodGet, "/ops/course-credits/catalog/credit-types/"+credit.Id, nil, tokens.admin).Data()
	if got["courseSpecId"] != spec.Id || got["consumable"] != false || got["referenceUnitValue"] != float64(0) {
		t.Fatalf("credit type = %v", got)
	}

	failures := map[string]string{
		"/ops/course-credits/catalog/course-specs?status=gone": "OPS_FILTER_STATUS_INVALID",
		"/ops/course-credits/packages?perPage=101":             "PER_PAGE_INVALID",
		"/ops/course-credits/packages?page=1.5":                "PAGINATION_INVALID",
		"/ops/course-credits/price-versions/missing":           "OPS_RESOURCE_NOT_FOUND",
	}
	for url, code := range failures {
		result := testkit.Call(t, handler, http.MethodGet, url, nil, tokens.admin)
		if result.Code() != 400 || result.Body["errorCode"] != code {
			t.Fatalf("%s = %v", url, result.Body)
		}
	}
}

func TestCatalogCommandsValidateWriteAndAudit(t *testing.T) {
	app, handler, tokens := setup(t)
	credit := testkit.Create(t, app, "credit_types", map[string]any{"code": "k", "name": "课点", "kind": "universal", "status": "active"})

	unknown := testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/packages",
		map[string]any{"zeta": 1, "code": "p", "alpha": 2}, tokens.admin)
	if details, _ := unknown.Body["details"].(map[string]any); unknown.Body["errorCode"] != "ADMIN_RESOURCE_FIELD_INVALID" || len(details["fields"].([]any)) != 2 {
		t.Fatalf("unknown fields = %v", unknown.Body)
	}
	deadline := testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/packages", map[string]any{
		"code": "p", "name": "十节", "saleChannel": "all", "activationMode": "FIRST_RESERVATION",
		"expiryPolicy": "NO_EXPIRY", "status": "draft",
	}, tokens.admin)
	if deadline.Body["errorCode"] != "PACKAGE_ACTIVATION_DEADLINE_REQUIRED" {
		t.Fatalf("missing activation deadline = %v", deadline.Body)
	}

	created := testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/packages", map[string]any{
		"code": "p", "name": "十节", "saleChannel": "all", "activationMode": "GRANT_TIME",
		"expiryPolicy": "FIXED_DURATION", "validityDurationDays": "180", "status": "draft",
	}, with(tokens.finance, "X-Trace-Id", "t-create"))
	data := created.Data()
	packageID, _ := data["id"].(string)
	if created.Code() != 10000 || len(packageID) != 15 || data["status"] != "draft" || data["operationId"] != nil || data["traceId"] != "t-create" {
		t.Fatalf("create package = %v", created.Body)
	}
	if stored, _ := app.FindRecordById("packages", packageID); stored == nil || stored.GetInt("validityDurationDays") != 180 {
		t.Fatalf("stored package = %v", stored)
	}

	publish := testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/packages/"+packageID+"/status", map[string]any{"status": "active"}, tokens.admin)
	if publish.Body["errorCode"] != "PACKAGE_GRANT_LINES_REQUIRED" {
		t.Fatalf("publish without lines = %v", publish.Body)
	}
	line := map[string]any{"packageId": packageID, "creditTypeId": credit.Id, "quantity": 10}
	if result := testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/grant-lines", line, tokens.admin); result.Code() != 10000 {
		t.Fatalf("grant line = %v", result.Body)
	}
	duplicate := testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/grant-lines", line, tokens.admin)
	if duplicate.Code() != 400 || duplicate.Body["errorCode"] != "COURSE_CREDIT_INTERNAL_ERROR" || duplicate.Body["message"] != "Batch transaction failed." {
		t.Fatalf("duplicate grant line = %v", duplicate.Body)
	}
	if publish := testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/packages/"+packageID+"/status", map[string]any{"status": "active"}, tokens.admin); publish.Body["errorCode"] != "PACKAGE_ACTIVE_PRICE_REQUIRED" {
		t.Fatalf("publish without price = %v", publish.Body)
	}

	price := map[string]any{"packageId": packageID, "currency": "CNY", "listAmount": 1000, "saleAmount": 1200,
		"validFrom": "2026-01-01", "version": 1, "status": "active"}
	if result := testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/price-versions", price, tokens.admin); result.Body["errorCode"] != "PRICE_SALE_AMOUNT_INVALID" {
		t.Fatalf("sale above list = %v", result.Body)
	}
	price["saleAmount"], price["validTo"] = 900, "2025-12-31"
	if result := testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/price-versions", price, tokens.admin); result.Body["errorCode"] != "PRICE_VALID_TO_INVALID" {
		t.Fatalf("validTo before validFrom = %v", result.Body)
	}
	delete(price, "validTo")
	firstPrice := testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/price-versions", price, tokens.admin).Data()
	priceID, _ := firstPrice["id"].(string)

	revised := testkit.Call(t, handler, http.MethodPatch, "/ops/course-operations/price-versions/"+priceID, map[string]any{"saleAmount": 800}, tokens.admin).Data()
	if revised["previousId"] != priceID || revised["version"] != float64(2) || revised["id"] == priceID {
		t.Fatalf("price revision = %v", revised)
	}
	if original, _ := app.FindRecordById("price_versions", priceID); original.GetFloat("saleAmount") != 900 {
		t.Fatal("a price revision must leave the previous version untouched")
	}

	if result := testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/packages/"+packageID+"/status", map[string]any{"status": "active"}, tokens.admin); result.Data()["status"] != "active" {
		t.Fatalf("publish = %v", result.Body)
	}
	if result := testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/packages/"+packageID+"/status", map[string]any{"status": "gone"}, tokens.admin); result.Body["errorCode"] != "ADMIN_RESOURCE_STATUS_INVALID" {
		t.Fatalf("bad status = %v", result.Body)
	}
	if result := testkit.Call(t, handler, http.MethodPatch, "/ops/course-operations/packages/missing", map[string]any{}, tokens.admin); result.Code() != 404 {
		t.Fatalf("update missing = %v", result.Body)
	}

	audits, _ := app.FindRecordsByFilter("ops_audit_logs", `action~"course_operations."`, "@rowid", 0, 0)
	actions := []string{}
	for _, row := range audits {
		actions = append(actions, row.GetString("action")+":"+row.GetString("actorRole"))
	}
	want := "course_operations.packages.create:teacher,course_operations.grantLines.create:admin," +
		"course_operations.priceVersions.create:admin,course_operations.priceVersions.create_revision:admin," +
		"course_operations.packages.update:admin"
	if strings.Join(actions, ",") != want {
		t.Fatalf("audits = %v", actions)
	}
}

func TestInvalidJSONBody(t *testing.T) {
	_, handler, tokens := setup(t)
	for body, message := range map[string]string{"": "请求体必须是有效的 JSON 对象", "[1]": "请求体必须是 JSON 对象"} {
		request := testkit.Raw(t, handler, http.MethodPost, "/ops/course-operations/course-specs", body, tokens.admin)
		if request.Code() != 400 || request.Body["errorCode"] != "INVALID_JSON_BODY" || request.Body["message"] != message {
			t.Fatalf("body %q = %v", body, request.Body)
		}
	}
}

func TestFollowUpsRecordAndList(t *testing.T) {
	app, handler, tokens := setup(t)
	student := testkit.Create(t, app, "students", map[string]any{"realName": "学员"})
	path := "/ops/course-credits/students/" + student.Id + "/follow-ups"
	future := time.Now().Add(48 * time.Hour).UTC().Format("2006-01-02")

	for body, code := range map[string]string{
		`{"status":"maybe","snoozeUntil":"` + future + `"}`: "FOLLOW_UP_STATUS_INVALID",
		`{"status":"contacted","snoozeUntil":"2020-01-01"}`: "FOLLOW_UP_SNOOZE_INVALID",
		`{"status":"contacted"}`:                            "FOLLOW_UP_SNOOZE_INVALID",
	} {
		if result := testkit.Raw(t, handler, http.MethodPost, path, body, tokens.admin); result.Body["errorCode"] != code {
			t.Fatalf("%s = %v", body, result.Body)
		}
	}
	missing := testkit.Raw(t, handler, http.MethodPost, "/ops/course-credits/students/nobody/follow-ups",
		`{"status":"declined","snoozeUntil":"`+future+`"}`, tokens.admin)
	if missing.Code() != 404 || missing.Body["errorCode"] != "COURSE_CREDIT_INTERNAL_ERROR" {
		t.Fatalf("missing student = %v", missing.Body)
	}

	note := strings.Repeat("音", 310)
	recorded := testkit.Call(t, handler, http.MethodPost, path, map[string]any{"status": "declined", "snoozeUntil": future, "note": " " + note}, tokens.finance).Data()
	if recorded["status"] != "declined" || len([]rune(recorded["note"].(string))) != 300 || recorded["snoozeUntil"] != future+"T00:00:00.000Z" || recorded["operationId"] != nil {
		t.Fatalf("recorded = %v", recorded)
	}
	listed := testkit.Call(t, handler, http.MethodGet, path, nil, tokens.finance).Data()
	items, _ := listed["items"].([]any)
	if len(items) != 1 {
		t.Fatalf("follow-ups = %v", listed)
	}
	item, _ := items[0].(map[string]any)
	if item["id"] != recorded["id"] || item["studentId"] != student.Id || item["actorId"] != tokens.adminID || item["created"] == nil {
		t.Fatalf("follow-up = %v", item)
	}
	row, _ := app.FindRecordById("ops_audit_logs", recorded["id"].(string))
	if row == nil || row.GetString("actorRole") != "teacher" || row.GetString("action") != followUpAction {
		t.Fatalf("stored follow-up = %v", row)
	}
}
