package coursecredit

import (
	"slices"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
)

// Hono's CourseCreditGrantService: a paid order becomes credit batches.

var (
	activationModes = []string{"GRANT_TIME", "FIRST_RESERVATION", "FIRST_CHECK_IN", "FIRST_COMPLETED_SESSION", "TERM_START"}
	expiryPolicies  = []string{"FIXED_DURATION", "TERM_END", "NO_EXPIRY"}
)

func grantOrderCredits(app core.App, orderID string, actor Actor, now time.Time) (map[string]any, error) {
	if orderID == "" {
		return nil, Fail("ORDER_ID_REQUIRED", "orderId is required", nil)
	}
	scopedKey, err := scopedIdempotencyKey("grantOrderCredits", actor.IdempotencyKey)
	if err != nil {
		return nil, err
	}
	requestHash := fingerprint(map[string]any{"orderId": orderID, "traceId": actor.TraceID})
	if result, err := replay(app, scopedKey, requestHash, replayConflict); result != nil || err != nil {
		return result, err
	}

	order, err := get(app, "orders", orderID)
	if err != nil {
		return nil, err
	}
	if order["status"] != "paid" {
		return nil, Fail("ORDER_NOT_PAID", "Only paid orders can grant credits", nil)
	}
	defaults, lines, err := normalizeGrantSnapshot(order["grantSnapshot"])
	if err != nil {
		return nil, err
	}
	creditTypes := map[string]map[string]any{}
	for _, line := range lines {
		id := relationID(jsx.Get(asMap(line), "creditTypeId"))
		if _, ok := creditTypes[id]; ok {
			continue
		}
		creditType, err := get(app, "credit_types", id)
		if err != nil {
			return nil, err
		}
		creditTypes[id] = creditType
	}

	at := iso(now)
	operationID := ids.Record()
	grants := make([]grantBatch, 0, len(lines))
	for _, line := range lines {
		id := relationID(jsx.Get(asMap(line), "creditTypeId"))
		grant, err := buildGrantBatch(at, creditTypes[id], line, operationID, order, defaults, actor.ID)
		if err != nil {
			return nil, err
		}
		grants = append(grants, grant)
	}
	summaries := make([]any, len(grants))
	for i, grant := range grants {
		summaries[i] = map[string]any{
			"activationDeadline": or(grant.batch["activationDeadline"], nil),
			"activationMode":     grant.batch["activationMode"],
			"batchId":            grant.batch["id"],
			"creditTypeId":       grant.batch["creditTypeId"],
			"effectiveExpiresAt": or(grant.batch["effectiveExpiresAt"], nil),
			"quantity":           grant.batch["originalQuantity"],
		}
	}
	result := map[string]any{"operationId": operationID, "orderId": order["id"], "batches": summaries}
	orderVersion := positiveVersion(order["version"])
	operation := map[string]any{
		"id":             operationID,
		"operationNo":    operationNo("grant", now, operationID),
		"studentId":      order["studentId"],
		"type":           "grant",
		"status":         "committed",
		"idempotencyKey": scopedKey,
		"sourceType":     "order",
		"sourceId":       order["id"],
		"requestSnapshot": map[string]any{
			"requestHash": requestHash, "orderId": order["id"],
		},
		"resultSnapshot": result,
		"actorId":        actor.ID,
		"actorRole":      actorRoleOr(actor, "service"),
		"traceId":        actor.TraceID,
	}
	for key, value := range operationAudit("order_grant",
		map[string]any{"orderId": order["id"], "status": order["status"], "version": order["version"]}, result) {
		operation[key] = value
	}
	plan := []step{
		create("credit_operations", operation),
		versionClaim("order", jsx.String(order["id"]), orderVersion, operationID),
	}
	for _, grant := range grants {
		plan = append(plan, create("credit_batches", grant.batch), create("credit_events", grant.event))
	}
	plan = append(plan,
		update("orders", jsx.String(order["id"]), map[string]any{"status": "granted", "version": orderVersion + 1}),
		outbox("course-credit.order-granted", "order", jsx.String(order["id"]), result),
	)
	return commitOrReplay(app, plan, scopedKey, requestHash, replayConflict, "COURSE_CREDIT_BATCH_FAILED", result)
}

type grantBatch struct {
	batch map[string]any
	event map[string]any
}

// normalizeGrantSnapshot accepts `{...defaults, lines}` or a bare array of lines.
func normalizeGrantSnapshot(value any) (map[string]any, []any, error) {
	invalid := Fail("ORDER_GRANT_SNAPSHOT_INVALID", "Order grant snapshot has no lines", nil)
	if lines, ok := value.([]any); ok {
		if len(lines) == 0 {
			return nil, nil, invalid
		}
		return map[string]any{}, lines, nil
	}
	snapshot, ok := value.(map[string]any)
	if !ok {
		return nil, nil, invalid
	}
	lines, ok := snapshot["lines"].([]any)
	if !ok || len(lines) == 0 {
		return nil, nil, invalid
	}
	defaults := copyMap(snapshot)
	delete(defaults, "lines")
	return defaults, lines, nil
}

func asMap(value any) map[string]any {
	result, _ := value.(map[string]any)
	return result
}

// buildGrantBatch is Hono's buildGrantBatch: one grant line becomes a batch and its GRANT event.
func buildGrantBatch(at string, creditType map[string]any, rawLine any, operationID string, order, defaults map[string]any, actorID string) (grantBatch, error) {
	line, _ := rawLine.(map[string]any)
	creditTypeID, _ := line["creditTypeId"].(string)
	if line == nil || creditTypeID == "" || !isInt(line["quantity"]) || line["quantity"].(float64) <= 0 {
		return grantBatch{}, Fail("ORDER_GRANT_SNAPSHOT_INVALID", "Grant lines require creditTypeId and positive integer quantity", nil)
	}
	if err := validateCreditTypeForOrder(creditType, order["type"]); err != nil {
		return grantBatch{}, err
	}
	policy := copyMap(defaults)
	for key, value := range line {
		policy[key] = value
	}
	mode, _ := policy["activationMode"].(string)
	if !slices.Contains(activationModes, mode) {
		return grantBatch{}, Fail("INVALID_ACTIVATION_MODE", "Grant activation mode is invalid", nil)
	}
	expiryPolicy, _ := policy["expiryPolicy"].(string)
	if !slices.Contains(expiryPolicies, expiryPolicy) {
		return grantBatch{}, Fail("INVALID_EXPIRY_POLICY", "Grant expiry policy is invalid", nil)
	}
	activeAtGrant := mode == "GRANT_TIME"
	if !activeAtGrant && !(isInt(policy["activationDeadlineDays"]) && policy["activationDeadlineDays"].(float64) >= 0) {
		return grantBatch{}, Fail("ACTIVATION_DEADLINE_REQUIRED", "Deferred activation requires activationDeadlineDays", nil)
	}
	if expiryPolicy == "FIXED_DURATION" && !(isInt(policy["validityDurationDays"]) && policy["validityDurationDays"].(float64) >= 0) {
		return grantBatch{}, Fail("INVALID_DURATION_DAYS", "Fixed duration requires validityDurationDays", nil)
	}
	listUnitValue, err := nonNegativeCost(jsx.Get(policy, "listUnitValue"))
	if err != nil {
		return grantBatch{}, err
	}
	paidUnitCost, err := nonNegativeCost(jsx.Get(policy, "paidUnitCost"))
	if err != nil {
		return grantBatch{}, err
	}
	activationDeadline := ""
	if !activeAtGrant {
		activationDeadline = addDays(at, policy["activationDeadlineDays"].(float64))
	}
	effectiveExpiresAt := ""
	if expiryPolicy == "TERM_END" {
		termEnd, ok := millis(jsx.Get(policy, "termEnd"))
		if !ok {
			return grantBatch{}, Fail("INVALID_DATE", "Term expiry requires termEnd", nil)
		}
		effectiveExpiresAt = fromMillis(termEnd)
	} else if expiryPolicy == "FIXED_DURATION" && activeAtGrant {
		effectiveExpiresAt = addDays(at, policy["validityDurationDays"].(float64))
	}
	activatedAt := ""
	status := "unactivated"
	if activeAtGrant {
		activatedAt, status = at, "active"
	}
	validityDurationDays := policy["validityDurationDays"]
	if validityDurationDays == nil {
		validityDurationDays = 0
	}
	priority := any(0)
	if isInt(policy["priority"]) {
		priority = policy["priority"]
	}
	batchID := ids.Record()
	batch := map[string]any{
		"id":                   batchID,
		"studentId":            order["studentId"],
		"creditTypeId":         creditTypeID,
		"sourceOperationId":    operationID,
		"originalQuantity":     line["quantity"],
		"availableQuantity":    line["quantity"],
		"frozenQuantity":       0,
		"consumedQuantity":     0,
		"expiredQuantity":      0,
		"reversedQuantity":     0,
		"status":               status,
		"validFrom":            or(policy["validFrom"], at),
		"originalExpiresAt":    effectiveExpiresAt,
		"effectiveExpiresAt":   effectiveExpiresAt,
		"activationMode":       mode,
		"expiryPolicy":         expiryPolicy,
		"activationDeadline":   activationDeadline,
		"activatedAt":          activatedAt,
		"validityDurationDays": validityDurationDays,
		"grantSnapshot":        policy,
		"listUnitValue":        listUnitValue,
		"paidUnitCost":         paidUnitCost,
		"currency":             or(policy["currency"], order["currency"]),
		"priority":             priority,
		"version":              1,
	}
	event := map[string]any{
		"id":              ids.Record(),
		"operationId":     operationID,
		"batchId":         batchID,
		"studentId":       order["studentId"],
		"creditTypeId":    creditTypeID,
		"eventType":       "GRANT",
		"quantityDelta":   line["quantity"],
		"bucketFrom":      "",
		"bucketTo":        "availableQuantity",
		"balanceSnapshot": balanceSnapshot(batch),
		"businessTime":    at,
		"actorId":         actorID,
		"reason":          "order_grant",
		"metadata":        map[string]any{"orderId": order["id"]},
	}
	return grantBatch{batch: batch, event: event}, nil
}

func validateCreditTypeForOrder(creditType map[string]any, orderType any) error {
	if creditType == nil {
		return Fail("CREDIT_TYPE_INVALID", "Granted credit type does not exist", nil)
	}
	if orderType != "package_purchase" && orderType != "universal_recharge" {
		return Fail("ORDER_TYPE_INVALID", "Order type cannot grant course credits", nil)
	}
	mismatch := Fail("ORDER_CREDIT_TYPE_MISMATCH", "Order type does not match granted credit type", nil)
	if creditType["kind"] == "universal" {
		if creditType["consumable"] != false {
			return Fail("CREDIT_TYPE_INVALID", "Universal credit must be non-consumable", nil)
		}
		if orderType != "universal_recharge" {
			return mismatch
		}
		return nil
	}
	if creditType["kind"] != "course" || creditType["consumable"] != true || !jsx.Truthy(creditType["courseSpecId"]) {
		return Fail("CREDIT_TYPE_INVALID", "Course credit must be consumable and reference one course specification", nil)
	}
	if orderType != "package_purchase" {
		return mismatch
	}
	return nil
}

func nonNegativeCost(value any) (float64, error) {
	number := jsx.Number(value)
	if !jsx.IsFinite(value) || number < 0 {
		return 0, Fail("ORDER_GRANT_SNAPSHOT_INVALID", "Grant line cost basis is invalid", nil)
	}
	return number, nil
}
