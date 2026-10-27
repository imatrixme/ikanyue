package coursecredit

import (
	"errors"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/records"
)

// Hono's CourseCreditExpiryService: due batches move available (and invalid
// reserved) quantity to expired. Each batch commits on its own, keyed by its
// version, so a rerun after a crash or a concurrent run never expires twice.

const (
	defaultExpiryLimit = 100
	maxExpiryLimit     = 200
	expiryWorkerActor  = "course-credit-expiry-worker"
)

type expirySummary struct {
	Scanned               int      `json:"scanned"`
	ExpiredBatches        int      `json:"expiredBatches"`
	ExpiredQuantity       float64  `json:"expiredQuantity"`
	ExpiredReservations   int      `json:"expiredReservations"`
	OperationIDs          []string `json:"operationIds"`
	ProtectedReservations int      `json:"protectedReservations"`
}

func (s expirySummary) asMap() map[string]any {
	return map[string]any{
		"scanned": s.Scanned, "expiredBatches": s.ExpiredBatches, "expiredQuantity": s.ExpiredQuantity,
		"expiredReservations": s.ExpiredReservations, "operationIds": s.OperationIDs,
		"protectedReservations": s.ProtectedReservations,
	}
}

func expireDue(app core.App, actor Actor, limitValue any, now time.Time) (map[string]any, error) {
	at := iso(now)
	limit, err := expiryLimit(limitValue)
	if err != nil {
		return nil, err
	}
	due, err := pageOf(app, "credit_batches", dueBatchFilter(at), "effectiveExpiresAt,activationDeadline,created,id", 1, limit)
	if err != nil {
		return nil, err
	}
	summary := expirySummary{Scanned: len(due.Items), OperationIDs: []string{}}
	failures := []any{}
	for _, candidate := range due.Items {
		id := jsx.String(candidate["id"])
		item, err := expireBatch(app, id, at, actor, 0)
		if err != nil {
			failures = append(failures, map[string]any{"batchId": id, "errorCode": safeErrorCode(err)})
			continue
		}
		summary.ExpiredBatches += item.ExpiredBatches
		summary.ExpiredQuantity += item.ExpiredQuantity
		summary.ExpiredReservations += item.ExpiredReservations
		summary.OperationIDs = append(summary.OperationIDs, item.OperationIDs...)
		summary.ProtectedReservations += item.ProtectedReservations
	}
	if len(failures) > 0 {
		details := summary.asMap()
		details["failed"] = failures
		return nil, &storeError{status: 503, code: "COURSE_CREDIT_EXPIRY_RUN_FAILED",
			message: "One or more course-credit batches failed to expire", details: details}
	}
	return summary.asMap(), nil
}

func expireBatch(app core.App, batchID, at string, actor Actor, attempt int) (expirySummary, error) {
	batch, err := get(app, "credit_batches", batchID)
	if err != nil {
		return expirySummary{}, err
	}
	allocations := []map[string]any{}
	if jsx.Number(or(batch["frozenQuantity"], 0.0)) > 0 {
		allocations, err = list(app, "session_credit_allocations",
			`batchId="`+records.EscapeFilter(jsx.String(batch["id"]))+`" && status="reserved"`, "created,id")
		if err != nil {
			return expirySummary{}, err
		}
	}
	activationExpired := false
	if !jsx.Truthy(batch["activatedAt"]) {
		if activationExpired, err = activationDeadlinePassed(batch, at); err != nil {
			return expirySummary{}, err
		}
	}
	invalid, protected := []map[string]any{}, []map[string]any{}
	for _, allocation := range allocations {
		valid := false
		if !activationExpired {
			if valid, err = canConsumeProtectedReservation(batch, allocation["reservedForStartAt"]); err != nil {
				return expirySummary{}, err
			}
		}
		if valid {
			protected = append(protected, allocation)
		} else {
			invalid = append(invalid, allocation)
		}
	}
	nextBatch, availableExpired, err := expireAvailableQuantity(batch, at)
	if err != nil {
		return expirySummary{}, err
	}
	invalidQuantity, err := sumQuantity(invalid)
	if err != nil {
		return expirySummary{}, err
	}
	if invalidQuantity > 0 {
		if nextBatch, err = moveQuantity(nextBatch, "frozenQuantity", "expiredQuantity", invalidQuantity); err != nil {
			return expirySummary{}, err
		}
		if nextBatch["status"], err = deriveBatchStatus(nextBatch); err != nil {
			return expirySummary{}, err
		}
	}
	expiredQuantity := availableExpired + invalidQuantity
	if expiredQuantity == 0 {
		return expirySummary{OperationIDs: []string{}, ProtectedReservations: len(protected)}, nil
	}

	operationID := ids.Record()
	batchVersion := positiveVersion(batch["version"])
	sessionStudents, err := reservedSessionStudents(app, invalid)
	if err != nil {
		return expirySummary{}, err
	}
	protectedQuantity, err := sumQuantity(protected)
	if err != nil {
		return expirySummary{}, err
	}
	result := map[string]any{
		"batchId":                      batch["id"],
		"expiredQuantity":              expiredQuantity,
		"expiredReservationQuantity":   invalidQuantity,
		"operationId":                  operationID,
		"protectedReservationQuantity": protectedQuantity,
	}
	actorID := or(actor.ID, expiryWorkerActor)
	operation := map[string]any{
		"id":              operationID,
		"operationNo":     operationNo("expire", mustTime(at), operationID),
		"studentId":       relationID(batch["studentId"]),
		"type":            "expire",
		"status":          "committed",
		"idempotencyKey":  "expireBatch:" + jsx.String(batch["id"]) + ":v" + strconv.Itoa(batchVersion),
		"sourceType":      "credit_batch",
		"sourceId":        batch["id"],
		"requestSnapshot": map[string]any{"at": at, "batchVersion": batchVersion},
		"resultSnapshot":  result,
		"actorId":         actorID,
		"actorRole":       actorRoleOr(actor, "system"),
		"traceId":         actor.TraceID,
	}
	for key, value := range operationAudit("scheduled_expiry", balanceSnapshot(batch), result) {
		operation[key] = value
	}
	id := jsx.String(batch["id"])
	plan := []step{
		create("credit_operations", operation),
		versionClaim("credit_batch", id, batchVersion, operationID),
		update("credit_batches", id, map[string]any{
			"availableQuantity": nextBatch["availableQuantity"],
			"frozenQuantity":    nextBatch["frozenQuantity"],
			"expiredQuantity":   nextBatch["expiredQuantity"],
			"status":            nextBatch["status"],
			"version":           batchVersion + 1,
		}),
	}
	allocationIDs := []any{}
	for _, allocation := range invalid {
		allocationIDs = append(allocationIDs, allocation["id"])
		plan = append(plan, update("session_credit_allocations", jsx.String(allocation["id"]), map[string]any{"status": "expired"}))
	}
	for _, student := range sessionStudents {
		version := positiveVersion(student["version"])
		studentID := jsx.String(student["id"])
		plan = append(plan,
			versionClaim("session_student", studentID, version, operationID),
			update("session_students", studentID, map[string]any{
				"creditStatus": "credit_insufficient", "eligibilityReason": "CREDIT_EXPIRED", "version": version + 1,
			}),
		)
	}
	for _, movement := range []struct {
		quantity    float64
		bucket      string
		allocations []any
	}{{availableExpired, "availableQuantity", []any{}}, {invalidQuantity, "frozenQuantity", allocationIDs}} {
		if movement.quantity <= 0 {
			continue
		}
		metadata := map[string]any{}
		if len(movement.allocations) > 0 {
			metadata["allocationIds"] = movement.allocations
		}
		plan = append(plan, create("credit_events", map[string]any{
			"id":              ids.Record(),
			"operationId":     operationID,
			"batchId":         batch["id"],
			"studentId":       relationID(batch["studentId"]),
			"creditTypeId":    relationID(batch["creditTypeId"]),
			"eventType":       "EXPIRE",
			"quantityDelta":   movement.quantity,
			"bucketFrom":      movement.bucket,
			"bucketTo":        "expiredQuantity",
			"balanceSnapshot": balanceSnapshot(nextBatch),
			"businessTime":    at,
			"actorId":         actorID,
			"reason":          "scheduled_expiry",
			"metadata":        metadata,
		}))
	}
	plan = append(plan, outbox("course-credit.batch-expired", "credit_batch", id, result))
	if err := send(app, plan); err != nil {
		if attempt == 0 && isVersionConflict(err) {
			return expireBatch(app, batchID, at, actor, 1)
		}
		return expirySummary{}, withCode(err, "COURSE_CREDIT_EXPIRY_FAILED")
	}
	return expirySummary{
		ExpiredBatches: 1, ExpiredQuantity: expiredQuantity, ExpiredReservations: len(invalid),
		OperationIDs: []string{operationID}, ProtectedReservations: len(protected),
	}, nil
}

func mustTime(at string) time.Time {
	ms, _ := millis(at)
	return time.UnixMilli(ms)
}

func dueBatchFilter(at string) string {
	value := records.EscapeFilter(filterTime(at))
	return `(status="active" || status="unactivated") && (availableQuantity>0 || frozenQuantity>0)` +
		` && ((effectiveExpiresAt!="" && effectiveExpiresAt<="` + value + `")` +
		` || (activatedAt="" && activationDeadline!="" && activationDeadline<="` + value + `"))`
}

func expiryLimit(value any) (int, error) {
	if _, undefined := value.(jsx.Undefined); undefined {
		return defaultExpiryLimit, nil
	}
	limit := jsx.Number(value)
	if !jsx.IsInteger(value) || limit <= 0 || limit > maxExpiryLimit {
		return 0, Fail("EXPIRY_LIMIT_INVALID", "Expiry limit must be between 1 and "+strconv.Itoa(maxExpiryLimit), nil)
	}
	return int(limit), nil
}

func reservedSessionStudents(app core.App, allocations []map[string]any) ([]map[string]any, error) {
	seen := []string{}
	result := []map[string]any{}
	for _, allocation := range allocations {
		id := relationID(allocation["sessionStudentId"])
		if id == "" || slices.Contains(seen, id) {
			continue
		}
		seen = append(seen, id)
		student, err := get(app, "session_students", id)
		if err != nil {
			return nil, err
		}
		if student["creditStatus"] == "reserved" {
			result = append(result, student)
		}
	}
	return result, nil
}

func sumQuantity(rows []map[string]any) (float64, error) {
	total := 0.0
	for _, row := range rows {
		quantity := jsx.Number(row["quantity"])
		if !jsx.IsInteger(row["quantity"]) || quantity <= 0 {
			return 0, Fail("ALLOCATION_QUANTITY_INVALID", "Reserved allocation quantity must be a positive integer", nil)
		}
		total += quantity
	}
	return total, nil
}

var safeCode = regexp.MustCompile(`^[A-Z0-9_:-]{1,80}$`)

// safeErrorCode is the per-batch failure code an expiry run reports.
func safeErrorCode(err error) string {
	code := ""
	var business *Error
	var store *storeError
	switch {
	case errors.As(err, &business):
		code = business.Code
	case errors.As(err, &store):
		code = store.code
	}
	code = strings.ToUpper(code)
	if code == "" || !safeCode.MatchString(code) {
		return "COURSE_CREDIT_EXPIRY_FAILED"
	}
	return code
}
