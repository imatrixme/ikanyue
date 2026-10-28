package coursecredit

import (
	"errors"
	"testing"

	"kanyue.server/internal/testkit"
)

// Class membership cases ported from Hono's courseCreditClassMembershipService tests.

const membershipEffective = "2026-08-01T00:00:00.000Z"

type membershipFixture struct {
	ledgerFixture
	otherClassID, teacherID string
}

func membershipSetup(t *testing.T) membershipFixture {
	t.Helper()
	f := ledgerSetup(t, true)
	other := testkit.Create(t, f.app, "classes", map[string]any{"code": "c2", "name": "周日班", "courseSpecId": f.specID,
		"defaultCreditTypeId": f.creditTypeID, "status": "active", "capacity": 8})
	return membershipFixture{ledgerFixture: f, otherClassID: other.Id, teacherID: f.operatorID(t)}
}

// command is Hono's command input: metadata plus named fields.
func (f membershipFixture) command(t *testing.T, key string, values map[string]any) map[string]any {
	t.Helper()
	actor := f.admin(t)
	actor.IdempotencyKey = key
	return bookingInput(Body{Values: map[string]any{}}, actor, values)
}

func (f membershipFixture) student(t *testing.T, changes map[string]any) map[string]any {
	t.Helper()
	return with2(f.command(t, "student-key", map[string]any{"classId": f.classID, "studentId": f.studentID,
		"status": "active", "effectiveFrom": membershipEffective}), changes)
}

func (f membershipFixture) transfer(t *testing.T, changes map[string]any) map[string]any {
	t.Helper()
	return with2(f.command(t, "transfer-key", map[string]any{"fromClassId": f.classID, "toClassId": f.otherClassID,
		"studentId": f.studentID, "effectiveAt": membershipEffective}), changes)
}

func (f membershipFixture) teacher(t *testing.T, changes map[string]any) map[string]any {
	t.Helper()
	return with2(f.command(t, "teacher-key", map[string]any{"classId": f.classID, "teacherId": f.teacherID,
		"role": "lead", "status": "active", "effectiveFrom": membershipEffective}), changes)
}

func (f membershipFixture) member(t *testing.T, classID, effectiveFrom string) string {
	t.Helper()
	return put(t, f.app, "class_students", map[string]any{"classId": classID, "studentId": f.studentID, "status": "active",
		"effectiveFrom": effectiveFrom, "effectiveTo": ""}).Id
}

// conversion_allocations exists in the schema but only the deleted student conversion wrote it.
var ledgerCollections = []string{"credit_batches", "credit_events", "session_credit_allocations"}

// Hono: courseCreditClassMembershipService › student membership command writes teaching relation and audit without changing credit quantities
func TestMembershipWritesRelationWithoutLedger(t *testing.T) {
	f := membershipSetup(t)
	result, err := setStudentMembership(f.app, f.student(t, nil))
	if err != nil || result["replayed"] != false {
		t.Fatalf("result = %v, %v", result, err)
	}
	if operation := f.first(t, "credit_operations", `idempotencyKey="setStudentMembership:student-key"`); operation["type"] != "class_membership" {
		t.Fatalf("operation = %v", operation)
	}
	member := f.first(t, "class_students", `id="`+result["membershipId"].(string)+`"`)
	if member["classId"] != f.classID || member["studentId"] != f.studentID || member["status"] != "active" ||
		member["effectiveFrom"] != "2026-08-01 00:00:00.000Z" || member["effectiveTo"] != "" || member["sourceOrderId"] != "" {
		t.Fatalf("membership = %v", member)
	}
	if f.count(t, "outbox_events", `topic="course-credit.class-student-changed"`) != 1 {
		t.Fatal("missing outbox event")
	}
	for _, collection := range ledgerCollections {
		if f.count(t, collection, "") != 0 {
			t.Fatalf("membership wrote %s", collection)
		}
	}
}

// Hono: courseCreditClassMembershipService › membership transition closes the prior interval and creates the new status atomically
func TestMembershipTransitionClosesPriorInterval(t *testing.T) {
	f := membershipSetup(t)
	prior := f.member(t, f.classID, "2026-07-01 00:00:00.000Z")
	result, err := setStudentMembership(f.app, f.student(t, map[string]any{"status": "paused",
		"effectiveFrom": "2026-09-01T00:00:00Z", "effectiveTo": "2026-10-01T00:00:00Z"}))
	if err != nil {
		t.Fatal(err)
	}
	if closed := f.first(t, "class_students", `id="`+prior+`"`); closed["effectiveTo"] != "2026-09-01 00:00:00.000Z" {
		t.Fatalf("prior = %v", closed)
	}
	created := f.first(t, "class_students", `id="`+result["membershipId"].(string)+`"`)
	if created["status"] != "paused" || created["effectiveTo"] != "2026-10-01 00:00:00.000Z" {
		t.Fatalf("created = %v", created)
	}
}

// Hono: courseCreditClassMembershipService › student transfer closes source and opens target without any ledger movement
func TestTransferClosesSourceAndOpensTarget(t *testing.T) {
	f := membershipSetup(t)
	source := f.member(t, f.classID, "2026-07-01 00:00:00.000Z")
	result, err := transferStudent(f.app, f.transfer(t, nil))
	if err != nil || result["toClassId"] != f.otherClassID {
		t.Fatalf("result = %v, %v", result, err)
	}
	if closed := f.first(t, "class_students", `id="`+source+`"`); closed["effectiveTo"] != "2026-08-01 00:00:00.000Z" {
		t.Fatalf("source = %v", closed)
	}
	if target := f.first(t, "class_students", `id="`+result["membershipId"].(string)+`"`); target["classId"] != f.otherClassID {
		t.Fatalf("target = %v", target)
	}
	for _, collection := range ledgerCollections {
		if f.count(t, collection, "") != 0 {
			t.Fatalf("transfer wrote %s", collection)
		}
	}
}

// Hono: courseCreditClassMembershipService › teacher assignment snapshots role and closes a previous effective interval
func TestTeacherAssignmentClosesPreviousInterval(t *testing.T) {
	f := membershipSetup(t)
	prior := put(t, f.app, "class_teachers", map[string]any{"classId": f.classID, "teacherId": f.teacherID, "role": "lead",
		"status": "active", "effectiveFrom": "2026-07-01 00:00:00.000Z", "effectiveTo": ""}).Id
	result, err := setTeacherAssignment(f.app, f.teacher(t, nil))
	if err != nil || result["role"] != "lead" {
		t.Fatalf("result = %v, %v", result, err)
	}
	if closed := f.first(t, "class_teachers", `id="`+prior+`"`); closed["effectiveTo"] != "2026-08-01 00:00:00.000Z" {
		t.Fatalf("prior = %v", closed)
	}
	created := f.first(t, "class_teachers", `id="`+result["assignmentId"].(string)+`"`)
	if created["classId"] != f.classID || created["teacherId"] != f.teacherID || created["role"] != "lead" ||
		created["status"] != "active" || created["effectiveFrom"] != "2026-08-01 00:00:00.000Z" || created["effectiveTo"] != "" {
		t.Fatalf("created = %v", created)
	}
}

// Hono: courseCreditClassMembershipService › teaching commands replay committed results and reject conflicting key reuse
func TestTeachingCommandsReplayAndConflict(t *testing.T) {
	f := membershipSetup(t)
	first, err := setStudentMembership(f.app, f.student(t, nil))
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := setStudentMembership(f.app, f.student(t, nil))
	if err != nil || replayed["replayed"] != true || replayed["membershipId"] != first["membershipId"] {
		t.Fatalf("replay = %v, %v", replayed, err)
	}
	if f.count(t, "class_students", "") != 1 {
		t.Fatal("replay wrote another membership")
	}
	_, err = setStudentMembership(f.app, f.student(t, map[string]any{"status": "paused"}))
	failsWith(t, err, "IDEMPOTENCY_CONFLICT")

	// A concurrent identical assignment committed while this plan failed.
	command := f.teacher(t, nil)
	prepared, err := prepareTeaching(f.app, "setTeacherAssignment", command, map[string]any{"race": true})
	if err != nil {
		t.Fatal(err)
	}
	put(t, f.app, "credit_operations", map[string]any{"type": "class_teacher_assignment", "status": "committed", "operationNo": "raced",
		"idempotencyKey": prepared.scopedKey, "requestSnapshot": map[string]any{"requestHash": prepared.requestHash},
		"resultSnapshot": map[string]any{"operationId": "raced"}})
	raced, err := prepared.commit(f.app, []step{update("class_teachers", "missing", map[string]any{})}, map[string]any{})
	if err != nil || raced["replayed"] != true || raced["operationId"] != "raced" {
		t.Fatalf("raced = %v, %v", raced, err)
	}
}

// Hono: courseCreditClassMembershipService › membership validation rejects invalid identities, dates, transitions, classes, and transfers
func TestMembershipValidation(t *testing.T) {
	f := membershipSetup(t)
	for _, item := range []struct {
		changes map[string]any
		code    string
	}{
		{map[string]any{"classId": ""}, "CLASS_ID_REQUIRED"},
		{map[string]any{"studentId": ""}, "STUDENT_ID_REQUIRED"},
		{map[string]any{"status": "bad"}, "INVALID_MEMBERSHIP_STATUS"},
		{map[string]any{"effectiveFrom": "bad"}, "INVALID_DATE"},
		{map[string]any{"effectiveTo": "2026-07-01T00:00:00Z"}, "INVALID_EFFECTIVE_RANGE"},
	} {
		_, err := setStudentMembership(f.app, f.student(t, item.changes))
		failsWith(t, err, item.code)
	}
	patch(t, f.app, "classes", f.classID, map[string]any{"status": "completed"})
	_, err := setStudentMembership(f.app, f.student(t, nil))
	failsWith(t, err, "CLASS_NOT_OPEN")
	patch(t, f.app, "classes", f.classID, map[string]any{"status": "active"})
	open := f.member(t, f.classID, "2026-08-01 00:00:00.000Z")
	_, err = setStudentMembership(f.app, f.student(t, nil))
	failsWith(t, err, "MEMBERSHIP_EFFECTIVE_ORDER_INVALID")
	patch(t, f.app, "class_students", open, map[string]any{"effectiveFrom": "2026-07-01 00:00:00.000Z"})
	failFirst(f.app, "class_students", 2, errors.New("storage"))
	_, err = setStudentMembership(f.app, f.student(t, map[string]any{"idempotencyKey": "storage"}))
	failsWith(t, err, "COURSE_CREDIT_BATCH_FAILED")
}

// Hono: courseCreditClassMembershipService › membership validation rejects invalid identities, dates, transitions, classes, and transfers
func TestTransferValidation(t *testing.T) {
	f := membershipSetup(t)
	for _, item := range []struct {
		changes map[string]any
		code    string
	}{
		{map[string]any{"fromClassId": ""}, "SOURCE_CLASS_ID_REQUIRED"},
		{map[string]any{"toClassId": ""}, "TARGET_CLASS_ID_REQUIRED"},
		{map[string]any{"studentId": ""}, "STUDENT_ID_REQUIRED"},
		{map[string]any{"toClassId": f.classID}, "TRANSFER_CLASS_MUST_DIFFER"},
	} {
		_, err := transferStudent(f.app, f.transfer(t, item.changes))
		failsWith(t, err, item.code)
	}
	_, err := transferStudent(f.app, f.transfer(t, nil))
	failsWith(t, err, "SOURCE_MEMBERSHIP_NOT_ACTIVE")

	f.member(t, f.classID, "2026-07-01 00:00:00.000Z")
	target := f.member(t, f.otherClassID, "2026-07-01 00:00:00.000Z")
	_, err = transferStudent(f.app, f.transfer(t, nil))
	failsWith(t, err, "TARGET_MEMBERSHIP_ALREADY_OPEN")
	patch(t, f.app, "class_students", target, map[string]any{"effectiveTo": "2026-07-15 00:00:00.000Z"})

	other := testkit.Create(t, f.app, "credit_types", map[string]any{"code": "other", "name": "其他", "kind": "course",
		"courseSpecId": f.specID, "consumable": true, "referenceUnitValue": 100, "status": "active"})
	patch(t, f.app, "classes", f.otherClassID, map[string]any{"defaultCreditTypeId": other.Id})
	_, err = transferStudent(f.app, f.transfer(t, nil))
	failsWith(t, err, "TRANSFER_CREDIT_TYPE_MISMATCH")
}

// Hono: courseCreditClassMembershipService › teacher and date helpers cover policy boundaries
func TestMembershipHelpers(t *testing.T) {
	if date, err := membershipDate(membershipEffective, "date"); err != nil || date != membershipEffective {
		t.Fatalf("date = %q, %v", date, err)
	}
	if end, err := optionalMembershipEnd("", membershipEffective); err != nil || end != "" {
		t.Fatalf("blank end = %q, %v", end, err)
	}
	if end, err := optionalMembershipEnd("2026-09-01T00:00:00Z", membershipEffective); err != nil || end != "2026-09-01T00:00:00.000Z" {
		t.Fatalf("end = %q, %v", end, err)
	}
	if err := first(validateOpenClass(map[string]any{"status": "draft"}), validateTransitionTime(nil, membershipEffective)); err != nil {
		t.Fatal(err)
	}
	f := membershipSetup(t)
	for _, item := range []struct {
		changes map[string]any
		code    string
	}{
		{map[string]any{"teacherId": ""}, "TEACHER_ID_REQUIRED"},
		{map[string]any{"role": "bad"}, "INVALID_TEACHER_ROLE"},
		{map[string]any{"status": "bad"}, "INVALID_TEACHER_STATUS"},
	} {
		_, err := setTeacherAssignment(f.app, f.teacher(t, item.changes))
		failsWith(t, err, item.code)
	}
}
