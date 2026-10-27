package coursecredit

import (
	"math"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/records"
)

// Hono's CourseCreditReconciliationService: replay each batch's events and
// compare the expected buckets with the stored snapshot and allocations.

var eventOrder = map[string]int{
	"GRANT": 0, "CONVERT_IN": 0, "ADJUST": 0, "ACTIVATE": 1, "EXTEND": 1,
	"FREEZE": 2, "CONVERT_OUT": 2, "CONSUME": 3, "RELEASE": 3, "EXPIRE": 3, "REVERSE": 4,
}

type difference struct {
	code, field      string
	expected, actual any
	batchID          string
}

func runReconciliation(app core.App, scope, since any, clock func() time.Time) (map[string]any, error) {
	if scope != "full" && scope != "incremental" {
		return nil, Fail("RECONCILIATION_SCOPE_INVALID", "Reconciliation scope must be full or incremental", nil)
	}
	sinceISO := ""
	if scope == "incremental" {
		ms, ok := millis(or(since, ""))
		if !ok {
			return nil, Fail("RECONCILIATION_SINCE_REQUIRED", "Incremental reconciliation requires a valid since timestamp", nil)
		}
		sinceISO = fromMillis(ms)
	}
	startedAt := iso(clock())
	batches, err := reconciliationBatches(app, scope == "full", sinceISO)
	if err != nil {
		return nil, err
	}
	differences := []difference{}
	for _, batch := range batches {
		batchID := records.EscapeFilter(jsx.String(batch["id"]))
		events, err := list(app, "credit_events", `batchId="`+batchID+`"`, "businessTime,created,id")
		if err != nil {
			return nil, err
		}
		allocations, err := list(app, "session_credit_allocations", `batchId="`+batchID+`"`, "created,id")
		if err != nil {
			return nil, err
		}
		for _, item := range reconstructBatch(batch, events, allocations) {
			item.batchID = jsx.String(batch["id"])
			differences = append(differences, item)
		}
	}

	runID := ids.Record()
	finishedAt := iso(clock())
	status := "passed"
	if len(differences) > 0 {
		status = "failed"
	}
	differenceBatchIDs := []any{}
	for _, item := range differences {
		if !slices.Contains(differenceBatchIDs, any(item.batchID)) {
			differenceBatchIDs = append(differenceBatchIDs, item.batchID)
		}
	}
	plan := []step{create("reconciliation_runs", map[string]any{
		"id": runID, "scope": scope, "status": status, "startedAt": startedAt, "finishedAt": finishedAt,
		"differenceCount": len(differences),
		"report":          map[string]any{"batchCount": len(batches), "differenceBatchIds": differenceBatchIDs, "since": sinceISO},
	})}
	for _, item := range differences {
		exception := map[string]any{
			"id": ids.Record(), "runId": runID, "batchId": item.batchID, "code": item.code, "field": item.field,
			"details": map[string]any{"actual": item.actual, "expected": item.expected},
			"status":  "open", "detectedAt": finishedAt,
		}
		if finite(item.expected) {
			exception["expectedValue"] = item.expected
		}
		if finite(item.actual) {
			exception["actualValue"] = item.actual
		}
		plan = append(plan, create("reconciliation_exceptions", exception))
	}
	if err := send(app, plan); err != nil {
		return nil, err
	}
	return map[string]any{
		"batchCount": len(batches), "differenceCount": len(differences), "runId": runID,
		"scope": scope, "since": sinceISO, "status": status,
	}, nil
}

// finite is Number.isFinite without coercion.
func finite(value any) bool {
	number, ok := value.(float64)
	return ok && !math.IsNaN(number) && !math.IsInf(number, 0)
}

func reconciliationBatches(app core.App, full bool, since string) ([]map[string]any, error) {
	if full {
		return list(app, "credit_batches", "", "id")
	}
	literal := records.EscapeFilter(filterTime(since))
	batches, err := list(app, "credit_batches", `updated>="`+literal+`"`, "id")
	if err != nil {
		return nil, err
	}
	events, err := list(app, "credit_events", `created>="`+literal+`"`, "batchId,id")
	if err != nil {
		return nil, err
	}
	known := map[string]bool{}
	for _, batch := range batches {
		known[jsx.String(batch["id"])] = true
	}
	for _, event := range events {
		id := relationID(event["batchId"])
		if id == "" || known[id] {
			continue
		}
		batch, err := get(app, "credit_batches", id)
		if err != nil {
			return nil, err
		}
		known[id] = true
		batches = append(batches, batch)
	}
	sort.SliceStable(batches, func(i, j int) bool {
		return jsx.String(batches[i]["id"]) < jsx.String(batches[j]["id"])
	})
	return batches, nil
}

// reconstructBatch is Hono's reconstructBatch; it returns the differences only.
func reconstructBatch(batch map[string]any, events, allocations []map[string]any) []difference {
	batchID := jsx.String(batch["id"])
	differences := []difference{}
	add := func(code, field string, expected, actual any) {
		differences = append(differences, difference{code: code, field: field, expected: expected, actual: actual})
	}
	expected := map[string]float64{}
	for _, bucket := range bucketNames {
		expected[bucket] = 0
	}
	ordered := slices.Clone(events)
	sort.SliceStable(ordered, func(i, j int) bool { return compareEvents(ordered[i], ordered[j]) < 0 })
	seen := map[string]bool{}
	for _, event := range ordered {
		id, ok := event["id"].(string)
		if !ok || id == "" {
			add("EVENT_ID_INVALID", "eventId", nil, event["id"])
			continue
		}
		if seen[id] {
			add("DUPLICATE_EVENT", "eventId", id, id)
			continue
		}
		seen[id] = true
		if event["batchId"] != batchID {
			add("EVENT_BATCH_MISMATCH", "batchId", batchID, event["batchId"])
			continue
		}
		quantity, ok := wholeQuantity(math.Abs(jsx.Number(or(event["quantityDelta"], 0.0))))
		if !ok {
			add("EVENT_QUANTITY_INVALID", "quantityDelta", nil, event["quantityDelta"])
			continue
		}
		from, _ := or(event["bucketFrom"], "").(string)
		to, _ := or(event["bucketTo"], "").(string)
		if !validBucket(from) || !validBucket(to) {
			buckets := make([]any, len(bucketNames))
			for i, name := range bucketNames {
				buckets[i] = name
			}
			add("EVENT_BUCKET_INVALID", "bucket", buckets, map[string]any{"from": from, "to": to})
			continue
		}
		if quantity > 0 && from == "" && to == "" {
			add("EVENT_MOVEMENT_MISSING", "bucket", "source or target", map[string]any{"from": from, "to": to})
			continue
		}
		if from != "" {
			expected[from] -= quantity
			if expected[from] < 0 {
				add("EVENT_SOURCE_UNDERFLOW", from, ">="+jsx.String(quantity), expected[from]+quantity)
			}
		}
		if to != "" {
			expected[to] += quantity
		}
	}

	actual := map[string]any{}
	for _, bucket := range bucketNames {
		value, ok := wholeQuantity(or(batch[bucket], 0.0))
		if !ok {
			add("BATCH_BUCKET_INVALID", bucket, nil, batch[bucket])
			actual[bucket] = nil
			continue
		}
		actual[bucket] = value
	}
	for _, bucket := range bucketNames {
		if actual[bucket] != nil && actual[bucket] != expected[bucket] {
			add("BUCKET_MISMATCH", bucket, expected[bucket], actual[bucket])
		}
	}

	if original, ok := wholeQuantity(batch["originalQuantity"]); !ok {
		add("BATCH_ORIGINAL_QUANTITY_INVALID", "originalQuantity", nil, batch["originalQuantity"])
	} else {
		expectedTotal := bucketTotal(func(bucket string) any { return expected[bucket] })
		actualTotal := bucketTotal(func(bucket string) any { return actual[bucket] })
		if expectedTotal != original {
			add("EXPECTED_CONSERVATION_MISMATCH", "originalQuantity", original, expectedTotal)
		}
		if actualTotal != nil && actualTotal != original {
			add("SNAPSHOT_CONSERVATION_MISMATCH", "originalQuantity", original, actualTotal)
		}
	}

	summary := map[string]float64{"consumed": 0, "expired": 0, "released": 0, "reserved": 0, "reversed": 0}
	for _, allocation := range allocations {
		if allocation["batchId"] != batchID {
			add("ALLOCATION_BATCH_MISMATCH", "batchId", batchID, allocation["batchId"])
			continue
		}
		quantity, ok := wholeQuantity(allocation["quantity"])
		status, _ := allocation["status"].(string)
		if _, known := summary[status]; !ok || !known {
			add("ALLOCATION_INVALID", "allocation", nil, map[string]any{
				"id": allocation["id"], "quantity": allocation["quantity"], "status": allocation["status"],
			})
			continue
		}
		summary[status] += quantity
	}
	if summary["reserved"] != expected["frozenQuantity"] {
		add("RESERVED_ALLOCATION_MISMATCH", "frozenQuantity", expected["frozenQuantity"], summary["reserved"])
	}
	return differences
}

func compareEvents(left, right map[string]any) int {
	if diff := eventTime(left, "businessTime") - eventTime(right, "businessTime"); diff != 0 {
		return sign(diff)
	}
	if diff := eventTime(left, "created") - eventTime(right, "created"); diff != 0 {
		return sign(diff)
	}
	if diff := orderOf(left) - orderOf(right); diff != 0 {
		return diff
	}
	return strings.Compare(jsx.String(left["id"]), jsx.String(right["id"]))
}

func orderOf(event map[string]any) int {
	eventType, _ := event["eventType"].(string)
	if order, ok := eventOrder[eventType]; ok {
		return order
	}
	return 99
}

func sign(value int64) int {
	if value < 0 {
		return -1
	}
	return 1
}

func eventTime(event map[string]any, field string) int64 {
	ms, ok := millis(or(event[field], ""))
	if !ok {
		return 0
	}
	return ms
}

func validBucket(bucket string) bool {
	return bucket == "" || slices.Contains(bucketNames, bucket)
}

// wholeQuantity is Number(value) when it is a non-negative integer.
func wholeQuantity(value any) (float64, bool) {
	number := jsx.Number(value)
	if !jsx.IsInteger(value) || number < 0 {
		return 0, false
	}
	return number, true
}

// bucketTotal sums the buckets, or nil when one is not an integer.
func bucketTotal(value func(string) any) any {
	total := 0.0
	for _, bucket := range bucketNames {
		number, ok := value(bucket).(float64)
		if !ok || !isInt(number) {
			return nil
		}
		total += number
	}
	return total
}
