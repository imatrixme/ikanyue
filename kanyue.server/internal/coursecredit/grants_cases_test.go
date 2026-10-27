package coursecredit

import (
	"errors"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// Grant cases ported from Hono's courseCreditGrantService tests.

var grantNow = time.Date(2026, 7, 17, 10, 0, 0, 0, time.UTC)

type grantFixture struct {
	ledgerFixture
	order *core.Record
}

func grantLine(changes map[string]any) map[string]any {
	line := map[string]any{"quantity": 10, "activationMode": "FIRST_CHECK_IN", "activationDeadlineDays": 90, "validityDurationDays": 180,
		"expiryPolicy": "FIXED_DURATION", "listUnitValue": 300, "paidUnitCost": 280, "currency": "CNY"}
	for key, value := range changes {
		line[key] = value
	}
	return line
}

// grantSetup stores Hono's baseOrder: a paid package purchase of ten course credits at version 4.
func grantSetup(t *testing.T, changes map[string]any) grantFixture {
	t.Helper()
	f := ledgerSetup(t, true)
	fields := map[string]any{"orderNo": "O1", "studentId": f.studentID, "type": "package_purchase", "channel": "offline", "status": "paid",
		"currency": "CNY", "productSnapshot": map[string]any{"packageId": "p10"}, "idempotencyKey": "order", "version": 4,
		"grantSnapshot": map[string]any{"lines": []any{grantLine(map[string]any{"creditTypeId": f.creditTypeID})}}}
	for key, value := range changes {
		fields[key] = value
	}
	return grantFixture{f, put(t, f.app, "orders", fields)}
}

func (f grantFixture) grant(key string) (map[string]any, error) {
	return grantOrderCredits(f.app, f.order.Id, Actor{ID: "operator", IdempotencyKey: key}, grantNow)
}

func (f grantFixture) lines(changes map[string]any) map[string]any {
	return map[string]any{"lines": []any{grantLine(copyWith(changes, "creditTypeId", f.creditTypeID))}}
}

// Hono: courseCreditGrantService › Hono grant service builds one atomic SDK batch for a direct package
func TestGrantBuildsOneAtomicPlan(t *testing.T) {
	f := grantSetup(t, nil)
	result, err := f.grant("grant-key")
	if err != nil || result["replayed"] != false || len(result["batches"].([]any)) != 1 {
		t.Fatalf("result = %v, %v", result, err)
	}
	operation, _ := findFirst(f.app, "credit_operations", `type="grant"`)
	if operation["idempotencyKey"] != "grantOrderCredits:grant-key" || operation["status"] != "committed" || operation["reason"] != "order_grant" ||
		operation["outcome"] != "committed" || fmtJSON(operation["beforeSummary"]) != `{"orderId":"`+f.order.Id+`","status":"paid","version":4}` ||
		operation["afterSummary"].(map[string]any)["batchesCount"] != 1.0 {
		t.Fatalf("operation = %v", operation)
	}
	claim, _ := findFirst(f.app, "credit_version_claims", "")
	batch, _ := findFirst(f.app, "credit_batches", `studentId="`+f.studentID+`"`)
	event, _ := findFirst(f.app, "credit_events", `eventType="GRANT"`)
	if claim["entityType"] != "order" || claim["expectedVersion"] != 4.0 || batch["originalQuantity"] != 10.0 || batch["status"] != "unactivated" ||
		batch["expiryPolicy"] != "FIXED_DURATION" || batch["grantSnapshot"].(map[string]any)["paidUnitCost"] != 280.0 ||
		event["actorId"] != "operator" || event["balanceSnapshot"].(map[string]any)["availableQuantity"] != 10.0 {
		t.Fatalf("claim = %v, batch = %v, event = %v", claim, batch, event)
	}
	order := reload(t, f.app, f.order)
	if order.GetString("status") != "granted" || order.GetInt("version") != 5 || f.count(t, "outbox_events", `topic="course-credit.order-granted"`) != 1 {
		t.Fatalf("order = %v", order.FieldsData())
	}
}

func (f grantFixture) count(t *testing.T, collection, filter string) int {
	t.Helper()
	return f.ledgerFixture.count(t, collection, filter)
}

// Hono: courseCreditGrantService › Hono grant service supports universal recharge and immediate no-expiry activation
func TestGrantUniversalRechargeActivatesImmediately(t *testing.T) {
	f := grantSetup(t, map[string]any{"type": "universal_recharge"})
	universal := put(t, f.app, "credit_types", map[string]any{"code": "universal", "name": "通用点", "kind": "universal", "consumable": false, "status": "active"})
	patch(t, f.app, "orders", f.order.Id, map[string]any{"grantSnapshot": []any{map[string]any{"creditTypeId": universal.Id, "quantity": 3000,
		"activationMode": "GRANT_TIME", "expiryPolicy": "NO_EXPIRY", "listUnitValue": 1, "paidUnitCost": 0.9}}})
	result, err := f.grant("grant-key")
	if err != nil || result["batches"].([]any)[0].(map[string]any)["effectiveExpiresAt"] != nil {
		t.Fatalf("result = %v, %v", result, err)
	}
	batch, _ := findFirst(f.app, "credit_batches", `creditTypeId="`+universal.Id+`"`)
	if batch["status"] != "active" || batch["activatedAt"] != "2026-07-17 10:00:00.000Z" || batch["currency"] != "CNY" || batch["priority"] != 0.0 {
		t.Fatalf("batch = %v", batch)
	}
}

// Hono: courseCreditGrantService › Hono grant service replays stored results and rejects conflicting reuse
func TestGrantReplaysAndRejectsConflicts(t *testing.T) {
	f := grantSetup(t, nil)
	first, err := f.grant("grant-key")
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := f.grant("grant-key")
	if err != nil || replayed["replayed"] != true || replayed["operationId"] != first["operationId"] {
		t.Fatalf("replay = %v, %v", replayed, err)
	}
	_, err = grantOrderCredits(f.app, f.order.Id, Actor{ID: "operator", IdempotencyKey: "grant-key", TraceID: "other"}, grantNow)
	failsWith(t, err, "IDEMPOTENCY_CONFLICT")
}

// Hono: courseCreditGrantService › Hono grant service resolves a same-request race after Batch API conflict
func TestGrantResolvesSameRequestRace(t *testing.T) {
	f := grantSetup(t, nil)
	hash := fingerprint(map[string]any{"orderId": f.order.Id, "traceId": ""})
	put(t, f.app, "credit_operations", map[string]any{"type": "grant", "status": "committed", "operationNo": "raced",
		"idempotencyKey": "grantOrderCredits:grant-key", "requestSnapshot": map[string]any{"requestHash": hash},
		"resultSnapshot": map[string]any{"operationId": "raced-operation"}})
	result, err := commitOrReplay(f.app, []step{update("orders", "missing", map[string]any{})}, "grantOrderCredits:grant-key", hash,
		replayConflict, "COURSE_CREDIT_BATCH_FAILED", map[string]any{})
	if err != nil || result["replayed"] != true || result["operationId"] != "raced-operation" {
		t.Fatalf("raced = %v, %v", result, err)
	}
}

// Hono: courseCreditGrantService › duplicate payment delivery replays once and cannot grant the same order twice
func TestDuplicatePaymentGrantsOnce(t *testing.T) {
	f := grantSetup(t, nil)
	first, err := f.grant("payment:provider-event-1")
	if err != nil || first["replayed"] != false {
		t.Fatalf("first = %v, %v", first, err)
	}
	if replayed, err := f.grant("payment:provider-event-1"); err != nil || replayed["replayed"] != true {
		t.Fatalf("replay = %v, %v", replayed, err)
	}
	_, err = f.grant("payment:provider-event-1-duplicate")
	failsWith(t, err, "ORDER_NOT_PAID")
	if f.count(t, "credit_operations", `type="grant"`) != 1 || reload(t, f.app, f.order).GetString("status") != "granted" {
		t.Fatal("one grant")
	}
}

// Hono: courseCreditGrantService › cancelled orders cannot create any grant operation
func TestCancelledOrderCannotGrant(t *testing.T) {
	f := grantSetup(t, map[string]any{"status": "cancelled"})
	_, err := f.grant("grant-key")
	failsWith(t, err, "ORDER_NOT_PAID")
	if f.count(t, "credit_operations", "") != 0 {
		t.Fatal("no operation")
	}
}

// Hono: courseCreditGrantService › Hono grant service preserves non-idempotency storage failures
func TestGrantPreservesStorageFailures(t *testing.T) {
	known := grantSetup(t, nil)
	failFirst(known.app, "credit_operations", 1, Fail("PB_DOWN", "storage down", nil))
	_, err := known.grant("grant-key")
	failsWith(t, err, "PB_DOWN")
	unknown := grantSetup(t, nil)
	failFirst(unknown.app, "credit_operations", 1, errors.New("batch failed"))
	_, err = unknown.grant("grant-key")
	failsWith(t, err, "COURSE_CREDIT_BATCH_FAILED")
}

// Hono: courseCreditGrantService › Hono grant service rejects invalid order, snapshot, credit, activation, expiry, and cost inputs
func TestGrantRejectsInvalidInputs(t *testing.T) {
	f := grantSetup(t, nil)
	_, err := grantOrderCredits(f.app, "", Actor{IdempotencyKey: "k"}, grantNow)
	failsWith(t, err, "ORDER_ID_REQUIRED")
	_, err = f.grant("")
	failsWith(t, err, "IDEMPOTENCY_KEY_REQUIRED")
	cases := []struct {
		order func(f grantFixture) map[string]any
		code  string
	}{
		{func(grantFixture) map[string]any { return map[string]any{"status": "cancelled"} }, "ORDER_NOT_PAID"},
		{func(grantFixture) map[string]any {
			return map[string]any{"grantSnapshot": map[string]any{"lines": []any{}}}
		}, "ORDER_GRANT_SNAPSHOT_INVALID"},
		{func(f grantFixture) map[string]any {
			return map[string]any{"grantSnapshot": map[string]any{"lines": []any{map[string]any{"creditTypeId": f.creditTypeID}}}}
		}, "ORDER_GRANT_SNAPSHOT_INVALID"},
		{func(f grantFixture) map[string]any {
			patch(t, f.app, "credit_types", f.creditTypeID, map[string]any{"kind": "universal", "consumable": true})
			return nil
		}, "CREDIT_TYPE_INVALID"},
		{func(grantFixture) map[string]any { return map[string]any{"type": "offline"} }, "ORDER_TYPE_INVALID"},
		{func(grantFixture) map[string]any { return map[string]any{"type": "universal_recharge"} }, "ORDER_CREDIT_TYPE_MISMATCH"},
		{func(f grantFixture) map[string]any { return f.snapshot(map[string]any{"activationMode": "BAD"}) }, "INVALID_ACTIVATION_MODE"},
		{func(f grantFixture) map[string]any { return f.snapshot(map[string]any{"expiryPolicy": "BAD"}) }, "INVALID_EXPIRY_POLICY"},
		{func(f grantFixture) map[string]any { return f.snapshot(map[string]any{"activationDeadlineDays": -1}) }, "ACTIVATION_DEADLINE_REQUIRED"},
		{func(f grantFixture) map[string]any { return f.snapshot(map[string]any{"validityDurationDays": -1}) }, "INVALID_DURATION_DAYS"},
		{func(f grantFixture) map[string]any { return f.snapshot(map[string]any{"listUnitValue": "bad"}) }, "ORDER_GRANT_SNAPSHOT_INVALID"},
		{func(f grantFixture) map[string]any {
			return f.snapshot(map[string]any{"expiryPolicy": "TERM_END", "termEnd": "bad"})
		}, "INVALID_DATE"},
	}
	for i, c := range cases {
		order := grantSetup(t, nil)
		if changes := c.order(order); changes != nil {
			patch(t, order.app, "orders", order.order.Id, changes)
		}
		if _, err := order.grant("grant-key"); errorCode(err) != c.code {
			t.Fatalf("case %d = %v, want %s", i, err, c.code)
		}
	}
	// A missing credit type is PocketBase's not-found, as in Hono against a real repository.
	missing := grantSetup(t, nil)
	patch(t, missing.app, "orders", missing.order.Id, map[string]any{"grantSnapshot": map[string]any{"lines": []any{grantLine(map[string]any{"creditTypeId": "missing"})}}})
	if _, err := missing.grant("grant-key"); err == nil {
		t.Fatal("missing credit type must fail")
	}
}

func (f grantFixture) snapshot(changes map[string]any) map[string]any {
	return map[string]any{"grantSnapshot": f.lines(changes)}
}

// Hono: courseCreditGrantService › grant helpers preserve policy defaults, term expiry, balance, and legacy versions
func TestGrantHelpers(t *testing.T) {
	if defaults, _, _ := normalizeGrantSnapshot([]any{map[string]any{"creditTypeId": "x", "quantity": 1.0}}); len(defaults) != 0 {
		t.Fatalf("defaults = %v", defaults)
	}
	if positiveVersion(nil) != 1 || positiveVersion(2.0) != 2 {
		t.Fatal("positiveVersion")
	}
	line := map[string]any{"creditTypeId": "course", "quantity": 10.0, "activationMode": "GRANT_TIME", "expiryPolicy": "TERM_END",
		"termEnd": "2026-12-31T00:00:00Z", "listUnitValue": 300.0, "paidUnitCost": 280.0}
	built, err := buildGrantBatch("2026-07-17T10:00:00.000Z", map[string]any{"kind": "course", "consumable": true, "courseSpecId": "spec"}, line,
		"operation", map[string]any{"id": "order", "studentId": "student", "type": "package_purchase", "currency": "CNY"},
		map[string]any{"validFrom": "2026-07-01T00:00:00Z", "priority": 2.0}, "operator")
	if err != nil || built.batch["effectiveExpiresAt"] != "2026-12-31T00:00:00.000Z" || built.batch["validFrom"] != "2026-07-01T00:00:00Z" ||
		built.batch["priority"] != 2.0 || fmtJSON(balanceSnapshot(built.batch)) != fmtJSON(built.event["balanceSnapshot"]) {
		t.Fatalf("built = %v, %v", built, err)
	}
}
