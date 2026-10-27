package coursecredit

import (
	"reflect"
	"testing"
)

// Settlement planning cases ported from Hono's courseCreditSettlementPlanning tests.

const settlementNow = "2026-08-10T11:05:00.000Z"

func settlementRuleSnapshots(absent string) (map[string]any, map[string]any) {
	return map[string]any{"version": 2.0, "present": "consume", "late": "consume", "leave": "release", "absent": absent},
		map[string]any{"version": 3.0, "cancelled": "release"}
}

func settlementSession(changes map[string]any) map[string]any {
	attendance, settlement := settlementRuleSnapshots("consume")
	return with2(map[string]any{"id": "session", "status": "completed", "attendanceRuleSnapshot": attendance,
		"settlementRuleSnapshot": settlement}, changes)
}

func settlementStudent(changes map[string]any) map[string]any {
	return with2(map[string]any{"id": "session-student", "studentId": "student", "attendanceStatus": "present",
		"creditStatus": "reserved", "version": 3.0}, changes)
}

func settlementAllocation(changes map[string]any) map[string]any {
	return with2(map[string]any{"id": "allocation", "batchId": "batch", "quantity": 1.0, "status": "reserved",
		"reservedForStartAt": "2026-08-10T10:00:00.000Z"}, changes)
}

func settlementBatch(changes map[string]any) map[string]any {
	return with2(map[string]any{"id": "batch", "studentId": "student", "creditTypeId": "course", "originalQuantity": 2.0,
		"availableQuantity": 0.0, "frozenQuantity": 1.0, "consumedQuantity": 1.0, "expiredQuantity": 0.0, "reversedQuantity": 0.0,
		"activatedAt": settlementNow, "version": 4.0, "validFrom": "2026-08-01T00:00:00.000Z"}, changes)
}

type settlementInput struct {
	session, student map[string]any
	allocations      []map[string]any
	batches          map[string]map[string]any
	now, actor       string
}

func defaultSettlement() settlementInput {
	return settlementInput{settlementSession(nil), settlementStudent(nil), []map[string]any{settlementAllocation(nil)},
		map[string]map[string]any{"batch": settlementBatch(nil)}, settlementNow, "operator"}
}

func (s settlementInput) plan() ([]step, decision, error) {
	return studentSettlementPlan(s.session, s.student, s.allocations, s.batches, "operation", s.now, s.actor)
}

// planData prefers the update of a collection, like Hono's request helper.
func planData(plan []step, collection string) map[string]any {
	var created map[string]any
	for _, item := range plan {
		if item.collection != collection {
			continue
		}
		if item.id != "" {
			return item.data
		}
		if created == nil {
			created = item.data
		}
	}
	return created
}

func stepCount(plan []step, collection string) int {
	count := 0
	for _, item := range plan {
		if item.collection == collection {
			count++
		}
	}
	return count
}

// Hono: courseCreditSettlementPlanning › snapshotted rules decide all final attendance states without changing attendance
func TestSettlementDecisionFollowsSnapshots(t *testing.T) {
	for status, creditStatus := range map[string]string{"present": "consumed", "late": "consumed", "leave": "released",
		"absent": "consumed", "cancelled": "released"} {
		result, err := settlementDecision(settlementSession(nil), settlementStudent(map[string]any{"attendanceStatus": status}))
		version := 2.0
		if status == "cancelled" {
			version = 3.0
		}
		if err != nil || result.creditStatus != creditStatus || result.ruleSource != status || result.ruleVersion != version {
			t.Fatalf("%s = %+v, %v", status, result, err)
		}
	}
	attendance, _ := settlementRuleSnapshots("release")
	released, err := settlementDecision(settlementSession(map[string]any{"attendanceRuleSnapshot": attendance}),
		settlementStudent(map[string]any{"attendanceStatus": "absent"}))
	if err != nil || released.action != "release" {
		t.Fatalf("released absent = %+v, %v", released, err)
	}
}

// Hono: courseCreditSettlementPlanning › institution cancellation always releases regardless of student attendance rules
func TestInstitutionCancellationReleases(t *testing.T) {
	result, err := settlementDecision(settlementSession(map[string]any{"status": "cancelled"}), settlementStudent(nil))
	want := decision{"release", "released", "RELEASE", "institution_cancelled", "availableQuantity", 3.0}
	if err != nil || result != want {
		t.Fatalf("decision = %+v, %v", result, err)
	}
}

// Hono: courseCreditSettlementPlanning › consume planning moves frozen quantity and creates reusable SDK batch requests
func TestConsumePlanningMovesFrozenQuantity(t *testing.T) {
	plan, choice, err := defaultSettlement().plan()
	if err != nil || choice.creditStatus != "consumed" {
		t.Fatalf("decision = %+v, %v", choice, err)
	}
	if got := planData(plan, "credit_batches"); !reflect.DeepEqual(got, map[string]any{"availableQuantity": 0.0, "consumedQuantity": 2.0,
		"expiredQuantity": 0.0, "frozenQuantity": 0.0, "status": "depleted", "version": 5}) {
		t.Fatalf("batch = %v", got)
	}
	if got := planData(plan, "session_credit_allocations"); !reflect.DeepEqual(got, map[string]any{"status": "consumed"}) {
		t.Fatalf("allocation = %v", got)
	}
	if got := planData(plan, "session_students"); !reflect.DeepEqual(got, map[string]any{"creditStatus": "consumed", "settledAt": settlementNow, "version": 4}) {
		t.Fatalf("session student = %v", got)
	}
	event := planData(plan, "credit_events")
	if event["eventType"] != "CONSUME" || event["quantityDelta"] != -1.0 || event["bucketFrom"] != "frozenQuantity" || event["bucketTo"] != "consumedQuantity" {
		t.Fatalf("event = %v", event)
	}
	if !reflect.DeepEqual(event["metadata"], map[string]any{"allocationId": "allocation", "attendanceStatus": "present", "immediateExpiry": false,
		"ruleSource": "present", "ruleVersion": 2.0, "sessionId": "session", "sessionStudentId": "session-student"}) {
		t.Fatalf("metadata = %v", event["metadata"])
	}
	if stepCount(plan, "credit_version_claims") != 2 {
		t.Fatal("claims")
	}
}

// Hono: courseCreditSettlementPlanning › delayed settlement consumes a reservation that was valid at service time after batch expiry
func TestDelayedSettlementConsumesProtectedReservation(t *testing.T) {
	input := defaultSettlement()
	input.now = "2026-08-20T10:00:00.000Z"
	input.batches["batch"] = settlementBatch(map[string]any{"effectiveExpiresAt": "2026-08-10T10:30:00.000Z"})
	plan, choice, err := input.plan()
	batch := planData(plan, "credit_batches")
	if err != nil || choice.creditStatus != "consumed" || batch["consumedQuantity"] != 2.0 || batch["expiredQuantity"] != 0.0 ||
		planData(plan, "session_credit_allocations")["status"] != "consumed" {
		t.Fatalf("plan = %v, %v", plan, err)
	}
}

// Hono: courseCreditSettlementPlanning › release planning restores available quantity and supports object batch lookup
func TestReleasePlanningRestoresAvailable(t *testing.T) {
	input := defaultSettlement()
	input.student = settlementStudent(map[string]any{"attendanceStatus": "leave"})
	input.actor = ""
	plan, _, err := input.plan()
	if err != nil {
		t.Fatal(err)
	}
	if batch := planData(plan, "credit_batches"); batch["availableQuantity"] != 1.0 || batch["frozenQuantity"] != 0.0 || batch["status"] != "active" {
		t.Fatalf("batch = %v", batch)
	}
	event := planData(plan, "credit_events")
	if event["eventType"] != "RELEASE" || event["quantityDelta"] != 1.0 || event["actorId"] != "" ||
		event["metadata"].(map[string]any)["immediateExpiry"] != false {
		t.Fatalf("event = %v", event)
	}
}

// Hono: courseCreditSettlementPlanning › release after expiry moves frozen quantity directly to expired
func TestReleaseAfterExpiryExpiresFrozen(t *testing.T) {
	input := defaultSettlement()
	input.student = settlementStudent(map[string]any{"attendanceStatus": "leave"})
	input.batches["batch"] = settlementBatch(map[string]any{"effectiveExpiresAt": "2026-08-10T11:00:00.000Z"})
	plan, _, err := input.plan()
	if err != nil {
		t.Fatal(err)
	}
	if batch := planData(plan, "credit_batches"); batch["availableQuantity"] != 0.0 || batch["expiredQuantity"] != 1.0 || batch["status"] != "depleted" {
		t.Fatalf("batch = %v", batch)
	}
	if planData(plan, "session_credit_allocations")["status"] != "expired" {
		t.Fatal("allocation must expire")
	}
	if event := planData(plan, "credit_events"); event["bucketTo"] != "expiredQuantity" || event["metadata"].(map[string]any)["immediateExpiry"] != true {
		t.Fatalf("event = %v", event)
	}
}

// Hono: courseCreditSettlementPlanning › settlement rules reject incomplete snapshots and non-final facts
func TestSettlementRulesRejectIncompleteFacts(t *testing.T) {
	attendance, settlement := settlementRuleSnapshots("consume")
	for _, item := range []struct {
		attendance, settlement any
		code                   string
	}{
		{nil, settlement, "ATTENDANCE_RULE_SNAPSHOT_REQUIRED"},
		{[]any{}, settlement, "ATTENDANCE_RULE_SNAPSHOT_REQUIRED"},
		{attendance, map[string]any{}, "SETTLEMENT_RULE_SNAPSHOT_REQUIRED"},
		{copyWith(attendance, "version", 0.0), settlement, "RULE_SNAPSHOT_VERSION_INVALID"},
		{copyWith(attendance, "late", "waive"), settlement, "SETTLEMENT_ACTION_INVALID"},
	} {
		_, _, err := settlementRules(map[string]any{"attendanceRuleSnapshot": item.attendance, "settlementRuleSnapshot": item.settlement})
		failsWith(t, err, item.code)
	}
	for _, item := range []struct {
		session, student map[string]any
		code             string
	}{
		{settlementSession(map[string]any{"status": "scheduled"}), settlementStudent(nil), "SESSION_NOT_SETTLEABLE"},
		{settlementSession(nil), map[string]any{}, "ATTENDANCE_STATUS_REQUIRED"},
		{settlementSession(nil), settlementStudent(map[string]any{"attendanceStatus": "checked_in"}), "ATTENDANCE_NOT_FINAL"},
		{settlementSession(nil), settlementStudent(map[string]any{"attendanceStatus": "unknown"}), "INVALID_ATTENDANCE_STATUS"},
	} {
		_, err := settlementDecision(item.session, item.student)
		failsWith(t, err, item.code)
	}
}

// Hono: courseCreditSettlementPlanning › settlement planning rejects unsafe allocation and batch states
func TestSettlementPlanningRejectsUnsafeStates(t *testing.T) {
	for _, item := range []struct {
		change func(*settlementInput)
		code   string
	}{
		{func(s *settlementInput) { s.student = settlementStudent(map[string]any{"creditStatus": "pending"}) }, "SESSION_STUDENT_NOT_RESERVED"},
		{func(s *settlementInput) { s.allocations = nil }, "SESSION_ALLOCATION_REQUIRED"},
		{func(s *settlementInput) {
			s.allocations[0] = settlementAllocation(map[string]any{"status": "consumed"})
		}, "SESSION_ALLOCATION_NOT_RESERVED"},
		{func(s *settlementInput) { s.allocations[0] = settlementAllocation(map[string]any{"id": ""}) }, "SESSION_ALLOCATION_ID_REQUIRED"},
		{func(s *settlementInput) { s.allocations[0] = settlementAllocation(map[string]any{"batchId": ""}) }, "SETTLEMENT_BATCH_ID_REQUIRED"},
		{func(s *settlementInput) { s.allocations[0] = settlementAllocation(map[string]any{"quantity": 0.0}) }, "INVALID_CREDIT_QUANTITY"},
		{func(s *settlementInput) { s.batches = map[string]map[string]any{} }, "SETTLEMENT_BATCH_NOT_FOUND"},
		{func(s *settlementInput) { s.batches["batch"] = settlementBatch(map[string]any{"studentId": "other"}) }, "SETTLEMENT_BATCH_STUDENT_MISMATCH"},
		{func(s *settlementInput) {
			s.batches["batch"] = settlementBatch(map[string]any{"effectiveExpiresAt": "2026-08-10T10:00:00.000Z"})
		}, "RESERVATION_SERVICE_TIME_INVALID"},
		{func(s *settlementInput) {
			s.batches["batch"] = settlementBatch(map[string]any{"frozenQuantity": 0.0, "availableQuantity": 1.0})
		}, "CREDIT_INSUFFICIENT"},
		{func(s *settlementInput) {
			s.allocations = append(s.allocations, settlementAllocation(map[string]any{"id": "second"}))
		}, "DUPLICATE_SETTLEMENT_BATCH"},
	} {
		input := defaultSettlement()
		item.change(&input)
		_, _, err := input.plan()
		failsWith(t, err, item.code)
	}
}
