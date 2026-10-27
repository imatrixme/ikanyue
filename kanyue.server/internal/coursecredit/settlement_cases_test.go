package coursecredit

import (
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// Session settlement cases ported from Hono's courseCreditSessionSettlementService
// tests, over a stored settled-ready session instead of Hono's mock repository.

type settlementFixture struct {
	ledgerFixture
	sessionID, source string
	students          map[string]string // attendance status → session student id
	batches           map[string]string // attendance status → batch id
	allocations       map[string]string // attendance status → allocation id
	teachers          map[string]string // key → session teacher id
	rules             map[string]string // role → teacher credit rule id
}

func (f settlementFixture) teacherRule(role string, base, duration, participant float64) map[string]any {
	return map[string]any{"ruleId": f.rules[role], "courseSpecId": f.specID, "baseQuantity": base,
		"durationFactor": duration, "participantFactor": participant}
}

// settlementSetup stores a completed session whose students each hold one reserved
// credit and whose teachers are a confirmed lead, a confirmed assistant and an absent lead.
func settlementSetup(t *testing.T, session func(f settlementFixture) map[string]any, attendances ...string) settlementFixture {
	t.Helper()
	if len(attendances) == 0 {
		attendances = []string{"present", "leave"}
	}
	ledger := ledgerSetup(t, true)
	f := settlementFixture{ledgerFixture: ledger, students: map[string]string{}, batches: map[string]string{},
		allocations: map[string]string{}, teachers: map[string]string{}, rules: map[string]string{}}
	for _, role := range []string{"lead", "assistant"} {
		f.rules[role] = put(t, f.app, "teacher_credit_rules", map[string]any{"courseSpecId": f.specID, "role": role, "baseQuantity": 1,
			"durationFactor": 0, "participantFactor": 0, "validFrom": "2020-01-01 00:00:00.000Z", "version": 1, "status": "active"}).Id
	}
	f.source = put(t, f.app, "credit_operations", map[string]any{"type": "grant", "status": "committed", "operationNo": "source",
		"idempotencyKey": "source", "studentId": f.studentID}).Id
	fields := map[string]any{"code": "settle", "title": "结算课", "status": "completed", "startAt": "2026-08-10 10:00:00.000Z",
		"endAt": "2026-08-10 11:00:00.000Z", "requiredCreditTypeId": f.creditTypeID, "requiredQuantity": 1, "rosterVersion": 2,
		"version": 5, "originType": "class",
		"attendanceRuleSnapshot": map[string]any{"version": 1, "present": "consume", "late": "consume", "leave": "release", "absent": "consume"},
		"settlementRuleSnapshot": map[string]any{"version": 1, "cancelled": "release"},
		"teacherRuleSnapshot": map[string]any{"version": 2, "rules": map[string]any{
			"lead": f.teacherRule("lead", 1, 0, 0.1), "assistant": f.teacherRule("assistant", 0.5, 0.25, 0)}}}
	if session != nil {
		for key, value := range session(f) {
			fields[key] = value
		}
	}
	f.sessionID = put(t, f.app, "sessions", fields).Id
	for _, status := range attendances {
		learner := put(t, f.app, "students", map[string]any{"realName": "学员" + status})
		f.students[status] = put(t, f.app, "session_students", map[string]any{"sessionId": f.sessionID, "studentId": learner.Id,
			"attendanceStatus": status, "creditStatus": "reserved", "version": 3}).Id
		f.batches[status] = put(t, f.app, "credit_batches", map[string]any{"studentId": learner.Id, "creditTypeId": f.creditTypeID,
			"sourceOperationId": f.source, "originalQuantity": 1, "availableQuantity": 0, "frozenQuantity": 1, "consumedQuantity": 0,
			"expiredQuantity": 0, "reversedQuantity": 0, "status": "active", "activationMode": "GRANT_TIME",
			"validFrom": "2026-08-01 00:00:00.000Z", "effectiveExpiresAt": "2026-08-11 00:00:00.000Z",
			"activatedAt": "2026-08-01 00:00:00.000Z", "version": 2}).Id
		f.allocations[status] = put(t, f.app, "session_credit_allocations", map[string]any{"sessionStudentId": f.students[status],
			"batchId": f.batches[status], "quantity": 1, "status": "reserved", "reservedForStartAt": "2026-08-10 10:00:00.000Z",
			"operationId": f.source}).Id
	}
	for _, teacher := range []struct{ key, role, status string }{{"lead", "lead", "confirmed"}, {"assistant", "assistant", "confirmed"},
		{"absent", "lead", "absent"}} {
		account := f.operatorID(t)
		if teacher.key != "lead" {
			account = put(t, f.app, "teachers", map[string]any{"email": teacher.key + "@example.com", "password": "secret-password"}).Id
		}
		f.teachers[teacher.key] = put(t, f.app, "session_teachers", map[string]any{"sessionId": f.sessionID, "teacherId": account,
			"role": teacher.role, "assignmentSource": "class_default", "actualStatus": teacher.status, "creditStatus": "not_eligible"}).Id
	}
	return f
}

func (f settlementFixture) command(t *testing.T, key string) map[string]any {
	t.Helper()
	actor := f.admin(t)
	actor.IdempotencyKey = key
	return bookingInput(Body{Values: map[string]any{}}, actor, map[string]any{"sessionId": f.sessionID})
}

func (f settlementFixture) settle(t *testing.T, key string) (map[string]any, error) {
	t.Helper()
	return settleSession(f.app, f.command(t, key))
}

func outcomeStatuses(result map[string]any) map[string]string {
	statuses := map[string]string{}
	for _, item := range result["studentOutcomes"].([]any) {
		outcome := item.(map[string]any)
		statuses[outcome["attendanceStatus"].(string)] = outcome["creditStatus"].(string)
	}
	return statuses
}

func earningQuantities(result map[string]any) []float64 {
	quantities := []float64{}
	for _, item := range result["teacherEarnings"].([]any) {
		quantities = append(quantities, item.(map[string]any)["quantity"].(float64))
	}
	slices.Sort(quantities)
	return quantities
}

// Hono: courseCreditSessionSettlementService › settleSession atomically settles students, teacher earnings, session, audit, and outbox
func TestSettleSessionWritesEverything(t *testing.T) {
	f := settlementSetup(t, nil)
	result, err := f.settle(t, "settle-key")
	if err != nil || result["replayed"] != false {
		t.Fatalf("result = %v, %v", result, err)
	}
	if statuses := outcomeStatuses(result); statuses["present"] != "consumed" || statuses["leave"] != "released" {
		t.Fatalf("outcomes = %v", statuses)
	}
	if quantities := earningQuantities(result); !slices.Equal(quantities, []float64{0.75, 1.1}) {
		t.Fatalf("earnings = %v", quantities)
	}
	operation := f.first(t, "credit_operations", `id="`+result["operationId"].(string)+`"`)
	if operation["type"] != "settle_session" || operation["requestSnapshot"].(map[string]any)["sessionStatus"] != "completed" {
		t.Fatalf("operation = %v", operation)
	}
	if batch := f.first(t, "credit_batches", `id="`+f.batches["present"]+`"`); batch["consumedQuantity"] != 1.0 {
		t.Fatalf("present batch = %v", batch)
	}
	// The leave reservation's batch lapsed before settlement, so it releases straight to expired.
	if batch := f.first(t, "credit_batches", `id="`+f.batches["leave"]+`"`); batch["expiredQuantity"] != 1.0 {
		t.Fatalf("leave batch = %v", batch)
	}
	if allocation := f.first(t, "session_credit_allocations", `id="`+f.allocations["leave"]+`"`); allocation["status"] != "expired" {
		t.Fatalf("leave allocation = %v", allocation)
	}
	if f.count(t, "teacher_credit_events", `status="pending"`) != 2 {
		t.Fatal("teacher earnings")
	}
	if teacher := f.first(t, "session_teachers", `id="`+f.teachers["lead"]+`"`); teacher["creditStatus"] != "pending" {
		t.Fatalf("lead = %v", teacher)
	}
	if teacher := f.first(t, "session_teachers", `id="`+f.teachers["absent"]+`"`); teacher["creditStatus"] != "not_eligible" {
		t.Fatalf("absent lead = %v", teacher)
	}
	if session := f.first(t, "sessions", `id="`+f.sessionID+`"`); session["status"] != "settled" {
		t.Fatalf("session = %v", session)
	}
	if f.count(t, "outbox_events", `topic="course-credit.session-settled"`) != 1 {
		t.Fatal("outbox")
	}
}

// Hono: courseCreditSessionSettlementService › cancelled session releases reservations and creates no normal teacher earning
func TestCancelledSessionReleasesWithoutEarnings(t *testing.T) {
	f := settlementSetup(t, func(settlementFixture) map[string]any { return map[string]any{"status": "cancelled"} }, "present")
	result, err := f.settle(t, "cancel")
	if err != nil || outcomeStatuses(result)["present"] != "released" || len(result["teacherEarnings"].([]any)) != 0 {
		t.Fatalf("result = %v, %v", result, err)
	}
	if f.count(t, "teacher_credit_events", "") != 0 {
		t.Fatal("cancelled session wrote teacher earnings")
	}
}

// Hono: courseCreditSessionSettlementService › cancelled session creates only snapshotted teacher compensation independent from student quantity
func TestCancelledSessionCompensatesSnapshottedTeachers(t *testing.T) {
	f := settlementSetup(t, func(f settlementFixture) map[string]any {
		lead := f.teacherRule("lead", 1, 0, 0)
		lead["cancellationCompensation"] = map[string]any{"quantity": 0.75, "eligibleActualStatuses": []any{"confirmed"}}
		return map[string]any{"status": "cancelled", "teacherRuleSnapshot": map[string]any{"version": 3,
			"rules": map[string]any{"lead": lead, "assistant": f.teacherRule("assistant", 1, 0, 0)}}}
	})
	result, err := f.settle(t, "cancel-compensation")
	if err != nil || len(result["studentOutcomes"].([]any)) != 2 {
		t.Fatalf("result = %v, %v", result, err)
	}
	earnings := result["teacherEarnings"].([]any)
	if len(earnings) != 1 || earnings[0].(map[string]any)["eventType"] != "compensate" || earnings[0].(map[string]any)["quantity"] != 0.75 {
		t.Fatalf("earnings = %v", earnings)
	}
	if event := f.first(t, "teacher_credit_events", `eventType="compensate"`); event["reason"] != "session_cancellation_compensation" ||
		f.count(t, "teacher_credit_events", "") != 1 {
		t.Fatalf("event = %v", event)
	}
}

// Hono: courseCreditSessionSettlementService › correction-pending session re-settles using its preserved terminal status
func TestCorrectionPendingSessionResettles(t *testing.T) {
	f := settlementSetup(t, nil)
	patch(t, f.app, "sessions", f.sessionID, map[string]any{"status": "correction_pending", "correctionBaseStatus": "completed",
		"settlementOperationId": f.source})
	result, err := f.settle(t, "resettle-key")
	if err != nil || len(result["studentOutcomes"].([]any)) != 2 {
		t.Fatalf("result = %v, %v", result, err)
	}
	snapshot := f.first(t, "credit_operations", `id="`+result["operationId"].(string)+`"`)["requestSnapshot"].(map[string]any)
	if snapshot["sessionStatus"] != "completed" || snapshot["priorSettlementOperationId"] != f.source {
		t.Fatalf("snapshot = %v", snapshot)
	}
	if session := f.first(t, "sessions", `id="`+f.sessionID+`"`); session["correctionBaseStatus"] != "" || session["status"] != "settled" {
		t.Fatalf("session = %v", session)
	}
}

// Hono: courseCreditSessionSettlementService › settlement replays immutable results and resolves same-request races
func TestSettlementReplaysAndResolvesRaces(t *testing.T) {
	f := settlementSetup(t, nil)
	first, err := f.settle(t, "settle-key")
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := f.settle(t, "settle-key")
	if err != nil || replayed["replayed"] != true || replayed["operationId"] != first["operationId"] {
		t.Fatalf("replay = %v, %v", replayed, err)
	}
	if f.count(t, "credit_operations", `type="settle_session"`) != 1 {
		t.Fatal("replay settled again")
	}
	// A stored command under the key with another request hash conflicts.
	put(t, f.app, "credit_operations", map[string]any{"type": "settle_session", "status": "committed", "operationNo": "other",
		"idempotencyKey": "settleSession:other", "requestSnapshot": map[string]any{"requestHash": "different"}, "resultSnapshot": map[string]any{}})
	_, err = f.settle(t, "other")
	failsWith(t, err, "IDEMPOTENCY_CONFLICT")

	prepared, err := prepareTeaching(f.app, "settleSession", f.command(t, "race"), map[string]any{"sessionId": f.sessionID})
	if err != nil {
		t.Fatal(err)
	}
	put(t, f.app, "credit_operations", map[string]any{"type": "settle_session", "status": "committed", "operationNo": "raced",
		"idempotencyKey": prepared.scopedKey, "requestSnapshot": map[string]any{"requestHash": prepared.requestHash},
		"resultSnapshot": map[string]any{"operationId": "raced"}})
	raced, err := prepared.commit(f.app, []step{update("sessions", "missing", map[string]any{})}, map[string]any{})
	if err != nil || raced["replayed"] != true || raced["operationId"] != "raced" {
		t.Fatalf("raced = %v, %v", raced, err)
	}
}

// Hono: courseCreditSessionSettlementService › teacher write failure rejects the single transaction without compensation writes
func TestTeacherWriteFailureRollsBackSettlement(t *testing.T) {
	f := settlementSetup(t, nil)
	f.app.OnRecordCreateExecute("teacher_credit_events").BindFunc(func(*core.RecordEvent) error {
		return Fail("TEACHER_WRITE_FAILED", "teacher failed", nil)
	})
	_, err := f.settle(t, "settle-key")
	failsWith(t, err, "TEACHER_WRITE_FAILED")
	for _, collection := range []string{"credit_events", "teacher_credit_events"} {
		if f.count(t, collection, "") != 0 {
			t.Fatalf("%s kept a partial write", collection)
		}
	}
	if session := f.first(t, "sessions", `id="`+f.sessionID+`"`); session["status"] != "completed" {
		t.Fatalf("session = %v", session)
	}
}

// Hono: courseCreditSessionSettlementService › settlement validates session, roster, credit, allocation, and storage contracts
func TestSettlementValidation(t *testing.T) {
	f := settlementSetup(t, nil)
	_, err := settleSession(f.app, with2(f.command(t, "empty"), map[string]any{"sessionId": ""}))
	failsWith(t, err, "SESSION_ID_REQUIRED")
	for i, item := range []struct {
		session map[string]any
		code    string
	}{
		{map[string]any{"status": "scheduled"}, "SESSION_NOT_SETTLEABLE"},
		{map[string]any{"originType": "migration"}, "MIGRATION_SESSION_SETTLEMENT_FORBIDDEN"},
		{map[string]any{"requiredQuantity": 0}, "SESSION_CREDIT_QUANTITY_INVALID"},
		{map[string]any{"settlementOperationId": f.source}, "SESSION_ALREADY_SETTLED"},
		{map[string]any{"status": "correction_pending", "correctionBaseStatus": ""}, "CORRECTION_BASE_STATUS_REQUIRED"},
		{map[string]any{"status": "correction_pending", "correctionBaseStatus": "completed"}, "PRIOR_SETTLEMENT_OPERATION_REQUIRED"},
	} {
		patch(t, f.app, "sessions", f.sessionID, item.session)
		_, err := f.settle(t, "session-"+string(rune('a'+i)))
		failsWith(t, err, item.code)
		patch(t, f.app, "sessions", f.sessionID, map[string]any{"status": "completed", "originType": "class", "requiredQuantity": 1,
			"settlementOperationId": "", "correctionBaseStatus": ""})
	}

	patch(t, f.app, "credit_types", f.creditTypeID, map[string]any{"kind": "universal", "consumable": false})
	_, err = f.settle(t, "credit-type")
	failsWith(t, err, "SESSION_CREDIT_TYPE_INVALID")
	patch(t, f.app, "credit_types", f.creditTypeID, map[string]any{"kind": "course", "consumable": true})

	patch(t, f.app, "session_students", f.students["present"], map[string]any{"creditStatus": "credit_insufficient"})
	_, err = f.settle(t, "unresolved")
	failsWith(t, err, "SESSION_STUDENT_CREDIT_UNRESOLVED")
	patch(t, f.app, "session_students", f.students["present"], map[string]any{"creditStatus": "reserved"})

	patch(t, f.app, "session_credit_allocations", f.allocations["present"], map[string]any{"status": "consumed"})
	_, err = f.settle(t, "allocation")
	failsWith(t, err, "SESSION_ALLOCATION_QUANTITY_MISMATCH")
	patch(t, f.app, "session_credit_allocations", f.allocations["present"], map[string]any{"status": "reserved"})

	failFirst(f.app, "teacher_credit_events", 2, errors.New("storage"))
	_, err = f.settle(t, "storage")
	failsWith(t, err, "COURSE_CREDIT_BATCH_FAILED")
}

// Hono: courseCreditSessionSettlementService › settlement validates session, roster, credit, allocation, and storage contracts
func TestSettlementRequiresRoster(t *testing.T) {
	f := settlementSetup(t, nil, "present")
	rows, err := f.app.FindRecordsByFilter("session_students", `sessionId="`+f.sessionID+`"`, "", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range rows {
		allocations, _ := f.app.FindRecordsByFilter("session_credit_allocations", `sessionStudentId="`+row.Id+`"`, "", 0, 0)
		for _, allocation := range allocations {
			if err := f.app.Delete(allocation); err != nil {
				t.Fatal(err)
			}
		}
		if err := f.app.Delete(row); err != nil {
			t.Fatal(err)
		}
	}
	_, err = f.settle(t, "no-roster")
	failsWith(t, err, "SESSION_ROSTER_REQUIRED")
}

// Hono: courseCreditSessionSettlementService › settlement helper contracts expose deterministic result and validation behavior
func TestSettlementHelperContracts(t *testing.T) {
	session := map[string]any{"status": "correction_pending", "correctionBaseStatus": "cancelled", "settlementOperationId": "reversal",
		"requiredQuantity": 1.0}
	if err := validateSettleableSession(session); err != nil {
		t.Fatal(err)
	}
	if effective := effectiveSettlementSession(session); effective["status"] != "cancelled" || session["status"] != "correction_pending" {
		t.Fatalf("effective = %v", effective)
	}
	start := time.Date(2026, 8, 10, 10, 0, 0, 0, time.UTC)
	hours, err := sessionDurationHours(map[string]any{"startAt": iso(start), "endAt": iso(start.Add(90 * time.Minute))})
	if err != nil || hours != 1.5 {
		t.Fatalf("hours = %v, %v", hours, err)
	}
	_, err = sessionDurationHours(map[string]any{"startAt": iso(start), "endAt": iso(start)})
	failsWith(t, err, "SESSION_DURATION_INVALID")
	f := settlementSetup(t, nil)
	result, err := f.settle(t, "contract")
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range result["teacherEarnings"].([]any) {
		earning := item.(map[string]any)
		if earning["roleRuleId"] == nil || earning["sessionTeacherId"] == "" || earning["teacherId"] == "" {
			t.Fatalf("earning = %v", earning)
		}
	}
}
