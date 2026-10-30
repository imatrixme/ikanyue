package coursecredit

import (
	"math"

	"kanyue.server/internal/jsx"
)

// Refund requests: what an online order owes back and which credit it holds
// meanwhile. Settling the money is the payment plugin's job (or the studio's,
// offline); the order center books the outcome.

type refundQuote struct {
	amount  float64
	lines   []any
	blocked bool
	message string
	order   map[string]any
	batches []map[string]any
}

// public is the quote students and ops see.
func (q *refundQuote) public() map[string]any {
	return map[string]any{"amount": q.amount, "currency": "CNY", "lines": q.lines, "blocked": q.blocked, "message": q.message}
}

func (c *orderCenter) refundPreview(studentID, orderID string) (*refundQuote, error) {
	order, err := c.owned(studentID, orderID)
	if err != nil {
		return nil, err
	}
	product := asMap(order["productSnapshot"])
	if product["origin"] != "gateway" {
		return nil, Fail("OFFLINE_REFUND_MANUAL_ONLY", "历史线下款项需要人工核对", nil)
	}
	if order["status"] != "granted" || jsx.Number(order["pendingRefundCount"]) > 0 {
		return nil, Fail("REFUND_NOT_READY", "订单尚未完成或已有退款正在处理", nil)
	}
	grant, err := fulfillment(c.app, orderID)
	if err != nil {
		return nil, err
	}
	batches := []map[string]any{}
	for _, item := range anyList(grant["batches"]) {
		batch, err := get(c.app, "credit_batches", recordID(asMap(item)["batchId"]))
		if err != nil {
			return nil, err
		}
		if batch["studentId"] != studentID || batch["sourceOperationId"] != grant["operationId"] {
			return nil, Fail("REFUND_BATCH_MISMATCH", "课时来源不一致，需要人工核对", nil)
		}
		batches = append(batches, batch)
	}
	if len(batches) == 0 {
		return nil, Fail("REFUND_BATCH_MISSING", "尚未查到可核对的课时", nil)
	}
	blocked := false
	for _, batch := range batches {
		blocked = blocked || jsx.Number(batch["frozenQuantity"]) > 0
	}
	lines := make([]any, len(batches))
	total := 0.0
	for i, batch := range batches {
		var allocation map[string]any
		for _, item := range anyList(product["allocations"]) {
			if line := asMap(item); line["creditTypeId"] == batch["creditTypeId"] {
				allocation = line
				break
			}
		}
		if allocation == nil || allocation["quantity"] != batch["originalQuantity"] {
			return nil, Fail("REFUND_ALLOCATION_MISMATCH", "金额分摊需要人工核对", nil)
		}
		available := jsx.Number(batch["availableQuantity"])
		amount := math.Floor(jsx.Number(allocation["paidMinor"]) * available / jsx.Number(allocation["quantity"]))
		lines[i] = map[string]any{"batchId": batch["id"], "quantity": batch["availableQuantity"], "amount": amount}
		total += amount
	}
	amount := math.Min(jsx.Number(product["paidMinor"])-jsx.Number(order["refundedMinor"]), total)
	message := "按购买时的实付金额退还未使用部分"
	if blocked {
		message = "请先处理已预约课程，再退剩余课时"
	}
	return &refundQuote{amount: math.Max(0, amount), lines: lines, blocked: blocked, message: message,
		order: order, batches: batches}, nil
}

// sameActor is the replay check that a refund was requested by the same operator for the same reason.
func sameActor(row, actor map[string]any) bool {
	if actor == nil {
		return true
	}
	stored := asMap(row["actor"])
	return stored["id"] == actor["id"] && stored["reason"] == actor["reason"]
}

// requestRefund withdraws the order's remaining credit and records what it owes back.
// actor is nil when the student asks; ops pass {id, role, reason}.
func (c *orderCenter) requestRefund(studentID, orderID string, key, expectedAmount any, actor map[string]any) (map[string]any, error) {
	text, ok := key.(string)
	if !ok || !commerceKey.MatchString(text) {
		return nil, Fail("REFUND_KEY_REQUIRED", "请重新提交退款申请", nil)
	}
	if !isSafeInt(expectedAmount) || expectedAmount.(float64) <= 0 {
		return nil, Fail("REFUND_QUOTE_REQUIRED", "请先确认预计退款金额", nil)
	}
	refundID := commerceID("commerce-refund", studentID, orderID, text)
	existing, err := findFirst(c.app, "order_refunds", `id="`+escape(refundID)+`"`)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		if existing["amountMinor"] != expectedAmount || !sameActor(existing, actor) {
			return nil, Fail("REFUND_REQUEST_CONFLICT", "退款申请与原请求不一致", nil)
		}
	} else if err := c.withdrawForRefund(studentID, orderID, refundID, expectedAmount, actor); err != nil {
		return nil, err
	}
	return c.refundDetail(studentID, refundID)
}

func (c *orderCenter) withdrawForRefund(studentID, orderID, refundID string, expectedAmount any, actor map[string]any) error {
	quote, err := c.refundPreview(studentID, orderID)
	if err != nil {
		return err
	}
	switch {
	case quote.blocked:
		return Fail("REFUND_HAS_RESERVATIONS", quote.message, nil)
	case !(quote.amount > 0):
		return Fail("NO_REFUNDABLE_AMOUNT", "当前没有可退金额", nil)
	case quote.amount != expectedAmount:
		return Fail("REFUND_QUOTE_CHANGED", "可退金额已变化，请重新确认", nil)
	}
	operationID := commerceID("refund-withdraw", refundID)
	at := iso(clock())
	held := []any{}
	withdrawn := []map[string]any{}
	for _, batch := range quote.batches {
		if jsx.Number(batch["availableQuantity"]) > 0 {
			held = append(held, map[string]any{"id": batch["id"], "quantity": batch["availableQuantity"], "status": batch["status"]})
			withdrawn = append(withdrawn, batch)
		}
	}
	reason, requester := "refund_entitlements_withdrawn", map[string]any{"id": studentID, "role": "student", "reason": "退还剩余课时"}
	if actor != nil {
		reason, requester = jsx.String(or(actor["reason"], reason)), actor
	}
	plan := []step{
		auditOperation(operationID, quote.order, reason, at, actor),
		create("order_refunds", map[string]any{"id": refundID, "orderId": orderID, "studentId": studentID, "kind": "package",
			"status": "processing", "settlement": refundSettlement(c.app), "amountMinor": quote.amount, "feeMinor": 0,
			"held": held, "actor": requester, "version": 1}),
	}
	plan = append(plan, orderUpdate(quote.order, operationID, map[string]any{"pendingRefundCount": 1, "refundReservedMinor": quote.amount})...)
	if actor != nil {
		plan = append(plan, create("order_audit", map[string]any{"id": commerceID("refund-audit", refundID),
			"subjectId": orderID, "actorId": actor["id"], "action": "refund_requested", "data": map[string]any{
				"reason": actor["reason"], "refundId": refundID, "amount": quote.amount, "role": actor["role"], "createdAt": at}}))
	}
	for _, batch := range withdrawn {
		movement, err := refundMovement(batch, operationID, at, jsx.Number(batch["availableQuantity"]), false, nil, actor)
		if err != nil {
			return err
		}
		plan = append(plan, movement...)
	}
	if err := send(c.app, plan); err != nil {
		replay, findErr := findFirst(c.app, "order_refunds", `id="`+escape(refundID)+`"`)
		if findErr != nil || replay == nil || replay["amountMinor"] != expectedAmount || !sameActor(replay, actor) {
			return err
		}
	}
	return nil
}

// refundMovement withdraws credit into reversedQuantity, or restores it when the refund failed.
func refundMovement(batch map[string]any, operationID, at string, quantity float64, restore bool, originalStatus any, actor map[string]any) ([]step, error) {
	expired := false
	if restore && jsx.Truthy(batch["effectiveExpiresAt"]) {
		expiresAt, ok1 := millis(batch["effectiveExpiresAt"])
		now, ok2 := millis(at)
		expired = ok1 && ok2 && expiresAt <= now
	}
	target := "availableQuantity"
	if expired {
		target = "expiredQuantity"
	}
	version := jsx.Number(batch["version"])
	next := copyMap(batch)
	next["version"] = version + 1
	if restore {
		if !(jsx.Number(batch["reversedQuantity"]) >= quantity) {
			return nil, Fail("REFUND_RESTORE_CONFLICT", "退款课时恢复需要人工核对", nil)
		}
		next["reversedQuantity"] = jsx.Number(next["reversedQuantity"]) - quantity
		next[target] = jsx.Number(or(next[target], 0.0)) + quantity
		next["status"] = originalStatus
		if expired {
			next["status"] = "expired"
		}
	} else {
		next["availableQuantity"] = jsx.Number(next["availableQuantity"]) - quantity
		next["reversedQuantity"] = jsx.Number(or(next["reversedQuantity"], 0.0)) + quantity
		next["status"] = "cancelled"
	}
	changes := map[string]any{"availableQuantity": next["availableQuantity"], "expiredQuantity": or(next["expiredQuantity"], 0.0),
		"reversedQuantity": next["reversedQuantity"], "version": next["version"]}
	if next["status"] != nil {
		changes["status"] = next["status"]
	}
	eventType, delta, from, to := "REVERSE", -quantity, "availableQuantity", "reversedQuantity"
	reason := "申请退款，暂停剩余课程权益"
	if restore {
		eventType, delta, from, to = "ADJUST", quantity, "reversedQuantity", target
		reason = "退款失败，恢复课程权益"
	}
	actorID := batch["studentId"]
	if actor != nil {
		actorID, reason = or(actor["id"], actorID), jsx.String(or(actor["reason"], reason))
	}
	batchID := jsx.String(batch["id"])
	return []step{
		create("credit_version_claims", map[string]any{"id": commerceID("batch-claim", batchID, version), "entityType": "credit_batch",
			"entityId": batchID, "expectedVersion": version, "operationId": operationID}),
		update("credit_batches", batchID, changes),
		create("credit_events", map[string]any{"id": commerceID("refund-event", operationID, batchID), "operationId": operationID,
			"batchId": batchID, "studentId": batch["studentId"], "creditTypeId": batch["creditTypeId"], "eventType": eventType,
			"quantityDelta": delta, "bucketFrom": from, "bucketTo": to, "balanceSnapshot": balanceSnapshot(next),
			"businessTime": at, "actorId": actorID, "reason": reason,
			"metadata": map[string]any{"source": "commerce_refund", "pendingWithdrawal": !restore}}),
	}, nil
}

func (c *orderCenter) refundDetail(studentID, refundID string) (map[string]any, error) {
	row, err := get(c.app, "order_refunds", refundID)
	if err != nil {
		return nil, err
	}
	if row["studentId"] != studentID {
		return nil, Fail("COMMERCE_ORDER_FORBIDDEN", "不能查看其他学员的退款", nil)
	}
	return refundView(row), nil
}

func refundView(row map[string]any) map[string]any {
	return map[string]any{"id": row["id"], "orderId": row["orderId"], "status": row["status"],
		"amount": row["amountMinor"], "createdAt": createdAt(row)}
}
