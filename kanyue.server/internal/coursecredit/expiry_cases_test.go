package coursecredit

import (
	"errors"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/jsx"
)

// Activation and expiry cases ported from Hono's courseCreditActivationExpiry
// and courseCreditExpiryService tests.

func activationPolicy(mode string) map[string]any {
	policy := map[string]any{"activationMode": mode, "activationDeadline": "2026-02-01T00:00:00Z", "validityDurationDays": 30.0,
		"activatedAt": nil, "effectiveExpiresAt": nil, "status": "unactivated"}
	if mode == "GRANT_TIME" {
		policy["activationDeadline"] = nil
	}
	return policy
}

func quantityBatch() map[string]any {
	return map[string]any{"originalQuantity": 5.0, "availableQuantity": 3.0, "frozenQuantity": 2.0, "consumedQuantity": 0.0,
		"expiredQuantity": 0.0, "reversedQuantity": 0.0, "activatedAt": "2026-01-01T00:00:00Z", "activationMode": "GRANT_TIME",
		"activationDeadline": nil, "validityDurationDays": 31.0, "validFrom": "2026-01-01T00:00:00Z", "effectiveExpiresAt": "2026-02-01T00:00:00Z"}
}

// Hono: courseCreditActivationExpiry › time helpers enforce valid dates and half-open intervals
func TestActivationTimeHelpers(t *testing.T) {
	if addDays("2026-01-01T00:00:00Z", 2) != "2026-01-03T00:00:00.000Z" {
		t.Fatal("addDays")
	}
	_, err := dateOf("not-a-date", "value")
	failsWith(t, err, "INVALID_DATE")
	for _, blank := range []any{nil, ""} {
		if _, ok, err := optionalDateOf(blank, "value"); ok || err != nil {
			t.Fatalf("optional %v = %v, %v", blank, ok, err)
		}
	}
	// isWithinHalfOpen is serviceTimeValid's [validFrom, effectiveExpiresAt) check.
	window := map[string]any{"validFrom": "2026-01-01", "effectiveExpiresAt": "2026-01-02"}
	for at, want := range map[string]bool{"2026-01-01": true, "2026-01-02": false} {
		if got, _ := serviceTimeValid(window, at); got != want {
			t.Fatalf("within %s = %v", at, got)
		}
	}
	if open, _ := serviceTimeValid(map[string]any{}, "2026-01-02"); !open {
		t.Fatal("an unbounded window contains every time")
	}
}

// Hono: courseCreditActivationExpiry › activation policy validation requires explicit modes, deadlines, and duration
func TestActivationPolicyValidation(t *testing.T) {
	if err := validateActivationPolicy(activationPolicy("GRANT_TIME")); err != nil {
		t.Fatal(err)
	}
	failsWith(t, validateActivationPolicy(activationPolicy("UNKNOWN")), "INVALID_ACTIVATION_MODE")
	failsWith(t, validateActivationPolicy(copyWith(activationPolicy("FIRST_CHECK_IN"), "activationDeadline", nil)), "ACTIVATION_DEADLINE_REQUIRED")
	failsWith(t, validateActivationPolicy(copyWith(activationPolicy("FIRST_CHECK_IN"), "validityDurationDays", -1.0)), "INVALID_DURATION_DAYS")
}

// Hono: courseCreditActivationExpiry › all activation modes use only their explicit trigger and activate exactly once
func TestActivationOnReservationActivatesOnce(t *testing.T) {
	// Only FIRST_RESERVATION activates at runtime; grant-time batches start active in buildGrantBatch.
	for mode := range activationTriggers {
		if err := validateActivationPolicy(activationPolicy(mode)); err != nil {
			t.Fatalf("%s: %v", mode, err)
		}
	}
	activated, err := activateOnReservation(activationPolicy("FIRST_RESERVATION"), "2026-01-10T00:00:00Z")
	if err != nil || activated["status"] != "active" || activated["activatedAt"] != "2026-01-10T00:00:00.000Z" ||
		activated["effectiveExpiresAt"] != "2026-02-09T00:00:00.000Z" {
		t.Fatalf("activated = %v, %v", activated, err)
	}
	// An activated batch is reservable without checking the deadline again, so it never re-activates.
	if ok, err := canReserveUnactivatedBatch(activated, "2030-01-01", "2030-01-01"); !ok || err != nil {
		t.Fatalf("activated reservable = %v, %v", ok, err)
	}
}

// Hono: courseCreditActivationExpiry › activation deadline is exclusive and fixed expiry can be retained
func TestActivationDeadlineExclusiveAndFixedExpiry(t *testing.T) {
	policy := activationPolicy("FIRST_RESERVATION")
	if passed, _ := activationDeadlinePassed(policy, "2026-02-01T00:00:00Z"); !passed {
		t.Fatal("deadline is exclusive")
	}
	_, err := activateOnReservation(policy, "2026-02-01T00:00:00Z")
	failsWith(t, err, "ACTIVATION_DEADLINE_PASSED")
	fixed := copyWith(copyWith(policy, "validityDurationDays", nil), "effectiveExpiresAt", "2026-12-31T00:00:00Z")
	if activated, err := activateOnReservation(fixed, "2026-01-01"); err != nil || activated["effectiveExpiresAt"] != "2026-12-31T00:00:00.000Z" {
		t.Fatalf("fixed = %v, %v", activated, err)
	}
}

// Hono: courseCreditActivationExpiry › unactivated reservations stop at the deadline while active batches remain reservable
func TestUnactivatedReservationsStopAtDeadline(t *testing.T) {
	policy := activationPolicy("FIRST_CHECK_IN")
	for _, c := range []struct {
		start, now string
		want       bool
	}{{"2026-01-20", "2026-01-10", true}, {"2026-02-01", "2026-01-10", false}, {"2026-01-20", "2026-02-01", false}} {
		if got, err := canReserveUnactivatedBatch(policy, c.start, c.now); err != nil || got != c.want {
			t.Fatalf("reserve %v = %v, %v", c, got, err)
		}
	}
	if got, _ := canReserveUnactivatedBatch(copyWith(policy, "activatedAt", "2026-01-01"), "2030-01-01", "2030-01-01"); !got {
		t.Fatal("active batches stay reservable")
	}
}

// Hono: courseCreditActivationExpiry › service-time expiry protects valid reservations and expires released quantity correctly
func TestServiceTimeExpiryAndRelease(t *testing.T) {
	batch := quantityBatch()
	if ok, _ := serviceTimeValid(batch, "2026-01-01T00:00:00Z"); !ok {
		t.Fatal("valid at start")
	}
	if ok, _ := serviceTimeValid(batch, "2026-02-01T00:00:00Z"); ok {
		t.Fatal("expired at end")
	}
	if ok, _ := canConsumeProtectedReservation(batch, "2026-01-31T23:59:59Z"); !ok {
		t.Fatal("protected before expiry")
	}
	_, err := canConsumeProtectedReservation(batch, nil)
	failsWith(t, err, "RESERVATION_START_REQUIRED")
	if _, target, _ := releaseFrozen(batch, 1, "2026-01-20"); target != "availableQuantity" {
		t.Fatalf("before = %s", target)
	}
	if _, target, _ := releaseFrozen(batch, 1, "2026-02-01"); target != "expiredQuantity" {
		t.Fatalf("after = %s", target)
	}
}

// Hono: courseCreditActivationExpiry › expiry moves only available quantity and preserves frozen reservations
func TestExpiryMovesOnlyAvailableQuantity(t *testing.T) {
	batch := quantityBatch()
	if _, quantity, _ := expireAvailableQuantity(batch, "2026-01-20"); quantity != 0 {
		t.Fatalf("early = %v", quantity)
	}
	expired, quantity, err := expireAvailableQuantity(batch, "2026-02-01")
	if err != nil || quantity != 3 || expired["expiredQuantity"] != 3.0 || expired["frozenQuantity"] != 2.0 {
		t.Fatalf("expired = %v, %v, %v", expired, quantity, err)
	}
	spent := copyWith(copyWith(batch, "availableQuantity", 0.0), "consumedQuantity", 3.0)
	if _, quantity, _ := expireAvailableQuantity(spent, "2026-02-01"); quantity != 0 {
		t.Fatalf("spent = %v", quantity)
	}
	unactivated := copyWith(copyWith(copyWith(batch, "activatedAt", nil), "effectiveExpiresAt", nil), "activationDeadline", "2026-01-15")
	if _, quantity, _ := expireAvailableQuantity(unactivated, "2026-01-15"); quantity != 3 {
		t.Fatalf("unactivated = %v", quantity)
	}
}

var expiryNow = time.Date(2026, 7, 17, 0, 0, 0, 0, time.UTC)

type expiryFixture struct {
	ledgerFixture
	batch  *core.Record
	source string
}

// expirySetup stores Hono's creditBatch: 3 available and 4 frozen of 10, expired since July 1.
func expirySetup(t *testing.T, changes map[string]any) expiryFixture {
	t.Helper()
	f := ledgerSetup(t, true)
	source := put(t, f.app, "credit_operations", map[string]any{"type": "grant", "status": "committed", "operationNo": "source", "idempotencyKey": "source", "studentId": f.studentID})
	fields := map[string]any{"studentId": f.studentID, "creditTypeId": f.creditTypeID, "sourceOperationId": source.Id,
		"originalQuantity": 10, "availableQuantity": 3, "frozenQuantity": 4, "consumedQuantity": 3, "expiredQuantity": 0, "reversedQuantity": 0,
		"status": "active", "activationMode": "GRANT_TIME", "validFrom": "2026-01-01 00:00:00.000Z",
		"effectiveExpiresAt": "2026-07-01 00:00:00.000Z", "activatedAt": "2026-01-01 00:00:00.000Z", "version": 2}
	for key, value := range changes {
		fields[key] = value
	}
	return expiryFixture{f, put(t, f.app, "credit_batches", fields), source.Id}
}

// reserve stores a reserved allocation (and its session student) for a session starting at start.
func (f expiryFixture) reserve(t *testing.T, quantity int, start string) *core.Record {
	t.Helper()
	learner := put(t, f.app, "students", map[string]any{"realName": "学员"})
	student := put(t, f.app, "session_students", map[string]any{"sessionId": f.sessionID, "studentId": learner.Id,
		"attendanceStatus": "scheduled", "creditStatus": "reserved", "version": 1})
	put(t, f.app, "session_credit_allocations", map[string]any{"sessionStudentId": student.Id, "batchId": f.batch.Id,
		"quantity": quantity, "status": "reserved", "reservedForStartAt": start, "operationId": f.source})
	return student
}

func (f expiryFixture) run(t *testing.T) (map[string]any, error) {
	t.Helper()
	return expireDue(f.app, Actor{ID: "scheduler"}, jsx.Undefined{}, expiryNow)
}

func (f ledgerFixture) count(t *testing.T, collection, filter string) int {
	t.Helper()
	rows, err := f.app.FindRecordsByFilter(collection, filter, "", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	return len(rows)
}

// Hono: courseCreditExpiryService › expiry worker atomically expires available and invalid frozen credits while protecting service-time reservations
func TestExpiryWorkerExpiresAndProtects(t *testing.T) {
	f := expirySetup(t, nil)
	f.reserve(t, 2, "2026-06-30 10:00:00.000Z")
	invalid := f.reserve(t, 2, "2026-07-18 10:00:00.000Z")
	result, err := f.run(t)
	if err != nil || result["scanned"] != 1 || result["expiredBatches"] != 1 || result["expiredQuantity"] != 5.0 ||
		result["expiredReservations"] != 1 || result["protectedReservations"] != 1 || len(result["operationIds"].([]string)) != 1 {
		t.Fatalf("result = %v, %v %v", result, err, fmtJSON(errDetails(err)))
	}
	batch := reload(t, f.app, f.batch)
	if batch.GetInt("availableQuantity") != 0 || batch.GetInt("frozenQuantity") != 2 || batch.GetInt("expiredQuantity") != 5 ||
		batch.GetString("status") != "active" || batch.GetInt("version") != 3 {
		t.Fatalf("batch = %v", batch.FieldsData())
	}
	student := reload(t, f.app, invalid)
	if student.GetString("creditStatus") != "credit_insufficient" || student.GetString("eligibilityReason") != "CREDIT_EXPIRED" || student.GetInt("version") != 2 {
		t.Fatalf("session student = %v", student.FieldsData())
	}
	if f.count(t, "session_credit_allocations", `status="expired"`) != 1 || f.count(t, "credit_version_claims", "") != 2 {
		t.Fatal("allocation and version claims")
	}
	events, _ := f.app.FindRecordsByFilter("credit_events", `eventType="EXPIRE"`, "bucketFrom", 0, 0)
	if len(events) != 2 || events[0].GetString("bucketFrom") != "availableQuantity" || events[0].GetInt("quantityDelta") != 3 ||
		events[1].GetString("bucketFrom") != "frozenQuantity" || events[1].GetInt("quantityDelta") != 2 {
		t.Fatalf("events = %v", events)
	}
	if f.count(t, "credit_operations", `idempotencyKey="expireBatch:`+f.batch.Id+`:v2"`) != 1 ||
		f.count(t, "outbox_events", `topic="course-credit.batch-expired"`) != 1 {
		t.Fatal("operation and outbox")
	}
}

// Hono: courseCreditExpiryService › expiry worker expires every reservation when an unactivated batch misses its activation deadline
func TestExpiryWorkerActivationDeadline(t *testing.T) {
	f := expirySetup(t, map[string]any{"activatedAt": "", "activationDeadline": "2026-07-16 00:00:00.000Z", "activationMode": "FIRST_RESERVATION",
		"availableQuantity": 1, "frozenQuantity": 1, "consumedQuantity": 0, "originalQuantity": 2, "effectiveExpiresAt": "", "status": "unactivated"})
	f.reserve(t, 1, "2026-07-20 10:00:00.000Z")
	result, err := f.run(t)
	if err != nil || result["expiredQuantity"] != 2.0 {
		t.Fatalf("result = %v, %v %v", result, err, fmtJSON(errDetails(err)))
	}
	batch := reload(t, f.app, f.batch)
	if batch.GetInt("availableQuantity") != 0 || batch.GetInt("frozenQuantity") != 0 || batch.GetInt("expiredQuantity") != 2 ||
		batch.GetString("status") != "expired" || batch.GetInt("version") != 3 {
		t.Fatalf("batch = %v", batch.FieldsData())
	}
}

// Hono: courseCreditExpiryService › expiry worker is a no-op when all frozen credits remain protected
func TestExpiryWorkerNoOpWhenProtected(t *testing.T) {
	f := expirySetup(t, map[string]any{"availableQuantity": 0, "frozenQuantity": 2, "consumedQuantity": 3, "originalQuantity": 5})
	f.reserve(t, 2, "2026-06-30 10:00:00.000Z")
	result, err := f.run(t)
	if err != nil || result["expiredBatches"] != 0 || result["protectedReservations"] != 1 || f.count(t, "credit_operations", `type="expire"`) != 0 {
		t.Fatalf("result = %v, %v %v", result, err, fmtJSON(errDetails(err)))
	}
}

// failFirst makes the first count writes of collection fail with err.
func failFirst(app core.App, collection string, count int, err error) *int {
	attempts := 0
	app.OnRecordCreateExecute(collection).BindFunc(func(e *core.RecordEvent) error {
		attempts++
		if attempts <= count {
			return err
		}
		return e.Next()
	})
	return &attempts
}

// Hono: courseCreditExpiryService › expiry worker retries a version race from current storage state without duplicating events
func TestExpiryWorkerRetriesVersionRace(t *testing.T) {
	f := expirySetup(t, map[string]any{"availableQuantity": 3, "frozenQuantity": 0, "originalQuantity": 6})
	attempts := failFirst(f.app, "credit_version_claims", 1, errors.New("version conflict"))
	result, err := f.run(t)
	if err != nil || result["expiredBatches"] != 1 || *attempts != 2 {
		t.Fatalf("result = %v, %v %v, attempts %d", result, err, fmtJSON(errDetails(err)), *attempts)
	}
	// The retry rereads storage; a later run finds nothing left to expire.
	again, err := f.run(t)
	if err != nil || again["scanned"] != 0 || f.count(t, "credit_events", `eventType="EXPIRE"`) != 1 {
		t.Fatalf("again = %v, %v", again, err)
	}
}

// Hono: courseCreditExpiryService › expiry worker reports safe per-batch failures after continuing the scan
func TestExpiryWorkerReportsSafeFailures(t *testing.T) {
	f := expirySetup(t, nil)
	failFirst(f.app, "credit_operations", 2, Fail("DB_DOWN", "private", nil))
	_, err := f.run(t)
	failsWith(t, err, "COURSE_CREDIT_EXPIRY_RUN_FAILED")
	var store *storeError
	if !errors.As(err, &store) || store.status != 503 || store.details["failed"].([]any)[0].(map[string]any)["errorCode"] != "DB_DOWN" {
		t.Fatalf("failure = %v", err)
	}
}

// Hono: courseCreditExpiryService › expiry worker uses default configuration and accepts an empty repository page
func TestExpiryWorkerEmptyRun(t *testing.T) {
	f := ledgerSetup(t, true)
	result, err := expireDue(f.app, Actor{}, jsx.Undefined{}, expiryNow)
	if err != nil || fmtJSON(result) != `{"expiredBatches":0,"expiredQuantity":0,"expiredReservations":0,"operationIds":[],"protectedReservations":0,"scanned":0}` {
		t.Fatalf("result = %s, %v", fmtJSON(result), err)
	}
}

// Hono: courseCreditExpiryService › expiry worker assigns a stable code to uncategorized storage failures
func TestExpiryWorkerStableFailureCode(t *testing.T) {
	f := expirySetup(t, nil)
	failFirst(f.app, "credit_operations", 2, errors.New("private"))
	_, err := f.run(t)
	var store *storeError
	if !errors.As(err, &store) || store.details["failed"].([]any)[0].(map[string]any)["errorCode"] != "COURSE_CREDIT_EXPIRY_FAILED" {
		t.Fatalf("failure = %v", err)
	}
}

// Hono: courseCreditExpiryService › expiry worker rejects corrupt reserved allocation quantities before storage writes
func TestExpiryWorkerRejectsCorruptAllocations(t *testing.T) {
	f := expirySetup(t, nil)
	f.reserve(t, 0, "2026-07-18 00:00:00.000Z")
	_, err := f.run(t)
	var store *storeError
	if !errors.As(err, &store) || store.details["failed"].([]any)[0].(map[string]any)["errorCode"] != "ALLOCATION_QUANTITY_INVALID" ||
		f.count(t, "credit_operations", `type="expire"`) != 0 {
		t.Fatalf("failure = %v", err)
	}
}

// Hono: courseCreditExpiryService › expiry helper contracts validate limits, dates, relations, filters, and safe errors
func TestExpiryHelperContracts(t *testing.T) {
	if limit, _ := expiryLimit(jsx.Undefined{}); limit != 100 {
		t.Fatalf("default = %d", limit)
	}
	if limit, _ := expiryLimit("200"); limit != 200 {
		t.Fatalf("limit = %d", limit)
	}
	for _, value := range []any{0.0, 201.0} {
		_, err := expiryLimit(value)
		failsWith(t, err, "EXPIRY_LIMIT_INVALID")
	}
	if filter := dueBatchFilter(iso(expiryNow)); !jsx.Truthy(filter) || !containsAll(filter, "activationDeadline", "2026-07-17 00:00:00.000Z") {
		t.Fatalf("filter = %s", filter)
	}
	if relationID([]any{map[string]any{"id": "relation"}}) != "relation" || relationID(map[string]any{}) != "" || relationID(nil) != "" {
		t.Fatal("relationID")
	}
	if safeErrorCode(errors.New("x")) != "COURSE_CREDIT_EXPIRY_FAILED" || safeErrorCode(Fail("bad private code", "", nil)) != "COURSE_CREDIT_EXPIRY_FAILED" {
		t.Fatal("safeErrorCode")
	}
	valid, _ := canConsumeProtectedReservation(map[string]any{"validFrom": "2026-01-01", "effectiveExpiresAt": "2026-07-01"}, "2026-06-01T00:00:00Z")
	invalid, _ := canConsumeProtectedReservation(map[string]any{"validFrom": "2026-01-01", "effectiveExpiresAt": "2026-07-01"}, "2026-08-01T00:00:00Z")
	if !valid || invalid {
		t.Fatal("allocations partition into protected and invalid")
	}
}

func errDetails(err error) any {
	var store *storeError
	if errors.As(err, &store) {
		return store.details
	}
	var business *Error
	if errors.As(err, &business) {
		return business.Details
	}
	return nil
}
