package coursecredit

import (
	"crypto/sha256"
	"encoding/hex"
	"math"
	"slices"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
)

// Hono's reservationPlanning, reservationRequests, settlementPlanning (release
// on cancellation), reschedulePlanning and commerce/reservationCancellation:
// how an appointment freezes, moves and returns course credit.

const fefoSort = "effectiveExpiresAt,priority,created,id"

// bookingBatchFilter: batches that could still serve a student's course credit.
func bookingBatchFilter(studentID, creditTypeID string) string {
	return `studentId="` + escape(studentID) + `" && creditTypeId="` + escape(creditTypeID) + `"` +
		` && availableQuantity>0 && (status="active" || status="unactivated")`
}

// fefoFilter is buildFefoFilter: candidate batches valid for a session start.
func fefoFilter(studentID, creditTypeID string, sessionStart any) (string, error) {
	start, err := dateOf(sessionStart, "sessionStart")
	if err != nil {
		return "", err
	}
	at := filterTime(fromMillis(start))
	return strings.Join([]string{
		`studentId="` + escape(studentID) + `"`,
		`creditTypeId="` + escape(creditTypeID) + `"`,
		"availableQuantity > 0",
		`(status="active" || status="unactivated")`,
		`(validFrom="" || validFrom<="` + at + `")`,
		`((status="active" && (effectiveExpiresAt="" || effectiveExpiresAt>"` + at + `")) || ` +
			`(status="unactivated" && activationDeadline>"` + at + `"))`,
	}, " && "), nil
}

// reservationContext is what a batch must satisfy to serve one session.
type reservationContext struct {
	creditType   map[string]any
	now          string
	creditTypeID string
	sessionStart any
}

// normalizeBookingBatch is normalizeBatch: integer buckets as numbers plus the credit type's kind.
func normalizeBookingBatch(record, creditType map[string]any) map[string]any {
	batch := copyMap(record)
	for _, key := range []string{"availableQuantity", "consumedQuantity", "expiredQuantity", "frozenQuantity",
		"originalQuantity", "priority", "reversedQuantity"} {
		if number := jsx.Number(or(record[key], 0.0)); jsx.IsInteger(number) {
			batch[key] = number
		}
	}
	batch["creditKind"] = creditType["kind"]
	batch["consumable"] = creditType["consumable"]
	batch["version"] = float64(positiveVersion(record["version"]))
	return batch
}

var activationTriggers = map[string]string{
	"GRANT_TIME":              "GRANT",
	"FIRST_RESERVATION":       "RESERVATION_SUCCEEDED",
	"FIRST_CHECK_IN":          "VALID_CHECK_IN",
	"FIRST_COMPLETED_SESSION": "SESSION_COMPLETED",
	"TERM_START":              "TERM_STARTED",
}

func validateActivationPolicy(batch map[string]any) error {
	mode, _ := batch["activationMode"].(string)
	if _, ok := activationTriggers[mode]; !ok {
		return Fail("INVALID_ACTIVATION_MODE", "activation mode is not supported", map[string]any{"activationMode": batch["activationMode"]})
	}
	if mode != "GRANT_TIME" {
		_, ok, err := optionalDateOf(batch["activationDeadline"], "activationDeadline")
		if err != nil {
			return err
		}
		if !ok {
			return Fail("ACTIVATION_DEADLINE_REQUIRED", "unactivated batches require an activation deadline", nil)
		}
	}
	if days, present := batch["validityDurationDays"]; present && days != nil {
		if !isInt(days) || days.(float64) < 0 {
			return Fail("INVALID_DURATION_DAYS", "validityDurationDays must be a non-negative integer", nil)
		}
	}
	return nil
}

func canReserveUnactivatedBatch(batch map[string]any, sessionStart any, now string) (bool, error) {
	if err := validateActivationPolicy(batch); err != nil {
		return false, err
	}
	if jsx.Truthy(batch["activatedAt"]) {
		return true, nil
	}
	if passed, err := activationDeadlinePassed(batch, now); err != nil || passed {
		return false, err
	}
	deadline, ok, err := optionalDateOf(batch["activationDeadline"], "activationDeadline")
	if err != nil || !ok {
		return false, err
	}
	start, err := dateOf(sessionStart, "sessionStart")
	return err == nil && start < deadline, err
}

// serviceTimeValid is isServiceTimeValid: the session starts inside [validFrom, effectiveExpiresAt).
func serviceTimeValid(batch map[string]any, sessionStart any) (bool, error) {
	value, err := dateOf(sessionStart, "value")
	if err != nil {
		return false, err
	}
	start, hasStart, err := optionalDateOf(batch["validFrom"], "start")
	if err != nil {
		return false, err
	}
	end, hasEnd, err := optionalDateOf(batch["effectiveExpiresAt"], "end")
	if err != nil {
		return false, err
	}
	return (!hasStart || value >= start) && (!hasEnd || value < end), nil
}

// batchEligible is evaluateBatchEligibility without the rejection reason.
func batchEligible(batch map[string]any, context reservationContext) (bool, error) {
	if batch["creditTypeId"] != context.creditTypeID ||
		batch["creditKind"] == "universal" || batch["consumable"] == false || jsx.Truthy(batch["locked"]) ||
		(batch["status"] != "active" && batch["status"] != "unactivated") {
		return false, nil
	}
	if available := batch["availableQuantity"]; !isInt(available) || available.(float64) <= 0 {
		return false, nil
	}
	if !jsx.Truthy(batch["activatedAt"]) {
		return canReserveUnactivatedBatch(batch, context.sessionStart, context.now)
	}
	return serviceTimeValid(batch, context.sessionStart)
}

// activateOnReservation is activateBatch(batch, 'RESERVATION_SUCCEEDED', now) for a FIRST_RESERVATION batch.
func activateOnReservation(batch map[string]any, at string) (map[string]any, error) {
	if err := validateActivationPolicy(batch); err != nil {
		return nil, err
	}
	activationAt, err := dateOf(at, "activatedAt")
	if err != nil {
		return nil, err
	}
	if passed, err := activationDeadlinePassed(batch, fromMillis(activationAt)); err != nil {
		return nil, err
	} else if passed {
		return nil, Fail("ACTIVATION_DEADLINE_PASSED", "batch activation deadline has passed", nil)
	}
	next := copyMap(batch)
	next["activatedAt"] = fromMillis(activationAt)
	next["status"] = "active"
	if days, present := batch["validityDurationDays"]; present && days != nil {
		next["effectiveExpiresAt"] = fromMillis(activationAt + int64(days.(float64))*dayMillis)
	} else if expires, ok, err := optionalDateOf(batch["effectiveExpiresAt"], "effectiveExpiresAt"); err != nil {
		return nil, err
	} else if ok {
		next["effectiveExpiresAt"] = fromMillis(expires)
	} else {
		next["effectiveExpiresAt"] = nil
	}
	return next, nil
}

type creditAllocation struct {
	batchID  string
	quantity float64
}

// reservationPlan is planReservation's result: FEFO allocations over prepared batches.
type reservationPlan struct {
	allocations []creditAllocation
	missing     float64
	activated   map[string]bool
	batches     map[string]map[string]any
}

func planReservation(records []map[string]any, quantity float64, context reservationContext) (reservationPlan, error) {
	plan := reservationPlan{activated: map[string]bool{}, batches: map[string]map[string]any{}}
	prepared := []map[string]any{}
	for _, record := range records {
		batch := normalizeBookingBatch(record, context.creditType)
		eligible, err := batchEligible(batch, context)
		if err != nil {
			return plan, err
		}
		if !eligible {
			continue
		}
		if !jsx.Truthy(batch["activatedAt"]) && batch["activationMode"] == "FIRST_RESERVATION" {
			activated, err := activateOnReservation(batch, context.now)
			if err != nil {
				return plan, err
			}
			if valid, err := serviceTimeValid(activated, context.sessionStart); err != nil {
				return plan, err
			} else if !valid {
				continue
			}
			batch = activated
			plan.activated[jsx.String(batch["id"])] = true
		}
		prepared = append(prepared, batch)
	}
	for _, batch := range prepared {
		plan.batches[jsx.String(batch["id"])] = batch
	}
	return plan, allocateFefo(&plan, prepared, quantity, context)
}

func allocateFefo(plan *reservationPlan, prepared []map[string]any, quantity float64, context reservationContext) error {
	if !isInt(quantity) || quantity <= 0 {
		return Fail("INVALID_CREDIT_QUANTITY", "quantity must be greater than zero", nil)
	}
	eligible := []map[string]any{}
	for _, batch := range prepared {
		ok, err := batchEligible(batch, context)
		if err != nil {
			return err
		}
		if ok {
			eligible = append(eligible, batch)
		}
	}
	slices.SortStableFunc(eligible, compareFefo)
	remaining := quantity
	for _, batch := range eligible {
		if remaining == 0 {
			break
		}
		allocated := math.Min(batch["availableQuantity"].(float64), remaining)
		plan.allocations = append(plan.allocations, creditAllocation{jsx.String(batch["id"]), allocated})
		remaining -= allocated
	}
	plan.missing = remaining
	return nil
}

func compareFefo(left, right map[string]any) int {
	nullable := func(value any) float64 {
		if ms, ok, _ := optionalDateOf(value, "date"); ok {
			return float64(ms)
		}
		return math.Inf(1)
	}
	for _, key := range []string{"effectiveExpiresAt"} {
		if a, b := nullable(left[key]), nullable(right[key]); a != b {
			return compareFloat(a, b)
		}
	}
	if a, b := jsx.Number(or(left["priority"], 0.0)), jsx.Number(or(right["priority"], 0.0)); a != b {
		return compareFloat(a, b)
	}
	if a, b := nullable(left["created"]), nullable(right["created"]); a != b {
		return compareFloat(a, b)
	}
	return strings.Compare(jsx.String(left["id"]), jsx.String(right["id"]))
}

func compareFloat(a, b float64) int {
	if a < b {
		return -1
	}
	return 1
}

// reservationMovement freezes allocated quantity on one batch.
type reservationMovement struct {
	activationSnapshot map[string]any
	nextBatch          map[string]any
	activated          bool
	allocationID       string
	expectedVersion    int
	quantity           float64
}

func buildReservationMovements(plan reservationPlan) ([]reservationMovement, error) {
	movements := []reservationMovement{}
	for _, allocation := range plan.allocations {
		batch := plan.batches[allocation.batchID]
		moved, err := moveQuantity(batch, "availableQuantity", "frozenQuantity", allocation.quantity)
		if err != nil {
			return nil, err
		}
		if moved["status"], err = deriveBatchStatus(moved); err != nil {
			return nil, err
		}
		version := positiveVersion(batch["version"])
		moved["version"] = version + 1
		movements = append(movements, reservationMovement{
			activationSnapshot: batch, nextBatch: moved, activated: plan.activated[allocation.batchID],
			allocationID: ids.Record(), expectedVersion: version, quantity: allocation.quantity,
		})
	}
	return movements, nil
}

// reservationSession names the session student a reservation freezes credit for.
type reservationSession struct {
	sessionID, sessionStartAt string
	sessionStudent            map[string]any
	operationID, at, actorID  string
}

func (r reservationSession) creditEvent(batch map[string]any, eventType string, delta float64, from, to, reason string, metadata map[string]any) map[string]any {
	base := map[string]any{"sessionId": r.sessionID, "sessionStudentId": r.sessionStudent["id"]}
	for key, value := range metadata {
		base[key] = value
	}
	return map[string]any{
		"id": ids.Record(), "operationId": r.operationID, "batchId": batch["id"],
		"studentId": r.sessionStudent["studentId"], "creditTypeId": batch["creditTypeId"],
		"eventType": eventType, "quantityDelta": delta, "bucketFrom": from, "bucketTo": to,
		"balanceSnapshot": balanceSnapshot(batch), "businessTime": r.at, "actorId": r.actorID,
		"reason": reason, "metadata": base,
	}
}

// movementPlan is reservationMovementPlan: claim, update, events and allocation per movement.
// metadata adds event metadata; it gets "" for activation and the allocation id for the freeze.
func (r reservationSession) movementPlan(movements []reservationMovement, reservedFor any, reason string, metadata func(allocationID string) map[string]any) []step {
	plan := []step{}
	for _, movement := range movements {
		batch := movement.nextBatch
		id := jsx.String(batch["id"])
		plan = append(plan,
			versionClaim("credit_batch", id, movement.expectedVersion, r.operationID),
			update("credit_batches", id, map[string]any{
				"activatedAt": or(batch["activatedAt"], ""), "availableQuantity": batch["availableQuantity"],
				"effectiveExpiresAt": or(batch["effectiveExpiresAt"], ""), "frozenQuantity": batch["frozenQuantity"],
				"status": batch["status"], "version": batch["version"],
			}))
		if movement.activated {
			plan = append(plan, create("credit_events", r.creditEvent(movement.activationSnapshot, "ACTIVATE", 0, "", "", reason, metadata(""))))
		}
		plan = append(plan,
			create("credit_events", r.creditEvent(batch, "FREEZE", -movement.quantity, "availableQuantity", "frozenQuantity", reason, metadata(movement.allocationID))),
			create("session_credit_allocations", map[string]any{
				"id": movement.allocationID, "sessionStudentId": r.sessionStudent["id"], "batchId": batch["id"],
				"quantity": movement.quantity, "status": "reserved", "reservedForStartAt": reservedFor, "operationId": r.operationID,
			}))
	}
	return plan
}

// releaseFrozen is releaseFrozenQuantity: back to available, or expired when the batch already lapsed.
func releaseFrozen(batch map[string]any, quantity float64, at string) (map[string]any, string, error) {
	target := "availableQuantity"
	if expiry, ok, err := optionalDateOf(batch["effectiveExpiresAt"], "effectiveExpiresAt"); err != nil {
		return nil, "", err
	} else if ok {
		released, err := dateOf(at, "value")
		if err != nil {
			return nil, "", err
		}
		if released >= expiry {
			target = "expiredQuantity"
		}
	}
	moved, err := moveQuantity(batch, "frozenQuantity", target, quantity)
	if err != nil {
		return nil, "", err
	}
	moved["status"], err = deriveBatchStatus(moved)
	return moved, target, err
}

// validateReservedAllocation is settlement/reschedule's validateAllocation.
func validateReservedAllocation(allocation map[string]any, seen map[string]bool, batchCode, duplicateCode, duplicateMessage string) error {
	if allocation["status"] != "reserved" {
		return Fail("SESSION_ALLOCATION_NOT_RESERVED", "Only reserved allocations can be settled", nil)
	}
	if id, _ := allocation["id"].(string); id == "" {
		return Fail("SESSION_ALLOCATION_ID_REQUIRED", "Session allocation id is required", nil)
	}
	batchID, _ := allocation["batchId"].(string)
	if batchID == "" {
		return Fail(batchCode, "Session allocation batchId is required", nil)
	}
	if _, err := nonNegativeQuantity(allocation["quantity"], "allocation.quantity"); err != nil {
		return err
	}
	if allocation["quantity"].(float64) <= 0 {
		return Fail("INVALID_CREDIT_QUANTITY", "Allocation quantity must be greater than zero", nil)
	}
	if seen[batchID] {
		return Fail(duplicateCode, duplicateMessage, nil)
	}
	seen[batchID] = true
	return nil
}

// cancellationReleasePlan is buildStudentSettlementRequests for a cancelled appointment session:
// every reserved allocation is released back to its batch.
func cancellationReleasePlan(session, sessionStudent map[string]any, allocations []map[string]any, batches map[string]map[string]any, operationID, at, actorID string) ([]step, error) {
	if sessionStudent["creditStatus"] != "reserved" {
		return nil, Fail("SESSION_STUDENT_NOT_RESERVED", "Session student must have reserved credit before settlement", nil)
	}
	if len(allocations) == 0 {
		return nil, Fail("SESSION_ALLOCATION_REQUIRED", "Reserved session credit allocations are required", nil)
	}
	ruleVersion, err := cancelledSettlementVersion(session, sessionStudent)
	if err != nil {
		return nil, err
	}
	context := reservationSession{sessionID: jsx.String(session["id"]), sessionStudent: sessionStudent, operationID: operationID, at: at, actorID: actorID}
	plan := []step{}
	seen := map[string]bool{}
	for _, allocation := range allocations {
		if err := validateReservedAllocation(allocation, seen, "SETTLEMENT_BATCH_ID_REQUIRED",
			"DUPLICATE_SETTLEMENT_BATCH", "A batch can appear only once per student settlement"); err != nil {
			return nil, err
		}
		record := batches[jsx.String(allocation["batchId"])]
		if record == nil {
			return nil, Fail("SETTLEMENT_BATCH_NOT_FOUND", "Reserved allocation batch was not found", map[string]any{"batchId": allocation["batchId"]})
		}
		if record["studentId"] != sessionStudent["studentId"] {
			return nil, Fail("SETTLEMENT_BATCH_STUDENT_MISMATCH", "Allocation batch belongs to another student", nil)
		}
		batch := normalizeBookingBatch(record, map[string]any{"kind": "course", "consumable": true})
		quantity := allocation["quantity"].(float64)
		next, target, err := releaseFrozen(batch, quantity, at)
		if err != nil {
			return nil, err
		}
		version := positiveVersion(batch["version"])
		next["version"] = version + 1
		status := "released"
		if target == "expiredQuantity" {
			status = "expired"
		}
		id := jsx.String(next["id"])
		plan = append(plan,
			versionClaim("credit_batch", id, version, operationID),
			update("credit_batches", id, map[string]any{
				"availableQuantity": next["availableQuantity"], "consumedQuantity": next["consumedQuantity"],
				"expiredQuantity": next["expiredQuantity"], "frozenQuantity": next["frozenQuantity"],
				"status": next["status"], "version": next["version"],
			}),
			update("session_credit_allocations", jsx.String(allocation["id"]), map[string]any{"status": status}),
			create("credit_events", context.creditEvent(next, "RELEASE", quantity, "frozenQuantity", target, "session_settlement", map[string]any{
				"allocationId": allocation["id"], "attendanceStatus": sessionStudent["attendanceStatus"],
				"immediateExpiry": target == "expiredQuantity", "ruleSource": "institution_cancelled", "ruleVersion": ruleVersion,
			})))
	}
	version := positiveVersion(sessionStudent["version"])
	studentID := jsx.String(sessionStudent["id"])
	return append(plan,
		versionClaim("session_student", studentID, version, operationID),
		update("session_students", studentID, map[string]any{"creditStatus": "released", "settledAt": at, "version": version + 1}),
	), nil
}

// cancelledSettlementVersion is settlementDecision for a cancelled session: rule snapshots must be valid.
func cancelledSettlementVersion(session, sessionStudent map[string]any) (any, error) {
	if _, ok := sessionStudent["attendanceStatus"].(string); !ok {
		return nil, Fail("ATTENDANCE_STATUS_REQUIRED", "Session student attendance status is required", nil)
	}
	attendance, err := ruleSnapshot(session["attendanceRuleSnapshot"], "ATTENDANCE_RULE_SNAPSHOT_REQUIRED")
	if err != nil {
		return nil, err
	}
	settlement, err := ruleSnapshot(session["settlementRuleSnapshot"], "SETTLEMENT_RULE_SNAPSHOT_REQUIRED")
	if err != nil {
		return nil, err
	}
	for _, status := range []string{"present", "late", "leave", "absent"} {
		if err := settlementAction(attendance[status], status, "attendance"); err != nil {
			return nil, err
		}
	}
	if err := settlementAction(settlement["cancelled"], "cancelled", "settlement"); err != nil {
		return nil, err
	}
	return settlement["version"], nil
}

func ruleSnapshot(value any, code string) (map[string]any, error) {
	snapshot, ok := value.(map[string]any)
	if !ok || len(snapshot) == 0 {
		return nil, Fail(code, "Session requires an immutable rule snapshot", nil)
	}
	if !isInt(snapshot["version"]) || snapshot["version"].(float64) <= 0 {
		return nil, Fail("RULE_SNAPSHOT_VERSION_INVALID", "Rule snapshot version must be a positive integer", nil)
	}
	return snapshot, nil
}

func settlementAction(action any, status, source string) error {
	if action == "consume" || action == "release" {
		return nil
	}
	details := map[string]any{"source": source, "status": status}
	if action != nil {
		details["action"] = action
	}
	return Fail("SETTLEMENT_ACTION_INVALID", "Settlement action for "+status+" must be consume or release", details)
}

// rescheduleInput is planRescheduledStudent's input.
type rescheduleInput struct {
	session, sessionStudent, creditType map[string]any
	allocations, candidates             []map[string]any
	allocated                           map[string]map[string]any
	newStartAt, at, operationID         string
	actorID                             string
}

// rescheduleCreditPlan is buildRescheduleStudentRequests: keep allocations still valid at the new
// start, release the rest and freeze replacements FEFO. It reports whether credit stayed reserved.
func rescheduleCreditPlan(input rescheduleInput) ([]step, bool, error) {
	if input.sessionStudent["creditStatus"] != "reserved" {
		return nil, false, Fail("RESCHEDULE_STUDENT_NOT_RESERVED", "Only reserved session students require revalidation", nil)
	}
	required := input.session["requiredQuantity"]
	if !isInt(required) || required.(float64) <= 0 {
		return nil, false, Fail("SESSION_CREDIT_QUANTITY_INVALID", "Session required quantity must be a positive integer", nil)
	}
	if input.creditType["kind"] != "course" || input.creditType["consumable"] != true {
		return nil, false, Fail("SESSION_CREDIT_TYPE_INVALID", "Session must require an exact consumable course credit", nil)
	}
	if len(input.allocations) == 0 {
		return nil, false, Fail("SESSION_ALLOCATION_REQUIRED", "Reserved session credit allocations are required", nil)
	}
	// mergeBatchRecords: candidates in FEFO order, allocated batches overriding or appended.
	order := []string{}
	batches := map[string]map[string]any{}
	put := func(batch map[string]any) {
		id := jsx.String(batch["id"])
		if _, ok := batches[id]; !ok {
			order = append(order, id)
		}
		batches[id] = batch
	}
	for _, batch := range input.candidates {
		put(batch)
	}
	for _, allocation := range input.allocations {
		if batch := input.allocated[jsx.String(allocation["batchId"])]; batch != nil {
			put(batch)
		}
	}
	context := reservationSession{sessionID: jsx.String(input.session["id"]), sessionStudent: input.sessionStudent,
		operationID: input.operationID, at: input.at, actorID: input.actorID}
	metadata := func(allocationID any) map[string]any {
		return map[string]any{"allocationId": allocationID, "newStartAt": input.newStartAt, "oldStartAt": input.session["startAt"]}
	}
	retained, released := []step{}, []step{}
	retainedQuantity := 0.0
	seen := map[string]bool{}
	for _, allocation := range input.allocations {
		if err := validateReservedAllocation(allocation, seen, "RESCHEDULE_BATCH_ID_REQUIRED",
			"DUPLICATE_RESCHEDULE_BATCH", "A batch can appear only once per student revalidation"); err != nil {
			return nil, false, err
		}
		batchID := jsx.String(allocation["batchId"])
		record := batches[batchID]
		if record == nil {
			return nil, false, Fail("RESCHEDULE_BATCH_NOT_FOUND", "Reserved allocation batch was not found", nil)
		}
		if record["studentId"] != input.sessionStudent["studentId"] {
			return nil, false, Fail("RESCHEDULE_BATCH_STUDENT_MISMATCH", "Allocation batch belongs to another student", nil)
		}
		batch := normalizeBookingBatch(record, input.creditType)
		quantity := allocation["quantity"].(float64)
		valid, err := serviceTimeValid(batch, input.newStartAt)
		if err != nil {
			return nil, false, err
		}
		if valid {
			retainedQuantity += quantity
			retained = append(retained, update("session_credit_allocations", jsx.String(allocation["id"]),
				map[string]any{"reservedForStartAt": input.newStartAt}))
			continue
		}
		next, target, err := releaseFrozen(batch, quantity, input.at)
		if err != nil {
			return nil, false, err
		}
		version := positiveVersion(batch["version"])
		next["version"] = float64(version + 1)
		batches[batchID] = next
		status := "released"
		if target == "expiredQuantity" {
			status = "expired"
		}
		released = append(released,
			versionClaim("credit_batch", batchID, version, input.operationID),
			update("credit_batches", batchID, map[string]any{
				"availableQuantity": next["availableQuantity"], "expiredQuantity": next["expiredQuantity"],
				"frozenQuantity": next["frozenQuantity"], "status": next["status"], "version": next["version"],
			}),
			update("session_credit_allocations", jsx.String(allocation["id"]), map[string]any{"status": status}),
			create("credit_events", context.creditEvent(next, "RELEASE", quantity, "frozenQuantity", target, "session_reschedule", metadata(allocation["id"]))))
	}
	if retainedQuantity > required.(float64) {
		return nil, false, Fail("RESCHEDULE_ALLOCATION_EXCESS", "Retained allocation exceeds session requirement", nil)
	}
	plan := append(retained, released...)
	reserved := true
	if remaining := required.(float64) - retainedQuantity; remaining > 0 {
		values := make([]map[string]any, len(order))
		for i, id := range order {
			values[i] = batches[id]
		}
		reservation, err := planReservation(values, remaining, reservationContext{creditType: input.creditType, now: input.at,
			creditTypeID: jsx.String(input.session["requiredCreditTypeId"]), sessionStart: input.newStartAt})
		if err != nil {
			return nil, false, err
		}
		reserved = reservation.missing == 0
		if reserved {
			movements, err := buildReservationMovements(reservation)
			if err != nil {
				return nil, false, err
			}
			plan = append(plan, context.movementPlan(movements, input.newStartAt, "session_reschedule", func(allocationID string) map[string]any {
				return metadata(allocationID)
			})...)
		}
	}
	status, reason := "reserved", ""
	if !reserved {
		status, reason = "credit_insufficient", "reschedule_credit_insufficient"
	}
	version := positiveVersion(input.sessionStudent["version"])
	studentID := jsx.String(input.sessionStudent["id"])
	return append(plan,
		versionClaim("session_student", studentID, version, input.operationID),
		update("session_students", studentID, map[string]any{"creditStatus": status, "eligibilityReason": reason, "version": version + 1}),
	), reserved, nil
}

// commerceID is commerce/planning's id(): a short hash of the JSON-encoded parts.
func commerceID(parts ...any) string {
	sum := sha256.Sum256([]byte(stableJSON(parts)))
	return hex.EncodeToString(sum[:])[:15]
}

// cashQuote is reservationQuote's result for credit bought through commerce checkout.
type cashQuote struct {
	fee, refundable, paid float64
	receivedAt            string
	policyVersion         any
	order, batch          map[string]any
	allocation            map[string]any
	institution           bool
}

// reservationQuote prices cancelling a reservation paid in cash; nil when the credit was not bought online.
func reservationQuote(app core.App, appointment map[string]any, allocations []map[string]any, batches map[string]map[string]any, at string, institution bool) (*cashQuote, error) {
	cash := []map[string]any{}
	for _, allocation := range allocations {
		snapshot, _ := batches[jsx.String(allocation["batchId"])]["grantSnapshot"].(map[string]any)
		if jsx.Truthy(snapshot["commerceOrderId"]) {
			cash = append(cash, allocation)
		}
	}
	if len(cash) == 0 {
		return nil, nil
	}
	if len(allocations) != 1 || len(cash) != 1 || cash[0]["quantity"] != 1.0 {
		return nil, Fail("CASH_RESERVATION_ALLOCATION_INVALID", "预约金额分摊需要人工核对", nil)
	}
	allocation := cash[0]
	batch := batches[jsx.String(allocation["batchId"])]
	snapshot := batch["grantSnapshot"].(map[string]any)
	order, err := get(app, "commerce_orders", jsx.String(snapshot["commerceOrderId"]))
	if err != nil {
		return nil, err
	}
	data, _ := order["data"].(map[string]any)
	policy, _ := data["policy"].(map[string]any)
	grant, _ := data["grantResult"].(map[string]any)
	granted := false
	for _, item := range anyList(grant["batches"]) {
		if entry, _ := item.(map[string]any); entry["batchId"] == batch["id"] {
			granted = true
		}
	}
	if order["studentId"] != appointment["studentId"] || batch["studentId"] != appointment["studentId"] ||
		order["status"] != "completed" || policy["reservationRefund"] != "cash" ||
		grant["operationId"] != batch["sourceOperationId"] || !granted {
		return nil, Fail("CASH_RESERVATION_SOURCE_MISMATCH", "预约课时来源需要核对", nil)
	}
	var line map[string]any
	for _, item := range anyList(data["allocations"]) {
		if entry, _ := item.(map[string]any); entry["creditTypeId"] == batch["creditTypeId"] {
			line = entry
			break
		}
	}
	frozen, _ := batch["frozenQuantity"].(float64)
	if line == nil || line["quantity"] != batch["originalQuantity"] || frozen < 1 {
		return nil, Fail("CASH_RESERVATION_BALANCE_MISMATCH", "预约课时余额需要核对", nil)
	}
	// Each retired unit gets its original paid allocation, never the undiscounted list price.
	paid := math.Floor(jsx.Number(line["paidMinor"]) / jsx.Number(line["quantity"]))
	quote, err := cancellationQuote(policy, appointment["requestedStartAt"], at, paid, institution)
	if err != nil {
		return nil, err
	}
	available := jsx.Number(jsx.Get(data, "amount")) - jsx.Number(jsx.Get(data, "refunded")) - jsx.Number(or(data["refundReservedAmount"], 0.0))
	if !(quote.refundable <= available) {
		return nil, Fail("CASH_REFUND_PRINCIPAL_CONFLICT", "当前可退本金需要核对", nil)
	}
	quote.paid, quote.order, quote.batch, quote.allocation, quote.institution = paid, order, batch, allocation, institution
	return quote, nil
}

func anyList(value any) []any {
	items, _ := value.([]any)
	return items
}

// cancellationQuote applies the order's cancellation tiers to the paid amount.
func cancellationQuote(policy map[string]any, startAt any, receivedAt string, paidMinor float64, institution bool) (*cashQuote, error) {
	if err := validateCommercePolicy(policy); err != nil {
		return nil, err
	}
	if !isInt(paidMinor) || paidMinor < 0 || paidMinor > 9007199254740991 {
		return nil, Fail("INVALID_COMMERCE_AMOUNT", "金额无效", nil)
	}
	start, ok1 := millis(startAt)
	received, ok2 := millis(receivedAt)
	if !ok1 || !ok2 {
		return nil, Fail("INVALID_CANCELLATION_TIME", "取消时间无效", nil)
	}
	delta := start - received
	feeBps := 0.0
	if !institution {
		feeBps = 10000
		for _, item := range anyList(policy["cancellationTiers"]) {
			tier, _ := item.(map[string]any)
			if float64(delta) >= jsx.Number(tier["beforeMinutes"])*minuteMillis {
				feeBps = tier["feeBps"].(float64)
				break
			}
		}
	}
	fee := math.Floor(paidMinor * feeBps / 10000)
	return &cashQuote{fee: fee, refundable: paidMinor - fee, receivedAt: receivedAt, policyVersion: policy["version"]}, nil
}

// validateCommercePolicy is commerce/planning's validatePolicy.
func validateCommercePolicy(policy map[string]any) error {
	if policy == nil || policy["packageRefund"] != "unused_paid_value" || !isInt(policy["version"]) || policy["version"].(float64) <= 0 {
		return Fail("COMMERCE_POLICY_REQUIRED", "课程尚未发布退费规则", nil)
	}
	tiers, ok := policy["cancellationTiers"].([]any)
	if !ok {
		return Fail("INVALID_CANCELLATION_TIERS", "取消规则无效", nil)
	}
	if policy["reservationRefund"] == "cash" {
		last, _ := lastOf(tiers).(map[string]any)
		if len(tiers) == 0 || last["beforeMinutes"] != 0.0 {
			return Fail("INVALID_CANCELLATION_TIERS", "请配置直至开课时的取消规则", nil)
		}
	}
	previousMinutes, previousFee := math.Inf(1), -1.0
	for _, item := range tiers {
		tier, _ := item.(map[string]any)
		minutes, fee := tier["beforeMinutes"], tier["feeBps"]
		if !isInt(minutes) || minutes.(float64) < 0 || minutes.(float64) >= previousMinutes ||
			!isInt(fee) || fee.(float64) < previousFee || fee.(float64) > 10000 || fee.(float64) < 0 {
			return Fail("INVALID_CANCELLATION_TIERS", "取消规则必须按提前时间递减、扣费比例递增", nil)
		}
		previousMinutes, previousFee = minutes.(float64), fee.(float64)
	}
	return nil
}

func lastOf(items []any) any {
	if len(items) == 0 {
		return nil
	}
	return items[len(items)-1]
}

// cashCancellationPlan reverses the paid unit and reserves its refund on the commerce order.
func cashCancellationPlan(quote *cashQuote, appointment, student, input map[string]any, operationID, at string) ([]step, map[string]any, error) {
	role := input["actorRole"]
	if role == "student" || (role == "admin" && !quote.institution) {
		if input["expectedRefundAmount"] != quote.refundable || input["expectedFee"] != quote.fee {
			return nil, nil, Fail("CANCELLATION_QUOTE_CHANGED", "取消扣费或退款金额已变化，请重新确认", nil)
		}
	}
	batch, order := quote.batch, quote.order
	version := batch["version"].(float64)
	next := copyMap(batch)
	next["frozenQuantity"] = batch["frozenQuantity"].(float64) - 1
	next["reversedQuantity"] = jsx.Number(or(batch["reversedQuantity"], 0.0)) + 1
	next["version"] = version + 1
	status, err := deriveBatchStatus(next)
	if err != nil {
		return nil, nil, err
	}
	next["status"] = status
	appointmentID := jsx.String(appointment["id"])
	refundID := commerceID("reservation-refund", appointmentID)
	studentVersion := student["version"].(float64)
	data := copyMap(order["data"].(map[string]any))
	pending := data["pendingRefundCount"]
	if pending == nil {
		pending = 0.0
		if jsx.Truthy(data["refundPending"]) {
			pending = 1.0
		}
	}
	due := 0.0
	if quote.refundable > 0 {
		due = 1
	}
	data["cancellationFees"] = jsx.Number(or(data["cancellationFees"], 0.0)) + quote.fee
	data["refundPending"] = orChain(data["refundPending"], quote.refundable > 0)
	data["pendingRefundCount"] = jsx.Number(pending) + due
	data["refundReservedAmount"] = jsx.Number(or(data["refundReservedAmount"], 0.0)) + quote.refundable
	orderVersion := order["version"].(float64)
	orderID := jsx.String(order["id"])
	batchID := jsx.String(batch["id"])
	plan := []step{
		versionClaim("credit_batch", batchID, int(version), operationID),
		update("credit_batches", batchID, map[string]any{"frozenQuantity": next["frozenQuantity"], "reversedQuantity": next["reversedQuantity"],
			"status": status, "version": next["version"]}),
		update("session_credit_allocations", jsx.String(quote.allocation["id"]), map[string]any{"status": "reversed"}),
		create("credit_events", map[string]any{"id": ids.Record(), "operationId": operationID, "batchId": batch["id"],
			"studentId": batch["studentId"], "creditTypeId": batch["creditTypeId"], "eventType": "REVERSE", "quantityDelta": -1,
			"bucketFrom": "frozenQuantity", "bucketTo": "reversedQuantity", "balanceSnapshot": balanceSnapshot(next),
			"businessTime": at, "actorId": input["actorId"], "reason": input["reason"],
			"metadata": map[string]any{"source": "reservation_cash_cancellation", "appointmentId": appointmentID,
				"fee": quote.fee, "refundAmount": quote.refundable, "policyVersion": quote.policyVersion}}),
		versionClaim("session_student", jsx.String(student["id"]), int(studentVersion), operationID),
		update("session_students", jsx.String(student["id"]), map[string]any{"creditStatus": "reversed", "settledAt": at, "version": studentVersion + 1}),
		create("commerce_claims", map[string]any{"id": commerceID("commerce_orders", orderID, orderVersion),
			"key": "commerce_orders:" + orderID + ":" + jsx.String(orderVersion)}),
		update("commerce_orders", orderID, map[string]any{"data": data, "version": orderVersion + 1}),
		create("commerce_audit", map[string]any{"id": commerceID("cancel-audit", appointmentID), "subjectId": orderID,
			"actorId": input["actorId"], "action": "reservation_cancelled", "data": map[string]any{
				"reason": input["reason"], "appointmentId": appointmentID, "fee": quote.fee, "amount": quote.refundable,
				"institution": quote.institution, "policy": order["data"].(map[string]any)["policy"],
				"receivedAt": quote.receivedAt, "createdAt": at}}),
	}
	refund := map[string]any{"amount": quote.refundable, "fee": quote.fee, "currency": "CNY", "refundId": nil, "status": "not_due"}
	if quote.refundable > 0 {
		plan = append(plan, create("commerce_refunds", map[string]any{"id": refundID, "orderId": orderID, "studentId": order["studentId"],
			"status": "processing", "version": 1, "data": map[string]any{"amount": quote.refundable, "kind": "reservation",
				"appointmentId": appointmentID, "gatewayId": "", "held": []any{},
				"actor": map[string]any{"id": input["actorId"], "role": input["actorRole"], "reason": input["reason"]},
				"fee":   quote.fee, "createdAt": at, "attempt": 0}}))
		refund["refundId"], refund["status"] = refundID, "processing"
	}
	return plan, refund, nil
}
