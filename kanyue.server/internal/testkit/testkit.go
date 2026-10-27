// Package testkit builds a PocketBase test app with the slice of the studio
// schema the Go modules touch, and calls module routes over real HTTP handlers.
package testkit

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
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
	save(t, app, teachers)

	students := core.NewBaseCollection("students")
	addText(students, "sn", "cellphone", "password", "tokenKey", "nickName", "realName", "avatar", "province",
		"lastLoginIp", "lastLoginMethod", "wechatId", "wechatUnionId")
	addBool(students, "blocked")
	addNumber(students, "gender", "age")
	addDate(students, "lastLoginAt")
	students.Fields.Add(&core.JSONField{Name: "wechatUserInfo"})
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
	audits.Fields.Add(&core.SelectField{Name: "actorRole", MaxSelect: 1, Values: []string{"teacher", "admin"}})
	addText(audits, "action", "resourceType", "resourceId")
	audits.Fields.Add(&core.SelectField{Name: "outcome", MaxSelect: 1, Required: true, Values: []string{"allowed", "denied", "success", "failed"}})
	audits.Fields.Add(&core.JSONField{Name: "metadata"})
	save(t, app, audits)

	venues := core.NewBaseCollection("venues")
	addText(venues, "name", "intro", "address", "openingHours", "phone")
	addBool(venues, "bookable")
	venues.Fields.Add(&core.SelectField{Name: "status", MaxSelect: 1, Values: []string{"active", "inactive"}})
	addNumber(venues, "sortOrder")
	save(t, app, venues)

	courseSpecs := core.NewBaseCollection("course_specs")
	addText(courseSpecs, "code", "name", "deliveryMode", "teacherTier", "status", "defaultCreditTypeId")
	addNumber(courseSpecs, "durationMinutes")
	save(t, app, courseSpecs)

	creditTypes := core.NewBaseCollection("credit_types")
	addText(creditTypes, "code", "name", "kind", "courseSpecId", "unitLabel", "status")
	save(t, app, creditTypes)

	packages := core.NewBaseCollection("packages")
	addText(packages, "code", "name", "description", "saleChannel", "activationMode", "expiryPolicy", "status")
	addNumber(packages, "activationDeadlineDays", "validityDurationDays")
	save(t, app, packages)

	grantLines := core.NewBaseCollection("package_grant_lines")
	addText(grantLines, "packageId", "creditTypeId")
	addNumber(grantLines, "quantity")
	save(t, app, grantLines)

	prices := core.NewBaseCollection("price_versions")
	addText(prices, "packageId", "currency", "status")
	addNumber(prices, "listAmount", "saleAmount", "version")
	addDate(prices, "validFrom", "validTo")
	save(t, app, prices)
	return app
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

func addDate(collection *core.Collection, names ...string) {
	for _, name := range names {
		collection.Fields.Add(&core.DateField{Name: name})
	}
}
