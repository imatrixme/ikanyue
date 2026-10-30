package coursecredit

import (
	"math"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/jsx"
)

// The order center's commands for the payment plugin. The plugin reports money
// facts (received, failed, refunded); the order center decides what they mean
// for the order and its credit. Every command is idempotent, so the plugin can
// replay one after a crash before it records its own transaction state.

// Payable is what the payment plugin needs to collect an online order.
type Payable struct {
	OrderID, StudentID, Name, Currency string
	// PayerOpenID is the WeChat identity the order was placed with; empty on the mock channel.
	PayerOpenID string
	// Status is the order's online status: pending, granting, completed or failed.
	Status string
	// Amount is what the student pays, in fen.
	Amount float64
}

// PayableOrder is the online order a payment collects.
func PayableOrder(app core.App, orderID string) (Payable, error) {
	order, err := onlineOrder(app, orderID)
	if err != nil {
		return Payable{}, err
	}
	product := asMap(order["productSnapshot"])
	return Payable{OrderID: jsx.String(order["id"]), StudentID: jsx.String(order["studentId"]), Name: jsx.String(product["offerName"]),
		Currency: jsx.String(order["currency"]), PayerOpenID: jsx.String(order["payerOpenId"]), Status: onlineStatus(order),
		Amount: jsx.Number(product["paidMinor"])}, nil
}

// OrderPaid books a received payment of amount fen and grants the order's credit.
// A receipt that does not match the order stops fulfilment for finance to check.
func OrderPaid(app core.App, orderID, paymentRef string, amount float64, paidAt any) error {
	order, err := onlineOrder(app, orderID)
	if err != nil {
		return err
	}
	if amount != jsx.Number(asMap(order["productSnapshot"])["paidMinor"]) {
		return Fail("PAYMENT_RECEIPT_MISMATCH", "付款信息不一致，已暂停自动发课", nil)
	}
	if order["status"] == "granted" {
		return nil
	}
	now := clock()
	if order["status"] == "pending" || order["status"] == "failed" {
		operationID := commerceID("receipt", orderID)
		at := iso(now)
		plan := []step{auditOperation(operationID, order, "gateway_receipt", at, nil)}
		plan = append(plan, orderUpdate(order, operationID, map[string]any{"status": "paid", "paidAt": or(paidAt, at), "paymentRef": paymentRef})...)
		plan = append(plan, create("payment_events", map[string]any{"id": commerceID("payment_event", paymentRef),
			"orderId": orderID, "providerEventId": "gateway:" + paymentRef, "type": "paid",
			"amount": amount / 100, "payloadHash": commerceID(paymentRef, amount, order["currency"])}))
		if err := send(app, plan); err != nil {
			return err
		}
		if order, err = get(app, "orders", orderID); err != nil {
			return err
		}
	}
	if order["status"] != "paid" && order["status"] != "granted" {
		return Fail("ORDER_NOT_GRANTABLE", "订单状态需要核对", nil)
	}
	_, err = grantOrderCredits(app, orderID, Actor{ID: "gateway", Role: "service", IdempotencyKey: "commerce-grant-" + orderID}, now)
	return err
}

// OrderPaymentFailed marks an unpaid order failed once its payment closed without money.
func OrderPaymentFailed(app core.App, orderID string) error {
	order, err := onlineOrder(app, orderID)
	if err != nil || order["status"] != "pending" {
		return err
	}
	operationID := commerceID("payment-failed", orderID, order["version"])
	plan := []step{auditOperation(operationID, order, "gateway_payment_failed", iso(clock()), nil)}
	return send(app, append(plan, orderUpdate(order, operationID, map[string]any{"status": "failed"})...))
}

// Refund is a refund request as the payment plugin settles it.
type Refund struct {
	ID, OrderID, StudentID string
	// Kind is package (unused credit) or reservation (a cancelled paid lesson).
	Kind, Status, Settlement, CreatedAt string
	// Amount is what is owed back, in fen.
	Amount float64
}

func refundOf(row map[string]any) Refund {
	return Refund{ID: jsx.String(row["id"]), OrderID: jsx.String(row["orderId"]), StudentID: jsx.String(row["studentId"]),
		Kind: jsx.String(row["kind"]), Status: jsx.String(row["status"]), Settlement: jsx.String(row["settlement"]),
		CreatedAt: createdAt(row), Amount: jsx.Number(row["amountMinor"])}
}

// RefundOf is one refund request.
func RefundOf(app core.App, refundID string) (Refund, error) {
	row, err := get(app, "order_refunds", refundID)
	if err != nil {
		return Refund{}, err
	}
	return refundOf(row), nil
}

// OnlineRefunds are the refund requests settled online, oldest first, in any of statuses.
func OnlineRefunds(app core.App, statuses ...string) ([]Refund, error) {
	filter := `settlement="online"`
	if len(statuses) > 0 {
		matches := ""
		for i, status := range statuses {
			if i > 0 {
				matches += " || "
			}
			matches += `status="` + escape(status) + `"`
		}
		filter += " && (" + matches + ")"
	}
	rows, err := list(app, "order_refunds", filter, "created")
	if err != nil {
		return nil, err
	}
	refunds := make([]Refund, len(rows))
	for i, row := range rows {
		refunds[i] = refundOf(row)
	}
	return refunds, nil
}

// RefundSucceeded books money returned for a refund request; ref names the channel refund.
func RefundSucceeded(app core.App, refundID, ref string) error {
	return finishRefund(app, refundID, ref, true)
}

// RefundFailed books a refund the channel rejected. Package refunds give the
// withdrawn credit back; a reservation refund stays owed until it is retried.
func RefundFailed(app core.App, refundID, ref string) error {
	return finishRefund(app, refundID, ref, false)
}

func finishRefund(app core.App, refundID, ref string, succeeded bool) error {
	refund, err := get(app, "order_refunds", refundID)
	if err != nil {
		return err
	}
	if refund["status"] != "processing" {
		return nil
	}
	order, err := onlineOrder(app, jsx.String(refund["orderId"]))
	if err != nil {
		return err
	}
	status := "failed"
	if succeeded {
		status = "succeeded"
	}
	operationID := commerceID("refund-finalize", refundID, ref)
	at := iso(clock())
	amount := jsx.Number(refund["amountMinor"])
	// A failed reservation refund stays owed, so it keeps its pending slot and reserved amount.
	liability := refund["kind"] == "reservation" && !succeeded
	pending, released := jsx.Number(order["pendingRefundCount"]), amount
	if liability {
		released = 0
	} else {
		pending--
	}
	refunded := jsx.Number(order["refundedMinor"])
	if succeeded {
		refunded += amount
	}
	plan := []step{auditOperation(operationID, order, "gateway_refund_"+status, at, nil)}
	plan = append(plan, claimedUpdate("order_refunds", refund, map[string]any{"status": status})...)
	plan = append(plan, orderUpdate(order, operationID, map[string]any{"pendingRefundCount": math.Max(0, pending),
		"refundReservedMinor": math.Max(0, jsx.Number(order["refundReservedMinor"])-released), "refundedMinor": refunded})...)
	if succeeded {
		plan = append(plan, create("payment_events", map[string]any{"id": commerceID("refund-payment-event", refundID),
			"orderId": order["id"], "providerEventId": "gateway-refund:" + ref, "type": "refunded",
			"amount": amount / 100, "payloadHash": commerceID(ref, amount)}))
	} else if !liability {
		for _, item := range anyList(refund["held"]) {
			held := asMap(item)
			batch, err := get(app, "credit_batches", recordID(held["id"]))
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
	return send(app, plan)
}

// ReopenRefund owes a failed reservation refund again so the plugin can retry it.
// actor is {id, reason}.
func ReopenRefund(app core.App, refundID string, actor map[string]any) error {
	refund, err := get(app, "order_refunds", refundID)
	if err != nil {
		return err
	}
	if refund["status"] != "failed" || refund["kind"] != "reservation" || refund["settlement"] != "online" {
		return Fail("REFUND_RETRY_NOT_ALLOWED", "只有已确认失败的预约退款可以重试", nil)
	}
	plan := claimedUpdate("order_refunds", refund, map[string]any{"status": "processing"})
	plan = append(plan, create("order_audit", map[string]any{"id": commerceID("refund-retry-audit", refundID, refund["version"]),
		"subjectId": refund["orderId"], "actorId": actor["id"], "action": "refund_retried",
		"data": map[string]any{"reason": actor["reason"], "refundId": refundID, "createdAt": iso(clock())}}))
	return send(app, plan)
}

// OrderSummary is how money views name the order a payment belongs to.
type OrderSummary struct {
	Name, Status, CreatedAt string
	Amount                  float64
	// Student is {id, name, cellphone}.
	Student map[string]any
}

// OrderSummaries names the online orders among ids; unknown ids are left out.
func OrderSummaries(app core.App, ids []string) (map[string]*OrderSummary, error) {
	c := &orderCenter{app: app}
	result := map[string]*OrderSummary{}
	for _, id := range ids {
		if _, done := result[id]; done || id == "" {
			continue
		}
		summary, err := orderSummary(c, id)
		if err != nil {
			return nil, err
		}
		if summary != nil {
			result[id] = summary
		}
	}
	return result, nil
}

// StudentOrderView is the student's view of their online order.
func StudentOrderView(app core.App, studentID, orderID string, mock bool) (map[string]any, error) {
	return (&orderCenter{app: app, mock: mock}).detail(studentID, orderID)
}

// OpsOrderView is the finance view of an online order.
func OpsOrderView(app core.App, orderID string, mock bool) (map[string]any, error) {
	return (&orderCenter{app: app, mock: mock}).opsDetail(orderID)
}

// RefundView is the student's view of a refund request.
func RefundView(app core.App, refundID string) (map[string]any, error) {
	row, err := get(app, "order_refunds", refundID)
	if err != nil {
		return nil, err
	}
	return refundView(row), nil
}
