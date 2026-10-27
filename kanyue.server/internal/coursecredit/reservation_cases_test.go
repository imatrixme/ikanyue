package coursecredit

import (
	"errors"
	"reflect"
	"testing"
)

// Reservation planning cases ported from Hono's courseCreditReservationService
// tests. Go plans reservations for booking confirmation; the student
// session-student reserve service behind /v1/course-credits/* stays in Hono.

const (
	reservationNow   = "2026-07-17T10:00:00.000Z"
	reservationStart = "2026-07-20T10:00:00.000Z"
)

var reservationCreditType = map[string]any{"kind": "course", "consumable": true}

func reservationBatch(changes map[string]any) map[string]any {
	return with2(map[string]any{"id": "batch-first", "studentId": "student", "creditTypeId": "course", "originalQuantity": 1.0,
		"availableQuantity": 1.0, "frozenQuantity": 0.0, "consumedQuantity": 0.0, "expiredQuantity": 0.0, "reversedQuantity": 0.0,
		"status": "unactivated", "validFrom": "2026-01-01T00:00:00Z", "effectiveExpiresAt": "", "activationMode": "FIRST_RESERVATION",
		"activationDeadline": "2026-10-01T00:00:00Z", "activatedAt": "", "validityDurationDays": 30.0, "priority": 0.0,
		"version": 2.0, "created": "2026-07-01T00:00:00Z"}, changes)
}

func reservationContextFor() reservationContext {
	return reservationContext{creditType: reservationCreditType, now: reservationNow, creditTypeID: "course", sessionStart: reservationStart}
}

func planFor(t *testing.T, batches []map[string]any, quantity float64) reservationPlan {
	t.Helper()
	plan, err := planReservation(batches, quantity, reservationContextFor())
	if err != nil {
		t.Fatal(err)
	}
	return plan
}

func eventTypes(plan []step) []string {
	result := []string{}
	for _, item := range plan {
		if item.collection == "credit_events" {
			result = append(result, item.data["eventType"].(string))
		}
	}
	return result
}

// Hono: courseCreditReservationService › Hono reservation service activates, allocates FEFO, freezes, and emits one atomic plan
func TestReservationPlanActivatesAllocatesAndFreezes(t *testing.T) {
	later := reservationBatch(map[string]any{"id": "batch-later", "activationMode": "GRANT_TIME", "activatedAt": reservationNow,
		"status": "active", "effectiveExpiresAt": "2026-12-01T00:00:00Z", "originalQuantity": 2.0, "availableQuantity": 2.0})
	plan := planFor(t, []map[string]any{reservationBatch(nil), later}, 2)
	if !reflect.DeepEqual(plan.allocations, []creditAllocation{{"batch-first", 1}, {"batch-later", 1}}) || plan.missing != 0 {
		t.Fatalf("plan = %+v", plan)
	}
	movements, err := buildReservationMovements(plan)
	if err != nil {
		t.Fatal(err)
	}
	session := reservationSession{sessionID: "session", sessionStartAt: reservationStart, operationID: "operation",
		at: reservationNow, actorID: "operator", sessionStudent: map[string]any{"id": "session-student", "studentId": "student"}}
	steps := session.movementPlan(movements, reservationStart, "reserve", func(string) map[string]any { return nil })
	claims, updates, events := 0, 0, []map[string]any{}
	for _, item := range steps {
		switch {
		case item.collection == "credit_version_claims":
			claims++
		case item.id != "":
			updates++
		case item.collection == "credit_events":
			events = append(events, item.data)
		}
	}
	if claims != 2 || updates != 2 || !reflect.DeepEqual(eventTypes(steps), []string{"ACTIVATE", "FREEZE", "FREEZE"}) {
		t.Fatalf("claims = %d, updates = %d, events = %v", claims, updates, eventTypes(steps))
	}
	activation := events[0]["balanceSnapshot"].(map[string]any)
	freeze := events[1]["balanceSnapshot"].(map[string]any)
	if activation["availableQuantity"] != 1.0 || activation["frozenQuantity"] != 0.0 || freeze["availableQuantity"] != 0.0 ||
		events[1]["actorId"] != "operator" {
		t.Fatalf("events = %v", events)
	}
}

// Hono: courseCreditReservationService › first-reservation activation rejects a batch that expires before service time
func TestFirstReservationSkipsBatchExpiringBeforeService(t *testing.T) {
	plan := planFor(t, []map[string]any{reservationBatch(map[string]any{"id": "too-short", "validityDurationDays": 1.0})}, 2)
	if len(plan.allocations) != 0 || plan.missing != 2 || len(plan.activated) != 0 {
		t.Fatalf("plan = %+v", plan)
	}
}

// Hono: courseCreditReservationService › reservation may freeze a deferred non-reservation activation batch without activating it
func TestDeferredActivationBatchFreezesWithoutActivating(t *testing.T) {
	plan := planFor(t, []map[string]any{reservationBatch(map[string]any{"activationMode": "FIRST_CHECK_IN"})}, 1)
	movements, err := buildReservationMovements(plan)
	if err != nil || len(movements) != 1 {
		t.Fatalf("movements = %v, %v", movements, err)
	}
	next := movements[0].nextBatch
	if movements[0].activated || next["activatedAt"] != "" || next["effectiveExpiresAt"] != "" || next["frozenQuantity"] != 1.0 {
		t.Fatalf("movement = %+v", movements[0])
	}
	session := reservationSession{sessionStudent: map[string]any{}}
	steps := session.movementPlan(movements, reservationStart, "reserve", func(string) map[string]any { return nil })
	if !reflect.DeepEqual(eventTypes(steps), []string{"FREEZE"}) {
		t.Fatalf("events = %v", eventTypes(steps))
	}
}

// Hono: courseCreditReservationService › reservation planning helpers normalize legacy records and expose conflict semantics
func TestReservationPlanningHelpers(t *testing.T) {
	normalized := normalizeBookingBatch(with2(reservationBatch(nil), map[string]any{"version": nil, "priority": nil}), reservationCreditType)
	if normalized["version"] != 1.0 || normalized["priority"] != 0.0 {
		t.Fatalf("normalized = %v", normalized)
	}
	if positiveVersion(3.0) != 3 || positiveVersion("bad") != 1 {
		t.Fatal("positiveVersion")
	}
	plan := planFor(t, []map[string]any{reservationBatch(map[string]any{"activationMode": "GRANT_TIME", "activatedAt": reservationNow, "status": "active"})}, 1)
	movements, err := buildReservationMovements(plan)
	if err != nil || movements[0].nextBatch["frozenQuantity"] != 1.0 {
		t.Fatalf("movements = %v, %v", movements, err)
	}
	for _, conflict := range []error{&storeError{status: 400}, &storeError{status: 409}, Fail("VERSION_CONFLICT", "", nil)} {
		if !isVersionConflict(conflict) {
			t.Fatalf("%v is a version conflict", conflict)
		}
	}
	if isVersionConflict(errors.New("other")) {
		t.Fatal("plain errors are not version conflicts")
	}
}
