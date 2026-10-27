package coursecredit

import (
	"errors"
	"testing"
	"time"
)

// Batch lifecycle cases ported from Hono's courseCreditBatchLifecycleService tests.

var lifecycleNow = time.Date(2026, 7, 17, 10, 0, 0, 0, time.UTC)

// lifecycleSetup stores Hono's batch(): 2 available, 1 frozen and 5 expired of 10, expiring July 20.
func lifecycleSetup(t *testing.T, changes map[string]any) expiryFixture {
	t.Helper()
	fields := map[string]any{"availableQuantity": 2, "frozenQuantity": 1, "consumedQuantity": 2, "expiredQuantity": 5,
		"originalExpiresAt": "2026-07-20 00:00:00.000Z", "effectiveExpiresAt": "2026-07-20 00:00:00.000Z",
		"listUnitValue": 300, "paidUnitCost": 280, "currency": "CNY", "priority": 1, "version": 3}
	for key, value := range changes {
		fields[key] = value
	}
	return expirySetup(t, fields)
}

func (f expiryFixture) extendCommand(changes map[string]any) batchCommand {
	values := map[string]any{"newExpiresAt": "2026-08-20T00:00:00Z", "reason": "approved extension"}
	return f.lifecycleCommand("extend-key", values, changes)
}

func (f expiryFixture) restoreCommand(changes map[string]any) batchCommand {
	values := map[string]any{"quantity": 2.0, "validityDurationDays": 30.0, "reason": "approved compensation"}
	return f.lifecycleCommand("restore-key", values, changes)
}

// lifecycleCommand applies changes to the body; batchId, actorId and idempotencyKey address the command itself.
func (f expiryFixture) lifecycleCommand(key string, values, changes map[string]any) batchCommand {
	command := batchCommand{BatchID: f.batch.Id, Actor: Actor{ID: "operator", IdempotencyKey: key}, Clock: func() time.Time { return lifecycleNow }}
	for name, value := range changes {
		switch name {
		case "batchId":
			command.BatchID = value.(string)
		case "actorId":
			command.Actor.ID = value.(string)
		case "idempotencyKey":
			command.Actor.IdempotencyKey = value.(string)
		default:
			values[name] = value
		}
	}
	command.Body = Body{Values: values}
	return command
}

func (f expiryFixture) operation(t *testing.T, kind string) map[string]any {
	t.Helper()
	operation, err := findFirst(f.app, "credit_operations", `type="`+kind+`"`)
	if err != nil || operation == nil {
		t.Fatalf("%s operation = %v, %v", kind, operation, err)
	}
	return operation
}

// Hono: courseCreditBatchLifecycleService › expiry extension preserves original expiry and writes one audited atomic plan
func TestExtendBatchExpiryWritesAuditedPlan(t *testing.T) {
	f := lifecycleSetup(t, nil)
	result, err := extendBatchExpiry(f.app, f.extendCommand(nil), 0)
	if err != nil || result["replayed"] != false || result["quantityScope"] != 3.0 {
		t.Fatalf("result = %v, %v", result, err)
	}
	operation := f.operation(t, "extend")
	before := operation["beforeSummary"].(map[string]any)
	if operation["reason"] != "approved extension" || operation["outcome"] != "committed" ||
		before["effectiveExpiresAt"] != "2026-07-20 00:00:00.000Z" || operation["afterSummary"].(map[string]any)["quantityScope"] != 3.0 {
		t.Fatalf("operation = %v", operation)
	}
	batch := reload(t, f.app, f.batch)
	if iso(batch.GetDateTime("effectiveExpiresAt").Time()) != "2026-08-20T00:00:00.000Z" || batch.GetInt("version") != 4 ||
		iso(batch.GetDateTime("originalExpiresAt").Time()) != "2026-07-20T00:00:00.000Z" {
		t.Fatalf("batch = %v", batch.FieldsData())
	}
	change, _ := findFirst(f.app, "credit_expiry_changes", "")
	event, _ := findFirst(f.app, "credit_events", `eventType="EXTEND"`)
	if change["quantityScope"] != 3.0 || event["balanceSnapshot"].(map[string]any)["expiredQuantity"] != 5.0 ||
		f.count(t, "credit_version_claims", "") != 1 || f.count(t, "outbox_events", `topic="course-credit.batch-extended"`) != 1 {
		t.Fatalf("change = %v, event = %v", change, event)
	}
}

// Hono: courseCreditBatchLifecycleService › expired quantity restoration creates a compensation batch without rewriting source quantities
func TestRestoreExpiredCreatesCompensationBatch(t *testing.T) {
	f := lifecycleSetup(t, nil)
	put(t, f.app, "credit_batches", map[string]any{"compensationSourceBatchId": f.batch.Id, "originalQuantity": 1, "studentId": f.studentID})
	result, err := restoreExpiredQuantity(f.app, f.restoreCommand(nil), 0)
	if err != nil || result["quantity"] != 2.0 {
		t.Fatalf("result = %v, %v", result, err)
	}
	source := reload(t, f.app, f.batch)
	if source.GetInt("version") != 4 || source.GetInt("expiredQuantity") != 5 || source.GetInt("availableQuantity") != 2 {
		t.Fatalf("source = %v", source.FieldsData())
	}
	compensation, _ := get(f.app, "credit_batches", result["compensationBatchId"].(string))
	if compensation["compensationSourceBatchId"] != f.batch.Id || compensation["originalQuantity"] != 2.0 || compensation["availableQuantity"] != 2.0 ||
		compensation["expiredQuantity"] != 0.0 || compensation["expiryPolicy"] != "FIXED_DURATION" ||
		compensation["effectiveExpiresAt"] != "2026-08-16 10:00:00.000Z" {
		t.Fatalf("compensation = %v", compensation)
	}
	event, _ := findFirst(f.app, "credit_events", `eventType="ADJUST"`)
	if event["quantityDelta"] != 2.0 || event["bucketTo"] != "availableQuantity" {
		t.Fatalf("event = %v", event)
	}
}

// Hono: courseCreditBatchLifecycleService › batch lifecycle commands replay immutable results and reject conflicting key reuse
func TestBatchLifecycleReplayAndConflict(t *testing.T) {
	f := lifecycleSetup(t, nil)
	first, err := extendBatchExpiry(f.app, f.extendCommand(nil), 0)
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := extendBatchExpiry(f.app, f.extendCommand(nil), 0)
	if err != nil || replayed["replayed"] != true || replayed["operationId"] != first["operationId"] || f.count(t, "credit_operations", `type="extend"`) != 1 {
		t.Fatalf("replay = %v, %v", replayed, err)
	}
	_, err = extendBatchExpiry(f.app, f.extendCommand(map[string]any{"newExpiresAt": "2026-09-20T00:00:00Z"}), 0)
	failsWith(t, err, "IDEMPOTENCY_CONFLICT")
}

// Hono: courseCreditBatchLifecycleService › same-request storage race returns replay while unknown failures remain visible
func TestBatchLifecycleRaceReplayAndFailures(t *testing.T) {
	f := lifecycleSetup(t, nil)
	// A concurrent duplicate committed while this plan failed: the failure replays the stored result.
	hash := fingerprint(map[string]any{"batchId": f.batch.Id, "quantity": 2.0, "validityDurationDays": 30.0,
		"reason": "approved compensation", "approvedBy": "operator"})
	put(t, f.app, "credit_operations", map[string]any{"type": "adjust", "status": "committed", "operationNo": "stored", "idempotencyKey": "restoreExpiredQuantity:restore-key",
		"requestSnapshot": map[string]any{"requestHash": hash}, "resultSnapshot": map[string]any{"operationId": "stored"}})
	raced, err := commitLifecycle(f.app, []step{update("credit_batches", "missing", map[string]any{})}, "restoreExpiredQuantity:restore-key", hash,
		map[string]any{}, 0, func() (map[string]any, error) { return nil, errors.New("must not retry") })
	if err != nil || raced["replayed"] != true || raced["operationId"] != "stored" {
		t.Fatalf("raced = %v, %v", raced, err)
	}

	known := lifecycleSetup(t, nil)
	failFirst(known.app, "credit_operations", 2, Fail("PB_DOWN", "down", nil))
	_, err = extendBatchExpiry(known.app, known.extendCommand(nil), 0)
	failsWith(t, err, "PB_DOWN")
	unknown := lifecycleSetup(t, nil)
	failFirst(unknown.app, "credit_operations", 2, errors.New("failed"))
	_, err = restoreExpiredQuantity(unknown.app, unknown.restoreCommand(nil), 0)
	failsWith(t, err, "COURSE_CREDIT_BATCH_FAILED")
}

// Hono: courseCreditBatchLifecycleService › version conflict retries restoration and prevents cumulative over-compensation
func TestRestoreRetriesVersionConflictWithoutOverCompensation(t *testing.T) {
	f := lifecycleSetup(t, nil)
	attempts := failFirst(f.app, "credit_version_claims", 1, errors.New("version"))
	if _, err := restoreExpiredQuantity(f.app, f.restoreCommand(map[string]any{"quantity": 4.0}), 0); err != nil || *attempts != 2 {
		t.Fatalf("retry = %v, attempts %d", err, *attempts)
	}
	// The retry rereads the compensations, so only one of the remaining expired quantity is left.
	_, err := restoreExpiredQuantity(f.app, f.restoreCommand(map[string]any{"idempotencyKey": "restore-2"}), 0)
	failsWith(t, err, "COMPENSATION_EXCEEDS_EXPIRED")
	if f.count(t, "credit_batches", `compensationSourceBatchId="`+f.batch.Id+`"`) != 1 {
		t.Fatal("one compensation batch")
	}
}

// Hono: courseCreditBatchLifecycleService › batch lifecycle validation rejects unsafe extension and compensation requests
func TestBatchLifecycleValidation(t *testing.T) {
	f := lifecycleSetup(t, nil)
	for code, changes := range map[string]map[string]any{
		"BATCH_ID_REQUIRED":         {"batchId": ""},
		"AUDIT_REASON_REQUIRED":     {"reason": ""},
		"ACTOR_ID_REQUIRED":         {"actorId": ""},
		"IDEMPOTENCY_KEY_REQUIRED":  {"idempotencyKey": ""},
		"INVALID_DATE":              {"newExpiresAt": "bad"},
		"EXPIRY_MUST_BE_FUTURE":     {"newExpiresAt": iso(lifecycleNow)},
		"EXPIRY_EXTENSION_REQUIRED": {"newExpiresAt": "2026-07-19T00:00:00Z"},
	} {
		_, err := extendBatchExpiry(f.app, f.extendCommand(changes), 0)
		failsWith(t, err, code)
	}
	// A missing batch is PocketBase's not-found, as in Hono against a real repository.
	if _, err := extendBatchExpiry(f.app, f.extendCommand(map[string]any{"batchId": "missing"}), 0); err == nil {
		t.Fatal("missing batch must fail")
	}
	patch(t, f.app, "credit_batches", f.batch.Id, map[string]any{"effectiveExpiresAt": ""})
	_, err := extendBatchExpiry(f.app, f.extendCommand(nil), 0)
	failsWith(t, err, "BATCH_HAS_NO_EXPIRY")
	patch(t, f.app, "credit_batches", f.batch.Id, map[string]any{"effectiveExpiresAt": "2026-07-20 00:00:00.000Z", "availableQuantity": 0, "frozenQuantity": 0})
	_, err = extendBatchExpiry(f.app, f.extendCommand(nil), 0)
	failsWith(t, err, "NO_REMAINING_CREDIT")

	for code, changes := range map[string]map[string]any{
		"INVALID_CREDIT_QUANTITY": {"quantity": 0.0},
		"INVALID_DURATION_DAYS":   {"validityDurationDays": 0.0},
	} {
		_, err := restoreExpiredQuantity(f.app, f.restoreCommand(changes), 0)
		failsWith(t, err, code)
	}
	put(t, f.app, "credit_batches", map[string]any{"compensationSourceBatchId": f.batch.Id, "originalQuantity": 4, "studentId": f.studentID})
	_, err = restoreExpiredQuantity(f.app, f.restoreCommand(nil), 0)
	failsWith(t, err, "COMPENSATION_EXCEEDS_EXPIRED")
	patch(t, f.app, "credit_batches", f.batch.Id, map[string]any{"expiredQuantity": 0})
	_, err = restoreExpiredQuantity(f.app, f.restoreCommand(nil), 0)
	failsWith(t, err, "NO_EXPIRED_CREDIT")
}

// Hono: courseCreditBatchLifecycleService › batch lifecycle helpers preserve numeric and audit contracts
func TestBatchLifecycleHelpers(t *testing.T) {
	if quantity, _ := integerQuantity(nil, "quantity"); quantity != 0 {
		t.Fatal("integerQuantity default")
	}
	_, err := integerQuantity(1.5, "quantity")
	failsWith(t, err, "INVALID_CREDIT_QUANTITY")
	if remaining, _ := remainingQuantity(map[string]any{"availableQuantity": 2.0, "frozenQuantity": 1.0}); remaining != 3 {
		t.Fatalf("remaining = %v", remaining)
	}
	if positiveVersion(nil) != 1 || positiveVersion(2.0) != 2 {
		t.Fatal("positiveVersion")
	}
	if date, _ := validFutureDate("2026-08-01T00:00:00Z", lifecycleNow, "date"); date != "2026-08-01T00:00:00.000Z" {
		t.Fatalf("future = %s", date)
	}
	failsWith(t, batchCommand{}.validate(), "BATCH_ID_REQUIRED")
	for _, conflict := range []error{&storeError{status: 400}, &storeError{status: 409}, Fail("VERSION_CONFLICT", "", nil)} {
		if !isVersionConflict(conflict) {
			t.Fatalf("conflict %v", conflict)
		}
	}
	if isVersionConflict(errors.New("other")) {
		t.Fatal("plain errors are not version conflicts")
	}
	f := lifecycleSetup(t, map[string]any{"currency": "", "priority": nil})
	result, err := restoreExpiredQuantity(f.app, f.restoreCommand(nil), 0)
	if err != nil {
		t.Fatal(err)
	}
	if built, _ := get(f.app, "credit_batches", result["compensationBatchId"].(string)); built["currency"] != "CNY" || built["priority"] != 0.0 {
		t.Fatalf("compensation defaults = %v", built)
	}
}
