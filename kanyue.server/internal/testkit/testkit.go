// Package testkit builds a PocketBase test app with the slice of the studio
// schema the Go modules touch, and calls module routes over real HTTP handlers.
package testkit

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// Secret signs tokens in tests only.
const Secret = "kanyue-test-only-secret-0123456789abcdef"

func NewApp(t *testing.T) *tests.TestApp {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	teachers := core.NewAuthCollection("teachers")
	addText(teachers, "sn", "username", "cellphone", "nickName", "realName", "avatar", "province", "lastLoginIp", "lastLoginMethod")
	addBool(teachers, "blocked", "idAdmin", "isAdmin", "opsPasswordChangeRequired")
	addNumber(teachers, "gender", "age")
	addDate(teachers, "lastPasswordChangedAt", "lastLoginAt")
	teachers.Fields.Add(&core.JSONField{Name: "courseCreditCapabilities"})
	addAutodates(teachers)
	save(t, app, teachers)

	students := core.NewBaseCollection("students")
	addText(students, "sn", "cellphone", "password", "tokenKey", "nickName", "realName", "avatar", "province",
		"lastLoginIp", "lastLoginMethod", "wechatId", "wechatUnionId")
	addBool(students, "blocked")
	addNumber(students, "gender", "age")
	addDate(students, "lastLoginAt")
	students.Fields.Add(&core.JSONField{Name: "wechatUserInfo"})
	addAutodates(students)
	students.AddIndex("idx_students_cellphone", true, "cellphone", "cellphone != ''")
	save(t, app, students)

	identities := core.NewBaseCollection("wechat_identities")
	addText(identities, "appId", "openId", "unionId", "principalId")
	identities.Fields.Add(&core.SelectField{Name: "principalType", MaxSelect: 1, Values: []string{"student", "teacher"}})
	identities.Fields.Add(&core.SelectField{Name: "status", MaxSelect: 1, Values: []string{"active", "revoked"}})
	addDate(identities, "lastUsedAt")
	save(t, app, identities)

	audits := core.NewBaseCollection("ops_audit_logs")
	audits.Fields.Add(&core.RelationField{Name: "actorId", CollectionId: teachers.Id, MaxSelect: 1})
	audits.Fields.Add(&core.SelectField{Name: "actorRole", MaxSelect: 1, Values: []string{"teacher", "admin", "anonymous", "student"}})
	addText(audits, "action", "resourceType", "resourceId")
	audits.Fields.Add(&core.SelectField{Name: "outcome", MaxSelect: 1, Required: true, Values: []string{"allowed", "denied", "success", "failed"}})
	audits.Fields.Add(&core.JSONField{Name: "metadata"})
	addAutodates(audits)
	save(t, app, audits)

	venues := core.NewBaseCollection("venues")
	addText(venues, "name", "intro", "address", "openingHours", "phone")
	addBool(venues, "bookable")
	venues.Fields.Add(&core.SelectField{Name: "status", MaxSelect: 1, Values: []string{"active", "inactive"}})
	addNumber(venues, "sortOrder")
	venues.Fields.Add(&core.FileField{Name: "cover", MaxSelect: 1, MaxSize: 5 * 1024 * 1024, MimeTypes: []string{"image/jpeg", "image/png", "image/webp"}})
	save(t, app, venues)

	// Catalog collections mirror Hono's catalogSchemas field types; required flags are
	// left off so tests can create partial fixtures.
	statuses := []string{"draft", "active", "inactive"}
	courseSpecs := core.NewBaseCollection("course_specs")
	addText(courseSpecs, "code", "name", "teacherTier")
	addSelect(courseSpecs, "deliveryMode", "one_to_one", "group", "workshop", "online", "hybrid")
	addNumber(courseSpecs, "durationMinutes")
	addSelect(courseSpecs, "status", statuses...)
	courseSpecs.Fields.Add(&core.JSONField{Name: "metadata"})
	addAutodates(courseSpecs)
	save(t, app, courseSpecs)

	creditTypes := core.NewBaseCollection("credit_types")
	addText(creditTypes, "code", "name", "unitLabel")
	addSelect(creditTypes, "kind", "universal", "course")
	creditTypes.Fields.Add(&core.RelationField{Name: "courseSpecId", CollectionId: courseSpecs.Id, MaxSelect: 1})
	addBool(creditTypes, "consumable")
	addNumber(creditTypes, "referenceUnitValue")
	addSelect(creditTypes, "status", statuses...)
	addAutodates(creditTypes)
	save(t, app, creditTypes)

	courseSpecs.Fields.Add(&core.RelationField{Name: "defaultCreditTypeId", CollectionId: creditTypes.Id, MaxSelect: 1})
	save(t, app, courseSpecs)

	packages := core.NewBaseCollection("packages")
	addText(packages, "code", "name", "description")
	addSelect(packages, "saleChannel", "admin", "wechat", "website", "offline", "all")
	addSelect(packages, "activationMode", "GRANT_TIME", "FIRST_RESERVATION", "FIRST_CHECK_IN", "FIRST_COMPLETED_SESSION", "TERM_START")
	addNumber(packages, "activationDeadlineDays", "validityDurationDays")
	addSelect(packages, "expiryPolicy", "FIXED_DURATION", "TERM_END", "NO_EXPIRY")
	addSelect(packages, "status", statuses...)
	addAutodates(packages)
	save(t, app, packages)

	grantLines := core.NewBaseCollection("package_grant_lines")
	grantLines.Fields.Add(&core.RelationField{Name: "packageId", CollectionId: packages.Id, MaxSelect: 1})
	grantLines.Fields.Add(&core.RelationField{Name: "creditTypeId", CollectionId: creditTypes.Id, MaxSelect: 1})
	addNumber(grantLines, "quantity")
	addAutodates(grantLines)
	grantLines.AddIndex("idx_package_grant_lines_unique", true, "packageId, creditTypeId", "")
	save(t, app, grantLines)

	prices := core.NewBaseCollection("price_versions")
	prices.Fields.Add(&core.RelationField{Name: "packageId", CollectionId: packages.Id, MaxSelect: 1})
	addText(prices, "currency")
	addNumber(prices, "listAmount", "saleAmount", "version")
	addDate(prices, "validFrom", "validTo")
	addSelect(prices, "status", statuses...)
	prices.Fields.Add(&core.JSONField{Name: "grantSnapshot"})
	addAutodates(prices)
	save(t, app, prices)
	importLedger(t, app)
	return app
}

// ledgerCollections and bookingCollections are the ledger, teaching and booking
// collections exported from a migrated local business DB (`_collections` rows,
// relation targets rewritten to names).
//
//go:embed ledger_collections.json
var ledgerCollections []byte

//go:embed booking_collections.json
var bookingCollections []byte

// importLedger imports both exports in one call so their relations to each other
// resolve; relations to collections the test schema does not have are dropped.
func importLedger(t *testing.T, app core.App) {
	t.Helper()
	collections := []map[string]any{}
	for _, raw := range [][]byte{ledgerCollections, bookingCollections} {
		part := []map[string]any{}
		if err := json.Unmarshal(raw, &part); err != nil {
			t.Fatal(err)
		}
		collections = append(collections, part...)
	}
	ids := map[string]string{}
	for _, collection := range collections {
		ids[collection["name"].(string)] = collection["id"].(string)
	}
	for _, collection := range collections {
		fields := []any{}
		for _, raw := range collection["fields"].([]any) {
			field := raw.(map[string]any)
			if field["type"] == "relation" {
				target := field["collectionId"].(string)
				if id, ok := ids[target]; ok {
					field["collectionId"] = id
				} else if existing, err := app.FindCollectionByNameOrId(target); err == nil {
					field["collectionId"] = existing.Id
				} else {
					continue
				}
			}
			fields = append(fields, field)
		}
		collection["fields"] = fields
	}
	if err := app.ImportCollections(collections, false); err != nil {
		t.Fatalf("import ledger collections: %v", err)
	}
}

// Create saves a record; password sets an auth record's password.
func Create(t *testing.T, app core.App, collection string, fields map[string]any) *core.Record {
	t.Helper()
	target, err := app.FindCollectionByNameOrId(collection)
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(target)
	for key, value := range fields {
		if key == "password" && target.IsAuth() {
			record.SetPassword(value.(string))
			continue
		}
		record.Set(key, value)
	}
	if err := app.Save(record); err != nil {
		t.Fatalf("create %s: %v", collection, err)
	}
	return record
}

// Serve registers modules the way server.Register does and returns the built mux.
func Serve(t *testing.T, app core.App, registers ...func(*core.ServeEvent)) http.Handler {
	t.Helper()
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	event := &core.ServeEvent{App: app, Router: router}
	for _, register := range registers {
		register(event)
	}
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	return mux
}

type Response struct {
	Status int
	Body   map[string]any
}

// Data returns the envelope's data object.
func (r Response) Data() map[string]any {
	data, _ := r.Body["data"].(map[string]any)
	return data
}

// Code returns the envelope code.
func (r Response) Code() int {
	code, _ := r.Body["code"].(float64)
	return int(code)
}

// Call sends a JSON body (nil for none) and decodes the JSON envelope.
func Call(t *testing.T, handler http.Handler, method, url string, body any, headers map[string]string) Response {
	t.Helper()
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(raw)
	}
	request := httptest.NewRequest(method, url, reader)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	result := Response{Status: recorder.Code, Body: map[string]any{}}
	if err := json.Unmarshal(recorder.Body.Bytes(), &result.Body); err != nil {
		t.Fatalf("%s %s: invalid JSON %q", method, url, recorder.Body.String())
	}
	return result
}

// Raw sends body verbatim as application/json, for malformed or hand-ordered payloads.
func Raw(t *testing.T, handler http.Handler, method, url, body string, headers map[string]string) Response {
	t.Helper()
	request := httptest.NewRequest(method, url, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	result := Response{Status: recorder.Code, Body: map[string]any{}}
	if err := json.Unmarshal(recorder.Body.Bytes(), &result.Body); err != nil {
		t.Fatalf("%s %s: invalid JSON %q", method, url, recorder.Body.String())
	}
	return result
}

func Bearer(token string) map[string]string {
	return map[string]string{"Authorization": "Bearer " + token}
}

func save(t *testing.T, app core.App, collection *core.Collection) {
	t.Helper()
	if err := app.Save(collection); err != nil {
		t.Fatalf("save %s: %v", collection.Name, err)
	}
}

func addText(collection *core.Collection, names ...string) {
	for _, name := range names {
		collection.Fields.Add(&core.TextField{Name: name})
	}
}

func addBool(collection *core.Collection, names ...string) {
	for _, name := range names {
		collection.Fields.Add(&core.BoolField{Name: name})
	}
}

func addNumber(collection *core.Collection, names ...string) {
	for _, name := range names {
		collection.Fields.Add(&core.NumberField{Name: name})
	}
}

func addSelect(collection *core.Collection, name string, values ...string) {
	collection.Fields.Add(&core.SelectField{Name: name, MaxSelect: 1, Values: values})
}

func addAutodates(collection *core.Collection) {
	collection.Fields.Add(
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
}

func addDate(collection *core.Collection, names ...string) {
	for _, name := range names {
		collection.Fields.Add(&core.DateField{Name: name})
	}
}
