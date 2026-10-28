package coursecredit

import (
	"net/http"
	"testing"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/testkit"
)

// Ops route cases ported from Hono's courseCreditOpsRoutes tests. Go serves the real
// read models, so the cases check capability gates and the data each scope sees.
// Teacher event routes are covered in teacher_credits_cases_test.go.

func opsRoutes(t *testing.T, f opsQueryFixture) (func(path string, headers map[string]string) testkit.Response, *auth.Signer, http.Handler) {
	t.Helper()
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	handler := testkit.Serve(t, f.app, CatalogModule{Signer: signer}.Register, LedgerModule{Signer: signer, GrantsEnabled: true}.Register,
		SessionsModule{Signer: signer, SettlementEnabled: true}.Register, FollowUpsModule{Signer: signer}.Register)
	get := func(path string, headers map[string]string) testkit.Response {
		return testkit.Call(t, handler, http.MethodGet, "/ops/course-credits/"+path, nil, headers)
	}
	return get, signer, handler
}

// Hono: courseCreditOpsRoutes › scoped operators can read every Admin workspace through structured APIs
func TestOpsRoutesReadEveryWorkspace(t *testing.T) {
	f, teacher := assignedSetup(t)
	get, signer, _ := opsRoutes(t, f)
	operator := opsHeaders(t, signer, teacher, false, Finance, Academic, Settlement, Teacher, Audit)
	for _, path := range []string{
		"catalog/course-specs?page=1&status=active", "packages/" + f.packageID, "enrollments?studentId=" + f.studentID + "&sourceId=order",
		"accounts?page=1&perPage=10", "accounts/" + f.studentID, "classes", "session-classes?classId=" + f.classID,
		"class-students?classId=" + f.classID + "&studentId=" + f.studentID, "session-teachers?sessionId=" + f.sessionID + "&actualStatus=planned",
		"package-grant-lines?creditTypeId=" + f.creditTypeID, "audit-logs?resourceType=session&resourceId=" + f.sessionID,
		"settlement-exceptions?kind=duplicate&status=open", "reconciliation/runs", "assigned-students?status=active",
		"assigned-classes?classId=" + f.classID, "assigned-lessons?status=scheduled",
	} {
		ok(t, get(path, operator), path)
	}
	// Query filters reach the read model.
	if items := ok(t, get("class-students?classId="+f.classID+"&studentId="+f.studentID, operator), "class students")["items"].([]any); len(items) != 1 {
		t.Fatalf("class students = %v", items)
	}
	if spec := ok(t, get("packages/"+f.packageID, operator), "package"); spec["id"] != f.packageID {
		t.Fatalf("package = %v", spec)
	}
}

// Hono: courseCreditOpsRoutes › teacher-only routes expose assigned teaching data and reject global operations data
func TestOpsRoutesTeacherOnly(t *testing.T) {
	f, teacherID := assignedSetup(t)
	get, signer, _ := opsRoutes(t, f)
	teacher := opsHeaders(t, signer, teacherID, false, Teacher)
	for _, path := range []string{"assigned-students?studentId=" + f.studentID, "assigned-classes?classId=" + f.classID, "assigned-lessons?sessionId=" + f.sessionID} {
		if items := ok(t, get(path, teacher), path)["items"].([]any); len(items) != 1 {
			t.Fatalf("%s = %v", path, items)
		}
	}
	for _, path := range []string{"classes", "packages", "accounts", "audit-logs"} {
		failed(t, get(path, teacher), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", path)
	}
}

// Hono: courseCreditOpsRoutes › settlement-only routes expose global lesson evidence without academic resources
func TestOpsRoutesSettlementOnly(t *testing.T) {
	f, _ := assignedSetup(t)
	get, signer, _ := opsRoutes(t, f)
	settlement := opsHeaders(t, signer, "settlement", false, Settlement)
	for _, path := range []string{"sessions?status=scheduled", "session-students?sessionId=" + f.sessionID, "session-teachers?sessionId=" + f.sessionID} {
		if items := ok(t, get(path, settlement), path)["items"].([]any); len(items) != 1 {
			t.Fatalf("%s = %v", path, items)
		}
	}
	failed(t, get("classes", settlement), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "classes")
}

// Hono: courseCreditOpsRoutes › Admin workspace capabilities prevent cross-scope financial and teacher access
func TestOpsRoutesPreventCrossScopeAccess(t *testing.T) {
	f, _ := assignedSetup(t)
	f.order(t, "O-1", "paid")
	get, signer, _ := opsRoutes(t, f)
	academic := opsHeaders(t, signer, "academic", false, Academic)
	ok(t, get("classes", academic), "classes")
	failed(t, get("orders", academic), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "orders")
	failed(t, get("accounts/"+f.studentID, academic), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "account")
}

// Hono: courseCreditOpsRoutes › finance operators read student overviews and record renewal follow-ups
func TestOpsRoutesFinanceFollowUps(t *testing.T) {
	f, _ := assignedSetup(t)
	other := f.learner(t, "乙")
	get, signer, handler := opsRoutes(t, f)
	financeID := f.operatorID(t)
	finance := opsHeaders(t, signer, financeID, false, Finance)
	ok(t, get("student-overview?studentIds="+f.studentID+","+other, finance), "overview")
	ok(t, get("accounts?renewalThreshold=2&studentIds="+f.studentID, finance), "accounts")
	ok(t, get("students/"+f.studentID+"/follow-ups", finance), "follow-ups")
	ok(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/students/"+f.studentID+"/follow-ups", map[string]any{
		"status": "contacted", "note": "已联系", "snoozeUntil": "2099-10-25T00:00:00Z", "actorId": "spoofed", "studentId": other}, finance), "record")
	items := ok(t, get("students/"+f.studentID+"/follow-ups", finance), "follow-ups")["items"].([]any)
	recorded := items[0].(map[string]any)
	if len(items) != 1 || recorded["studentId"] != f.studentID || recorded["actorId"] != financeID || recorded["status"] != "contacted" {
		t.Fatalf("recorded = %v", items)
	}

	academic := opsHeaders(t, signer, "academic", false, Academic)
	failed(t, get("student-overview?studentIds="+f.studentID, academic), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "academic overview")
	ok(t, get("sessions?from=2026-10-18&to=2026-10-19", academic), "sessions range")
}
