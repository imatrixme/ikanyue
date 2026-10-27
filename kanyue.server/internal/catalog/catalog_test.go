package catalog

import (
	"net/http"
	"testing"
	"time"

	"kanyue.server/internal/testkit"
)

func TestCatalogProjectsCurrentPricesAndCourseLinks(t *testing.T) {
	app := testkit.NewApp(t)
	now := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)

	spec := testkit.Create(t, app, "course_specs", map[string]any{
		"code": "vocal-1v1", "name": "声乐一对一", "deliveryMode": "one_to_one",
		"durationMinutes": 45, "teacherTier": "senior", "status": "active",
	})
	testkit.Create(t, app, "course_specs", map[string]any{"code": "draft", "name": "草稿课", "status": "draft"})
	credit := testkit.Create(t, app, "credit_types", map[string]any{
		"code": "vocal", "name": "声乐课点", "kind": "course", "courseSpecId": spec.Id, "status": "active",
	})
	universal := testkit.Create(t, app, "credit_types", map[string]any{
		"code": "any", "name": "通用课点", "kind": "universal", "unitLabel": "点", "status": "active",
	})
	sold := testkit.Create(t, app, "packages", map[string]any{
		"code": "p10", "name": "十节课", "saleChannel": "wechat", "activationMode": "GRANT_TIME",
		"expiryPolicy": "FIXED_DURATION", "validityDurationDays": 180, "status": "active",
	})
	unpriced := testkit.Create(t, app, "packages", map[string]any{"code": "p0", "name": "未定价", "status": "active"})
	testkit.Create(t, app, "package_grant_lines", map[string]any{"packageId": sold.Id, "creditTypeId": credit.Id, "quantity": 10})
	testkit.Create(t, app, "package_grant_lines", map[string]any{"packageId": sold.Id, "creditTypeId": universal.Id, "quantity": 2})
	testkit.Create(t, app, "package_grant_lines", map[string]any{"packageId": unpriced.Id, "creditTypeId": credit.Id, "quantity": 1})
	for _, price := range []map[string]any{
		{"validFrom": "2026-01-01 00:00:00.000Z", "version": 1, "saleAmount": 1000},
		{"validFrom": "2026-03-01 00:00:00.000Z", "version": 1, "saleAmount": 1100},
		{"validFrom": "2026-03-01 00:00:00.000Z", "version": 2, "saleAmount": 1200},
		{"validFrom": "2026-06-01 00:00:00.000Z", "version": 3, "saleAmount": 1300},
		{"validFrom": "2026-04-01 00:00:00.000Z", "validTo": "2026-04-30 00:00:00.000Z", "version": 9, "saleAmount": 1400},
	} {
		price["packageId"], price["currency"], price["listAmount"], price["status"] = sold.Id, "CNY", 1500, "active"
		testkit.Create(t, app, "price_versions", price)
	}

	handler := testkit.Serve(t, app, Module{Now: func() time.Time { return now }}.Register)

	full := testkit.Call(t, handler, http.MethodGet, "/v1/public/course-catalog", nil, nil)
	courses := full.Data()["courses"].([]any)
	packages := full.Data()["packages"].([]any)
	if len(courses) != 1 || len(packages) != 1 {
		t.Fatalf("want 1 active course and 1 priced package, got %v", full.Body)
	}
	course := courses[0].(map[string]any)
	if codes := course["packageCodes"].([]any); len(codes) != 1 || codes[0] != "p10" {
		t.Fatalf("packageCodes = %v", codes)
	}
	pkg := packages[0].(map[string]any)
	if sale := pkg["price"].(map[string]any)["saleAmount"]; sale != float64(1200) {
		t.Fatalf("current price picks latest validFrom then version, got %v", sale)
	}
	if pkg["purchaseMode"] != "mini_program" {
		t.Fatalf("purchaseMode = %v", pkg["purchaseMode"])
	}
	grants := map[string]map[string]any{}
	for _, item := range pkg["grants"].([]any) {
		grant := item.(map[string]any)
		grants[grant["creditName"].(string)] = grant
	}
	course1, anyCredit := grants["声乐课点"], grants["通用课点"]
	if course1["courseCode"] != "vocal-1v1" || course1["unitLabel"] != "课点" || anyCredit["courseCode"] != nil || anyCredit["unitLabel"] != "点" {
		t.Fatalf("grants = %v", grants)
	}

	detail := testkit.Call(t, handler, http.MethodGet, "/v1/public/course-catalog/courses/vocal-1v1", nil, nil)
	if list := detail.Data()["packages"].([]any); len(list) != 1 {
		t.Fatalf("course detail packages = %v", detail.Body)
	}
	missing := testkit.Call(t, handler, http.MethodGet, "/v1/public/course-catalog/packages/p0", nil, nil)
	if missing.Status != http.StatusOK || missing.Code() != 404 || missing.Body["errorCode"] != "PUBLIC_PACKAGE_NOT_FOUND" || missing.Body["message"] != "公开课包不存在" {
		t.Fatalf("unpriced package should be hidden: %v", missing.Body)
	}
}

func TestCatalogUnavailableWhenSchemaMissing(t *testing.T) {
	app := testkit.NewApp(t)
	collection, err := app.FindCollectionByNameOrId("price_versions")
	if err != nil {
		t.Fatal(err)
	}
	// Ledger collections reference price_versions, so hide it by renaming instead of deleting.
	collection.Name = "price_versions_missing"
	if err := app.Save(collection); err != nil {
		t.Fatal(err)
	}
	handler := testkit.Serve(t, app, Module{}.Register)
	result := testkit.Call(t, handler, http.MethodGet, "/v1/public/course-catalog", nil, nil)
	if result.Code() != 500 || result.Body["errorCode"] != "PUBLIC_CATALOG_UNAVAILABLE" || result.Body["message"] != "公开课程暂时不可用" {
		t.Fatalf("got %v", result.Body)
	}
}
