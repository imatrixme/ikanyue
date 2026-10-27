package coursecredit

import (
	"reflect"
	"testing"
)

// Reschedule planning cases ported from Hono's courseCreditReschedulePlanning tests,
// over rescheduleCreditPlan (Hono's buildRescheduleStudentRequests).

const (
	rescheduleNow   = "2026-08-15T10:00:00.000Z"
	rescheduleStart = "2026-08-20T10:00:00.000Z"
)

func rescheduleBatch(changes map[string]any) map[string]any {
	return with2(map[string]any{"id": "batch", "studentId": "student", "creditTypeId": "course", "originalQuantity": 1.0,
		"availableQuantity": 0.0, "frozenQuantity": 0.0, "consumedQuantity": 0.0, "expiredQuantity": 0.0, "reversedQuantity": 0.0,
		"activatedAt": rescheduleNow, "activationMode": "GRANT_TIME", "status": "active", "priority": 0.0, "version": 1.0}, changes)
}

func oldRescheduleBatch(changes map[string]any) map[string]any {
	return rescheduleBatch(with2(map[string]any{"id": "old", "frozenQuantity": 1.0,
		"effectiveExpiresAt": "2026-08-15T10:00:00.000Z", "version": 2.0}, changes))
}

func candidateRescheduleBatch(changes map[string]any) map[string]any {
	return rescheduleBatch(with2(map[string]any{"id": "candidate", "availableQuantity": 1.0,
		"effectiveExpiresAt": "2026-09-01T00:00:00.000Z", "version": 7.0}, changes))
}

func rescheduleAllocation(changes map[string]any) map[string]any {
	return with2(map[string]any{"id": "old-allocation", "batchId": "old", "quantity": 1.0, "status": "reserved"}, changes)
}

func defaultReschedule() rescheduleInput {
	return rescheduleInput{
		session: map[string]any{"id": "session", "startAt": "2026-08-10T10:00:00.000Z",
			"requiredCreditTypeId": "course", "requiredQuantity": 1.0},
		sessionStudent: map[string]any{"id": "session-student", "studentId": "student", "creditStatus": "reserved", "version": 4.0},
		creditType:     map[string]any{"id": "course", "kind": "course", "consumable": true},
		allocations:    []map[string]any{rescheduleAllocation(nil)},
		allocated:      map[string]map[string]any{"old": oldRescheduleBatch(nil)},
		newStartAt:     rescheduleStart, at: rescheduleNow, operationID: "operation", actorID: "operator",
	}
}

func updateOf(plan []step, collection, id string) map[string]any {
	for _, item := range plan {
		if item.collection == collection && item.id == id {
			return item.data
		}
	}
	return nil
}

func createdEvents(plan []step) []map[string]any {
	events := []map[string]any{}
	for _, item := range plan {
		if item.collection == "credit_events" && item.id == "" {
			events = append(events, item.data)
		}
	}
	return events
}

// Hono: courseCreditReschedulePlanning › reschedule releases expired allocation and atomically freezes a new FEFO batch
func TestRescheduleReleasesExpiredAndFreezesFEFO(t *testing.T) {
	input := defaultReschedule()
	input.candidates = []map[string]any{candidateRescheduleBatch(nil)}
	plan, outcome, err := rescheduleCreditPlan(input)
	if err != nil || !outcome.reserved || outcome.missing != 0 || len(outcome.added) != 1 || !reflect.DeepEqual(outcome.released, []any{"old-allocation"}) {
		t.Fatalf("outcome = %+v, %v", outcome, err)
	}
	if got := updateOf(plan, "credit_batches", "old"); !reflect.DeepEqual(got, map[string]any{"availableQuantity": 0.0,
		"expiredQuantity": 1.0, "frozenQuantity": 0.0, "status": "expired", "version": 3.0}) {
		t.Fatalf("old batch = %v", got)
	}
	if updateOf(plan, "session_credit_allocations", "old-allocation")["status"] != "expired" ||
		updateOf(plan, "credit_batches", "candidate")["frozenQuantity"] != 1.0 {
		t.Fatal("allocation or candidate")
	}
	created := planData(plan, "session_credit_allocations")
	for _, item := range plan {
		if item.collection == "session_credit_allocations" && item.id == "" {
			created = item.data
		}
	}
	if created["batchId"] != "candidate" || created["reservedForStartAt"] != rescheduleStart {
		t.Fatalf("created = %v", created)
	}
	events := createdEvents(plan)
	if !reflect.DeepEqual(eventTypes(plan), []string{"RELEASE", "FREEZE"}) ||
		events[0]["metadata"].(map[string]any)["oldStartAt"] != "2026-08-10T10:00:00.000Z" ||
		events[1]["metadata"].(map[string]any)["newStartAt"] != rescheduleStart {
		t.Fatalf("events = %v", events)
	}
}

// Hono: courseCreditReschedulePlanning › valid reservation is retained and only its protected service time changes
func TestRescheduleRetainsValidReservation(t *testing.T) {
	input := defaultReschedule()
	input.allocated = map[string]map[string]any{"old": oldRescheduleBatch(map[string]any{"effectiveExpiresAt": "2026-09-01T00:00:00.000Z"})}
	plan, outcome, err := rescheduleCreditPlan(input)
	if err != nil || !outcome.reserved || !reflect.DeepEqual(outcome.retained, []any{"old-allocation"}) ||
		len(outcome.released) != 0 || len(outcome.added) != 0 {
		t.Fatalf("outcome = %+v, %v", outcome, err)
	}
	if got := updateOf(plan, "session_credit_allocations", "old-allocation"); !reflect.DeepEqual(got, map[string]any{"reservedForStartAt": rescheduleStart}) {
		t.Fatalf("allocation = %v", got)
	}
	if stepCount(plan, "credit_batches") != 0 || len(createdEvents(plan)) != 0 {
		t.Fatal("retained reservation moved credit")
	}
}

// Hono: courseCreditReschedulePlanning › reschedule activates a FIRST_RESERVATION replacement before freezing it
func TestRescheduleActivatesReplacement(t *testing.T) {
	input := defaultReschedule()
	input.actorID = ""
	input.candidates = []map[string]any{candidateRescheduleBatch(map[string]any{"activatedAt": "", "activationDeadline": "2026-09-10T00:00:00.000Z",
		"activationMode": "FIRST_RESERVATION", "effectiveExpiresAt": "", "status": "unactivated", "validityDurationDays": 30.0})}
	plan, outcome, err := rescheduleCreditPlan(input)
	if err != nil || !outcome.reserved {
		t.Fatalf("outcome = %+v, %v", outcome, err)
	}
	events := createdEvents(plan)
	if !reflect.DeepEqual(eventTypes(plan), []string{"RELEASE", "ACTIVATE", "FREEZE"}) || events[0]["actorId"] != "" || events[1]["quantityDelta"] != 0.0 {
		t.Fatalf("events = %v", events)
	}
}

// Hono: courseCreditReschedulePlanning › insufficient replacement releases invalid credit without freezing a partial candidate
func TestRescheduleInsufficientReplacement(t *testing.T) {
	input := defaultReschedule()
	input.allocated = map[string]map[string]any{"old": oldRescheduleBatch(map[string]any{"effectiveExpiresAt": "2026-08-18T00:00:00.000Z"})}
	input.candidates = []map[string]any{candidateRescheduleBatch(map[string]any{"availableQuantity": 0.0, "frozenQuantity": 1.0})}
	plan, outcome, err := rescheduleCreditPlan(input)
	if err != nil || outcome.reserved || outcome.missing != 1 || len(outcome.added) != 0 {
		t.Fatalf("outcome = %+v, %v", outcome, err)
	}
	if updateOf(plan, "credit_batches", "old")["availableQuantity"] != 1.0 ||
		updateOf(plan, "session_credit_allocations", "old-allocation")["status"] != "released" || updateOf(plan, "credit_batches", "candidate") != nil {
		t.Fatalf("plan = %v", plan)
	}
	if got := updateOf(plan, "session_students", "session-student"); !reflect.DeepEqual(got, map[string]any{"creditStatus": "credit_insufficient",
		"eligibilityReason": "reschedule_credit_insufficient", "version": 5}) {
		t.Fatalf("student = %v", got)
	}
}

// Hono: courseCreditReschedulePlanning › session start equal to batch expiry is outside the half-open validity interval
func TestRescheduleStartAtExpiryIsInvalid(t *testing.T) {
	input := defaultReschedule()
	input.allocated = map[string]map[string]any{"old": oldRescheduleBatch(map[string]any{"effectiveExpiresAt": "2026-08-15T00:00:00.000Z"})}
	input.newStartAt, input.at = "2026-08-15T00:00:00.000Z", "2026-08-14T00:00:00.000Z"
	plan, outcome, err := rescheduleCreditPlan(input)
	if err != nil || len(outcome.retained) != 0 || updateOf(plan, "credit_batches", "old")["availableQuantity"] != 1.0 {
		t.Fatalf("outcome = %+v, %v", outcome, err)
	}
}

// Hono: courseCreditReschedulePlanning › reschedule planning rejects unsafe session, allocation, and batch inputs
// Invalid new start and reschedule times are rejected by rescheduleSession and the booking
// caller before planning (SESSION_TIME_INVALID); Go has no id factory to require.
func TestReschedulePlanningRejectsUnsafeInputs(t *testing.T) {
	for _, item := range []struct {
		change func(*rescheduleInput)
		code   string
	}{
		{func(i *rescheduleInput) { i.sessionStudent = copyWith(i.sessionStudent, "creditStatus", "pending") }, "RESCHEDULE_STUDENT_NOT_RESERVED"},
		{func(i *rescheduleInput) { i.session = copyWith(i.session, "requiredQuantity", 0.0) }, "SESSION_CREDIT_QUANTITY_INVALID"},
		{func(i *rescheduleInput) { i.creditType = map[string]any{"kind": "universal", "consumable": false} }, "SESSION_CREDIT_TYPE_INVALID"},
		{func(i *rescheduleInput) { i.allocations = nil }, "SESSION_ALLOCATION_REQUIRED"},
		{func(i *rescheduleInput) {
			i.allocations = []map[string]any{rescheduleAllocation(map[string]any{"status": "released"})}
		}, "SESSION_ALLOCATION_NOT_RESERVED"},
		{func(i *rescheduleInput) {
			i.allocations = []map[string]any{rescheduleAllocation(map[string]any{"id": ""})}
		}, "SESSION_ALLOCATION_ID_REQUIRED"},
		{func(i *rescheduleInput) {
			i.allocations = []map[string]any{rescheduleAllocation(map[string]any{"batchId": ""})}
		}, "RESCHEDULE_BATCH_ID_REQUIRED"},
		{func(i *rescheduleInput) {
			i.allocations = []map[string]any{rescheduleAllocation(map[string]any{"quantity": 0.0})}
		}, "INVALID_CREDIT_QUANTITY"},
		{func(i *rescheduleInput) { i.allocated = map[string]map[string]any{} }, "RESCHEDULE_BATCH_NOT_FOUND"},
		{func(i *rescheduleInput) {
			i.allocated = map[string]map[string]any{"old": oldRescheduleBatch(map[string]any{"studentId": "other"})}
		}, "RESCHEDULE_BATCH_STUDENT_MISMATCH"},
		{func(i *rescheduleInput) {
			i.allocations = []map[string]any{rescheduleAllocation(nil), rescheduleAllocation(map[string]any{"id": "duplicate"})}
		}, "DUPLICATE_RESCHEDULE_BATCH"},
	} {
		input := defaultReschedule()
		item.change(&input)
		_, _, err := rescheduleCreditPlan(input)
		failsWith(t, err, item.code)
	}

	excess := defaultReschedule()
	excess.allocations = []map[string]any{rescheduleAllocation(nil), rescheduleAllocation(map[string]any{"id": "second", "batchId": "second"})}
	excess.allocated = map[string]map[string]any{
		"old":    oldRescheduleBatch(map[string]any{"effectiveExpiresAt": "2026-09-01T00:00:00.000Z"}),
		"second": oldRescheduleBatch(map[string]any{"id": "second", "effectiveExpiresAt": "2026-09-01T00:00:00.000Z"}),
	}
	_, _, err := rescheduleCreditPlan(excess)
	failsWith(t, err, "RESCHEDULE_ALLOCATION_EXCESS")
}

// Hono: courseCreditReschedulePlanning › batch merge prefers authoritative allocated records over query candidates
func TestRescheduleMergePrefersAllocatedBatch(t *testing.T) {
	input := defaultReschedule()
	// The query candidate claims the batch is still valid; the allocated record says it expired.
	input.candidates = []map[string]any{oldRescheduleBatch(map[string]any{"version": 1.0, "effectiveExpiresAt": "2026-09-01T00:00:00.000Z"})}
	input.allocated = map[string]map[string]any{"old": oldRescheduleBatch(map[string]any{"version": 9.0})}
	plan, _, err := rescheduleCreditPlan(input)
	if err != nil || updateOf(plan, "credit_batches", "old")["version"] != 10.0 {
		t.Fatalf("plan = %v, %v", plan, err)
	}
}
