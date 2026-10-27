package coursecredit

import (
	"math"

	"kanyue.server/internal/jsx"
)

// Hono's CommerceRefundService: refunding the unused part of an online order.

type refundQuote struct {
	amount      float64
	lines       []any
	blocked     bool
	message     string
	transaction map[string]any
	order       map[string]any
	batches     []map[string]any
}

// public is the quote students and ops see.
func (q *refundQuote) public() map[string]any {
	return map[string]any{"amount": q.amount, "currency": "CNY", "lines": q.lines, "blocked": q.blocked, "message": q.message}
}

func (c *commerce) refundPreview(studentID, orderID string) (*refundQuote, error) {
	transaction, err := c.owned(studentID, orderID)
	if err != nil {
		return nil, err
	}
	order, err := get(c.app, "orders", orderID)
	if err != nil {
		return nil, err
	}
	if asMap(order["productSnapshot"])["origin"] != "gateway" {
		return nil, Fail("OFFLINE_REFUND_MANUAL_ONLY", "历史线下款项需要人工核对", nil)
	}
	data := asMap(transaction["data"])
	if transaction["status"] != "completed" || jsx.Truthy(data["refundPending"]) {
		return nil, Fail("REFUND_NOT_READY", "订单尚未完成或已有退款正在处理", nil)
	}
	grant := asMap(data["grantResult"])
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
		for _, item := range anyList(data["allocations"]) {
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
	amount := math.Min(jsx.Number(data["amount"])-jsx.Number(data["refunded"]), total)
	message := "按购买时的实付金额退还未使用部分"
	if blocked {
		message = "请先处理已预约课程，再退剩余课时"
	}
	return &refundQuote{amount: math.Max(0, amount), lines: lines, blocked: blocked, message: message,
		transaction: transaction, order: order, batches: batches}, nil
}

// sameActor is the replay check that a refund was requested by the same operator for the same reason.
func sameActor(data, actor map[string]any) bool {
	if actor == nil {
		return true
	}
	stored := asMap(data["actor"])
	return stored["id"] == actor["id"] && stored["reason"] == actor["reason"]
}

// requestRefund withdraws the order's remaining credit and asks the gateway to refund its value.
// actor is nil when the student asks; ops pass {id, role, reason}.
func (c *commerce) requestRefund(studentID, orderID string, key, expectedAmount any, actor map[string]any) (map[string]any, error) {
	text, ok := key.(string)
	if !ok || !commerceKey.MatchString(text) {
		return nil, Fail("REFUND_KEY_REQUIRED", "请重新提交退款申请", nil)
	}
	if !isSafeInt(expectedAmount) || expectedAmount.(float64) <= 0 {
		return nil, Fail("REFUND_QUOTE_REQUIRED", "请先确认预计退款金额", nil)
	}
	refundID := commerceID("commerce-refund", studentID, orderID, text)
	existing, err := findFirst(c.app, "commerce_refunds", `id="`+escape(refundID)+`"`)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		data := asMap(existing["data"])
		if data["amount"] != expectedAmount || !sameActor(data, actor) {
			return nil, Fail("REFUND_REQUEST_CONFLICT", "退款申请与原请求不一致", nil)
		}
	} else if err := c.withdrawForRefund(studentID, orderID, refundID, expectedAmount, actor); err != nil {
		return nil, err
	}
	if err := c.syncRefund(refundID); err != nil {
		return nil, err
	}
	return c.refundDetail(studentID, refundID)
}

func (c *commerce) withdrawForRefund(studentID, orderID, refundID string, expectedAmount any, actor map[string]any) error {
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
	data := copyMap(asMap(quote.transaction["data"]))
	data["refundPending"], data["pendingRefundCount"], data["refundReservedAmount"] = true, 1, quote.amount
	plan := []step{
		auditOperation(operationID, quote.order, reason, at, actor),
		create("commerce_refunds", map[string]any{"id": refundID, "orderId": orderID, "studentId": studentID,
			"status": "processing", "version": 1, "data": map[string]any{"amount": quote.amount, "gatewayId": "",
				"held": held, "createdAt": at, "actor": requester}}),
	}
	plan = append(plan, commerceUpdate("commerce_orders", quote.transaction, map[string]any{"data": data})...)
	if actor != nil {
		plan = append(plan, create("commerce_audit", map[string]any{"id": commerceID("refund-audit", refundID),
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
		replay, findErr := findFirst(c.app, "commerce_refunds", `id="`+escape(refundID)+`"`)
		if findErr != nil || replay == nil || asMap(replay["data"])["amount"] != expectedAmount || !sameActor(asMap(replay["data"]), actor) {
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

// pendingCount is reservationCancellation's pendingCount.
func pendingCount(data map[string]any) float64 {
	if count, ok := data["pendingRefundCount"]; ok && count != nil {
		return jsx.Number(count)
	}
	if jsx.Truthy(data["refundPending"]) {
		return 1
	}
	return 0
}

// syncRefund asks the gateway for the refund and books its final result.
func (c *commerce) syncRefund(refundID string) error {
	refund, err := get(c.app, "commerce_refunds", refundID)
	if err != nil {
		return err
	}
	if refund["status"] != "processing" {
		return nil
	}
	orderID := jsx.String(refund["orderId"])
	transaction, err := get(c.app, "commerce_orders", orderID)
	if err != nil {
		return err
	}
	data := asMap(refund["data"])
	paymentID := asMap(transaction["data"])["paymentId"]
	reference := jsx.String(orChain(data["gatewayReference"], refundID))
	var response map[string]any
	if !jsx.Truthy(data["gatewayId"]) {
		if response, err = c.gateway.refund(reference, paymentID, data["amount"]); err != nil {
			return err
		}
		next := copyMap(data)
		next["gatewayId"] = response["id"]
		if err := send(c.app, commerceUpdate("commerce_refunds", refund, map[string]any{"data": next})); err != nil {
			return err
		}
		if refund, err = get(c.app, "commerce_refunds", refundID); err != nil {
			return err
		}
		data = asMap(refund["data"])
	} else if response, err = c.gateway.refundStatus(jsx.String(data["gatewayId"])); err != nil {
		return err
	}
	if response["reference"] != reference || response["amount"] != data["amount"] || response["paymentId"] != paymentID {
		return Fail("REFUND_RECEIPT_MISMATCH", "退款结果需要核对", nil)
	}
	status := response["status"]
	if status != "succeeded" && status != "failed" {
		return nil
	}
	order, err := get(c.app, "orders", orderID)
	if err != nil {
		return err
	}
	if transaction, err = get(c.app, "commerce_orders", orderID); err != nil {
		return err
	}
	operationID := commerceID("refund-finalize", refundID, or(data["attempt"], 0))
	at := iso(clock())
	amount := jsx.Number(data["amount"])
	liability := data["kind"] == "reservation" && status == "failed"
	released := amount
	if liability {
		released = 0
	}
	orderData := copyMap(asMap(transaction["data"]))
	// A failed reservation refund stays owed, so it keeps its pending slot and reserved amount.
	pending := pendingCount(orderData)
	if !liability {
		pending--
	}
	pending = math.Max(0, pending)
	reserved := orderData["refundReservedAmount"]
	if reserved == nil {
		reserved = amount
	}
	refunded := jsx.Number(orderData["refunded"])
	if status == "succeeded" {
		refunded += amount
	}
	orderData["refundPending"], orderData["pendingRefundCount"] = pending > 0, pending
	orderData["refundReservedAmount"], orderData["refunded"] = math.Max(0, jsx.Number(reserved)-released), refunded
	plan := []step{auditOperation(operationID, order, "gateway_refund_"+jsx.String(status), at, nil)}
	plan = append(plan, commerceUpdate("commerce_refunds", refund, map[string]any{"status": status})...)
	plan = append(plan, commerceUpdate("commerce_orders", transaction, map[string]any{"data": orderData})...)
	if status == "succeeded" {
		plan = append(plan, create("payment_events", map[string]any{"id": commerceID("refund-payment-event", refundID),
			"orderId": order["id"], "providerEventId": "gateway-refund:" + jsx.String(response["id"]), "type": "refunded",
			"amount": amount / 100, "payloadHash": commerceID(response["id"], response["amount"])}))
	} else if !liability {
		for _, item := range anyList(data["held"]) {
			held := asMap(item)
			batch, err := get(c.app, "credit_batches", recordID(held["id"]))
			if err != nil {
				return err
			}
			movement, err := refundMovement(batch, operationID, at, jsx.Number(held["quantity"]), true, held["status"], nil)
			if err != nil {
				return err
			}
			plan = append(plan, movement...)
		}
	}
	return send(c.app, plan)
}

// retryLiability sends a failed reservation refund to the gateway again under a new reference.
func (c *commerce) retryLiability(refundID string, actor map[string]any) (map[string]any, error) {
	refund, err := get(c.app, "commerce_refunds", refundID)
	if err != nil {
		return nil, err
	}
	data := asMap(refund["data"])
	if refund["status"] != "failed" || data["kind"] != "reservation" {
		return nil, Fail("REFUND_RETRY_NOT_ALLOWED", "只有已确认失败的预约退款可以重试", nil)
	}
	attempt := jsx.Number(or(data["attempt"], 0.0)) + 1
	next := copyMap(data)
	next["attempt"], next["gatewayId"], next["gatewayReference"] = attempt, "", commerceID("refund-retry", refundID, attempt)
	plan := commerceUpdate("commerce_refunds", refund, map[string]any{"status": "processing", "data": next})
	plan = append(plan, create("commerce_audit", map[string]any{"id": commerceID("refund-retry-audit", refundID, attempt),
		"subjectId": refund["orderId"], "actorId": actor["id"], "action": "refund_retried",
		"data": map[string]any{"reason": actor["reason"], "refundId": refundID, "createdAt": iso(clock())}}))
	if err := send(c.app, plan); err != nil {
		return nil, err
	}
	if err := c.syncRefund(refundID); err != nil {
		return nil, err
	}
	return c.refundDetail(jsx.String(refund["studentId"]), refundID)
}

func (c *commerce) refundDetail(studentID, refundID string) (map[string]any, error) {
	row, err := get(c.app, "commerce_refunds", refundID)
	if err != nil {
		return nil, err
	}
	if row["studentId"] != studentID {
		return nil, Fail("COMMERCE_ORDER_FORBIDDEN", "不能查看其他学员的退款", nil)
	}
	result := map[string]any{"id": row["id"], "orderId": row["orderId"], "status": row["status"]}
	return pick(result, asMap(row["data"]), "amount", "createdAt"), nil
}

// recoverRefunds retries processing refunds, then acknowledges refund events already reflected locally.
func (c *commerce) recoverRefunds() (map[string]any, error) {
	rows, err := list(c.app, "commerce_refunds", `status="processing"`, "created")
	if err != nil {
		return nil, err
	}
	failed := 0
	for _, row := range rows {
		if c.syncRefund(jsx.String(row["id"])) != nil {
			failed++
		}
	}
	events, err := c.gatewayEvents("refund.")
	if err != nil {
		return nil, err
	}
	for _, event := range events {
		data := asMap(event["data"])
		row, err := c.refundByReference(jsx.String(asMap(data["payload"])["reference"]))
		if err != nil {
			return nil, err
		}
		if row == nil || (asMap(row["data"])["gatewayId"] == data["targetId"] && row["status"] != "processing") {
			if err := c.ack(event); err != nil {
				return nil, err
			}
		}
	}
	return map[string]any{"inspected": len(rows), "unresolved": failed}, nil
}

func (c *commerce) refundByReference(reference string) (map[string]any, error) {
	value := escape(reference)
	return findFirst(c.app, "commerce_refunds", `(id="`+value+`" || data.gatewayReference="`+value+`")`)
}
