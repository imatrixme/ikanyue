package coursecredit

import (
	"net/http"
	"testing"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/testkit"
)

// Owner workbench cases (OpenSpec add-owner-workbench): one teacher workbench whose
// management routes re-check the stored teacher and whose "确认上课" settles a lesson.

type workbenchFixture struct {
	settlementFixture
	handler                   http.Handler
	sign                      func(id string, isAdmin bool, capabilities ...string) map[string]string
	ownerID, hiredID          string
	owner, lead, hired, other map[string]string
}

func workbenchSetup(t *testing.T, session func(f settlementFixture) map[string]any) workbenchFixture {
	t.Helper()
	f := workbenchFixture{settlementFixture: settlementSetup(t, session)}
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	f.sign = func(id string, isAdmin bool, capabilities ...string) map[string]string {
		value, err := signer.Sign(id, "S1", "teacher", isAdmin, auth.Claims{"courseCreditCapabilities": capabilities}, auth.OpsTokenTTL)
		if err != nil {
			t.Fatal(err)
		}
		return testkit.Bearer(value)
	}
	teacher := func(email string, isAdmin bool, capabilities ...string) string {
		return put(t, f.app, "teachers", map[string]any{"email": email, "password": "secret-password", "verified": true,
			"idAdmin": isAdmin, "courseCreditCapabilities": capabilities}).Id
	}
	f.ownerID = teacher("owner@example.com", true)
	f.hiredID = teacher("hired@example.com", false, Teacher)
	f.owner = f.sign(f.ownerID, true)
	f.lead = f.sign(f.operatorID(t), false, Teacher)
	f.hired = f.sign(f.hiredID, false, Teacher)
	f.handler = testkit.Serve(t, f.app, WorkbenchModule{Signer: signer, SettlementEnabled: true}.Register)
	return f
}

func (f workbenchFixture) post(t *testing.T, headers map[string]string, path string, body any, key string) testkit.Response {
	t.Helper()
	return testkit.Call(t, f.handler, http.MethodPost, path, body, with(headers, "Idempotency-Key", key))
}

func (f workbenchFixture) confirm(t *testing.T, headers map[string]string, key string, absent ...string) testkit.Response {
	t.Helper()
	body := map[string]any{}
	if len(absent) > 0 {
		body["absentSessionStudentIds"] = absent
	}
	return f.post(t, headers, "/v1/workbench/lessons/"+f.sessionID+"/confirm", body, key)
}

func (f workbenchFixture) record(t *testing.T, collection, id string) map[string]any {
	t.Helper()
	record, err := get(f.app, collection, id)
	if err != nil {
		t.Fatal(err)
	}
	return record
}

func scheduledLesson(_ settlementFixture) map[string]any {
	return map[string]any{"status": "scheduled"}
}

func TestWorkbenchPermissionMatrix(t *testing.T) {
	f := workbenchSetup(t, scheduledLesson)
	finance := put(t, f.app, "teachers", map[string]any{"email": "finance@example.com", "password": "secret-password", "verified": true,
		"courseCreditCapabilities": []string{Teacher, Finance}}).Id
	settler := put(t, f.app, "teachers", map[string]any{"email": "settle@example.com", "password": "secret-password", "verified": true,
		"courseCreditCapabilities": []string{Teacher, Settlement}}).Id
	sessions := map[string]map[string]string{
		"owner": f.owner, "finance": f.sign(finance, false, Teacher, Finance),
		"settlement": f.sign(settler, false, Teacher, Settlement), "hired": f.hired,
	}
	routes := []struct {
		method, path string
		body         any
		allowed      []string
	}{
		{http.MethodGet, "/v1/workbench/summary", nil, []string{"owner", "finance", "settlement", "hired"}},
		{http.MethodGet, "/v1/workbench/lessons/pending", nil, []string{"owner", "finance", "settlement", "hired"}},
		{http.MethodGet, "/v1/workbench/students", nil, []string{"owner"}},
		{http.MethodPost, "/v1/workbench/students", map[string]any{}, []string{"owner"}},
		{http.MethodGet, "/v1/workbench/students/" + f.studentID + "/ledger", nil, []string{"owner"}},
		{http.MethodGet, "/v1/workbench/packages", nil, []string{"owner", "finance"}},
		{http.MethodPost, "/v1/workbench/students/" + f.studentID + "/grants", map[string]any{}, []string{"owner", "finance"}},
		{http.MethodPost, "/v1/workbench/lessons/" + f.sessionID + "/reverse", map[string]any{"reason": "学员实际缺席"}, []string{"owner", "settlement"}},
	}
	for _, route := range routes {
		for name, headers := range sessions {
			result := testkit.Call(t, f.handler, route.method, route.path, route.body, with(headers, "Idempotency-Key", "m-"+name))
			denied := result.Code() == 403
			if allowed := contains(route.allowed, name); allowed == denied {
				t.Fatalf("%s %s as %s = %v", route.method, route.path, name, result.Body)
			}
		}
	}
	student, err := f.signerFor(t).Sign(f.studentID, "S1", "student", false, nil, auth.OpsTokenTTL)
	if err != nil {
		t.Fatal(err)
	}
	rejected(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/workbench/summary", nil, testkit.Bearer(student)), 403, "student summary")

	summary := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/workbench/summary", nil, f.owner), "owner summary")
	permissions := summary["permissions"].(map[string]any)
	if permissions["manageStudents"] != true || permissions["grant"] != true || permissions["undo"] != true || permissions["allLessons"] != true ||
		summary["teacherCount"] != 4.0 || summary["pendingLessonCount"] != 1.0 {
		t.Fatalf("owner summary = %v", summary)
	}
	hired := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/workbench/summary", nil, f.hired), "hired summary")
	if permissions := hired["permissions"].(map[string]any); permissions["teach"] != true || permissions["manageStudents"] != false ||
		permissions["grant"] != false || permissions["undo"] != false || hired["pendingLessonCount"] != 0.0 {
		t.Fatalf("hired summary = %v", hired)
	}

	// The session still says administrator; the stored teacher no longer is.
	if _, err := f.app.DB().NewQuery("UPDATE teachers SET idAdmin=false WHERE id={:id}").Bind(map[string]any{"id": f.ownerID}).Execute(); err != nil {
		t.Fatal(err)
	}
	failed(t, testkit.Call(t, f.handler, http.MethodPost, "/v1/workbench/students", map[string]any{"realName": "新学员", "cellphone": "13900000001"}, f.owner),
		403, "COURSE_CREDIT_ADMIN_REQUIRED", "demoted owner adds a student")
	if _, err := f.app.DB().NewQuery("UPDATE teachers SET blocked=true WHERE id={:id}").Bind(map[string]any{"id": finance}).Execute(); err != nil {
		t.Fatal(err)
	}
	rejected(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/workbench/packages", nil, sessions["finance"]), 403, "blocked finance teacher")
}

func (f workbenchFixture) signerFor(t *testing.T) *auth.Signer {
	t.Helper()
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	return signer
}

func contains(values []string, value string) bool {
	for _, item := range values {
		if item == value {
			return true
		}
	}
	return false
}

func TestWorkbenchConfirmLesson(t *testing.T) {
	f := workbenchSetup(t, scheduledLesson)
	pending := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/workbench/lessons/pending", nil, f.lead), "pending")
	if lessons := items(pending); len(lessons) != 1 || lessons[0]["sessionId"] != f.sessionID || len(lessons[0]["students"].([]any)) != 2 {
		t.Fatalf("pending = %v", pending)
	}
	failed(t, f.confirm(t, f.hired, "c0"), 403, "SESSION_TEACHER_FORBIDDEN", "someone else's lesson")

	// Appointment lessons start with planned teachers: confirming marks the actor's own row only.
	patch(t, f.app, "session_teachers", f.teachers["lead"], map[string]any{"actualStatus": "planned"})
	patch(t, f.app, "session_teachers", f.teachers["assistant"], map[string]any{"actualStatus": "planned"})
	first := ok(t, f.confirm(t, f.lead, "c1", f.students["leave"]), "confirm")
	if lead := f.record(t, "session_teachers", f.teachers["lead"]); lead["actualStatus"] != "confirmed" {
		t.Fatalf("lead teacher = %v", lead)
	}
	if assistant := f.record(t, "session_teachers", f.teachers["assistant"]); assistant["actualStatus"] != "planned" {
		t.Fatalf("assistant teacher = %v", assistant)
	}
	session := f.record(t, "sessions", f.sessionID)
	if session["status"] != "settled" || session["settlementOperationId"] != first["operationId"] {
		t.Fatalf("session = %v", session)
	}
	if absent := f.record(t, "session_students", f.students["leave"]); absent["attendanceStatus"] != "absent" {
		t.Fatalf("absent student = %v", absent)
	}
	if present := f.record(t, "session_students", f.students["present"]); present["attendanceStatus"] != "present" {
		t.Fatalf("present student = %v", present)
	}
	if batch := f.record(t, "credit_batches", f.batches["present"]); batch["consumedQuantity"] != 1.0 || batch["frozenQuantity"] != 0.0 {
		t.Fatalf("present batch = %v", batch)
	}
	if audit, _ := findFirst(f.app, "ops_audit_logs", `action="course_operations.lesson.confirm"`); audit == nil || audit["actorId"] != f.operatorID(t) {
		t.Fatalf("confirm audit = %v", audit)
	}

	again := ok(t, f.confirm(t, f.lead, "c1", f.students["leave"]), "replay")
	if again["operationId"] != first["operationId"] {
		t.Fatalf("replay = %v, first = %v", again, first)
	}
	if settled, _ := list(f.app, "credit_operations", `type="settle_session"`, ""); len(settled) != 1 {
		t.Fatalf("settlements = %d", len(settled))
	}
	failed(t, f.confirm(t, f.lead, "c2"), 400, "SESSION_ALREADY_SETTLED", "settled lesson")
	pending = ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/workbench/lessons/pending", nil, f.lead), "pending after")
	if len(items(pending)) != 0 {
		t.Fatalf("pending after confirm = %v", pending)
	}

	failed(t, f.post(t, f.hired, "/v1/workbench/lessons/"+f.sessionID+"/reverse", map[string]any{"reason": "学员实际缺席"}, "r0"),
		403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "hired teacher undoes")
	ok(t, f.post(t, f.owner, "/v1/workbench/lessons/"+f.sessionID+"/reverse", map[string]any{"reason": "学员实际缺席"}, "r1"), "undo")
	if session := f.record(t, "sessions", f.sessionID); session["status"] != "correction_pending" {
		t.Fatalf("undone session = %v", session)
	}
	// Re-confirming skips completion: the lesson is already past it.
	ok(t, f.confirm(t, f.owner, "c3"), "re-confirm")
	if session := f.record(t, "sessions", f.sessionID); session["status"] != "settled" {
		t.Fatalf("re-confirmed session = %v", session)
	}
}

func TestWorkbenchConfirmBeforeStart(t *testing.T) {
	f := workbenchSetup(t, func(settlementFixture) map[string]any {
		return map[string]any{"status": "scheduled", "startAt": "2099-01-01 10:00:00.000Z", "endAt": "2099-01-01 11:00:00.000Z"}
	})
	failed(t, f.confirm(t, f.owner, "early"), 400, "LESSON_NOT_STARTED", "before start")
	if row := f.record(t, "session_students", f.students["leave"]); row["attendanceStatus"] != "leave" {
		t.Fatalf("attendance changed = %v", row)
	}
	if session := f.record(t, "sessions", f.sessionID); session["status"] != "scheduled" {
		t.Fatalf("session changed = %v", session)
	}
}

func TestWorkbenchGrant(t *testing.T) {
	f := workbenchSetup(t, scheduledLesson)
	packages := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/workbench/packages", nil, f.owner), "packages")
	offered := items(packages)
	if len(offered) != 1 || offered[0]["packageId"] != f.packageID {
		t.Fatalf("packages = %v", packages)
	}
	body := map[string]any{"packageId": f.packageID, "priceVersionId": f.priceID, "paidAmount": 700}
	failed(t, f.post(t, f.hired, "/v1/workbench/students/"+f.studentID+"/grants", body, "g0"), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "hired grants")
	if orders, _ := list(f.app, "orders", "", ""); len(orders) != 0 {
		t.Fatalf("orders after refusal = %v", orders)
	}
	result := ok(t, f.post(t, f.owner, "/v1/workbench/students/"+f.studentID+"/grants", body, "g1"), "grant")
	order := f.record(t, "orders", result["orderId"].(string))
	if order["channel"] != "offline" || order["listAmount"] != 1000.0 || order["paidAmount"] != 700.0 {
		t.Fatalf("order = %v", order)
	}
	ledger := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/workbench/students/"+f.studentID+"/ledger", nil, f.owner), "ledger")
	overview := ledger["overview"].(map[string]any)
	courses, _ := overview["courses"].([]any)
	if len(courses) != 1 || courses[0].(map[string]any)["remainingLessons"] != 10.0 {
		t.Fatalf("ledger = %v", ledger)
	}

	added := ok(t, testkit.Call(t, f.handler, http.MethodPost, "/v1/workbench/students", map[string]any{"realName": "新学员", "cellphone": "13900000002"}, f.owner), "add student")
	if added["realName"] != "新学员" {
		t.Fatalf("added = %v", added)
	}
	found := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/workbench/students?q=新学员", nil, f.owner), "search")
	if len(items(found)) != 1 {
		t.Fatalf("search = %v", found)
	}
}
