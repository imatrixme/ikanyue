package coursecredit

import (
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/records"
)

// Hono's CourseCreditBatchLifecycleService: audited expiry extensions and
// compensation batches for expired quantity.

// batchCommand is the request both lifecycle commands share; ApprovedBy is the operator.
type batchCommand struct {
	BatchID string
	Body    Body
	Actor   Actor
	Clock   func() time.Time
}

func (c batchCommand) reason() any { return c.Body.Get("reason") }

func (c batchCommand) validate() error {
	if c.BatchID == "" {
		return Fail("BATCH_ID_REQUIRED", "batchId is required", nil)
	}
	if _, ok := textValue(c.reason()); !ok {
		return Fail("AUDIT_REASON_REQUIRED", "An audit reason is required", nil)
	}
	if c.Actor.ID == "" {
		return Fail("ACTOR_ID_REQUIRED", "An operator actorId is required", nil)
	}
	return nil
}

func extendBatchExpiry(app core.App, command batchCommand, attempt int) (map[string]any, error) {
	if err := command.validate(); err != nil {
		return nil, err
	}
	now := command.Clock()
	newExpiresAt, err := validFutureDate(command.Body.Get("newExpiresAt"), now, "newExpiresAt")
	if err != nil {
		return nil, err
	}
	scopedKey, err := scopedIdempotencyKey("extendBatchExpiry", command.Actor.IdempotencyKey)
	if err != nil {
		return nil, err
	}
	requestHash := fingerprint(map[string]any{
		"batchId": command.BatchID, "newExpiresAt": newExpiresAt,
		"reason": command.reason(), "approvedBy": command.Actor.ID,
	})
	if result, err := replay(app, scopedKey, requestHash, replayConflict); result != nil || err != nil {
		return result, err
	}

	batch, err := get(app, "credit_batches", command.BatchID)
	if err != nil {
		return nil, err
	}
	oldMillis, ok := millis(batch["effectiveExpiresAt"])
	if !ok {
		return nil, Fail("BATCH_HAS_NO_EXPIRY", "Batch does not have an effective expiry", nil)
	}
	newMillis, _ := millis(newExpiresAt)
	if newMillis <= oldMillis {
		return nil, Fail("EXPIRY_EXTENSION_REQUIRED", "New expiry must be later than the effective expiry", nil)
	}
	quantityScope, err := remainingQuantity(batch)
	if err != nil {
		return nil, err
	}
	if quantityScope <= 0 {
		return nil, Fail("NO_REMAINING_CREDIT", "Batch has no remaining quantity to extend", nil)
	}

	operationID := ids.Record()
	version := positiveVersion(batch["version"])
	result := map[string]any{
		"batchId":       batch["id"],
		"newExpiresAt":  newExpiresAt,
		"oldExpiresAt":  fromMillis(oldMillis),
		"operationId":   operationID,
		"quantityScope": quantityScope,
	}
	next := copyMap(batch)
	next["effectiveExpiresAt"] = newExpiresAt
	next["version"] = version + 1
	plan := []step{
		lifecycleOperation(command, now, scopedKey, requestHash, result, batch, operationID, "extend"),
		versionClaim("credit_batch", command.BatchID, version, operationID),
		update("credit_batches", command.BatchID, map[string]any{"effectiveExpiresAt": newExpiresAt, "version": version + 1}),
		create("credit_expiry_changes", expiryChange(command, batch, batch["effectiveExpiresAt"], newExpiresAt, quantityScope)),
		create("credit_events", lifecycleEvent(command, now, next, operationID, "EXTEND", 0, "expiry_extension")),
		outbox("course-credit.batch-extended", "credit_batch", command.BatchID, result),
	}
	return commitLifecycle(app, plan, scopedKey, requestHash, result, attempt, func() (map[string]any, error) {
		return extendBatchExpiry(app, command, 1)
	})
}

func restoreExpiredQuantity(app core.App, command batchCommand, attempt int) (map[string]any, error) {
	if err := command.validate(); err != nil {
		return nil, err
	}
	quantity := command.Body.Get("quantity")
	if !isInt(quantity) || quantity.(float64) <= 0 {
		return nil, Fail("INVALID_CREDIT_QUANTITY", "Restored quantity must be a positive integer", nil)
	}
	days := command.Body.Get("validityDurationDays")
	if !isInt(days) || days.(float64) <= 0 {
		return nil, Fail("INVALID_DURATION_DAYS", "Compensation validityDurationDays must be a positive integer", nil)
	}
	scopedKey, err := scopedIdempotencyKey("restoreExpiredQuantity", command.Actor.IdempotencyKey)
	if err != nil {
		return nil, err
	}
	requestHash := fingerprint(map[string]any{
		"batchId": command.BatchID, "quantity": quantity, "validityDurationDays": days,
		"reason": command.reason(), "approvedBy": command.Actor.ID,
	})
	if result, err := replay(app, scopedKey, requestHash, replayConflict); result != nil || err != nil {
		return result, err
	}

	source, err := get(app, "credit_batches", command.BatchID)
	if err != nil {
		return nil, err
	}
	expiredQuantity, err := integerQuantity(source["expiredQuantity"], "expiredQuantity")
	if err != nil {
		return nil, err
	}
	if expiredQuantity <= 0 {
		return nil, Fail("NO_EXPIRED_CREDIT", "Batch has no expired quantity to restore", nil)
	}
	compensations, err := list(app, "credit_batches", `compensationSourceBatchId="`+records.EscapeFilter(command.BatchID)+`"`, "")
	if err != nil {
		return nil, err
	}
	alreadyRestored := 0.0
	for _, batch := range compensations {
		original, err := integerQuantity(batch["originalQuantity"], "originalQuantity")
		if err != nil {
			return nil, err
		}
		alreadyRestored += original
	}
	if alreadyRestored+quantity.(float64) > expiredQuantity {
		return nil, Fail("COMPENSATION_EXCEEDS_EXPIRED", "Compensation exceeds unrestored expired quantity",
			map[string]any{"alreadyRestored": alreadyRestored, "expiredQuantity": expiredQuantity})
	}

	now := command.Clock()
	at := iso(now)
	expiresAt := addDays(at, days.(float64))
	operationID := ids.Record()
	compensationID := ids.Record()
	version := positiveVersion(source["version"])
	reason, _ := textValue(command.reason())
	compensation := map[string]any{
		"id":                        compensationID,
		"studentId":                 source["studentId"],
		"creditTypeId":              source["creditTypeId"],
		"sourceOperationId":         operationID,
		"compensationSourceBatchId": command.BatchID,
		"originalQuantity":          quantity,
		"availableQuantity":         quantity,
		"frozenQuantity":            0,
		"consumedQuantity":          0,
		"expiredQuantity":           0,
		"reversedQuantity":          0,
		"status":                    "active",
		"validFrom":                 at,
		"originalExpiresAt":         expiresAt,
		"effectiveExpiresAt":        expiresAt,
		"activationMode":            "GRANT_TIME",
		"expiryPolicy":              "FIXED_DURATION",
		"activationDeadline":        "",
		"activatedAt":               at,
		"validityDurationDays":      days,
		"grantSnapshot":             map[string]any{"compensationSourceBatchId": command.BatchID, "reason": reason},
		"listUnitValue":             jsx.Number(or(source["listUnitValue"], 0.0)),
		"paidUnitCost":              jsx.Number(or(source["paidUnitCost"], 0.0)),
		"currency":                  or(source["currency"], "CNY"),
		"priority":                  jsx.Number(or(source["priority"], 0.0)),
		"version":                   1,
	}
	result := map[string]any{
		"compensationBatchId": compensationID,
		"expiresAt":           expiresAt,
		"operationId":         operationID,
		"quantity":            quantity,
		"sourceBatchId":       source["id"],
	}
	plan := []step{
		lifecycleOperation(command, now, scopedKey, requestHash, result, source, operationID, "adjust"),
		versionClaim("credit_batch", command.BatchID, version, operationID),
		update("credit_batches", command.BatchID, map[string]any{"version": version + 1}),
		create("credit_batches", compensation),
		create("credit_events", lifecycleEvent(command, now, compensation, operationID, "ADJUST", quantity, "expired_compensation")),
		create("credit_expiry_changes", expiryChange(command, source, source["effectiveExpiresAt"], expiresAt, quantity)),
		outbox("course-credit.expired-compensated", "credit_batch", compensationID, result),
	}
	return commitLifecycle(app, plan, scopedKey, requestHash, result, attempt, func() (map[string]any, error) {
		return restoreExpiredQuantity(app, command, 1)
	})
}

// commitLifecycle replays a raced duplicate and retries a lost version race once.
func commitLifecycle(app core.App, plan []step, scopedKey, requestHash string, result map[string]any, attempt int, retry func() (map[string]any, error)) (map[string]any, error) {
	if err := send(app, plan); err != nil {
		raced, replayErr := replay(app, scopedKey, requestHash, replayConflict)
		if replayErr != nil {
			return nil, replayErr
		}
		if raced != nil {
			return raced, nil
		}
		if attempt == 0 && isVersionConflict(err) {
			return retry()
		}
		return nil, withCode(err, "COURSE_CREDIT_BATCH_FAILED")
	}
	result["replayed"] = false
	return result, nil
}

func lifecycleOperation(command batchCommand, now time.Time, scopedKey, requestHash string, result, batch map[string]any, operationID, kind string) step {
	operation := map[string]any{
		"id":              operationID,
		"operationNo":     operationNo(kind, now, operationID),
		"studentId":       batch["studentId"],
		"type":            kind,
		"status":          "committed",
		"idempotencyKey":  scopedKey,
		"sourceType":      "credit_batch",
		"sourceId":        batch["id"],
		"requestSnapshot": map[string]any{"requestHash": requestHash},
		"resultSnapshot":  result,
		"actorId":         command.Actor.ID,
		"actorRole":       actorRoleOr(command.Actor, "admin"),
		"traceId":         command.Actor.TraceID,
	}
	before := map[string]any{
		"batchId":            batch["id"],
		"effectiveExpiresAt": batch["effectiveExpiresAt"],
		"expiredQuantity":    batch["expiredQuantity"],
		"status":             batch["status"],
		"version":            batch["version"],
	}
	for key, value := range operationAudit(command.reason(), before, result) {
		operation[key] = value
	}
	return create("credit_operations", operation)
}

func expiryChange(command batchCommand, batch map[string]any, oldExpiresAt any, newExpiresAt string, quantityScope any) map[string]any {
	reason, _ := command.reason().(string)
	return map[string]any{
		"id":            ids.Record(),
		"batchId":       batch["id"],
		"oldExpiresAt":  or(oldExpiresAt, ""),
		"newExpiresAt":  newExpiresAt,
		"quantityScope": quantityScope,
		"reason":        strings.TrimSpace(reason),
		"actorId":       command.Actor.ID,
		"approvedBy":    command.Actor.ID,
	}
}

func lifecycleEvent(command batchCommand, now time.Time, batch map[string]any, operationID, eventType string, delta any, reason string) map[string]any {
	bucketTo := ""
	if eventType == "ADJUST" {
		bucketTo = "availableQuantity"
	}
	return map[string]any{
		"id":              ids.Record(),
		"operationId":     operationID,
		"batchId":         batch["id"],
		"studentId":       batch["studentId"],
		"creditTypeId":    batch["creditTypeId"],
		"eventType":       eventType,
		"quantityDelta":   delta,
		"bucketFrom":      "",
		"bucketTo":        bucketTo,
		"balanceSnapshot": balanceSnapshot(batch),
		"businessTime":    iso(now),
		"actorId":         command.Actor.ID,
		"reason":          reason,
		"metadata":        map[string]any{"approvedBy": command.Actor.ID, "sourceBatchId": command.BatchID},
	}
}

func remainingQuantity(batch map[string]any) (float64, error) {
	available, err := integerQuantity(batch["availableQuantity"], "availableQuantity")
	if err != nil {
		return 0, err
	}
	frozen, err := integerQuantity(batch["frozenQuantity"], "frozenQuantity")
	if err != nil {
		return 0, err
	}
	return available + frozen, nil
}

// integerQuantity is Number(value || 0) as a non-negative integer.
func integerQuantity(value any, name string) (float64, error) {
	value = or(value, 0.0)
	if !jsx.IsInteger(value) || jsx.Number(value) < 0 {
		return 0, Fail("INVALID_CREDIT_QUANTITY", name+" must be a non-negative integer", nil)
	}
	return jsx.Number(value), nil
}

func validFutureDate(value any, now time.Time, name string) (string, error) {
	ms, ok := millis(value)
	if !ok {
		return "", Fail("INVALID_DATE", name+" must be a valid date", nil)
	}
	if ms <= now.UnixMilli() {
		return "", Fail("EXPIRY_MUST_BE_FUTURE", name+" must be in the future", nil)
	}
	return fromMillis(ms), nil
}
