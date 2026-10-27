package catalog

import (
	"encoding/json"
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/testkit"
)

// Public catalog cases ported from Hono's courseCreditPublicCatalog tests, over the
// same records stored in PocketBase.

var catalogNow = time.Date(2026, 8, 17, 12, 0, 0, 0, time.UTC)

func catalogSetup(t *testing.T) (core.App, http.Handler) {
	t.Helper()
	app := testkit.NewApp(t)
	course := testkit.Create(t, app, "course_specs", map[string]any{"code": "VOCAL-60", "name": "成人声乐一对一",
		"deliveryMode": "one_to_one", "durationMinutes": 60, "teacherTier": "senior", "status": "active"})
	testkit.Create(t, app, "course_specs", map[string]any{"code": "DRAFT-COURSE", "name": "草稿", "status": "draft"})
	pack := testkit.Create(t, app, "packages", map[string]any{"code": "VOCAL-10", "name": "成人声乐十节课包", "description": "十节系统训练",
		"saleChannel": "admin", "activationMode": "FIRST_CHECK_IN", "activationDeadlineDays": 30, "validityDurationDays": 180,
		"expiryPolicy": "FIXED_DURATION", "status": "active"})
	expired := testkit.Create(t, app, "packages", map[string]any{"code": "EXPIRED-PACKAGE", "name": "已过期", "saleChannel": "website",
		"activationMode": "GRANT_TIME", "expiryPolicy": "NO_EXPIRY", "status": "active"})
	credit := testkit.Create(t, app, "credit_types", map[string]any{"code": "vocal", "name": "成人声乐课点", "kind": "course",
		"courseSpecId": course.Id, "unitLabel": "课时", "status": "active"})
	testkit.Create(t, app, "package_grant_lines", map[string]any{"packageId": pack.Id, "creditTypeId": credit.Id, "quantity": 10})
	for _, changes := range []map[string]any{
		{"packageId": pack.Id, "status": "inactive", "version": 9},
		{"packageId": pack.Id},
		{"packageId": expired.Id, "validTo": "2026-08-16 00:00:00.000Z"},
	} {
		testkit.Create(t, app, "price_versions", priceFields(changes))
	}
	return app, testkit.Serve(t, app, Module{Now: func() time.Time { return catalogNow }}.Register)
}

func priceFields(changes map[string]any) map[string]any {
	fields := map[string]any{"currency": "CNY", "listAmount": 3000, "saleAmount": 2800, "validFrom": "2026-08-01 00:00:00.000Z",
		"version": 1, "status": "active", "grantSnapshot": map[string]any{"private": true}}
	for key, value := range changes {
		fields[key] = value
	}
	return fields
}

func roundTrip(t *testing.T, value any) any {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	var decoded any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	return decoded
}

// Hono: courseCreditPublicCatalog › public catalog projects only active courses, current prices, validity, and grant summaries
func TestPublicCatalogProjection(t *testing.T) {
	app, _ := catalogSetup(t)
	catalog, err := Build(app, catalogNow)
	if err != nil {
		t.Fatal(err)
	}
	if len(catalog.Courses) != 1 || len(catalog.Packages) != 1 {
		t.Fatalf("catalog = %+v", catalog)
	}
	if got := roundTrip(t, catalog.Courses[0]); !reflect.DeepEqual(got, map[string]any{"code": "VOCAL-60", "deliveryMode": "one_to_one",
		"durationMinutes": 60.0, "name": "成人声乐一对一", "packageCodes": []any{"VOCAL-10"}, "teacherTier": "senior"}) {
		t.Fatalf("course = %v", got)
	}
	if got := roundTrip(t, catalog.Packages[0]); !reflect.DeepEqual(got, map[string]any{"code": "VOCAL-10", "description": "十节系统训练",
		"grants": []any{map[string]any{"courseCode": "VOCAL-60", "courseName": "成人声乐一对一", "creditName": "成人声乐课点",
			"quantity": 10.0, "unitLabel": "课时"}},
		"name": "成人声乐十节课包", "price": map[string]any{"currency": "CNY", "listAmount": 3000.0, "saleAmount": 2800.0},
		"purchaseMode": "contact", "validity": map[string]any{"activationDeadlineDays": 30.0, "activationMode": "FIRST_CHECK_IN",
			"expiryPolicy": "FIXED_DURATION", "validityDurationDays": 180.0}}) {
		t.Fatalf("package = %v", got)
	}
	raw, _ := json.Marshal(catalog)
	for _, private := range []string{"studentId", "balance", "roster", "orderNo", "payerId", "teacherId",
		"teacherCredit", "grantSnapshot", "metadata", "idempotencyKey"} {
		if strings.Contains(string(raw), private) {
			t.Fatalf("%s leaked", private)
		}
	}
}

// Hono: courseCreditPublicCatalog › course and package details reject unpublished or unknown records
// Hono: courseCreditPublicCatalog › public routes require no bearer token and preserve safe not-found errors
func TestPublicCatalogDetails(t *testing.T) {
	_, handler := catalogSetup(t)
	get := func(path string) testkit.Response {
		return testkit.Call(t, handler, http.MethodGet, "/v1/public/course-catalog"+path, nil, nil)
	}
	if result := get(""); result.Code() != 10000 {
		t.Fatalf("catalog = %v", result.Body)
	}
	if packages := get("/courses/VOCAL-60").Data()["packages"].([]any); packages[0].(map[string]any)["code"] != "VOCAL-10" {
		t.Fatalf("course packages = %v", packages)
	}
	if detail := get("/packages/VOCAL-10").Data(); detail["code"] != "VOCAL-10" || detail["name"] != "成人声乐十节课包" {
		t.Fatalf("package = %v", detail)
	}
	for path, code := range map[string]string{
		"/courses/DRAFT-COURSE":     "PUBLIC_COURSE_NOT_FOUND",
		"/packages/EXPIRED-PACKAGE": "PUBLIC_PACKAGE_NOT_FOUND",
		"/packages/missing":         "PUBLIC_PACKAGE_NOT_FOUND",
	} {
		if result := get(path); result.Code() != 404 || result.Body["errorCode"] != code {
			t.Fatalf("%s = %v", path, result.Body)
		}
	}
}

// Hono: courseCreditPublicCatalog › catalog helpers select valid latest prices and build unique package links
func TestPublicCatalogCurrentPrice(t *testing.T) {
	app := testkit.NewApp(t)
	pack := testkit.Create(t, app, "packages", map[string]any{"code": "P1", "name": "课包", "status": "active"})
	prices := []*core.Record{}
	for _, changes := range []map[string]any{
		{"saleAmount": 1, "validTo": "2026-08-16 00:00:00.000Z", "version": 9},
		{"saleAmount": 2, "version": 1},
		{"saleAmount": 3, "version": 2},
		{"saleAmount": 4, "validFrom": "2026-08-18 00:00:00.000Z", "version": 3},
		{"saleAmount": 5, "validFrom": "", "version": 4},
	} {
		changes["packageId"] = pack.Id
		prices = append(prices, testkit.Create(t, app, "price_versions", priceFields(changes)))
	}
	if current := currentPrice(pack.Id, prices, catalogNow); current == nil || current.GetFloat("saleAmount") != 3 {
		t.Fatalf("current = %v", current)
	}
	if currentPrice(pack.Id, nil, catalogNow) != nil {
		t.Fatal("empty prices must have no current price")
	}
	// Equal validFrom and version keep the first stored price.
	same := []*core.Record{
		testkit.Create(t, app, "price_versions", priceFields(map[string]any{"packageId": pack.Id, "saleAmount": 6, "version": 0})),
		testkit.Create(t, app, "price_versions", priceFields(map[string]any{"packageId": pack.Id, "saleAmount": 7, "version": 0})),
	}
	if current := currentPrice(pack.Id, same, catalogNow); current.GetFloat("saleAmount") != 6 {
		t.Fatalf("tie = %v", current.GetFloat("saleAmount"))
	}

	// A course granted twice by one package links it once.
	course := testkit.Create(t, app, "course_specs", map[string]any{"code": "C1", "name": "课", "status": "active"})
	for _, name := range []string{"a", "b"} {
		credit := testkit.Create(t, app, "credit_types", map[string]any{"code": name, "name": name, "kind": "course", "courseSpecId": course.Id, "status": "active"})
		testkit.Create(t, app, "package_grant_lines", map[string]any{"packageId": pack.Id, "creditTypeId": credit.Id, "quantity": 1})
	}
	catalog, err := Build(app, catalogNow)
	if err != nil || !reflect.DeepEqual(catalog.Courses[0].PackageCodes, []string{"P1"}) {
		t.Fatalf("links = %+v, %v", catalog.Courses, err)
	}
}

// Hono: courseCreditPublicCatalog › public projections keep sparse legacy catalog records safe and explicit
func TestPublicCatalogSparseRecords(t *testing.T) {
	app := testkit.NewApp(t)
	testkit.Create(t, app, "course_specs", map[string]any{"code": "ORPHAN", "status": "active"})
	draft := testkit.Create(t, app, "course_specs", map[string]any{"code": "HIDDEN", "status": "draft"})
	pack := testkit.Create(t, app, "packages", map[string]any{"saleChannel": "wechat", "status": "active"})
	testkit.Create(t, app, "packages", map[string]any{"code": "NO-PRICE", "status": "active"})
	inactive := testkit.Create(t, app, "credit_types", map[string]any{"code": "old", "name": "停用", "kind": "course", "status": "inactive"})
	credit := testkit.Create(t, app, "credit_types", map[string]any{"code": "sparse", "kind": "course", "courseSpecId": draft.Id, "status": "active"})
	testkit.Create(t, app, "package_grant_lines", map[string]any{"packageId": pack.Id, "creditTypeId": inactive.Id, "quantity": 1})
	testkit.Create(t, app, "package_grant_lines", map[string]any{"packageId": pack.Id, "creditTypeId": credit.Id})
	testkit.Create(t, app, "price_versions", priceFields(map[string]any{"packageId": pack.Id, "currency": "", "listAmount": 0, "saleAmount": 0}))

	catalog, err := Build(app, catalogNow)
	if err != nil {
		t.Fatal(err)
	}
	if len(catalog.Courses) != 1 || !reflect.DeepEqual(roundTrip(t, catalog.Courses[0]), map[string]any{"code": "ORPHAN", "deliveryMode": "",
		"durationMinutes": 0.0, "name": "", "packageCodes": []any{}, "teacherTier": ""}) {
		t.Fatalf("courses = %+v", catalog.Courses)
	}
	// PocketBase stores unset numbers as 0, so Go reports 0 where Hono's mock records gave null.
	if len(catalog.Packages) != 1 || !reflect.DeepEqual(roundTrip(t, catalog.Packages[0]), map[string]any{"code": "", "description": "",
		"grants": []any{map[string]any{"courseCode": nil, "courseName": nil, "creditName": "", "quantity": 0.0, "unitLabel": "课点"}},
		"name":   "", "price": map[string]any{"currency": "", "listAmount": 0.0, "saleAmount": 0.0}, "purchaseMode": "mini_program",
		"validity": map[string]any{"activationDeadlineDays": 0.0, "activationMode": "", "expiryPolicy": "", "validityDurationDays": 0.0}}) {
		t.Fatalf("packages = %v", roundTrip(t, catalog.Packages))
	}
}
