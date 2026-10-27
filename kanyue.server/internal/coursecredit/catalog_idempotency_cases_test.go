package coursecredit

import (
	"regexp"
	"testing"
	"time"

	"kanyue.server/internal/ids"
)

// Catalog/idempotency cases ported from Hono's courseCreditCatalogIdempotency tests.

// Hono: courseCreditCatalogIdempotency › stable JSON and price validation are deterministic
func TestStableJSONAndPriceValidation(t *testing.T) {
	left := stableJSON(map[string]any{"b": 2.0, "a": []any{1.0, map[string]any{"d": 4.0, "c": 3.0}}})
	right := stableJSON(map[string]any{"a": []any{1.0, map[string]any{"c": 3.0, "d": 4.0}}, "b": 2.0})
	if left != right || left != `{"a":[1,{"c":3,"d":4}],"b":2}` {
		t.Fatalf("stableJSON = %s / %s", left, right)
	}
	price := map[string]any{"packageId": "p", "currency": "CNY", "listAmount": 3000.0, "saleAmount": 2800.0,
		"validFrom": "2026-07-01T00:00:00Z", "version": 1.0, "status": "active"}
	if err := validatePriceVersion(price); err != nil {
		t.Fatalf("valid price = %v", err)
	}
	failsWith(t, validatePriceVersion(copyWith(price, "currency", "cny")), "PRICE_CURRENCY_INVALID")
	failsWith(t, validatePriceVersion(copyWith(price, "listAmount", -1.0)), "PRICE_LIST_AMOUNT_INVALID")
	failsWith(t, validatePriceVersion(copyWith(price, "version", 0.0)), "PRICE_VERSION_INVALID")
}

// Hono: courseCreditCatalogIdempotency › idempotency keys execute once and replay original immutable results
func TestIdempotencyKeysReplayImmutableResults(t *testing.T) {
	if key, err := scopedIdempotencyKey("reserve", " abc "); err != nil || key != "reserve:abc" {
		t.Fatalf("key = %q, %v", key, err)
	}
	_, err := scopedIdempotencyKey("reserve", "")
	failsWith(t, err, "IDEMPOTENCY_KEY_REQUIRED")

	f := ledgerSetup(t, true)
	if fresh, err := replay(f.app, "reserve:abc", "hash", replayConflict); err != nil || fresh != nil {
		t.Fatalf("fresh = %v, %v", fresh, err)
	}
	put(t, f.app, "credit_operations", map[string]any{"type": "reserve", "status": "committed", "operationNo": "op",
		"idempotencyKey": "reserve:abc", "requestSnapshot": map[string]any{"requestHash": "hash"},
		"resultSnapshot": map[string]any{"quantity": 10.0}})
	replayed, err := replay(f.app, "reserve:abc", "hash", replayConflict)
	if err != nil || replayed["replayed"] != true || replayed["quantity"] != 10.0 {
		t.Fatalf("replayed = %v, %v", replayed, err)
	}
	// The replay is a copy: mutating it leaves the stored snapshot intact.
	replayed["quantity"] = 0.0
	if again, _ := replay(f.app, "reserve:abc", "hash", replayConflict); again["quantity"] != 10.0 {
		t.Fatalf("stored snapshot mutated: %v", again)
	}
	_, err = replay(f.app, "reserve:abc", "different", replayConflict)
	failsWith(t, err, "IDEMPOTENCY_CONFLICT")
}

// Hono: courseCreditCatalogIdempotency › course-credit identifiers are PocketBase-compatible and operation numbers are traceable
func TestRecordIDsAndOperationNumbers(t *testing.T) {
	if id := ids.Record(); !regexp.MustCompile(`^[a-f0-9]{15}$`).MatchString(id) {
		t.Fatalf("record id = %q", id)
	}
	at := time.Date(2026, 7, 17, 10, 0, 0, 0, time.UTC)
	if no := operationNo("reserve", at, "record"); no != "reserve-1784282400000-record" {
		t.Fatalf("operationNo = %q", no)
	}
}
