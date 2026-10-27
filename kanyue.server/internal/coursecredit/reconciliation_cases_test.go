package coursecredit

import (
	"errors"
	"fmt"
	"reflect"
	"slices"
	"sort"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
)

// Reconciliation cases ported from Hono's courseCreditReconciliation tests: the pure
// replay helpers over maps, and runReconciliation over stored PocketBase records.

var reconciliationNow = time.Date(2026, 8, 22, 10, 0, 0, 0, time.UTC)

func reconciliationBatch(changes map[string]any) map[string]any {
	return with2(map[string]any{"id": "batch", "originalQuantity": 2.0, "availableQuantity": 0.0, "frozenQuantity": 0.0,
		"consumedQuantity": 2.0, "expiredQuantity": 0.0, "reversedQuantity": 0.0}, changes)
}

func reconciliationEvent(id, eventType string, delta float64, from, to string, order int, changes map[string]any) map[string]any {
	return with2(map[string]any{"id": id, "batchId": "batch", "eventType": eventType, "quantityDelta": delta,
		"bucketFrom": from, "bucketTo": to, "businessTime": "2026-08-20T10:00:00.000Z",
		"created": fmt.Sprintf("2026-08-20T10:00:00.%03dZ", order)}, changes)
}

func reconciliationAllocation(status string, quantity any, changes map[string]any) map[string]any {
	return with2(map[string]any{"id": "allocation-" + status, "batchId": "batch", "status": status, "quantity": quantity}, changes)
}

func differenceCodes(differences []difference) []string {
	codes := []string{}
	for _, item := range differences {
		codes = append(codes, item.code)
	}
	return codes
}

// storedBatch saves a balanced batch with a two-unit grant and conversion.
func (f ledgerFixture) storedBatch(t *testing.T, changes map[string]any) string {
	t.Helper()
	batch := put(t, f.app, "credit_batches", with2(map[string]any{"studentId": f.studentID, "creditTypeId": f.creditTypeID,
		"originalQuantity": 2, "consumedQuantity": 2, "status": "active", "version": 1}, changes))
	for _, event := range []map[string]any{
		{"eventType": "GRANT", "quantityDelta": 2, "bucketTo": "availableQuantity"},
		{"eventType": "CONVERT_OUT", "quantityDelta": -2, "bucketFrom": "availableQuantity", "bucketTo": "consumedQuantity"},
	} {
		put(t, f.app, "credit_events", with2(map[string]any{"studentId": f.studentID, "creditTypeId": f.creditTypeID,
			"batchId": batch.Id, "businessTime": "2026-08-20 10:00:00.000Z"}, event))
	}
	return batch.Id
}

func reconcile(f ledgerFixture, scope, since any) (map[string]any, error) {
	return runReconciliation(f.app, scope, since, func() time.Time { return reconciliationNow })
}

func (f ledgerFixture) ledgerUnchanged(t *testing.T, id string, want map[string]any) {
	t.Helper()
	batch := f.first(t, "credit_batches", `id="`+id+`"`)
	for key, value := range want {
		if batch[key] != value {
			t.Fatalf("batch %s = %v, want %v", key, batch[key], value)
		}
	}
}

// Hono: courseCreditReconciliation › event replay reconstructs buckets independently from stored balance snapshots
func TestReconciliationReplayIgnoresStoredSnapshot(t *testing.T) {
	differences := reconstructBatch(reconciliationBatch(nil), []map[string]any{
		reconciliationEvent("consume", "CONSUME", -1, "frozenQuantity", "consumedQuantity", 3, nil),
		reconciliationEvent("grant", "GRANT", 2, "", "availableQuantity", 1, nil),
		reconciliationEvent("freeze", "FREEZE", -1, "availableQuantity", "frozenQuantity", 2, nil),
		reconciliationEvent("convert", "CONVERT_OUT", -1, "availableQuantity", "consumedQuantity", 4, nil),
	}, []map[string]any{reconciliationAllocation("consumed", 1.0, nil)})
	if len(differences) != 0 {
		t.Fatalf("differences = %+v", differences)
	}
	if bucketTotal(func(bucket string) any { return reconciliationBatch(nil)[bucket] }) != 2.0 {
		t.Fatal("bucket total")
	}
}

// Hono: courseCreditReconciliation › reconciliation reports snapshot, conservation, event, and allocation drift without mutation
func TestReconciliationReportsDrift(t *testing.T) {
	stored := reconciliationBatch(map[string]any{"availableQuantity": 2.0, "consumedQuantity": 2.0, "originalQuantity": 3.0})
	differences := reconstructBatch(stored, []map[string]any{
		reconciliationEvent("grant", "GRANT", 2, "", "availableQuantity", 1, nil),
		reconciliationEvent("bad-bucket", "FREEZE", -1, "unknown", "frozenQuantity", 2, nil),
		reconciliationEvent("wrong-batch", "GRANT", 1, "", "availableQuantity", 3, map[string]any{"batchId": "other"}),
		reconciliationEvent("duplicate", "FREEZE", -1, "availableQuantity", "frozenQuantity", 4, nil),
		reconciliationEvent("duplicate", "FREEZE", -1, "availableQuantity", "frozenQuantity", 5, nil),
		reconciliationEvent("underflow", "CONSUME", -2, "frozenQuantity", "consumedQuantity", 6, nil),
		reconciliationEvent("missing-movement", "ADJUST", 1, "", "", 7, nil),
		reconciliationEvent("", "ADJUST", 1, "", "availableQuantity", 8, nil),
		reconciliationEvent("bad-quantity", "ADJUST", 0.5, "", "availableQuantity", 9, nil),
	}, []map[string]any{
		reconciliationAllocation("reserved", 1.0, nil),
		reconciliationAllocation("unknown", 1.0, nil),
		reconciliationAllocation("reserved", 1.0, map[string]any{"batchId": "other"}),
	})
	codes := differenceCodes(differences)
	for _, code := range []string{"BUCKET_MISMATCH", "SNAPSHOT_CONSERVATION_MISMATCH", "EVENT_BUCKET_INVALID",
		"EVENT_BATCH_MISMATCH", "DUPLICATE_EVENT", "EVENT_SOURCE_UNDERFLOW", "EVENT_MOVEMENT_MISSING",
		"EVENT_ID_INVALID", "EVENT_QUANTITY_INVALID", "ALLOCATION_INVALID", "ALLOCATION_BATCH_MISMATCH",
		"RESERVED_ALLOCATION_MISMATCH"} {
		if !slices.Contains(codes, code) {
			t.Fatalf("missing %s in %v", code, codes)
		}
	}
	if stored["availableQuantity"] != 2.0 {
		t.Fatal("reconstruction mutated the stored batch")
	}
}

// Hono: courseCreditReconciliation › full reconciliation persists a passed run and never updates ledger snapshots
func TestReconciliationFullRunPasses(t *testing.T) {
	f := ledgerSetup(t, true)
	id := f.storedBatch(t, nil)
	result, err := reconcile(f, "full", nil)
	if err != nil {
		t.Fatal(err)
	}
	runID := result["runId"]
	delete(result, "runId")
	if runID == "" || !reflect.DeepEqual(result, map[string]any{"batchCount": 1, "differenceCount": 0,
		"scope": "full", "since": "", "status": "passed"}) {
		t.Fatalf("result = %v", result)
	}
	run := f.first(t, "reconciliation_runs", `id="`+runID.(string)+`"`)
	if run["status"] != "passed" || run["startedAt"] != "2026-08-22 10:00:00.000Z" || f.count(t, "reconciliation_exceptions", "") != 0 {
		t.Fatalf("run = %v", run)
	}
	f.ledgerUnchanged(t, id, map[string]any{"consumedQuantity": 2.0, "version": 1.0})
}

// Hono: courseCreditReconciliation › failed reconciliation appends review exceptions without rewriting the batch
func TestReconciliationFailedRunAppendsExceptions(t *testing.T) {
	f := ledgerSetup(t, true)
	id := f.storedBatch(t, map[string]any{"availableQuantity": 2, "consumedQuantity": 0})
	result, err := reconcile(f, "full", nil)
	if err != nil || result["status"] != "failed" || result["differenceCount"] != 2 {
		t.Fatalf("result = %v, %v", result, err)
	}
	if f.count(t, "reconciliation_exceptions", `status="open" && batchId="`+id+`" && runId="`+result["runId"].(string)+`"`) != 2 {
		t.Fatal("exceptions")
	}
	exception := f.first(t, "reconciliation_exceptions", `code="BUCKET_MISMATCH" && field="availableQuantity"`)
	if exception["expectedValue"] != 0.0 || exception["actualValue"] != 2.0 {
		t.Fatalf("exception = %v", exception)
	}
	f.ledgerUnchanged(t, id, map[string]any{"availableQuantity": 2.0, "consumedQuantity": 0.0, "version": 1.0})
}

// Hono: courseCreditReconciliation › incremental reconciliation unions changed batches with batches referenced by new events
func TestReconciliationIncrementalUnion(t *testing.T) {
	f := ledgerSetup(t, true)
	changed := f.storedBatch(t, nil)
	referenced := f.storedBatch(t, nil)
	untouched := f.storedBatch(t, nil)
	since := time.Now().UTC().Add(-time.Hour)
	stale := since.Add(-24 * time.Hour).Format("2006-01-02 15:04:05.000Z")
	for _, id := range []string{referenced, untouched} {
		if _, err := f.app.DB().NewQuery("UPDATE credit_batches SET updated={:at} WHERE id={:id}").
			Bind(dbx.Params{"at": stale, "id": id}).Execute(); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.app.DB().NewQuery("UPDATE credit_events SET created={:at} WHERE batchId={:id}").
		Bind(dbx.Params{"at": stale, "id": untouched}).Execute(); err != nil {
		t.Fatal(err)
	}
	if _, err := f.app.DB().NewQuery("UPDATE credit_events SET created={:at} WHERE batchId={:id}").
		Bind(dbx.Params{"at": stale, "id": changed}).Execute(); err != nil {
		t.Fatal(err)
	}

	local := since.In(time.FixedZone("CST", 8*3600)).Format("2006-01-02T15:04:05.000-07:00")
	result, err := reconcile(f, "incremental", local)
	if err != nil || result["batchCount"] != 2 || result["since"] != since.Format("2006-01-02T15:04:05.000Z") {
		t.Fatalf("result = %v, %v", result, err)
	}
	report := f.first(t, "reconciliation_runs", `id="`+result["runId"].(string)+`"`)["report"].(map[string]any)
	if report["batchCount"] != 2.0 {
		t.Fatalf("report = %v", report)
	}
	batches, err := reconciliationBatches(f.app, false, result["since"].(string))
	if err != nil {
		t.Fatal(err)
	}
	got := []string{}
	for _, batch := range batches {
		got = append(got, batch["id"].(string))
	}
	want := []string{changed, referenced}
	sort.Strings(want)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("batches = %v, want %v", got, want)
	}
}

// Hono: courseCreditReconciliation › reconciliation validates scope, incremental time, and storage failures
func TestReconciliationValidation(t *testing.T) {
	f := ledgerSetup(t, true)
	_, err := reconcile(f, "student", nil)
	failsWith(t, err, "RECONCILIATION_SCOPE_INVALID")
	_, err = reconcile(f, "incremental", nil)
	failsWith(t, err, "RECONCILIATION_SINCE_REQUIRED")
	_, err = reconcile(f, "incremental", "not-a-time")
	failsWith(t, err, "RECONCILIATION_SINCE_REQUIRED")

	f.storedBatch(t, nil)
	storage := errors.New("storage")
	failFirst(f.app, "reconciliation_runs", 1, storage)
	if _, err := reconcile(f, "full", nil); !errors.Is(err, storage) {
		t.Fatalf("error = %v", err)
	}
	if f.count(t, "reconciliation_runs", "") != 0 || f.count(t, "reconciliation_exceptions", "") != 0 {
		t.Fatal("a failed run left records behind")
	}
	result, err := reconcile(f, "incremental", "2026-08-20T00:00:00Z")
	if err != nil || result["since"] != "2026-08-20T00:00:00.000Z" {
		t.Fatalf("since = %v, %v", result, err)
	}
}

// Hono: courseCreditReconciliation › reconciliation helpers cover ordering, malformed snapshots, and exception projection
func TestReconciliationHelpers(t *testing.T) {
	events := []map[string]any{
		reconciliationEvent("freeze", "FREEZE", -1, "availableQuantity", "frozenQuantity", 1, nil),
		reconciliationEvent("grant", "GRANT", 1, "", "availableQuantity", 1, nil),
	}
	slices.SortStableFunc(events, compareEvents)
	if events[0]["eventType"] != "GRANT" || events[1]["eventType"] != "FREEZE" {
		t.Fatalf("order = %v", events)
	}
	unknown := []map[string]any{{"id": "z", "batchId": "batch", "eventType": "UNKNOWN"}, {"id": "a", "batchId": "batch", "eventType": "UNKNOWN"}}
	slices.SortStableFunc(unknown, compareEvents)
	if unknown[0]["id"] != "a" {
		t.Fatalf("unknown order = %v", unknown)
	}

	codes := differenceCodes(reconstructBatch(reconciliationBatch(map[string]any{"consumedQuantity": 0.0, "originalQuantity": 0.0}), nil,
		[]map[string]any{reconciliationAllocation("reserved", "bad", nil), reconciliationAllocation("unknown", 1.0, nil)}))
	if !reflect.DeepEqual(codes, []string{"ALLOCATION_INVALID", "ALLOCATION_INVALID"}) {
		t.Fatalf("allocations = %v", codes)
	}
	codes = differenceCodes(reconstructBatch(reconciliationBatch(map[string]any{"consumedQuantity": 0.0, "originalQuantity": 0.0}),
		[]map[string]any{{"batchId": "batch"}, {"id": 1.0, "batchId": "batch"},
			{"id": "activate", "batchId": "batch", "eventType": "ACTIVATE"}}, nil))
	if !reflect.DeepEqual(codes, []string{"EVENT_ID_INVALID", "EVENT_ID_INVALID"}) {
		t.Fatalf("replay = %v", codes)
	}

	// Exception rows keep only finite expected/actual values.
	if finite("text") || !finite(2.0) || finite(nil) {
		t.Fatal("finite")
	}
	malformed := differenceCodes(reconstructBatch(reconciliationBatch(map[string]any{"originalQuantity": "bad", "availableQuantity": "bad"}), nil, nil))
	if !slices.Contains(malformed, "BATCH_ORIGINAL_QUANTITY_INVALID") || !slices.Contains(malformed, "BATCH_BUCKET_INVALID") {
		t.Fatalf("malformed = %v", malformed)
	}
	invalidActual := differenceCodes(reconstructBatch(reconciliationBatch(map[string]any{"availableQuantity": "bad"}), []map[string]any{
		reconciliationEvent("grant", "GRANT", 2, "", "availableQuantity", 1, nil),
		reconciliationEvent("consume", "CONVERT_OUT", -2, "availableQuantity", "consumedQuantity", 2, nil),
	}, nil))
	if !slices.Contains(invalidActual, "BATCH_BUCKET_INVALID") {
		t.Fatalf("invalid actual = %v", invalidActual)
	}
	if bucketTotal(func(string) any { return nil }) != nil {
		t.Fatal("empty bucket total")
	}
}
