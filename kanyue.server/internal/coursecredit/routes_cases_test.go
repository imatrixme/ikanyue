package coursecredit

import (
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/testkit"
)

// Course-credit route cases ported from Hono's courseCreditRoutes tests. Go routes run
// the real services, so forwarded metadata is checked on the stored operations.

func (f ledgerFixture) paidOrder(t *testing.T) string {
	t.Helper()
	return testkit.Create(t, f.app, "orders", map[string]any{
		"orderNo": "O-1", "studentId": f.studentID, "payerId": f.studentID, "type": "package_purchase", "channel": "admin",
		"status": "paid", "currency": "CNY", "listAmount": 500, "paidAmount": 500, "priceVersionId": f.priceID, "version": 1,
		"idempotencyKey": "order-1", "productSnapshot": map[string]any{"packageId": f.packageID},
		"grantSnapshot": map[string]any{"activationMode": "GRANT_TIME", "expiryPolicy": "NO_EXPIRY",
			"lines": []any{map[string]any{"creditTypeId": f.creditTypeID, "quantity": 5, "listUnitValue": 100, "paidUnitCost": 100}}},
	}).Id
}

// Hono: courseCreditRoutes › admin order grant route forwards authenticated actor, idempotency key, and trace id
func TestGrantRouteForwardsAuthenticatedMetadata(t *testing.T) {
	f := ledgerSetup(t, true)
	handler, signer := adminRoutes(t, f)
	admin := f.operatorID(t)
	headers := override(override(opsHeaders(t, signer, admin, true), "Idempotency-Key", "grant-key"), "X-Trace-Id", "trace-1")
	order := f.paidOrder(t)
	result := ok(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/orders/"+order+"/grant", nil, headers), "grant")
	if result["traceId"] != "trace-1" || result["operationId"] == nil {
		t.Fatalf("result = %v", result)
	}
	operation := findFirstMap(t, f.app, "credit_operations", `id="`+result["operationId"].(string)+`"`)
	if operation["actorId"] != admin || operation["actorRole"] != "admin" || operation["traceId"] != "trace-1" ||
		!strings.Contains(operation["idempotencyKey"].(string), "grant-key") || operation["sourceId"] != order {
		t.Fatalf("operation = %v", operation)
	}
}

// override is with() where the new value wins over an existing header.
func override(headers map[string]string, key, value string) map[string]string {
	result := map[string]string{}
	for k, v := range headers {
		result[k] = v
	}
	result[key] = value
	return result
}

func findFirstMap(t *testing.T, app core.App, collection, filter string) map[string]any {
	t.Helper()
	row, err := findFirst(app, collection, filter)
	if err != nil || row == nil {
		t.Fatalf("%s %s = %v, %v", collection, filter, row, err)
	}
	return row
}

// Hono: courseCreditRoutes › grant route rejects non-admin operators before loading course-credit services
func TestGrantRouteRejectsNonFinanceOperators(t *testing.T) {
	f := ledgerSetup(t, true)
	handler, signer := adminRoutes(t, f)
	order := f.paidOrder(t)
	failed(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/orders/"+order+"/grant", nil,
		opsHeaders(t, signer, f.operatorID(t), false)), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "teacher")
	denial := findFirstMap(t, f.app, "ops_audit_logs", `outcome="denied"`)
	if denial["action"] != "course_credit.post" || denial["metadata"].(map[string]any)["capability"] != Finance {
		t.Fatalf("denial = %v", denial)
	}
	if f.count(t, "credit_operations", "") != 0 || findFirstMap(t, f.app, "orders", `id="`+order+`"`)["status"] != "paid" {
		t.Fatal("denied grant wrote")
	}
}

// Hono: courseCreditRoutes › authorization remains denied when the audit sink is unavailable
func TestAuthorizationDeniedWithoutAuditSink(t *testing.T) {
	f := ledgerSetup(t, true)
	handler, signer := adminRoutes(t, f)
	f.app.OnRecordCreateExecute("ops_audit_logs").BindFunc(func(*core.RecordEvent) error { return errors.New("audit unavailable") })
	failed(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/orders/order/grant", nil,
		opsHeaders(t, signer, "teacher", false)), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "teacher")
}

// Hono: courseCreditRoutes › scoped academic operators can manage classes but cannot grant financial credits
func TestAcademicOperatorsCannotGrant(t *testing.T) {
	f := ledgerSetup(t, true)
	handler, signer := adminRoutes(t, f)
	academic := opsHeaders(t, signer, "teacher-1", false, Academic)
	ok(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/classes/"+f.classID+"/students/"+f.studentID+"/membership",
		map[string]any{"status": "active", "effectiveFrom": "2026-07-17T10:00:00Z"}, academic), "membership")
	failed(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/orders/"+f.paidOrder(t)+"/grant", nil, academic),
		403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "grant")
	if f.count(t, "credit_batches", "") != 0 {
		t.Fatal("academic operator granted credits")
	}
}

// Hono: courseCreditRoutes › admin teaching routes forward authenticated metadata and JSON command fields
func TestTeachingRoutesForwardMetadata(t *testing.T) {
	f := membershipSetup(t)
	handler, signer := adminRoutes(t, f.ledgerFixture)
	admin := f.operatorID(t)
	headers := override(opsHeaders(t, signer, admin, true), "X-Trace-Id", "trace-teaching")
	post := func(path, key string, body map[string]any) map[string]any {
		return ok(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/"+path, body, override(headers, "Idempotency-Key", key)), path)
	}
	order := f.paidOrder(t)
	results := []map[string]any{
		post("classes/"+f.classID+"/students/"+f.studentID+"/membership", "membership",
			map[string]any{"status": "active", "effectiveFrom": "2026-08-01T00:00:00Z", "sourceOrderId": order}),
		post("classes/"+f.classID+"/teachers/"+admin+"/assignment", "teacher",
			map[string]any{"role": "lead", "status": "active", "effectiveFrom": "2026-08-01T00:00:00Z"}),
		post("classes/"+f.classID+"/students/"+f.studentID+"/transfer", "transfer",
			map[string]any{"toClassId": f.otherClassID, "effectiveAt": "2026-09-01T00:00:00Z"}),
	}
	for _, result := range results {
		operation := findFirstMap(t, f.app, "credit_operations", `id="`+result["operationId"].(string)+`"`)
		if operation["actorId"] != admin || operation["actorRole"] != "admin" || operation["traceId"] != "trace-teaching" {
			t.Fatalf("operation = %v", operation)
		}
	}
	if member := findFirstMap(t, f.app, "class_students", `classId="`+f.classID+`"`); member["sourceOrderId"] != order {
		t.Fatalf("membership = %v", member)
	}
	if moved := findFirstMap(t, f.app, "class_students", `classId="`+f.otherClassID+`"`); moved["effectiveFrom"] != "2026-09-01 00:00:00.000Z" {
		t.Fatalf("transfer = %v", moved)
	}

	draft := put(t, f.app, "sessions", map[string]any{"code": "draft", "title": "草稿课", "status": "draft",
		"startAt": "2099-08-10 10:00:00.000Z", "endAt": "2099-08-10 11:00:00.000Z", "requiredCreditTypeId": f.creditTypeID,
		"requiredQuantity": 1, "originType": "class", "version": 1,
		"attendanceRuleSnapshot": map[string]any{"version": 1, "present": "consume", "late": "consume", "leave": "release", "absent": "consume"},
		"settlementRuleSnapshot": map[string]any{"version": 1, "cancelled": "release"},
		"teacherRuleSnapshot": map[string]any{"version": 1, "rules": map[string]any{"lead": map[string]any{"ruleId": "rule1",
			"courseSpecId": f.specID, "baseQuantity": 1, "durationFactor": 0, "participantFactor": 0}}}}).Id
	other := put(t, f.app, "teachers", map[string]any{"email": "sub@example.com", "password": "secret-password"}).Id
	published := post("sessions/"+draft+"/publish", "publish", map[string]any{"classIds": []any{f.otherClassID},
		"teacherOverrides": []any{map[string]any{"teacherId": other, "role": "lead", "assignmentSource": "substitute"}}})
	if findFirstMap(t, f.app, "credit_operations", `id="`+published["operationId"].(string)+`"`)["traceId"] != "trace-teaching" ||
		findFirstMap(t, f.app, "session_teachers", `sessionId="`+draft+`" && teacherId="`+other+`"`)["assignmentSource"] != "substitute" {
		t.Fatalf("published = %v", published)
	}
}

// Hono: courseCreditRoutes › admin teaching routes reject malformed JSON before loading services
func TestTeachingRoutesRejectMalformedJSON(t *testing.T) {
	f := ledgerSetup(t, true)
	handler, signer := adminRoutes(t, f)
	result := testkit.Raw(t, handler, http.MethodPost, "/ops/course-credits/sessions/"+f.sessionID+"/publish", "{",
		with(opsHeaders(t, signer, f.operatorID(t), true), "Content-Type", "application/json"))
	if result.Code() != 400 || result.Body["errorCode"] != "INVALID_JSON_BODY" {
		t.Fatalf("result = %v", result.Body)
	}
	if f.count(t, "credit_operations", "") != 0 {
		t.Fatal("malformed body wrote")
	}
}

// Hono: courseCreditRoutes › course-credit routes preserve business codes and normalize storage failures
func TestRoutesPreserveBusinessCodesAndNormalizeStorage(t *testing.T) {
	f := ledgerSetup(t, true)
	handler, signer := adminRoutes(t, f)
	admin := opsHeaders(t, signer, f.operatorID(t), true)
	delete(admin, "Idempotency-Key")
	delete(admin, "X-Trace-Id")
	order := f.paidOrder(t)
	missingKey := testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/orders/"+order+"/grant", nil, admin)
	if missingKey.Code() != 400 || missingKey.Body["errorCode"] != "IDEMPOTENCY_KEY_REQUIRED" || missingKey.Body["operationId"] != nil ||
		len(missingKey.Body["traceId"].(string)) != 36 {
		t.Fatalf("missing key = %v", missingKey.Body)
	}

	f.app.OnRecordCreateExecute("credit_operations").BindFunc(func(*core.RecordEvent) error { return errors.New("PocketBase unavailable") })
	storage := testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/orders/"+order+"/grant", nil, with(admin, "Idempotency-Key", "grant"))
	if storage.Code() < 400 || storage.Body["errorCode"] == nil || strings.Contains(storage.Body["message"].(string), "PocketBase unavailable") {
		t.Fatalf("storage = %v", storage.Body)
	}
}

// Hono: courseCreditRoutes › course-credit handler helpers cover authorization and unknown failures
func TestRouteHelpersCoverAuthorizationAndUnknownFailures(t *testing.T) {
	f := ledgerSetup(t, true)
	handler := testkit.Serve(t, f.app, func(se *core.ServeEvent) {
		se.Router.GET("/test/forbidden", func(e *core.RequestEvent) error {
			return Command(e, "forbidden", func() (map[string]any, error) { return nil, Fail("SESSION_STUDENT_FORBIDDEN", "forbidden", nil) })
		})
		se.Router.GET("/test/unknown", func(e *core.RequestEvent) error {
			return Command(e, "unknown", func() (map[string]any, error) { return nil, errors.New("unknown") })
		})
		se.Router.GET("/test/empty", func(e *core.RequestEvent) error {
			return Command(e, "empty", func() (map[string]any, error) { return nil, nil })
		})
	})
	if forbidden := testkit.Call(t, handler, http.MethodGet, "/test/forbidden", nil, nil); forbidden.Code() != 403 {
		t.Fatalf("forbidden = %v", forbidden.Body)
	}
	if unknown := testkit.Call(t, handler, http.MethodGet, "/test/unknown", nil, nil); unknown.Code() != 500 || unknown.Body["errorCode"] != "COURSE_CREDIT_INTERNAL_ERROR" {
		t.Fatalf("unknown = %v", unknown.Body)
	}
	empty := testkit.Call(t, handler, http.MethodGet, "/test/empty", nil, map[string]string{"X-Trace-Id": "trace"})
	if data := empty.Data(); data["operationId"] != nil || data["traceId"] != "trace" {
		t.Fatalf("empty = %v", empty.Body)
	}
}
