package coursecredit

import (
	"math"
	"reflect"
	"slices"
	"testing"

	"kanyue.server/internal/auth"
)

// Domain cases ported from Hono's courseCreditQuantities, courseCreditEligibility
// and courseCreditAuthorization tests.

func bucketBatch(quantity float64) map[string]any {
	return map[string]any{"originalQuantity": quantity, "availableQuantity": quantity, "frozenQuantity": 0.0,
		"consumedQuantity": 0.0, "expiredQuantity": 0.0, "reversedQuantity": 0.0, "activatedAt": nil}
}

// Hono: courseCreditQuantities › quantity movements conserve a batch while freezing and consuming credits
func TestQuantityMovementsConserveBatch(t *testing.T) {
	original := bucketBatch(10)
	frozen, err := moveQuantity(original, "availableQuantity", "frozenQuantity", 2)
	if err != nil {
		t.Fatal(err)
	}
	consumed, err := moveQuantity(frozen, "frozenQuantity", "consumedQuantity", 1)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(original, bucketBatch(10)) {
		t.Fatalf("original mutated: %v", original)
	}
	if consumed["availableQuantity"] != 8.0 || consumed["frozenQuantity"] != 1.0 || consumed["consumedQuantity"] != 1.0 {
		t.Fatalf("consumed = %v", consumed)
	}
	if err := validateBatchQuantities(consumed); err != nil {
		t.Fatal(err)
	}
}

// Hono: courseCreditQuantities › quantity validation rejects negative, fractional, and non-conserving states
func TestQuantityValidationRejectsInvalidStates(t *testing.T) {
	failsWith(t, validateBatchQuantities(copyWith(bucketBatch(2), "originalQuantity", -1.0)), "INVALID_CREDIT_QUANTITY")
	fractional := copyWith(copyWith(bucketBatch(2), "frozenQuantity", 0.5), "availableQuantity", 1.5)
	failsWith(t, validateBatchQuantities(fractional), "INVALID_CREDIT_QUANTITY")
	failsWith(t, validateBatchQuantities(copyWith(bucketBatch(2), "availableQuantity", 1.0)), "BATCH_QUANTITY_MISMATCH")
}

// Hono: courseCreditQuantities › quantity movement rejects invalid buckets, zero, and insufficient source quantity
func TestQuantityMovementRejectsInvalidMoves(t *testing.T) {
	state := bucketBatch(2)
	for _, move := range []struct {
		from, to string
		quantity float64
		code     string
	}{
		{"missing", "frozenQuantity", 1, "INVALID_CREDIT_BUCKET"},
		{"availableQuantity", "missing", 1, "INVALID_CREDIT_BUCKET"},
		{"availableQuantity", "availableQuantity", 1, "INVALID_CREDIT_BUCKET"},
		{"availableQuantity", "frozenQuantity", 0, "INVALID_CREDIT_QUANTITY"},
		{"availableQuantity", "frozenQuantity", 3, "CREDIT_INSUFFICIENT"},
	} {
		_, err := moveQuantity(state, move.from, move.to, move.quantity)
		failsWith(t, err, move.code)
	}
}

// Hono: courseCreditQuantities › batch status derives from terminal buckets and activation
func TestBatchStatusDerivation(t *testing.T) {
	drained := copyWith(bucketBatch(2), "availableQuantity", 0.0)
	for _, item := range []struct {
		batch  map[string]any
		status string
	}{
		{copyWith(drained, "reversedQuantity", 2.0), "cancelled"},
		{copyWith(drained, "expiredQuantity", 2.0), "expired"},
		{copyWith(drained, "consumedQuantity", 2.0), "depleted"},
		{copyWith(bucketBatch(2), "activatedAt", "2026-01-01T00:00:00.000Z"), "active"},
		{bucketBatch(2), "unactivated"},
	} {
		if status, err := deriveBatchStatus(item.batch); err != nil || status != item.status {
			t.Fatalf("status = %q, %v; want %q", status, err, item.status)
		}
	}
}

// Hono: courseCreditQuantities › generated operation sequences preserve non-negative integer conservation
func TestGeneratedMovementsConserveQuantity(t *testing.T) {
	for seed := uint32(1); seed <= 150; seed++ {
		value := seed
		random := func() float64 {
			value = value*1664525 + 1013904223
			return float64(value) / 0x100000000
		}
		state := bucketBatch(25)
		for range 80 {
			sources := []string{}
			for _, name := range bucketNames {
				if state[name].(float64) > 0 {
					sources = append(sources, name)
				}
			}
			source := sources[int(random()*float64(len(sources)))]
			targets := slices.DeleteFunc(slices.Clone(bucketNames), func(name string) bool { return name == source })
			target := targets[int(random()*float64(len(targets)))]
			quantity := 1 + math.Floor(random()*state[source].(float64))
			next, err := moveQuantity(state, source, target, quantity)
			if err != nil {
				t.Fatalf("seed %d: %v", seed, err)
			}
			state = next
			total := 0.0
			for _, name := range bucketNames {
				if quantity := state[name].(float64); quantity < 0 || quantity != math.Trunc(quantity) {
					t.Fatalf("seed %d: %s = %v", seed, name, quantity)
				}
				total += state[name].(float64)
			}
			if total != 25 {
				t.Fatalf("seed %d: total = %v", seed, total)
			}
		}
	}
}

var eligibilityContext = reservationContext{creditTypeID: "vocal", sessionStart: "2026-02-10T10:00:00Z", now: "2026-01-10T10:00:00Z"}

func eligibleBatch(changes map[string]any) map[string]any {
	batch := map[string]any{"id": "batch", "creditTypeId": "vocal", "creditKind": "course", "consumable": true, "locked": false,
		"status": "active", "availableQuantity": 2.0, "activatedAt": "2026-01-01T00:00:00Z", "activationMode": "GRANT_TIME",
		"activationDeadline": nil, "validityDurationDays": 90.0, "validFrom": "2026-01-01T00:00:00Z",
		"effectiveExpiresAt": "2026-04-01T00:00:00Z", "priority": 0.0, "created": "2026-01-01T00:00:00Z"}
	for key, value := range changes {
		batch[key] = value
	}
	return batch
}

// Go keeps eligibility as a boolean; Hono's rejection reasons only surface in its
// allocation report, which Go does not expose.
//
// Hono: courseCreditEligibility › eligibility rejects every non-consumable or unavailable batch state
func TestEligibilityRejectsUnavailableBatches(t *testing.T) {
	if ok, err := batchEligible(eligibleBatch(nil), eligibilityContext); err != nil || !ok {
		t.Fatalf("baseline = %v, %v", ok, err)
	}
	for _, changes := range []map[string]any{
		{"creditTypeId": "other"}, {"creditKind": "universal"}, {"consumable": false}, {"locked": true},
		{"status": "expired"}, {"availableQuantity": 0.0}, {"availableQuantity": 0.5},
		{"effectiveExpiresAt": "2026-02-10T10:00:00Z"},
	} {
		if ok, err := batchEligible(eligibleBatch(changes), eligibilityContext); err != nil || ok {
			t.Fatalf("%v eligible = %v, %v", changes, ok, err)
		}
	}
}

// Hono: courseCreditEligibility › unactivated batches require both current time and service time before activation deadline
func TestUnactivatedEligibilityDeadline(t *testing.T) {
	batch := eligibleBatch(map[string]any{"status": "unactivated", "activatedAt": nil, "activationMode": "FIRST_CHECK_IN",
		"activationDeadline": "2026-02-01T00:00:00Z", "effectiveExpiresAt": nil})
	early := eligibilityContext
	early.sessionStart = "2026-01-20"
	late := early
	late.now = "2026-02-01"
	for _, item := range []struct {
		context reservationContext
		want    bool
	}{{eligibilityContext, false}, {early, true}, {late, false}} {
		if ok, err := batchEligible(batch, item.context); err != nil || ok != item.want {
			t.Fatalf("%+v eligible = %v, %v", item.context, ok, err)
		}
	}
}

// Hono: courseCreditEligibility › FEFO allocation sorts expiry, priority, creation, and id deterministically
func TestFefoOrdering(t *testing.T) {
	batches := []map[string]any{
		eligibleBatch(map[string]any{"id": "z", "effectiveExpiresAt": nil, "priority": 0.0, "created": "2026-01-01", "availableQuantity": 3.0}),
		eligibleBatch(map[string]any{"id": "c", "effectiveExpiresAt": "2026-03-01", "priority": 2.0, "created": "2026-01-01", "availableQuantity": 2.0}),
		eligibleBatch(map[string]any{"id": "b", "effectiveExpiresAt": "2026-03-01", "priority": 1.0, "created": "2026-01-02", "availableQuantity": 1.0}),
		eligibleBatch(map[string]any{"id": "a", "effectiveExpiresAt": "2026-03-01", "priority": 1.0, "created": "2026-01-01", "availableQuantity": 1.0}),
		eligibleBatch(map[string]any{"id": "aa", "effectiveExpiresAt": "2026-03-01", "priority": 1.0, "created": "2026-01-01", "availableQuantity": 1.0}),
	}
	sorted := slices.Clone(batches)
	slices.SortStableFunc(sorted, compareFefo)
	order := []string{}
	for _, batch := range sorted {
		order = append(order, batch["id"].(string))
	}
	if !slices.Equal(order, []string{"a", "aa", "b", "c", "z"}) {
		t.Fatalf("order = %v", order)
	}
	plan := reservationPlan{}
	if err := allocateFefo(&plan, batches, 4, eligibilityContext); err != nil {
		t.Fatal(err)
	}
	want := []creditAllocation{{"a", 1}, {"aa", 1}, {"b", 1}, {"c", 1}}
	if !reflect.DeepEqual(plan.allocations, want) || plan.missing != 0 {
		t.Fatalf("plan = %+v", plan)
	}
}

// Hono: courseCreditEligibility › FEFO reports missing quantity and rejected batch reasons without mutation
func TestFefoReportsMissingQuantity(t *testing.T) {
	batches := []map[string]any{
		eligibleBatch(map[string]any{"id": "one", "availableQuantity": 1.0}),
		eligibleBatch(map[string]any{"id": "wrong", "creditTypeId": "other", "availableQuantity": 9.0}),
	}
	plan := reservationPlan{}
	if err := allocateFefo(&plan, batches, 3, eligibilityContext); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(plan.allocations, []creditAllocation{{"one", 1}}) || plan.missing != 2 {
		t.Fatalf("plan = %+v", plan)
	}
	if batches[0]["availableQuantity"] != 1.0 {
		t.Fatalf("batch mutated: %v", batches[0])
	}
	failsWith(t, allocateFefo(&reservationPlan{}, batches, 0, eligibilityContext), "INVALID_CREDIT_QUANTITY")
}

// Hono: courseCreditAuthorization › super administrators receive all operator capabilities but not student or guardian scope
func TestAdminCapabilities(t *testing.T) {
	admin := auth.Claims{"id": "admin", "role": "teacher", "isAdmin": true}
	for _, capability := range []string{Academic, Audit, Finance, Settlement, Teacher} {
		if !HasCapability(admin, capability) {
			t.Fatalf("admin lacks %s", capability)
		}
	}
	if HasCapability(admin, Student) || HasCapability(admin, Guardian) {
		t.Fatal("admin must not hold student or guardian scope")
	}
}

// Hono: courseCreditAuthorization › teachers require explicit scoped capabilities and cannot inherit unrelated finance access
func TestTeacherCapabilities(t *testing.T) {
	teacher := auth.Claims{"id": "teacher", "role": "teacher", "courseCreditCapabilities": []any{Academic, Teacher, 123.0}}
	if !HasCapability(teacher, Academic) || !HasCapability(teacher, Teacher) || HasCapability(teacher, Finance) {
		t.Fatal("teacher capabilities must be exactly the explicit ones")
	}
	if err := RequireCapability(teacher, Academic); err != nil {
		t.Fatal(err)
	}
	err := RequireCapability(teacher, Finance)
	failsWith(t, err, "COURSE_CREDIT_CAPABILITY_REQUIRED")
	if details, _ := errDetails(err).(map[string]any); details["capability"] != Finance {
		t.Fatalf("details = %v", details)
	}
}

// Hono: courseCreditAuthorization › student and guardian scopes remain role-bound
func TestRoleBoundCapabilities(t *testing.T) {
	student := auth.Claims{"id": "student", "role": "student"}
	if !HasCapability(student, Student) || HasCapability(student, Finance) {
		t.Fatal("student scope")
	}
	if !HasCapability(auth.Claims{"id": "guardian", "role": "guardian", "capabilities": []any{Guardian}}, Guardian) ||
		HasCapability(auth.Claims{"id": "guardian", "role": "guardian"}, Guardian) {
		t.Fatal("guardian scope")
	}
	if HasCapability(auth.Claims{"id": "unknown", "role": "other"}, Student) || HasCapability(auth.Claims{}, "unknown") {
		t.Fatal("unknown role or capability")
	}
	if got := explicitCapabilities(auth.Claims{"capabilities": []any{Audit}}); !slices.Equal(got, []string{Audit}) {
		t.Fatalf("explicit = %v", got)
	}
	if got := explicitCapabilities(auth.Claims{"capabilities": "invalid"}); len(got) != 0 {
		t.Fatalf("invalid explicit = %v", got)
	}
}
