package coursecredit

import (
	"strings"
	"testing"
)

// Manual attendance cases ported from Hono's courseCreditManualAttendance tests,
// over the stored settlement fixture (a completed, still editable session).

func (f settlementFixture) attendance(t *testing.T, key string, values map[string]any) map[string]any {
	t.Helper()
	return with2(f.command(t, key), values)
}

func (f settlementFixture) teacherInput(t *testing.T, key, teacherID string, values map[string]any) map[string]any {
	t.Helper()
	input := bookingInput(Body{Values: map[string]any{}}, Actor{ID: teacherID, Role: "teacher", IdempotencyKey: key, TraceID: "trace"},
		map[string]any{"sessionId": f.sessionID})
	return with2(input, values)
}

func (f settlementFixture) preview(t *testing.T) map[string]any {
	t.Helper()
	result, err := previewSettlement(f.app, f.sessionID)
	if err != nil {
		t.Fatal(err)
	}
	return result.(map[string]any)
}

func previewItems(result map[string]any, key string) []map[string]any {
	raw, _ := result[key].([]any)
	items := make([]map[string]any, len(raw))
	for i, item := range raw {
		items[i], _ = item.(map[string]any)
	}
	return items
}

// Hono: courseCreditManualAttendance › manual attendance updates one roster entry with version claim, audit, and outbox
func TestManualAttendanceUpdatesOneRosterEntry(t *testing.T) {
	f := settlementSetup(t, nil)
	result, err := setAttendance(f.app, f.attendance(t, "late", map[string]any{"sessionStudentId": f.students["leave"], "attendanceStatus": "late"}))
	if err != nil || result["attendanceStatus"] != "late" || result["replayed"] != false {
		t.Fatalf("result = %v, %v", result, err)
	}
	row := f.first(t, "session_students", `id="`+f.students["leave"]+`"`)
	if row["attendanceStatus"] != "late" || row["checkedInAt"] == "" || row["version"] != 4.0 {
		t.Fatalf("row = %v", row)
	}
	if f.count(t, "credit_version_claims", `entityId="`+f.students["leave"]+`" && expectedVersion=3`) != 1 ||
		f.count(t, "ops_audit_logs", `action="course_operations.lesson.attendance"`) != 1 ||
		f.count(t, "outbox_events", `topic="course-session.attendance-updated"`) != 1 {
		t.Fatal("claim, audit or outbox missing")
	}
}

// Hono: courseCreditManualAttendance › bulk present updates every non-cancelled roster entry and preserves explicit exceptions later
func TestManualAttendanceMarksAllPresent(t *testing.T) {
	f := settlementSetup(t, nil, "absent", "leave", "cancelled")
	patch(t, f.app, "session_students", f.students["leave"], map[string]any{"version": 4})
	result, err := markAllPresent(f.app, f.command(t, "all"))
	if err != nil || result["updatedCount"] != 2 {
		t.Fatalf("result = %v, %v", result, err)
	}
	if f.count(t, "session_students", `attendanceStatus="present"`) != 2 ||
		f.count(t, "session_students", `id="`+f.students["cancelled"]+`" && attendanceStatus="cancelled"`) != 1 {
		t.Fatal("cancelled roster row was marked present")
	}
	if f.count(t, "credit_version_claims", `expectedVersion=3`) != 1 || f.count(t, "credit_version_claims", `expectedVersion=4`) != 1 {
		t.Fatal("version claims")
	}
	// An explicit exception can still be recorded after the bulk action.
	if _, err := setAttendance(f.app, f.attendance(t, "later", map[string]any{"sessionStudentId": f.students["leave"], "attendanceStatus": "leave"})); err != nil {
		t.Fatal(err)
	}
}

// Hono: courseCreditManualAttendance › actual teacher confirmation is atomic and assigned teachers can operate only their lessons
func TestActualTeacherConfirmation(t *testing.T) {
	f := settlementSetup(t, nil)
	operator := f.operatorID(t)
	result, err := setActualTeacher(f.app, f.teacherInput(t, "own", operator, map[string]any{"sessionTeacherId": f.teachers["lead"], "actualStatus": "absent"}))
	if err != nil || result["actualStatus"] != "absent" {
		t.Fatalf("result = %v, %v", result, err)
	}
	if row := f.first(t, "session_teachers", `id="`+f.teachers["lead"]+`"`); row["actualStatus"] != "absent" {
		t.Fatalf("row = %v", row)
	}
	_, err = setActualTeacher(f.app, f.teacherInput(t, "other-row", operator, map[string]any{"sessionTeacherId": f.teachers["assistant"], "actualStatus": "absent"}))
	failsWith(t, err, "SESSION_TEACHER_TARGET_FORBIDDEN")
	_, err = setAttendance(f.app, f.teacherInput(t, "stranger", "stranger", map[string]any{"sessionStudentId": f.students["present"], "attendanceStatus": "late"}))
	failsWith(t, err, "SESSION_TEACHER_FORBIDDEN")

	if err := authorizeSessionActor(f.app, map[string]any{"actorRole": "admin"}, f.sessionID); err != nil {
		t.Fatal(err)
	}
	global := map[string]any{"actorRole": "teacher", "actorTeachingScope": "global"}
	if err := authorizeSessionActor(f.app, global, f.sessionID); err != nil || isAssignedTeachingActor(global) {
		t.Fatalf("global scope = %v", err)
	}
}

// Hono: courseCreditManualAttendance › settlement preview reports consume, release, unresolved rows, and teacher workload without writes
func TestSettlementPreviewWithoutWrites(t *testing.T) {
	f := settlementSetup(t, nil, "present", "leave", "absent")
	patch(t, f.app, "session_students", f.students["absent"], map[string]any{"creditStatus": "credit_insufficient"})
	operations := f.count(t, "credit_operations", "")
	result := f.preview(t)
	if result["canSettle"] != false {
		t.Fatalf("result = %v", result)
	}
	actions := map[string]any{}
	for _, student := range previewItems(result, "students") {
		actions[student["attendanceStatus"].(string)] = student["action"]
		if student["attendanceStatus"] == "absent" && !strings.Contains(student["exception"].(string), "课时不足") {
			t.Fatalf("absent = %v", student)
		}
		if student["attendanceStatus"] == "present" {
			allocation := student["allocations"].([]any)[0].(map[string]any)
			if allocation["allocationId"] != f.allocations["present"] || allocation["batchId"] != f.batches["present"] ||
				allocation["quantity"] != 1.0 || allocation["status"] != "reserved" || allocation["effectiveExpiresAt"] == nil {
				t.Fatalf("allocation = %v", allocation)
			}
		}
	}
	if actions["present"] != "consume" || actions["leave"] != "release" || actions["absent"] != "exception" {
		t.Fatalf("actions = %v", actions)
	}
	teachers := previewItems(result, "teachers")
	if len(teachers) != 2 || teachers[0]["action"] != "earn" || teachers[0]["quantity"].(float64) <= 0 {
		t.Fatalf("teachers = %v", teachers)
	}
	if f.count(t, "credit_operations", "") != operations {
		t.Fatal("preview wrote")
	}
}

// Hono: courseCreditManualAttendance › settlement preview handles unfinished attendance and cancellation compensation
func TestSettlementPreviewUnfinishedAndCancelled(t *testing.T) {
	session := map[string]any{"status": "completed", "requiredQuantity": 1.0,
		"attendanceRuleSnapshot": map[string]any{"version": 1.0, "present": "consume", "late": "consume", "leave": "release", "absent": "consume"}, "settlementRuleSnapshot": map[string]any{"version": 1.0, "cancelled": "release"}}
	pending := previewStudent(session, map[string]any{"id": "row", "attendanceStatus": "scheduled", "creditStatus": "reserved"}, nil)
	if pending["action"] != "exception" || !strings.Contains(pending["exception"].(string), "出勤登记") {
		t.Fatalf("pending = %v", pending)
	}
	invalid := previewStudent(copyWith(session, "attendanceRuleSnapshot", map[string]any{}),
		map[string]any{"id": "row", "attendanceStatus": "present", "creditStatus": "reserved"}, nil)
	if !strings.Contains(invalid["exception"].(string), "规则") {
		t.Fatalf("invalid = %v", invalid)
	}

	cancelled := settlementSetup(t, func(settlementFixture) map[string]any { return map[string]any{"status": "cancelled"} }, "cancelled")
	result := cancelled.preview(t)
	if students := previewItems(result, "students"); students[0]["action"] != "release" {
		t.Fatalf("students = %v", students)
	}
	for _, teacher := range previewItems(result, "teachers") {
		if teacher["action"] != "compensate" {
			t.Fatalf("teacher = %v", teacher)
		}
	}

	correction := settlementSetup(t, func(f settlementFixture) map[string]any {
		return map[string]any{"status": "correction_pending", "correctionBaseStatus": "completed", "settlementOperationId": f.source}
	})
	if status := correction.preview(t)["sessionStatus"]; status != "completed" {
		t.Fatalf("status = %v", status)
	}
}

// Hono: courseCreditManualAttendance › manual attendance validation rejects invalid ids, states, mismatches, and empty rosters
func TestManualAttendanceValidation(t *testing.T) {
	f := settlementSetup(t, nil)
	for i, item := range []struct {
		values map[string]any
		code   string
	}{
		{map[string]any{"sessionId": ""}, "SESSION_ID_REQUIRED"},
		{map[string]any{}, "SESSION_STUDENT_ID_REQUIRED"},
		{map[string]any{"sessionStudentId": "row", "attendanceStatus": "scheduled"}, "ATTENDANCE_STATUS_INVALID"},
	} {
		_, err := setAttendance(f.app, f.attendance(t, "invalid-"+string(rune('a'+i)), item.values))
		failsWith(t, err, item.code)
	}
	failsWith(t, validateEditableSession(map[string]any{"status": "settled"}), "SESSION_ATTENDANCE_LOCKED")
	failsWith(t, validateEditableSession(map[string]any{"status": "cancelled"}), "SESSION_ATTENDANCE_LOCKED")

	elsewhere := put(t, f.app, "sessions", map[string]any{"code": "elsewhere", "title": "别处", "status": "completed",
		"startAt": "2026-08-10 10:00:00.000Z", "endAt": "2026-08-10 11:00:00.000Z", "requiredCreditTypeId": f.creditTypeID,
		"requiredQuantity": 1, "originType": "class", "attendanceRuleSnapshot": map[string]any{"version": 1},
		"settlementRuleSnapshot": map[string]any{"version": 1}, "teacherRuleSnapshot": map[string]any{"version": 1}}).Id
	foreignStudent := put(t, f.app, "session_students", map[string]any{"sessionId": elsewhere, "studentId": f.studentID,
		"attendanceStatus": "absent", "creditStatus": "reserved", "version": 1}).Id
	foreignTeacher := put(t, f.app, "session_teachers", map[string]any{"sessionId": elsewhere, "teacherId": f.operatorID(t),
		"role": "lead", "assignmentSource": "class_default", "actualStatus": "confirmed", "creditStatus": "not_eligible"}).Id
	_, err := setAttendance(f.app, f.attendance(t, "mismatch", map[string]any{"sessionStudentId": foreignStudent, "attendanceStatus": "present"}))
	failsWith(t, err, "ATTENDANCE_ROSTER_MISMATCH")

	empty := settlementSetup(t, nil, "cancelled")
	_, err = markAllPresent(empty.app, empty.command(t, "empty"))
	failsWith(t, err, "SESSION_ROSTER_REQUIRED")

	for i, item := range []struct {
		values map[string]any
		code   string
	}{
		{map[string]any{"sessionTeacherId": "", "actualStatus": "confirmed"}, "SESSION_TEACHER_ID_REQUIRED"},
		{map[string]any{"sessionTeacherId": "row", "actualStatus": "planned"}, "ACTUAL_TEACHER_STATUS_INVALID"},
		{map[string]any{"sessionTeacherId": foreignTeacher, "actualStatus": "absent"}, "ACTUAL_TEACHER_SESSION_MISMATCH"},
	} {
		_, err := setActualTeacher(f.app, f.attendance(t, "teacher-"+string(rune('a'+i)), item.values))
		failsWith(t, err, item.code)
	}

	scheduled := settlementSetup(t, func(settlementFixture) map[string]any { return map[string]any{"status": "scheduled"} })
	_, err = previewSettlement(scheduled.app, scheduled.sessionID)
	failsWith(t, err, "SESSION_NOT_SETTLEABLE")
	_, err = previewSettlement(f.app, "")
	failsWith(t, err, "SESSION_ID_REQUIRED")
}

// Hono: courseCreditManualAttendance › attendance helpers cover leave timestamp preservation, unknown status, and replay
func TestAttendanceHelpersAndReplay(t *testing.T) {
	pending := previewStudent(map[string]any{"requiredQuantity": 1.0}, map[string]any{"id": "row", "creditStatus": "pending"}, nil)
	if pending["exception"] != "课时状态尚未准备完成" {
		t.Fatalf("pending = %v", pending)
	}
	at := "2026-07-23T08:00:00.000Z"
	plan := attendancePlan(teaching{operationID: "operation", at: at}, map[string]any{"actorRole": ""},
		map[string]any{"sessionId": "session"}, []map[string]any{{"id": "row", "version": 2.0, "checkedInAt": "old"}}, "leave")
	if planData(plan, "session_students")["checkedInAt"] != "old" {
		t.Fatalf("leave timestamp = %v", planData(plan, "session_students"))
	}
	plan = attendancePlan(teaching{operationID: "operation", at: at}, map[string]any{"actorRole": ""},
		map[string]any{"sessionId": "session"}, []map[string]any{{"id": "row", "version": 2.0, "checkedInAt": ""}}, "leave")
	if planData(plan, "session_students")["checkedInAt"] != "" || planData(plan, "ops_audit_logs")["actorRole"] != "admin" {
		t.Fatal("empty timestamp or default audit role")
	}

	f := settlementSetup(t, nil)
	for name, run := range map[string]func() (map[string]any, error){
		"attendance": func() (map[string]any, error) {
			return setAttendance(f.app, f.attendance(t, "replay-attendance", map[string]any{"sessionStudentId": f.students["present"], "attendanceStatus": "present"}))
		},
		"bulk": func() (map[string]any, error) { return markAllPresent(f.app, f.command(t, "replay-bulk")) },
		"teacher": func() (map[string]any, error) {
			return setActualTeacher(f.app, f.attendance(t, "replay-teacher", map[string]any{"sessionTeacherId": f.teachers["lead"], "actualStatus": "confirmed"}))
		},
	} {
		first, err := run()
		if err != nil {
			t.Fatalf("%s = %v", name, err)
		}
		again, err := run()
		if err != nil || again["replayed"] != true || again["operationId"] != first["operationId"] {
			t.Fatalf("%s replay = %v, %v", name, again, err)
		}
	}
}
