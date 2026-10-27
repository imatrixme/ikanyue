package coursecredit

import (
	"net/http"
	"net/url"
	"testing"
	"time"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/testkit"
)

func (f bookingFixture) opsToken(t *testing.T, id string, capabilities ...string) map[string]string {
	t.Helper()
	value, err := f.signer.Sign(id, "S1", "teacher", false,
		auth.Claims{"scope": auth.OpsScope, "courseCreditCapabilities": capabilities}, auth.OpsTokenTTL)
	if err != nil {
		t.Fatal(err)
	}
	return testkit.Bearer(value)
}

func rangeQuery(from, to time.Time, extra url.Values) string {
	query := url.Values{"from": {iso(from)}, "to": {iso(to)}}
	for key, values := range extra {
		query[key] = values
	}
	return "?" + query.Encode()
}

func TestSessionAttendanceSettlementAndReversal(t *testing.T) {
	f := bookingSetup(t, true)
	slot := f.slots(t)[40]
	appointment := f.request(t, slot, "r1")
	confirmed := ok(t, f.call(t, f.teacher, http.MethodPost, "/v1/teacher/appointments/"+appointment["appointmentId"].(string)+"/confirm", nil, "c1"), "confirm")
	lessonID := confirmed["lessonId"].(string)
	teacherOps := f.opsToken(t, f.teacherID, Teacher)
	strangerOps := f.opsToken(t, "stranger12345ab", Teacher)
	settler := f.opsToken(t, f.teacherID, Settlement, Academic)

	now := time.Now().UTC()
	calendar := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/teacher/calendar"+rangeQuery(now, now.Add(7*24*time.Hour),
		url.Values{"includeAvailability": {"true"}}), nil, f.teacher), "teacher calendar")
	if entries := items(calendar); len(entries) != 1 || entries[0]["lessonId"] != lessonID || entries[0]["rawStatus"] != nil ||
		len(calendar["availability"].([]any)) == 0 {
		t.Fatalf("teacher calendar = %v", calendar)
	}
	upcoming := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/schedule/upcoming", nil, f.student), "upcoming")
	if entries := items(upcoming); len(entries) != 1 || entries[0]["participantSummary"].(map[string]any)["count"] != float64(0) {
		t.Fatalf("upcoming = %v", upcoming)
	}
	institution := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-calendar"+rangeQuery(now, now.Add(7*24*time.Hour),
		url.Values{"status": {"scheduled"}}), nil, f.ops), "ops calendar")
	facets := institution["facets"].(map[string]any)
	if entries := items(institution); len(entries) != 1 || entries[0]["version"] == nil || len(facets["teachers"].([]any)) != 2 {
		t.Fatalf("ops calendar = %v", institution)
	}
	failed(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-calendar"+rangeQuery(now, now.Add(50*24*time.Hour), nil), nil, f.ops),
		400, "CALENDAR_RANGE_TOO_LARGE", "range too large")
	if mine := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-calendar"+rangeQuery(now, now.Add(7*24*time.Hour), nil), nil, teacherOps), "teacher ops calendar"); len(items(mine)) != 1 {
		t.Fatalf("teacher ops calendar = %v", mine)
	}

	// Move the confirmed lesson into the past so it can finish.
	session, err := f.app.FindRecordById("sessions", lessonID)
	if err != nil {
		t.Fatal(err)
	}
	session.Set("startAt", now.Add(-2*time.Hour))
	session.Set("endAt", now.Add(-time.Hour))
	if err := f.app.Save(session); err != nil {
		t.Fatal(err)
	}
	roster := items(ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-credits/session-students?sessionId="+lessonID, nil, f.ops), "roster"))
	teachers := items(ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-credits/session-teachers?sessionId="+lessonID, nil, settler), "teachers"))
	if len(roster) != 1 || roster[0]["creditStatus"] != "reserved" || len(teachers) != 1 {
		t.Fatalf("roster = %v, teachers = %v", roster, teachers)
	}
	lesson := "/ops/course-operations/lessons/" + lessonID
	attendance := lesson + "/students/" + roster[0]["id"].(string) + "/attendance"
	failed(t, f.call(t, strangerOps, http.MethodPost, attendance, map[string]any{"attendanceStatus": "present"}, "a1"),
		403, "SESSION_TEACHER_FORBIDDEN", "stranger attendance")
	failed(t, f.call(t, teacherOps, http.MethodPost, attendance, map[string]any{"attendanceStatus": "maybe"}, "a1"),
		400, "ATTENDANCE_STATUS_INVALID", "bad attendance")
	marked := ok(t, f.call(t, teacherOps, http.MethodPost, attendance, map[string]any{"attendanceStatus": "late"}, "a1"), "attendance")
	if marked["attendanceStatus"] != "late" {
		t.Fatalf("attendance = %v", marked)
	}
	if all := ok(t, f.call(t, teacherOps, http.MethodPost, lesson+"/attendance/all-present", map[string]any{}, "a2"), "all present"); all["updatedCount"] != float64(1) {
		t.Fatalf("all present = %v", all)
	}
	actual := lesson + "/teachers/" + teachers[0]["id"].(string) + "/actual-status"
	ok(t, f.call(t, teacherOps, http.MethodPost, actual, map[string]any{"actualStatus": "confirmed"}, "t1"), "actual teacher")

	failed(t, testkit.Call(t, f.handler, http.MethodGet, lesson+"/settlement-preview", nil, settler), 400, "SESSION_NOT_SETTLEABLE", "early preview")
	failed(t, f.call(t, f.ops, http.MethodPost, lesson+"/status", map[string]any{"status": "cancelled"}, "l0"),
		400, "LESSON_CANCELLATION_COMMAND_REQUIRED", "status cancel")
	ok(t, f.call(t, f.ops, http.MethodPost, lesson+"/status", map[string]any{"status": "completed"}, "l1"), "complete lesson")
	preview := ok(t, testkit.Call(t, f.handler, http.MethodGet, lesson+"/settlement-preview", nil, settler), "preview")
	students := preview["students"].([]any)
	earnings := preview["teachers"].([]any)
	if preview["canSettle"] != true || students[0].(map[string]any)["action"] != "consume" || len(earnings) != 1 ||
		earnings[0].(map[string]any)["action"] != "earn" || earnings[0].(map[string]any)["role"] != "lead" {
		t.Fatalf("preview = %v", preview)
	}

	settle := "/ops/course-credits/sessions/" + lessonID + "/settle"
	failed(t, f.call(t, f.ops, http.MethodPost, settle, nil, "s1"), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "settle without capability")
	disabled := testkit.Serve(t, f.app, SessionsModule{Signer: f.signer}.Register)
	failed(t, testkit.Call(t, disabled, http.MethodPost, settle, nil, with(settler, "Idempotency-Key", "s1")),
		400, "COURSE_CREDIT_FEATURE_DISABLED", "settlement gated")
	settled := ok(t, f.call(t, settler, http.MethodPost, settle, nil, "s1"), "settle")
	if replay := ok(t, f.call(t, settler, http.MethodPost, settle, nil, "s1"), "settle replay"); replay["operationId"] != settled["operationId"] {
		t.Fatalf("settle replay = %v", replay)
	}
	batch := batchOf(t, f.app, f.studentID)
	if batch.GetInt("consumedQuantity") != 1 || batch.GetInt("frozenQuantity") != 0 {
		t.Fatalf("batch after settle = %v", batch.FieldsData())
	}
	if events, _ := f.app.FindRecordsByFilter("teacher_credit_events", `sessionTeacherId="`+teachers[0]["id"].(string)+`"`, "", 0, 0); len(events) != 1 {
		t.Fatalf("teacher events = %d", len(events))
	}

	reverse := "/ops/course-credits/sessions/" + lessonID + "/reverse-settlement"
	failed(t, f.call(t, settler, http.MethodPost, reverse, map[string]any{"reason": "错"}, "v1"), 400, "REVERSAL_REASON_REQUIRED", "short reason")
	ok(t, f.call(t, settler, http.MethodPost, reverse, map[string]any{"reason": "出勤登记错误"}, "v1"), "reverse")
	if session, _ = f.app.FindRecordById("sessions", lessonID); session.GetString("status") != "correction_pending" {
		t.Fatalf("session after reverse = %v", session.FieldsData())
	}
	if batch = batchOf(t, f.app, f.studentID); batch.GetInt("consumedQuantity") != 0 || batch.GetInt("frozenQuantity") != 1 {
		t.Fatalf("batch after reverse = %v", batch.FieldsData())
	}
	failed(t, f.call(t, f.ops, http.MethodPatch, lesson, map[string]any{"title": "改名"}, "l2"),
		400, "LESSON_IMMUTABLE_AFTER_SETTLEMENT", "edit after settlement")
	ok(t, f.call(t, teacherOps, http.MethodPost, attendance, map[string]any{"attendanceStatus": "leave"}, "a3"), "correct attendance")
	if again := ok(t, testkit.Call(t, f.handler, http.MethodGet, lesson+"/settlement-preview", nil, settler), "preview again"); again["sessionStatus"] != "completed" ||
		again["students"].([]any)[0].(map[string]any)["action"] == "exception" {
		t.Fatalf("preview again = %v", again)
	}
	ok(t, f.call(t, settler, http.MethodPost, settle, nil, "s2"), "resettle")
	if session, _ = f.app.FindRecordById("sessions", lessonID); session.GetString("status") != "settled" {
		t.Fatalf("session after resettle = %v", session.FieldsData())
	}
	failed(t, f.call(t, teacherOps, http.MethodPost, attendance, map[string]any{"attendanceStatus": "present"}, "a4"),
		400, "SESSION_ATTENDANCE_LOCKED", "attendance after settlement")
}

func TestClassSessionPublishRescheduleCancel(t *testing.T) {
	f := bookingSetup(t, true)
	teacherOps := f.opsToken(t, f.teacherID, Teacher)
	class := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-operations/classes", map[string]any{
		"code": "c1", "name": "周六班", "courseSpecId": f.specID, "defaultCreditTypeId": f.creditID, "status": "active",
	}, "k1"), "class")
	classID := class["id"].(string)
	membership := "/ops/course-credits/classes/" + classID + "/students/" + f.studentID + "/membership"
	failed(t, f.call(t, f.ops, http.MethodPost, membership, map[string]any{"status": "unknown", "effectiveFrom": "2020-01-01T00:00:00Z"}, "m1"),
		400, "INVALID_MEMBERSHIP_STATUS", "bad membership")
	ok(t, f.call(t, f.ops, http.MethodPost, membership, map[string]any{"status": "active", "effectiveFrom": "2020-01-01T00:00:00Z"}, "m1"), "membership")
	failed(t, f.call(t, f.ops, http.MethodPost, membership, map[string]any{"status": "active", "effectiveFrom": "2019-01-01T00:00:00Z"}, "m2"),
		400, "MEMBERSHIP_EFFECTIVE_ORDER_INVALID", "earlier membership")
	ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-credits/classes/"+classID+"/teachers/"+f.teacherID+"/assignment",
		map[string]any{"role": "lead", "status": "active", "effectiveFrom": "2020-01-01T00:00:00Z"}, "m3"), "assignment")

	start := time.Now().UTC().Add(72 * time.Hour).Truncate(time.Hour)
	lessonBody := func(code string, at time.Time) map[string]any {
		return map[string]any{
			"code": code, "title": "合唱课", "status": "draft", "startAt": iso(at), "endAt": iso(at.Add(time.Hour)),
			"requiredCreditTypeId": f.creditID, "requiredQuantity": 1, "originType": "class",
			"attendanceRuleSnapshot": map[string]any{"version": 1, "present": "consume", "late": "consume", "leave": "release", "absent": "consume"},
			"settlementRuleSnapshot": map[string]any{"version": 1, "cancelled": "release"},
			"teacherRuleSnapshot": map[string]any{"version": 1, "rules": map[string]any{"lead": map[string]any{
				"ruleId": "rule1", "courseSpecId": f.specID, "baseQuantity": 1, "durationFactor": 0, "participantFactor": 0,
			}}},
		}
	}
	lesson := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-operations/lessons", lessonBody("l1", start), "k2"), "lesson")
	lessonID := lesson["id"].(string)
	publish := "/ops/course-credits/sessions/" + lessonID + "/publish"
	failed(t, f.call(t, f.ops, http.MethodPost, publish, map[string]any{"classIds": []any{}}, "p1"), 400, "SESSION_CLASSES_REQUIRED", "no classes")
	published := ok(t, f.call(t, f.ops, http.MethodPost, publish, map[string]any{"classIds": []any{classID, classID}}, "p1"), "publish")
	if published["rosterCount"] != float64(1) || published["claimCount"] != float64(8) || len(published["classIds"].([]any)) != 1 ||
		published["teacherAssignments"].([]any)[0].(map[string]any)["assignmentSource"] != "class_default" {
		t.Fatalf("published = %v", published)
	}
	failed(t, f.call(t, f.ops, http.MethodPost, publish, map[string]any{"classIds": []any{classID}}, "p2"), 400, "SESSION_NOT_DRAFT", "publish twice")

	upcoming := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/schedule/upcoming?limit=2", nil, f.teacher), "upcoming")
	if entries := items(upcoming); len(entries) != 1 || entries[0]["lessonId"] != lessonID {
		t.Fatalf("upcoming = %v", upcoming)
	}
	failed(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/schedule/upcoming?limit=4", nil, f.teacher), 400, "CALENDAR_UPCOMING_LIMIT_INVALID", "limit")
	if lessons := items(ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-credits/assigned-lessons", nil, teacherOps), "assigned lessons")); len(lessons) != 1 ||
		len(lessons[0]["students"].([]any)) != 1 {
		t.Fatalf("assigned lessons = %v", lessons)
	}
	if students := items(ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-credits/assigned-students", nil, teacherOps), "assigned students")); len(students) != 1 ||
		len(students[0]["classAssignments"].([]any)) != 1 || students[0]["realName"] != "学员甲" {
		t.Fatalf("assigned students = %v", students)
	}
	if classes := items(ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-credits/assigned-classes", nil, teacherOps), "assigned classes")); len(classes) != 1 {
		t.Fatalf("assigned classes = %v", classes)
	}
	failed(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-credits/sessions?from=bad", nil, f.ops), 400, "OPS_FILTER_DATE_INVALID", "bad from")

	reschedule := "/ops/course-credits/sessions/" + lessonID + "/reschedule"
	moved := start.Add(24 * time.Hour)
	failed(t, f.call(t, f.ops, http.MethodPost, reschedule, map[string]any{"newStartAt": iso(start), "newEndAt": iso(start.Add(time.Hour))}, "r1"),
		400, "SESSION_TIME_UNCHANGED", "same time")
	rescheduled := ok(t, f.call(t, f.ops, http.MethodPost, reschedule, map[string]any{"newStartAt": iso(moved), "newEndAt": iso(moved.Add(time.Hour)), "reason": "场地调整"}, "r2"), "reschedule")
	if rescheduled["claimCount"] != float64(8) || rescheduled["newStartAt"] != iso(moved) {
		t.Fatalf("rescheduled = %v", rescheduled)
	}
	active, _ := f.app.FindRecordsByFilter("schedule_claims", `sourceId="`+lessonID+`" && status="active"`, "", 0, 0)
	if len(active) != 8 {
		t.Fatalf("active claims = %d", len(active))
	}

	clash := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-operations/lessons", lessonBody("l2", moved), "k3"), "clash lesson")
	failed(t, f.call(t, f.ops, http.MethodPost, "/ops/course-credits/sessions/"+clash["id"].(string)+"/publish",
		map[string]any{"classIds": []any{classID}}, "p3"), 400, "SESSION_SCHEDULE_CONFLICT", "clash")

	cancel := "/ops/course-credits/sessions/" + lessonID + "/cancel"
	failed(t, f.call(t, f.ops, http.MethodPost, cancel, map[string]any{"reason": "x"}, "x1"), 400, "SESSION_CANCEL_REASON_REQUIRED", "short reason")
	cancelled := ok(t, f.call(t, f.ops, http.MethodPost, cancel, map[string]any{"reason": "老师请假"}, "x1"), "cancel")
	if cancelled["status"] != "cancelled" || len(cancelled["releasedStudentIds"].([]any)) != 0 {
		t.Fatalf("cancelled = %v", cancelled)
	}
	if active, _ = f.app.FindRecordsByFilter("schedule_claims", `sourceId="`+lessonID+`" && status="active"`, "", 0, 0); len(active) != 0 {
		t.Fatalf("claims after cancel = %d", len(active))
	}
}
