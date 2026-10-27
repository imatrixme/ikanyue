package coursecredit

import (
	"reflect"
	"testing"
)

// Reverse settlement planning cases ported from Hono's courseCreditReverseSettlementPlanning tests.

type reversalInput struct {
	events                         []map[string]any
	allocations, batches, students map[string]map[string]any
}

func reversalEvent(id, eventType, bucketTo string, delta float64, suffix string) map[string]any {
	return map[string]any{"id": id, "eventType": eventType, "bucketTo": bucketTo, "quantityDelta": delta, "batchId": "batch-" + suffix,
		"metadata": map[string]any{"allocationId": "allocation-" + suffix, "sessionStudentId": "student-" + suffix}}
}

func reversalAllocation(suffix, status string) map[string]any {
	return map[string]any{"id": "allocation-" + suffix, "sessionStudentId": "student-" + suffix, "batchId": "batch-" + suffix,
		"quantity": 1.0, "status": status, "reservedForStartAt": "2026-08-10T10:00:00.000Z"}
}

func reversalBatch(suffix, studentID, terminal string) map[string]any {
	batch := map[string]any{"id": "batch-" + suffix, "studentId": studentID, "creditTypeId": "course", "originalQuantity": 1.0,
		"availableQuantity": 0.0, "frozenQuantity": 0.0, "consumedQuantity": 0.0, "expiredQuantity": 0.0, "reversedQuantity": 0.0,
		"activatedAt": "2026-08-16T10:00:00.000Z", "version": 4.0}
	batch[terminal] = 1.0
	return batch
}

func defaultReversal() reversalInput {
	return reversalInput{
		events: []map[string]any{reversalEvent("consume-event", "CONSUME", "consumedQuantity", -1, "consume"),
			reversalEvent("release-event", "RELEASE", "expiredQuantity", 1, "release")},
		allocations: map[string]map[string]any{"allocation-consume": reversalAllocation("consume", "consumed"),
			"allocation-release": reversalAllocation("release", "expired")},
		batches: map[string]map[string]any{"batch-consume": reversalBatch("consume", "account-consume", "consumedQuantity"),
			"batch-release": reversalBatch("release", "account-release", "expiredQuantity")},
		students: map[string]map[string]any{
			"student-consume": {"id": "student-consume", "studentId": "account-consume", "creditStatus": "consumed", "version": 3.0},
			"student-release": {"id": "student-release", "studentId": "account-release", "creditStatus": "released", "version": 3.0}},
	}
}

func (r reversalInput) plan() ([]step, []any, error) {
	return creditReversalPlan(r.events, r.allocations, r.batches, r.students, "session", "settlement-operation",
		teaching{operationID: "reversal-operation", at: "2026-08-16T10:00:00.000Z"},
		map[string]any{"actorId": "operator", "reason": "attendance correction"})
}

// planSteps splits a plan into its updates and creates of one collection.
func planSteps(plan []step, collection string) (updates, creates []map[string]any) {
	for _, item := range plan {
		if item.collection != collection {
			continue
		}
		if item.id != "" {
			updates = append(updates, item.data)
		} else {
			creates = append(creates, item.data)
		}
	}
	return updates, creates
}

func teacherEarningEvent(id, assignment, status string, quantity float64) map[string]any {
	return map[string]any{"id": id, "sessionTeacherId": assignment, "teacherId": "teacher-" + assignment, "ruleId": "rule",
		"eventType": "earn", "status": status, "quantityDelta": quantity}
}

// Hono: courseCreditReverseSettlementPlanning › credit reversal restores frozen buckets and appends linked reverse facts
func TestCreditReversalRestoresFrozen(t *testing.T) {
	plan, reversed, err := defaultReversal().plan()
	if err != nil || len(reversed) != 2 {
		t.Fatalf("reversed = %v, %v", reversed, err)
	}
	batches, _ := planSteps(plan, "credit_batches")
	if batches[0]["frozenQuantity"] != 1.0 || batches[0]["consumedQuantity"] != 0.0 || batches[1]["expiredQuantity"] != 0.0 {
		t.Fatalf("batches = %v", batches)
	}
	updated, replacements := planSteps(plan, "session_credit_allocations")
	if len(updated) != 2 || updated[0]["status"] != "reversed" || updated[1]["status"] != "reversed" || len(replacements) != 2 ||
		replacements[0]["status"] != "reserved" || replacements[1]["status"] != "reserved" {
		t.Fatalf("allocations = %v / %v", updated, replacements)
	}
	eventUpdates, events := planSteps(plan, "credit_events")
	if len(eventUpdates) != 0 || events[0]["quantityDelta"] != 1.0 || events[1]["quantityDelta"] != -1.0 ||
		events[0]["reversalOfEventId"] != "consume-event" || events[1]["reversalOfEventId"] != "release-event" ||
		events[0]["bucketFrom"] != "consumedQuantity" || events[1]["bucketFrom"] != "expiredQuantity" {
		t.Fatalf("events = %v", events)
	}
	students, _ := planSteps(plan, "session_students")
	if len(students) != 2 || students[0]["creditStatus"] != "reserved" || students[1]["creditStatus"] != "reserved" {
		t.Fatalf("students = %v", students)
	}
}

// Hono: courseCreditReverseSettlementPlanning › teacher reversal appends negative events and never mutates original earnings
func TestTeacherReversalAppendsNegativeEvents(t *testing.T) {
	plan, _, err := teacherReversalPlan([]map[string]any{teacherEarningEvent("lead-event", "assignment-lead", "pending", 1.25),
		teacherEarningEvent("assistant-event", "assignment-assistant", "confirmed", 0.5)}, "reversal-operation", "attendance correction")
	if err != nil {
		t.Fatal(err)
	}
	updates, events := planSteps(plan, "teacher_credit_events")
	if len(updates) != 0 || events[0]["quantityDelta"] != -1.25 || events[1]["quantityDelta"] != -0.5 ||
		events[0]["reversalOfEventId"] != "lead-event" || events[1]["reversalOfEventId"] != "assistant-event" ||
		events[0]["status"] != "reversed" || events[1]["status"] != "reversed" {
		t.Fatalf("events = %v", events)
	}
	teachers, _ := planSteps(plan, "session_teachers")
	if len(teachers) != 2 || teachers[0]["creditStatus"] != "reversed" || teachers[1]["creditStatus"] != "reversed" {
		t.Fatalf("teachers = %v", teachers)
	}
}

// Hono: courseCreditReverseSettlementPlanning › teacher cancellation compensation is reversible through the same immutable event path
func TestTeacherCompensationIsReversible(t *testing.T) {
	plan, _, err := teacherReversalPlan([]map[string]any{copyWith(teacherEarningEvent("compensation", "assignment", "pending", 0.75),
		"eventType", "compensate")}, "reversal-operation", "reason")
	_, events := planSteps(plan, "teacher_credit_events")
	if err != nil || events[0]["quantityDelta"] != -0.75 || events[0]["reversalOfEventId"] != "compensation" {
		t.Fatalf("events = %v, %v", events, err)
	}
}

// Hono: courseCreditReverseSettlementPlanning › reversal preserves legacy event links when allocation or teacher rule fields are absent
func TestReversalPreservesLegacyLinks(t *testing.T) {
	input := defaultReversal()
	input.allocations["allocation-consume"] = copyWith(reversalAllocation("consume", "consumed"), "sessionStudentId", "")
	plan, _, err := input.plan()
	_, replacements := planSteps(plan, "session_credit_allocations")
	if err != nil || replacements[0]["sessionStudentId"] != "student-consume" {
		t.Fatalf("replacements = %v, %v", replacements, err)
	}
	teacherPlan, _, err := teacherReversalPlan([]map[string]any{copyWith(teacherEarningEvent("event", "assignment", "pending", 1), "ruleId", "")},
		"reversal-operation", "reason")
	_, events := planSteps(teacherPlan, "teacher_credit_events")
	if err != nil || events[0]["ruleId"] != "" {
		t.Fatalf("teacher events = %v, %v", events, err)
	}
}

// Go checks the settled allocation status inline in creditReversalPlan.
//
// Hono: courseCreditReverseSettlementPlanning › reversal status mapping distinguishes consumed, released, and expired allocations
func TestReversalStatusMapping(t *testing.T) {
	for _, item := range []struct {
		eventType, bucket, status string
		delta                     float64
	}{{"CONSUME", "consumedQuantity", "consumed", -1}, {"RELEASE", "availableQuantity", "released", 1}, {"RELEASE", "expiredQuantity", "expired", 1}} {
		input := defaultReversal()
		input.events = []map[string]any{reversalEvent("event", item.eventType, item.bucket, item.delta, "consume")}
		input.allocations["allocation-consume"] = reversalAllocation("consume", item.status)
		input.batches["batch-consume"] = reversalBatch("consume", "account-consume", item.bucket)
		if _, _, err := input.plan(); err != nil {
			t.Fatalf("%s %s: %v", item.eventType, item.bucket, err)
		}
		input.allocations["allocation-consume"] = reversalAllocation("consume", "reserved")
		_, _, err := input.plan()
		failsWith(t, err, "REVERSAL_ALLOCATION_STATUS_INVALID")
	}
}

// Hono: courseCreditReverseSettlementPlanning › credit reversal rejects missing, duplicate, or inconsistent original facts
func TestCreditReversalRejectsInconsistentFacts(t *testing.T) {
	first := func(r *reversalInput, key string, value any) { r.events[0] = copyWith(r.events[0], key, value) }
	for _, item := range []struct {
		change func(*reversalInput)
		code   string
	}{
		{func(r *reversalInput) { first(r, "eventType", "FREEZE") }, "CREDIT_EVENT_NOT_REVERSIBLE"},
		{func(r *reversalInput) { first(r, "reversalOfEventId", "prior") }, "CREDIT_EVENT_ALREADY_REVERSED"},
		{func(r *reversalInput) { first(r, "bucketTo", "frozenQuantity") }, "REVERSAL_BUCKET_INVALID"},
		{func(r *reversalInput) { first(r, "metadata", map[string]any{}) }, "REVERSAL_ALLOCATION_ID_REQUIRED"},
		{func(r *reversalInput) {
			r.events = []map[string]any{r.events[0], copyWith(r.events[0], "id", "duplicate")}
		}, "DUPLICATE_REVERSAL_BATCH"},
		{func(r *reversalInput) { r.allocations = map[string]map[string]any{} }, "REVERSAL_ALLOCATION_NOT_FOUND"},
		{func(r *reversalInput) {
			r.allocations["allocation-consume"] = reversalAllocation("consume", "released")
		}, "REVERSAL_ALLOCATION_STATUS_INVALID"},
		{func(r *reversalInput) { r.batches = map[string]map[string]any{} }, "REVERSAL_BATCH_NOT_FOUND"},
		{func(r *reversalInput) { r.students = map[string]map[string]any{} }, "REVERSAL_SESSION_STUDENT_NOT_FOUND"},
		{func(r *reversalInput) {
			r.batches["batch-consume"] = reversalBatch("consume", "other", "consumedQuantity")
		}, "REVERSAL_BATCH_STUDENT_MISMATCH"},
		{func(r *reversalInput) { first(r, "quantityDelta", -2.0) }, "REVERSAL_QUANTITY_MISMATCH"},
		{func(r *reversalInput) {
			r.batches["batch-consume"] = reversalBatch("consume", "account-consume", "availableQuantity")
		}, "CREDIT_INSUFFICIENT"},
	} {
		input := defaultReversal()
		item.change(&input)
		_, _, err := input.plan()
		failsWith(t, err, item.code)
	}
}

// Hono: courseCreditReverseSettlementPlanning › teacher reversal rejects invalid, repeated, or non-positive earning events
func TestTeacherReversalRejectsInvalidEvents(t *testing.T) {
	for _, item := range []struct {
		events []map[string]any
		code   string
	}{
		{[]map[string]any{copyWith(teacherEarningEvent("event", "assignment", "pending", 1), "eventType", "confirm")}, "TEACHER_EVENT_NOT_REVERSIBLE"},
		{[]map[string]any{copyWith(teacherEarningEvent("event", "assignment", "pending", 1), "reversalOfEventId", "prior")}, "TEACHER_EVENT_ALREADY_REVERSED"},
		{[]map[string]any{teacherEarningEvent("one", "assignment", "pending", 1), teacherEarningEvent("two", "assignment", "pending", 1)}, "DUPLICATE_TEACHER_REVERSAL"},
		{[]map[string]any{teacherEarningEvent("event", "assignment", "pending", 0)}, "TEACHER_REVERSAL_QUANTITY_INVALID"},
	} {
		_, _, err := teacherReversalPlan(item.events, "reversal-operation", "reason")
		failsWith(t, err, item.code)
	}
	if plan, _, err := teacherReversalPlan(nil, "reversal-operation", "reason"); err != nil || !reflect.DeepEqual(plan, []step{}) {
		t.Fatalf("empty = %v, %v", plan, err)
	}
}
