package coursecredit

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

// Session publication cases ported from Hono's courseCreditSessionPublicationService
// tests: a stored draft session combining two classes with overlapping members.

type publicationFixture struct {
	ledgerFixture
	draftID        string
	classA, classB string
	students       map[string]string // name → student id
	teachers       map[string]string // name → teacher id
	memberships    map[string]string // name → class-a membership id
}

const publicationStart = "2026-11-10 10:00:00.000Z"

func publicationSetup(t *testing.T, session map[string]any) publicationFixture {
	t.Helper()
	f := publicationFixture{ledgerFixture: ledgerSetup(t, true), students: map[string]string{}, teachers: map[string]string{},
		memberships: map[string]string{}}
	f.draftID = put(t, f.app, "sessions", with2(map[string]any{"code": "draft", "title": "合班课", "status": "draft",
		"startAt": publicationStart, "endAt": "2026-11-10 11:00:00.000Z", "requiredCreditTypeId": f.creditTypeID,
		"requiredQuantity": 1, "rosterVersion": 1, "version": 2, "originType": "class",
		"attendanceRuleSnapshot": map[string]any{"version": 1, "present": "consume", "late": "consume", "leave": "release", "absent": "consume"},
		"settlementRuleSnapshot": map[string]any{"version": 1, "cancelled": "release"},
		"teacherRuleSnapshot": map[string]any{"version": 1, "rules": map[string]any{"lead": map[string]any{"ruleId": "teacher-rule-v1",
			"courseSpecId": f.specID, "baseQuantity": 1, "durationFactor": 0, "participantFactor": 0}}}}, session)).Id
	class := func(code string) string {
		return put(t, f.app, "classes", map[string]any{"code": code, "name": code, "status": "active", "defaultCreditTypeId": f.creditTypeID}).Id
	}
	f.classA, f.classB = class("class-a"), class("class-b")
	for _, name := range []string{"student-1", "student-2", "student-paused"} {
		f.students[name] = put(t, f.app, "students", map[string]any{"realName": name}).Id
	}
	for _, name := range []string{"lead", "assistant", "inactive", "substitute"} {
		f.teachers[name] = put(t, f.app, "teachers", map[string]any{"email": name + "@example.com", "password": "secret-password"}).Id
	}
	member := func(classID, name, status string) string {
		return put(t, f.app, "class_students", map[string]any{"classId": classID, "studentId": f.students[name], "status": status,
			"effectiveFrom": "2026-01-01 00:00:00.000Z"}).Id
	}
	for _, name := range []string{"student-1", "student-2"} {
		f.memberships[name] = member(f.classA, name, "active")
	}
	member(f.classA, "student-paused", "paused")
	member(f.classB, "student-1", "active")
	assign := func(classID, name, role, status string) {
		put(t, f.app, "class_teachers", map[string]any{"classId": classID, "teacherId": f.teachers[name], "role": role, "status": status,
			"effectiveFrom": "2026-01-01 00:00:00.000Z"})
	}
	assign(f.classA, "lead", "lead", "active")
	assign(f.classA, "assistant", "assistant", "active")
	assign(f.classA, "inactive", "observer", "inactive")
	assign(f.classB, "lead", "lead", "active")
	return f
}

func (f publicationFixture) publish(t *testing.T, key string, changes map[string]any) (map[string]any, error) {
	t.Helper()
	actor := f.admin(t)
	actor.IdempotencyKey = key
	return publishSession(f.app, with2(bookingInput(Body{Values: map[string]any{}}, actor, map[string]any{"sessionId": f.draftID}),
		with2(map[string]any{"classIds": []any{f.classB, f.classA, f.classA}, "teacherOverrides": []any{}}, changes)))
}

func (f publicationFixture) names(ids ...any) []string {
	names := []string{}
	for _, id := range ids {
		for name, known := range f.students {
			if known == id {
				names = append(names, name)
			}
		}
	}
	return names
}

// Hono: courseCreditSessionPublicationService › session publication atomically snapshots combined classes, deduplicated roster, and default teachers
func TestSessionPublicationSnapshotsClassesRosterAndTeachers(t *testing.T) {
	f := publicationSetup(t, nil)
	result, err := f.publish(t, "publish-key", nil)
	if err != nil || result["replayed"] == true || result["rosterCount"] != 2 {
		t.Fatalf("result = %v, %v", result, err)
	}
	if got := f.names(result["studentIds"].([]any)...); len(got) != 2 || !strings.Contains(strings.Join(got, ","), "student-1") ||
		!strings.Contains(strings.Join(got, ","), "student-2") {
		t.Fatalf("students = %v", got)
	}
	filter := `sessionId="` + f.draftID + `"`
	sources := f.first(t, "session_students", filter+` && studentId="`+f.students["student-1"]+`"`)["sourceClassIds"].([]any)
	want := []any{f.classA, f.classB}
	if f.classB < f.classA {
		want = []any{f.classB, f.classA}
	}
	if !reflect.DeepEqual(sources, want) {
		t.Fatalf("sources = %v", sources)
	}
	if f.count(t, "session_students", filter) != 2 || f.count(t, "session_classes", filter) != 2 || f.count(t, "session_teachers", filter) != 2 {
		t.Fatal("materialized rows")
	}
	session := f.first(t, "sessions", `id="`+f.draftID+`"`)
	if session["status"] != "scheduled" || session["rosterVersion"] != 2.0 || session["version"] != 3.0 {
		t.Fatalf("session = %v", session)
	}
	operation := f.first(t, "credit_operations", `type="publish_session"`)
	if operation["studentId"] != "" || f.count(t, "credit_version_claims", `entityType="session" && expectedVersion=2`) != 1 {
		t.Fatalf("operation = %v", operation)
	}
}

// Hono: courseCreditSessionPublicationService › session teacher override replaces the inherited role while preserving other roles
func TestSessionPublicationTeacherOverride(t *testing.T) {
	f := publicationSetup(t, nil)
	result, err := f.publish(t, "publish-key", map[string]any{"teacherOverrides": []any{map[string]any{"teacherId": f.teachers["substitute"],
		"role": "lead", "assignmentSource": "substitute", "actualStatus": "confirmed"}}})
	if err != nil || !reflect.DeepEqual(result["teacherAssignments"], []any{
		map[string]any{"assignmentSource": "class_default", "role": "assistant", "teacherId": f.teachers["assistant"]},
		map[string]any{"assignmentSource": "substitute", "role": "lead", "teacherId": f.teachers["substitute"]},
	}) {
		t.Fatalf("result = %v, %v", result, err)
	}
	filter := `sessionId="` + f.draftID + `"`
	if f.first(t, "session_teachers", filter+` && teacherId="`+f.teachers["substitute"]+`"`)["actualStatus"] != "confirmed" ||
		f.count(t, "session_teachers", filter+` && teacherId="`+f.teachers["lead"]+`"`) != 0 {
		t.Fatal("override")
	}
}

// Hono: courseCreditSessionPublicationService › materialized roster remains a historical snapshot after source memberships change
func TestSessionPublicationRosterIsHistorical(t *testing.T) {
	f := publicationSetup(t, nil)
	if _, err := f.publish(t, "publish-key", nil); err != nil {
		t.Fatal(err)
	}
	patch(t, f.app, "class_students", f.memberships["student-1"], map[string]any{"status": "cancelled"})
	put(t, f.app, "class_students", map[string]any{"classId": f.classB, "studentId": f.students["student-paused"], "status": "active",
		"effectiveFrom": "2026-01-01 00:00:00.000Z"})
	filter := `sessionId="` + f.draftID + `"`
	if f.count(t, "session_students", filter) != 2 || f.count(t, "session_students", filter+` && studentId="`+f.students["student-paused"]+`"`) != 0 ||
		len(f.first(t, "session_students", filter+` && studentId="`+f.students["student-1"]+`"`)["sourceClassIds"].([]any)) != 2 {
		t.Fatal("roster changed with memberships")
	}
}

// Hono: courseCreditSessionPublicationService › publication replays the original result and resolves a same-request batch race
func TestSessionPublicationReplayAndRace(t *testing.T) {
	f := publicationSetup(t, nil)
	first, err := f.publish(t, "publish-key", nil)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := f.publish(t, "publish-key", map[string]any{"classIds": []any{f.classA, f.classB}})
	if err != nil || replay["replayed"] != true || replay["operationId"] != first["operationId"] {
		t.Fatalf("replay = %v, %v", replay, err)
	}
	if f.count(t, "credit_operations", `type="publish_session"`) != 1 {
		t.Fatal("replay stored another operation")
	}

	// The identical request committed while this plan failed: the stored result is replayed.
	stored := f.first(t, "credit_operations", `type="publish_session"`)
	hash := stored["requestSnapshot"].(map[string]any)["requestHash"].(string)
	raced, err := commitOrReplay(f.app, []step{update("sessions", "missing", map[string]any{})}, stored["idempotencyKey"].(string), hash,
		replayConflict, "COURSE_CREDIT_BATCH_FAILED", map[string]any{})
	if err != nil || raced["replayed"] != true {
		t.Fatalf("raced = %v, %v", raced, err)
	}

	_, err = f.publish(t, "publish-key", map[string]any{"teacherOverrides": []any{map[string]any{"teacherId": f.teachers["substitute"], "role": "lead"}}})
	failsWith(t, err, "IDEMPOTENCY_CONFLICT")
}

// Hono: courseCreditSessionPublicationService › publication rejects invalid sessions, classes, credit types, teachers, and storage failures
func TestSessionPublicationRejectsInvalidInputs(t *testing.T) {
	for _, item := range []struct {
		session, changes map[string]any
		code             string
	}{
		{nil, map[string]any{"sessionId": ""}, "SESSION_ID_REQUIRED"},
		{nil, map[string]any{"classIds": []any{}}, "SESSION_CLASSES_REQUIRED"},
		{nil, map[string]any{"classIds": []any{""}}, "CLASS_ID_REQUIRED"},
		{nil, map[string]any{"teacherOverrides": map[string]any{}}, "INVALID_TEACHER_OVERRIDES"},
		{map[string]any{"status": "scheduled"}, nil, "SESSION_NOT_DRAFT"},
		{map[string]any{"endAt": publicationStart}, nil, "SESSION_TIME_INVALID"},
		{map[string]any{"requiredQuantity": 0}, nil, "SESSION_CREDIT_QUANTITY_INVALID"},
		{map[string]any{"attendanceRuleSnapshot": map[string]any{}}, nil, "ATTENDANCE_RULE_SNAPSHOT_REQUIRED"},
		{map[string]any{"settlementRuleSnapshot": map[string]any{}}, nil, "SETTLEMENT_RULE_SNAPSHOT_REQUIRED"},
		{map[string]any{"teacherRuleSnapshot": nil}, nil, "TEACHER_RULE_SNAPSHOT_REQUIRED"},
	} {
		f := publicationSetup(t, item.session)
		_, err := f.publish(t, "publish-key", item.changes)
		failsWith(t, err, item.code)
	}

	f := publicationSetup(t, nil)
	patch(t, f.app, "classes", f.classA, map[string]any{"status": "completed"})
	_, err := f.publish(t, "k1", nil)
	failsWith(t, err, "CLASS_NOT_ACTIVE")
	patch(t, f.app, "classes", f.classA, map[string]any{"status": "active"})
	other := put(t, f.app, "credit_types", map[string]any{"code": "other", "name": "其他", "kind": "course", "consumable": true, "status": "active"})
	patch(t, f.app, "classes", f.classB, map[string]any{"defaultCreditTypeId": other.Id})
	_, err = f.publish(t, "k2", nil)
	failsWith(t, err, "CLASS_CREDIT_TYPE_MISMATCH")
	patch(t, f.app, "classes", f.classB, map[string]any{"defaultCreditTypeId": f.creditTypeID})
	patch(t, f.app, "credit_types", f.creditTypeID, map[string]any{"kind": "universal", "consumable": false})
	_, err = f.publish(t, "k3", nil)
	failsWith(t, err, "SESSION_CREDIT_TYPE_INVALID")
	patch(t, f.app, "credit_types", f.creditTypeID, map[string]any{"kind": "course", "consumable": true})

	_, err = f.app.DB().NewQuery("DELETE FROM class_teachers").Execute()
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.publish(t, "k4", nil)
	failsWith(t, err, "SESSION_LEAD_TEACHER_REQUIRED")

	failing := publicationSetup(t, nil)
	failFirst(failing.app, "session_classes", 1, errors.New("failed"))
	_, err = failing.publish(t, "k5", nil)
	failsWith(t, err, "COURSE_CREDIT_BATCH_FAILED")
	if failing.count(t, "session_students", "") != 0 || failing.first(t, "sessions", `id="`+failing.draftID+`"`)["status"] != "draft" {
		t.Fatal("a failed publication left rows behind")
	}
}

// Hono: courseCreditSessionPublicationService › publication planning helpers validate override policies and deterministic keys
func TestSessionPublicationHelpers(t *testing.T) {
	if filter := activeAtFilter("classId", `a"`, "2026-08-10T10:00:00.000Z"); !strings.Contains(filter, "effectiveFrom") ||
		!strings.Contains(filter, `classId="a\"`) || !strings.Contains(filter, "2026-08-10 10:00:00.000Z") {
		t.Fatalf("filter = %s", filter)
	}
	if (sessionTeacher{teacherID: "teacher", role: "lead"}).key() != "lead:teacher" {
		t.Fatal("teacher key")
	}
	if got, err := normalizeTeacherOverride(map[string]any{"teacherId": "teacher", "role": "lead"}); err != nil ||
		got != (sessionTeacher{"teacher", "lead", "session_override", "planned"}) {
		t.Fatalf("override = %+v, %v", got, err)
	}
	rows, err := materializeSessionTeachers([]any{map[string]any{"teacherId": "teacher", "role": "lead", "status": "active"}}, nil, "session")
	if err != nil || rows[0]["assignmentSource"] != "class_default" || rows[0]["actualStatus"] != "planned" {
		t.Fatalf("class teacher = %v, %v", rows, err)
	}
	for _, item := range []struct {
		override map[string]any
		code     string
	}{
		{map[string]any{"role": "lead"}, "TEACHER_ID_REQUIRED"},
		{map[string]any{"teacherId": "x", "role": "bad"}, "INVALID_TEACHER_ROLE"},
		{map[string]any{"teacherId": "x", "role": "lead", "assignmentSource": "class_default"}, "INVALID_ASSIGNMENT_SOURCE"},
		{map[string]any{"teacherId": "x", "role": "lead", "actualStatus": "bad"}, "INVALID_ACTUAL_TEACHER_STATUS"},
	} {
		_, err := normalizeTeacherOverride(item.override)
		failsWith(t, err, item.code)
	}
	for _, item := range []struct {
		assignment map[string]any
		code       string
	}{
		{map[string]any{"role": "lead", "status": "active"}, "TEACHER_ID_REQUIRED"},
		{map[string]any{"teacherId": "x", "role": "bad", "status": "active"}, "INVALID_TEACHER_ROLE"},
	} {
		_, err := materializeSessionTeachers([]any{item.assignment}, nil, "session")
		failsWith(t, err, item.code)
	}
	_, err = materializeSessionTeachers(nil, nil, "session")
	failsWith(t, err, "SESSION_LEAD_TEACHER_REQUIRED")
	if err := validateDraftSession(map[string]any{"status": "draft", "startAt": "2026-08-10T10:00:00Z", "endAt": "2026-08-10T11:00:00Z",
		"requiredQuantity":       1.0,
		"attendanceRuleSnapshot": map[string]any{"version": 1.0, "present": "consume", "late": "consume", "leave": "release", "absent": "consume"},
		"settlementRuleSnapshot": map[string]any{"version": 1.0, "cancelled": "release"},
		"teacherRuleSnapshot": map[string]any{"version": 1.0, "rules": map[string]any{"lead": map[string]any{"ruleId": "rule", "courseSpecId": "spec",
			"baseQuantity": 1.0, "durationFactor": 0.0, "participantFactor": 0.0}}}}); err != nil {
		t.Fatal(err)
	}
}
