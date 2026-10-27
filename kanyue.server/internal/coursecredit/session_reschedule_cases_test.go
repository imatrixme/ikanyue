package coursecredit

import (
	"errors"
	"testing"
)

// Session reschedule cases ported from Hono's courseCreditSessionRescheduleService
// tests, over the stored scheduled session of cancellationSetup.

const (
	rescheduledStart = "2026-11-20T10:00:00.000Z"
	rescheduledEnd   = "2026-11-20T11:00:00.000Z"
)

// rescheduleServiceSetup stores a reserved student whose batch expires before the new
// start, a fresh candidate batch for them, and a pending roster row.
func rescheduleServiceSetup(t *testing.T) (settlementFixture, string) {
	t.Helper()
	f := cancellationSetup(t, map[string]any{"version": 3}, "scheduled", "pending")
	patch(t, f.app, "session_students", f.students["pending"], map[string]any{"creditStatus": "pending"})
	patch(t, f.app, "credit_batches", f.batches["scheduled"], map[string]any{"effectiveExpiresAt": "2026-11-01 00:00:00.000Z"})
	learner := f.first(t, "session_students", `id="`+f.students["scheduled"]+`"`)["studentId"]
	candidate := put(t, f.app, "credit_batches", map[string]any{"studentId": learner, "creditTypeId": f.creditTypeID,
		"sourceOperationId": f.source, "originalQuantity": 1, "availableQuantity": 1, "status": "active", "activationMode": "GRANT_TIME",
		"validFrom": "2026-08-01 00:00:00.000Z", "activatedAt": "2026-08-01 00:00:00.000Z",
		"effectiveExpiresAt": "2026-12-31 00:00:00.000Z", "version": 7}).Id
	return f, candidate
}

func (f settlementFixture) reschedule(t *testing.T, key string, changes map[string]any) (map[string]any, error) {
	t.Helper()
	return rescheduleSession(f.app, with2(f.command(t, key), with2(map[string]any{
		"newStartAt": rescheduledStart, "newEndAt": rescheduledEnd}, changes)))
}

// Hono: courseCreditSessionRescheduleService › reschedule command updates session and revalidates reserved students in one SDK batch
func TestSessionRescheduleRevalidatesReservedStudents(t *testing.T) {
	f, candidate := rescheduleServiceSetup(t)
	result, err := f.reschedule(t, "reschedule-key", nil)
	if err != nil || result["replayed"] == true {
		t.Fatalf("result = %v, %v", result, err)
	}
	outcomes := result["studentOutcomes"].([]any)
	outcome := outcomes[0].(map[string]any)
	if len(outcomes) != 1 || outcome["creditStatus"] != "reserved" || outcome["sessionStudentId"] != f.students["scheduled"] ||
		outcome["releasedAllocationIds"].([]any)[0] != f.allocations["scheduled"] || len(outcome["newAllocationIds"].([]any)) != 1 {
		t.Fatalf("outcomes = %v", outcomes)
	}
	operation := f.first(t, "credit_operations", `type="reschedule_session"`)
	if operation["sourceType"] != "session" || operation["sourceId"] != f.sessionID {
		t.Fatalf("operation = %v", operation)
	}
	session := f.first(t, "sessions", `id="`+f.sessionID+`"`)
	if session["startAt"] != "2026-11-20 10:00:00.000Z" || session["endAt"] != "2026-11-20 11:00:00.000Z" || session["version"] != 4.0 {
		t.Fatalf("session = %v", session)
	}
	if f.count(t, "outbox_events", `topic="course-credit.session-rescheduled"`) != 1 ||
		f.count(t, "session_credit_allocations", `batchId="`+candidate+`" && status="reserved"`) != 1 {
		t.Fatal("outbox or replacement allocation")
	}
	if pending := f.first(t, "session_students", `id="`+f.students["pending"]+`"`); pending["version"] != 3.0 || pending["creditStatus"] != "pending" {
		t.Fatalf("pending student was touched: %v", pending)
	}
}

// Hono: courseCreditSessionRescheduleService › reschedule command can update a session with no reserved students
func TestSessionRescheduleWithoutReservedStudents(t *testing.T) {
	f, _ := rescheduleServiceSetup(t)
	patch(t, f.app, "session_students", f.students["scheduled"], map[string]any{"creditStatus": "pending"})
	before := f.count(t, "session_credit_allocations", "")
	result, err := f.reschedule(t, "reschedule-key", nil)
	if err != nil || len(result["studentOutcomes"].([]any)) != 0 {
		t.Fatalf("result = %v, %v", result, err)
	}
	if f.count(t, "session_credit_allocations", "") != before || f.count(t, "session_credit_allocations", `status!="reserved"`) != 0 {
		t.Fatal("allocations changed")
	}
}

// Hono: courseCreditSessionRescheduleService › reschedule command replays committed results and resolves same-request races
func TestSessionRescheduleReplayAndRace(t *testing.T) {
	f, _ := rescheduleServiceSetup(t)
	first, err := f.reschedule(t, "reschedule-key", nil)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := f.reschedule(t, "reschedule-key", nil)
	if err != nil || replay["replayed"] != true || replay["operationId"] != first["operationId"] {
		t.Fatalf("replay = %v, %v", replay, err)
	}
	stored := f.first(t, "credit_operations", `type="reschedule_session"`)
	raced, err := commitOrReplay(f.app, []step{update("sessions", "missing", map[string]any{})}, stored["idempotencyKey"].(string),
		stored["requestSnapshot"].(map[string]any)["requestHash"].(string), replayConflict, "COURSE_CREDIT_BATCH_FAILED", map[string]any{})
	if err != nil || raced["replayed"] != true {
		t.Fatalf("raced = %v, %v", raced, err)
	}
	_, err = f.reschedule(t, "reschedule-key", map[string]any{"newEndAt": "2026-11-20T12:00:00.000Z"})
	failsWith(t, err, "IDEMPOTENCY_CONFLICT")
}

// Hono: courseCreditSessionRescheduleService › reschedule command preserves storage failures and validates command contracts
func TestSessionRescheduleFailuresAndValidation(t *testing.T) {
	f, _ := rescheduleServiceSetup(t)
	failFirst(f.app, "outbox_events", 1, errors.New("failed"))
	_, err := f.reschedule(t, "k0", nil)
	failsWith(t, err, "COURSE_CREDIT_BATCH_FAILED")
	if f.first(t, "sessions", `id="`+f.sessionID+`"`)["version"] != 3.0 {
		t.Fatal("a failed reschedule changed the session")
	}

	for _, item := range []struct {
		changes map[string]any
		code    string
	}{
		{map[string]any{"sessionId": ""}, "SESSION_ID_REQUIRED"},
		{map[string]any{"newStartAt": "invalid"}, "SESSION_TIME_INVALID"},
		{map[string]any{"newEndAt": rescheduledStart}, "SESSION_TIME_INVALID"},
		{map[string]any{"newStartAt": "2026-10-10T10:00:00.000Z", "newEndAt": "2026-10-10T11:00:00.000Z"}, "SESSION_TIME_UNCHANGED"},
	} {
		_, err := f.reschedule(t, "k-"+item.code, item.changes)
		failsWith(t, err, item.code)
	}
	for _, item := range []struct {
		collection string
		id         func(settlementFixture) string
		fields     map[string]any
		code       string
	}{
		{"sessions", func(f settlementFixture) string { return f.sessionID }, map[string]any{"status": "completed"}, "SESSION_NOT_RESCHEDULABLE"},
		{"sessions", func(f settlementFixture) string { return f.sessionID }, map[string]any{"startAt": ""}, "SESSION_TIME_INVALID"},
		{"credit_types", func(f settlementFixture) string { return f.creditTypeID }, map[string]any{"kind": "universal", "consumable": false}, "SESSION_CREDIT_TYPE_INVALID"},
		{"session_credit_allocations", func(f settlementFixture) string { return f.allocations["scheduled"] }, map[string]any{"status": "released"}, "SESSION_ALLOCATION_REQUIRED"},
	} {
		g, _ := rescheduleServiceSetup(t)
		patch(t, g.app, item.collection, item.id(g), item.fields)
		_, err := g.reschedule(t, "reschedule-key", nil)
		failsWith(t, err, item.code)
	}
}

// Hono: courseCreditSessionRescheduleService › reschedule validation helpers cover valid and invalid time boundaries
func TestSessionRescheduleTimeBoundaries(t *testing.T) {
	f, _ := rescheduleServiceSetup(t)
	_, err := f.reschedule(t, "k1", map[string]any{"newEndAt": rescheduledStart})
	failsWith(t, err, "SESSION_TIME_INVALID")
	patch(t, f.app, "sessions", f.sessionID, map[string]any{"status": "draft"})
	_, err = f.reschedule(t, "k2", nil)
	failsWith(t, err, "SESSION_NOT_RESCHEDULABLE")
	patch(t, f.app, "sessions", f.sessionID, map[string]any{"status": "enrollment_closed"})
	if _, err := f.reschedule(t, "k3", nil); err != nil {
		t.Fatal(err)
	}
}
