package coursecredit

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/testkit"
)

// Teacher substitution cases (OpenSpec add-teacher-substitution): the owner moves a
// booked lesson to another teacher, or hands a leaving teacher over, and students keep
// their lessons.

type substitutionFixture struct {
	bookingFixture
	workbench        http.Handler
	owner            map[string]string
	ownerID, otherID string
}

func substitutionSetup(t *testing.T) substitutionFixture {
	t.Helper()
	f := substitutionFixture{bookingFixture: bookingSetup(t, true)}
	owner := put(t, f.app, "teachers", map[string]any{"email": "owner@example.com", "password": "owner-password", "verified": true,
		"idAdmin": true, "realName": "老板"})
	f.ownerID = owner.Id
	other, err := findFirst(f.app, "teachers", `email="t2@example.com"`)
	if err != nil || other == nil {
		t.Fatalf("other teacher = %v, %v", other, err)
	}
	f.otherID = other["id"].(string)
	patch(t, f.app, "teachers", f.otherID, map[string]any{"realName": "李老师"})
	token, err := f.signer.Sign(owner.Id, "S1", "teacher", true, auth.Claims{}, auth.OpsTokenTTL)
	if err != nil {
		t.Fatal(err)
	}
	f.owner = testkit.Bearer(token)
	f.workbench = testkit.Serve(t, f.app, WorkbenchModule{Signer: f.signer, SettlementEnabled: true}.Register)
	return f
}

func (f substitutionFixture) post(t *testing.T, headers map[string]string, path string, body any, key string) testkit.Response {
	t.Helper()
	return testkit.Call(t, f.workbench, http.MethodPost, path, body, with(headers, "Idempotency-Key", key))
}

func (f substitutionFixture) substitute(t *testing.T, headers map[string]string, lessonID, teacherID, key string) testkit.Response {
	t.Helper()
	return f.post(t, headers, "/v1/workbench/lessons/"+lessonID+"/substitute", map[string]any{"teacherId": teacherID, "reason": "王老师请假"}, key)
}

// leadRows maps teacher id → actual status of the lesson's lead rows.
func (f substitutionFixture) leadRows(t *testing.T, lessonID string) map[string]any {
	t.Helper()
	rows, err := list(f.app, "session_teachers", `sessionId="`+lessonID+`" && role="lead"`, "")
	if err != nil {
		t.Fatal(err)
	}
	result := map[string]any{}
	for _, row := range rows {
		result[relationID(row["teacherId"])] = row["actualStatus"]
	}
	return result
}

func (f substitutionFixture) teacherClaims(t *testing.T, lessonID, teacherID string) int {
	t.Helper()
	claims, err := list(f.app, "schedule_claims", `sourceId="`+lessonID+`" && ownerType="teacher" && ownerId="`+teacherID+`" && status="active"`, "")
	if err != nil {
		t.Fatal(err)
	}
	return len(claims)
}

// startNow moves a lesson so it has already started, as time passing would.
func (f substitutionFixture) startNow(t *testing.T, lessonID string) {
	t.Helper()
	start := time.Now().UTC().Add(-2 * time.Hour)
	patch(t, f.app, "sessions", lessonID, map[string]any{"startAt": iso(start), "endAt": iso(start.Add(time.Hour))})
}

func TestSubstituteBookedLesson(t *testing.T) {
	f := substitutionSetup(t)
	appointmentID, lessonID := f.confirmed(t, 40, "a1")
	claims := f.teacherClaims(t, lessonID, f.teacherID)
	if claims == 0 {
		t.Fatal("booked lesson has no teacher claims")
	}

	failed(t, f.substitute(t, f.teacher, lessonID, f.otherID, "s0"), 403, "COURSE_CREDIT_ADMIN_REQUIRED", "hired teacher substitutes")
	failed(t, f.substitute(t, f.owner, lessonID, f.teacherID, "s-same"), 400, "SUBSTITUTE_SAME_TEACHER", "same teacher")
	first := ok(t, f.substitute(t, f.owner, lessonID, f.otherID, "s1"), "substitute")
	if first["fromTeacherId"] != f.teacherID || first["toTeacherId"] != f.otherID {
		t.Fatalf("substitute = %v", first)
	}
	if again := ok(t, f.substitute(t, f.owner, lessonID, f.otherID, "s1"), "replay"); again["operationId"] != first["operationId"] {
		t.Fatalf("replay = %v", again)
	}
	if rows := f.leadRows(t, lessonID); rows[f.teacherID] != "cancelled" || rows[f.otherID] != "planned" || len(rows) != 2 {
		t.Fatalf("lead rows = %v", rows)
	}
	if f.teacherClaims(t, lessonID, f.teacherID) != 0 || f.teacherClaims(t, lessonID, f.otherID) != claims {
		t.Fatal("calendar cells did not move to the substitute")
	}
	if audit, _ := findFirst(f.app, "ops_audit_logs", `action="course_operations.lesson.substitute_teacher"`); audit == nil || audit["actorId"] != f.ownerID {
		t.Fatalf("audit = %v", audit)
	}

	// Students and teachers see who actually teaches; the booking keeps the teacher booked.
	view := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/student/appointments/"+appointmentID, nil, f.student), "student appointment")
	if view["teacher"].(map[string]any)["name"] != "李老师" || recordField(t, f.bookingFixture, "appointment_requests", appointmentID, "teacherId") != f.teacherID {
		t.Fatalf("student appointment = %v", view)
	}
	lesson := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/student/learning/lessons/"+lessonID, nil, f.student), "student lesson")
	if summary := fmt.Sprint(lesson["teacherSummary"]); !strings.Contains(summary, "李老师") || strings.Contains(summary, "王老师") {
		t.Fatalf("lesson teachers = %v", summary)
	}

	failed(t, f.call(t, f.teacher, http.MethodPost, "/v1/teacher/appointments/"+appointmentID+"/cancel", map[string]any{"reason": "临时有事"}, "c1"),
		403, "APPOINTMENT_TEACHER_FORBIDDEN", "replaced teacher cancels")
	_, err := rescheduleAppointment(f.app, f.as("admin", "move", map[string]any{"appointmentId": appointmentID,
		"newStartAt": iso(time.Now().UTC().Add(72 * time.Hour)), "newEndAt": iso(time.Now().UTC().Add(73 * time.Hour)), "reason": "改期"}))
	if code := errorCode(err); code != "APPOINTMENT_TEACHER_SUBSTITUTED" {
		t.Fatalf("owner reschedule = %v", err)
	}

	// The substitute confirms the lesson and is paid for it.
	f.startNow(t, lessonID)
	failed(t, f.post(t, f.teacher, "/v1/workbench/lessons/"+lessonID+"/confirm", map[string]any{}, "k0"), 403, "SESSION_TEACHER_FORBIDDEN", "replaced teacher confirms")
	ok(t, f.post(t, f.otherTeacher, "/v1/workbench/lessons/"+lessonID+"/confirm", map[string]any{}, "k1"), "substitute confirms")
	events, err := list(f.app, "teacher_credit_events", `sessionTeacherId.sessionId="`+lessonID+`"`, "")
	if err != nil || len(events) != 1 || relationID(events[0]["teacherId"]) != f.otherID {
		t.Fatalf("earnings = %v, %v", events, err)
	}
	failed(t, f.substitute(t, f.owner, lessonID, f.teacherID, "s2"), 400, "SESSION_ALREADY_SETTLED", "settled lesson")

	// Undo, switch back (reusing the old row) and confirm again.
	ok(t, f.post(t, f.owner, "/v1/workbench/lessons/"+lessonID+"/reverse", map[string]any{"reason": "其实是王老师上的"}, "r1"), "undo")
	ok(t, f.substitute(t, f.owner, lessonID, f.teacherID, "s3"), "switch back")
	if rows := f.leadRows(t, lessonID); rows[f.teacherID] != "planned" || rows[f.otherID] != "cancelled" || len(rows) != 2 {
		t.Fatalf("lead rows after switching back = %v", rows)
	}
	ok(t, f.post(t, f.teacher, "/v1/workbench/lessons/"+lessonID+"/confirm", map[string]any{}, "k2"), "original teacher confirms")
	if status := recordField(t, f.bookingFixture, "sessions", lessonID, "status"); status != "settled" {
		t.Fatalf("status = %v", status)
	}
}

func TestSubstituteBusyAndAbsentTeacher(t *testing.T) {
	f := substitutionSetup(t)
	_, lessonID := f.confirmed(t, 40, "a1")
	lesson, _ := get(f.app, "sessions", lessonID)
	busy := put(t, f.app, "sessions", map[string]any{"code": "busy", "title": "李老师的课", "status": "scheduled",
		"startAt": lesson["startAt"], "endAt": lesson["endAt"], "originType": "admin", "version": 1})
	put(t, f.app, "session_teachers", map[string]any{"sessionId": busy.Id, "teacherId": f.otherID, "role": "lead",
		"assignmentSource": "class_default", "actualStatus": "planned", "creditStatus": "pending"})
	failed(t, f.substitute(t, f.owner, lessonID, f.otherID, "s1"), 400, "SUBSTITUTE_TEACHER_BUSY", "busy substitute")

	// The booked teacher did not come: the absent row stays and the owner takes the lesson.
	lead, _ := findFirst(f.app, "session_teachers", `sessionId="`+lessonID+`" && role="lead"`)
	patch(t, f.app, "session_teachers", lead["id"].(string), map[string]any{"actualStatus": "absent"})
	ok(t, f.substitute(t, f.owner, lessonID, f.ownerID, "s2"), "owner takes over")
	if rows := f.leadRows(t, lessonID); rows[f.teacherID] != "absent" || rows[f.ownerID] != "planned" {
		t.Fatalf("lead rows = %v", rows)
	}
	if f.teacherClaims(t, lessonID, f.teacherID) != 0 || f.teacherClaims(t, lessonID, f.ownerID) == 0 {
		t.Fatal("the absent teacher's calendar cells did not move")
	}
}

func TestHandoverLeavingTeacher(t *testing.T) {
	f := substitutionSetup(t)
	_, lessonID := f.confirmed(t, 40, "a1")
	_, startedID := f.confirmed(t, 80, "a2")
	f.startNow(t, startedID)
	pendingID := f.pending(t, 120, "a3")
	batch := batchOf(t, f.app, f.studentID)
	available := batch.GetFloat("availableQuantity")
	handover := "/v1/workbench/teachers/" + f.teacherID + "/handover"
	preview := func(to string) testkit.Response {
		return testkit.Call(t, f.workbench, http.MethodGet, handover+"?toTeacherId="+to, nil, f.owner)
	}

	failed(t, preview(f.teacherID), 400, "HANDOVER_RECEIVER_INVALID", "same teacher")
	failed(t, testkit.Call(t, f.workbench, http.MethodGet, "/v1/workbench/teachers/"+f.ownerID+"/handover?toTeacherId="+f.otherID, nil, f.owner),
		400, "HANDOVER_SELF_FORBIDDEN", "owner hands themselves over")
	failed(t, testkit.Call(t, f.workbench, http.MethodGet, handover+"?toTeacherId="+f.otherID, nil, f.otherTeacher),
		403, "COURSE_CREDIT_ADMIN_REQUIRED", "hired teacher previews")
	shown := ok(t, preview(f.otherID), "preview")
	offerings := shown["offerings"].([]any)
	if len(shown["lessons"].([]any)) != 2 || len(shown["conflicts"].([]any)) != 0 || len(shown["pendingRequests"].([]any)) != 1 ||
		len(shown["students"].([]any)) != 1 || len(offerings) != 1 || offerings[0].(map[string]any)["receiverOffers"] != false {
		t.Fatalf("preview = %v", shown)
	}
	listed := ok(t, testkit.Call(t, f.workbench, http.MethodGet, "/v1/workbench/teachers", nil, f.owner), "teachers")
	for _, item := range items(listed) {
		if item["teacherId"] == f.teacherID && (item["lessonCount"] != 2.0 || item["pendingRequestCount"] != 1.0) {
			t.Fatalf("teacher card = %v", item)
		}
	}

	failed(t, f.post(t, f.owner, handover, map[string]any{"toTeacherId": f.otherID, "reason": "走"}, "h0"), 400, "HANDOVER_REASON_REQUIRED", "short reason")
	result := ok(t, f.post(t, f.owner, handover, map[string]any{"toTeacherId": f.otherID, "reason": "老师离职交接"}, "h1"), "handover")
	if result["lessonCount"] != 2.0 || result["declinedCount"] != 1.0 || result["offeringCount"] != 1.0 {
		t.Fatalf("handover = %v", result)
	}
	if again := ok(t, f.post(t, f.owner, handover, map[string]any{"toTeacherId": f.otherID, "reason": "老师离职交接"}, "h1"), "replay"); again["operationId"] != result["operationId"] {
		t.Fatalf("replay = %v", again)
	}
	for _, id := range []string{lessonID, startedID} {
		if rows := f.leadRows(t, id); rows[f.teacherID] != "cancelled" || rows[f.otherID] != "planned" {
			t.Fatalf("lesson %s rows = %v", id, rows)
		}
	}
	if status := recordField(t, f.bookingFixture, "appointment_requests", pendingID, "status"); status != "declined" {
		t.Fatalf("pending request = %v", status)
	}
	if status := recordField(t, f.bookingFixture, "teacher_course_offerings", f.offeringID, "status"); status != "inactive" {
		t.Fatalf("offering = %v", status)
	}
	if blocked := recordField(t, f.bookingFixture, "teachers", f.teacherID, "blocked"); blocked != true {
		t.Fatalf("blocked = %v", blocked)
	}
	if after := batchOf(t, f.app, f.studentID); after.GetFloat("availableQuantity") != available {
		t.Fatalf("student lessons changed: %v → %v", available, after.GetFloat("availableQuantity"))
	}
	ok(t, f.post(t, f.otherTeacher, "/v1/workbench/lessons/"+startedID+"/confirm", map[string]any{}, "k1"), "receiver confirms")
}

func TestHandoverRefusesConflicts(t *testing.T) {
	f := substitutionSetup(t)
	_, lessonID := f.confirmed(t, 40, "a1")
	lesson, _ := get(f.app, "sessions", lessonID)
	busy := put(t, f.app, "sessions", map[string]any{"code": "busy", "title": "李老师的课", "status": "scheduled",
		"startAt": lesson["startAt"], "endAt": lesson["endAt"], "originType": "admin", "version": 1})
	put(t, f.app, "session_teachers", map[string]any{"sessionId": busy.Id, "teacherId": f.otherID, "role": "lead",
		"assignmentSource": "class_default", "actualStatus": "planned", "creditStatus": "pending"})
	handover := "/v1/workbench/teachers/" + f.teacherID + "/handover"
	shown := ok(t, testkit.Call(t, f.workbench, http.MethodGet, handover+"?toTeacherId="+f.otherID, nil, f.owner), "preview")
	if len(shown["conflicts"].([]any)) != 1 {
		t.Fatalf("preview = %v", shown)
	}
	failed(t, f.post(t, f.owner, handover, map[string]any{"toTeacherId": f.otherID, "reason": "老师离职交接"}, "h1"), 400, "HANDOVER_CONFLICTS", "conflict")
	if rows := f.leadRows(t, lessonID); rows[f.teacherID] != "planned" || len(rows) != 1 {
		t.Fatalf("rows after refused handover = %v", rows)
	}
	if blocked := recordField(t, f.bookingFixture, "teachers", f.teacherID, "blocked"); blocked == true {
		t.Fatal("refused handover blocked the teacher")
	}
}
