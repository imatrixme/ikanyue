package coursecredit

import (
	"errors"
	"testing"
)

// Settlement reversal cases ported from Hono's courseCreditSessionSettlementReversalService
// tests, reversing a settlement the Go service committed.

func (f settlementFixture) settled(t *testing.T) string {
	t.Helper()
	result, err := f.settle(t, "settle-key")
	if err != nil {
		t.Fatal(err)
	}
	return result["operationId"].(string)
}

func (f settlementFixture) reverse(t *testing.T, key string, changes map[string]any) (map[string]any, error) {
	t.Helper()
	return reverseSessionSettlement(f.app, with2(f.command(t, key), with2(map[string]any{"reason": "attendance correction"}, changes)))
}

// Hono: courseCreditSessionSettlementReversalService › reverseSessionSettlement restores reservations and appends linked reverse events atomically
func TestReverseSettlementRestoresReservations(t *testing.T) {
	f := settlementSetup(t, nil)
	original := f.settled(t)
	result, err := f.reverse(t, "reverse-key", nil)
	if err != nil || result["replayed"] != false || len(result["reversedCreditEventIds"].([]any)) != 2 ||
		len(result["reversedTeacherEventIds"].([]any)) != 2 {
		t.Fatalf("result = %v, %v", result, err)
	}
	operation := f.first(t, "credit_operations", `id="`+result["operationId"].(string)+`"`)
	if operation["type"] != "reverse_session_settlement" || operation["reversalOfOperationId"] != original ||
		operation["sourceType"] != "settlement_operation" {
		t.Fatalf("operation = %v", operation)
	}
	if session := f.first(t, "sessions", `id="`+f.sessionID+`"`); session["status"] != "correction_pending" || session["correctionBaseStatus"] != "completed" {
		t.Fatalf("session = %v", session)
	}
	if f.count(t, "session_credit_allocations", `status="reserved"`) != 2 || f.count(t, "session_credit_allocations", `status="reversed"`) != 2 {
		t.Fatal("allocations")
	}
	if f.count(t, "credit_events", `eventType="REVERSE" && reversalOfEventId!=""`) != 2 {
		t.Fatal("credit reverse events")
	}
	if f.count(t, "teacher_credit_events", `eventType="reverse" && reversalOfEventId!=""`) != 2 {
		t.Fatal("teacher reverse events")
	}
	// Original settlement facts are never rewritten.
	if f.count(t, "credit_events", `operationId="`+original+`" && reversalOfEventId=""`) != 2 ||
		f.count(t, "teacher_credit_events", `operationId="`+original+`" && status="pending"`) != 2 {
		t.Fatal("original events changed")
	}
	if f.count(t, "outbox_events", `topic="course-credit.session-settlement-reversed"`) != 1 {
		t.Fatal("outbox")
	}
}

// Hono: courseCreditSessionSettlementReversalService › reversal supports a cancelled settlement with no teacher earnings
func TestReverseCancelledSettlement(t *testing.T) {
	f := settlementSetup(t, func(settlementFixture) map[string]any { return map[string]any{"status": "cancelled"} })
	f.settled(t)
	if _, err := f.reverse(t, "reverse-key", nil); err != nil {
		t.Fatal(err)
	}
	if session := f.first(t, "sessions", `id="`+f.sessionID+`"`); session["correctionBaseStatus"] != "cancelled" {
		t.Fatalf("session = %v", session)
	}
	if f.count(t, "teacher_credit_events", "") != 0 {
		t.Fatal("cancelled reversal wrote teacher events")
	}
}

// Hono: courseCreditSessionSettlementReversalService › reversal replays committed results and resolves same-request races
func TestReverseSettlementReplaysAndRaces(t *testing.T) {
	f := settlementSetup(t, nil)
	f.settled(t)
	first, err := f.reverse(t, "reverse-key", nil)
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := f.reverse(t, "reverse-key", nil)
	if err != nil || replayed["replayed"] != true || replayed["operationId"] != first["operationId"] {
		t.Fatalf("replay = %v, %v", replayed, err)
	}
	_, err = f.reverse(t, "reverse-key", map[string]any{"reason": "another correction"})
	failsWith(t, err, "IDEMPOTENCY_CONFLICT")

	prepared, err := prepareTeaching(f.app, "reverseSessionSettlement", f.command(t, "race"), map[string]any{"race": true})
	if err != nil {
		t.Fatal(err)
	}
	put(t, f.app, "credit_operations", map[string]any{"type": "reverse_session_settlement", "status": "committed", "operationNo": "raced",
		"idempotencyKey": prepared.scopedKey, "requestSnapshot": map[string]any{"requestHash": prepared.requestHash},
		"resultSnapshot": map[string]any{"operationId": "raced"}})
	raced, err := prepared.commit(f.app, []step{update("sessions", "missing", map[string]any{})}, map[string]any{})
	if err != nil || raced["replayed"] != true || raced["operationId"] != "raced" {
		t.Fatalf("raced = %v, %v", raced, err)
	}
}

// Hono: courseCreditSessionSettlementReversalService › reversal preserves single-batch storage failure without compensation writes
func TestReverseSettlementStorageFailure(t *testing.T) {
	f := settlementSetup(t, nil)
	f.settled(t)
	attempts := failFirst(f.app, "outbox_events", 2, errors.New("failed"))
	_, err := f.reverse(t, "reverse-key", nil)
	failsWith(t, err, "COURSE_CREDIT_BATCH_FAILED")
	if *attempts < 1 || f.count(t, "credit_events", `eventType="REVERSE"`) != 0 || f.count(t, "credit_operations", `type="reverse_session_settlement"`) != 0 {
		t.Fatalf("attempts = %d, partial writes remain", *attempts)
	}
	if session := f.first(t, "sessions", `id="`+f.sessionID+`"`); session["status"] != "settled" {
		t.Fatalf("session = %v", session)
	}
}

// Hono: courseCreditSessionSettlementReversalService › reversal validates command, session, and original operation contracts
func TestReverseSettlementValidation(t *testing.T) {
	f := settlementSetup(t, nil)
	_, err := f.reverse(t, "empty", map[string]any{"sessionId": ""})
	failsWith(t, err, "SESSION_ID_REQUIRED")
	_, err = f.reverse(t, "short", map[string]any{"reason": "x"})
	failsWith(t, err, "REVERSAL_REASON_REQUIRED")
	_, err = f.reverse(t, "not-settled", nil)
	failsWith(t, err, "SESSION_NOT_REVERSIBLE")

	original := f.settled(t)
	patch(t, f.app, "sessions", f.sessionID, map[string]any{"settlementOperationId": ""})
	_, err = f.reverse(t, "no-operation", nil)
	failsWith(t, err, "SETTLEMENT_OPERATION_REQUIRED")
	patch(t, f.app, "sessions", f.sessionID, map[string]any{"settlementOperationId": original})

	snapshot := f.first(t, "credit_operations", `id="`+original+`"`)["requestSnapshot"]
	for i, item := range []struct {
		fields map[string]any
		code   string
	}{
		{map[string]any{"type": "reserve"}, "SETTLEMENT_OPERATION_INVALID"},
		{map[string]any{"sourceId": "other"}, "SETTLEMENT_OPERATION_SESSION_MISMATCH"},
		{map[string]any{"requestSnapshot": map[string]any{}}, "SETTLEMENT_BASE_STATUS_INVALID"},
	} {
		patch(t, f.app, "credit_operations", original, item.fields)
		_, err := f.reverse(t, "operation-"+string(rune('a'+i)), nil)
		failsWith(t, err, item.code)
		patch(t, f.app, "credit_operations", original, map[string]any{"type": "settle_session", "sourceId": f.sessionID, "requestSnapshot": snapshot})
	}
}

// Hono: courseCreditSessionSettlementReversalService › reversal helper validation accepts the authoritative original settlement
func TestReverseSettlementAcceptsAuthoritativeOriginal(t *testing.T) {
	f := settlementSetup(t, nil)
	original := f.settled(t)
	result, err := f.reverse(t, "reverse-key", nil)
	if err != nil || result["originalSettlementOperationId"] != original {
		t.Fatalf("result = %v, %v", result, err)
	}
	snapshot := f.first(t, "credit_operations", `id="`+result["operationId"].(string)+`"`)["requestSnapshot"].(map[string]any)
	if snapshot["baseStatus"] != "completed" {
		t.Fatalf("snapshot = %v", snapshot)
	}
}
