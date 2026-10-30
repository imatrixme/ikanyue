package payment

import (
	"errors"
	"net/http"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/coursecredit"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/tenancy"
)

// Collecting an order's money: the payment is created when the cashier first
// opens, and every result the gateway reports is handed to the order center.

type service struct {
	app     core.App
	gateway *gateway
}

// scoped is s reading and writing through app, a request's or a job's tenant scope.
func (s *service) scoped(app core.App) *service {
	bound := *s
	bound.app = app
	return &bound
}

const receiptMismatch = "PAYMENT_RECEIPT_MISMATCH"

// owned is the student's online order.
func (s *service) owned(studentID, orderID string) (coursecredit.Payable, error) {
	order, err := coursecredit.PayableOrder(s.app, orderID)
	if err != nil {
		return order, err
	}
	if order.StudentID != studentID {
		return order, coursecredit.Fail("COMMERCE_ORDER_FORBIDDEN", "不能操作其他学员的订单", nil)
	}
	return order, nil
}

// mark records a transaction's final channel status once the order center booked it.
func (s *service) mark(record *core.Record, status string) error {
	if record.GetString("status") == status && record.GetString("lastError") == "" {
		return nil
	}
	return change(s.app, record, map[string]any{"status": status, "lastError": ""})
}

// mismatch keeps a receipt that disagrees with the order for finance to check.
func (s *service) mismatch(record *core.Record) error {
	if record.GetString("lastError") != receiptMismatch {
		if err := change(s.app, record, map[string]any{"lastError": receiptMismatch}); err != nil {
			return err
		}
	}
	return coursecredit.Fail(receiptMismatch, "付款信息不一致，已暂停自动发课", nil)
}

// sync settles an order's payment against the gateway. open creates the
// payment when there is none yet; only the cashier and mock payment open one.
func (s *service) sync(orderID string, open bool) error {
	order, err := coursecredit.PayableOrder(s.app, orderID)
	if err != nil {
		return err
	}
	record, err := paymentOf(s.app, orderID)
	if err != nil {
		return err
	}
	if record == nil {
		if !open {
			return nil
		}
		// The row comes first so a crash after the gateway call is retried under the same idempotency key.
		record, err = insert(s.app, payments, hashID("payment", orderID), map[string]any{"orderId": orderID, "reference": orderID,
			"amountMinor": order.Amount, "currency": order.Currency, "payerId": order.PayerOpenID, "status": "pending", "version": 1})
		if err != nil {
			return err
		}
	}
	var result map[string]any
	if record.GetString("gatewayId") == "" {
		var payer any
		if order.PayerOpenID != "" {
			payer = order.PayerOpenID
		}
		if result, err = s.gateway.createPayment(orderID, record.GetFloat("amountMinor"), payer, order.Name); err != nil {
			return err
		}
		if err := change(s.app, record, map[string]any{"gatewayId": result["id"]}); err != nil {
			return err
		}
	} else if result, err = s.gateway.payment(record.GetString("gatewayId")); err != nil {
		return err
	}
	if result["reference"] != orderID || result["amount"] != record.GetFloat("amountMinor") || result["currency"] != "CNY" {
		return s.mismatch(record)
	}
	status, _ := result["status"].(string)
	switch {
	case order.Status == "completed":
		return s.mark(record, "succeeded")
	case status == "succeeded":
		err := coursecredit.OrderPaid(s.app, orderID, record.GetString("gatewayId"), jsx.Number(result["amount"]), result["paidAt"])
		var business *coursecredit.Error
		if errors.As(err, &business) && business.Code == receiptMismatch {
			return s.mismatch(record)
		}
		if err != nil {
			return err
		}
		return s.mark(record, "succeeded")
	case status == "failed" || status == "closed":
		if err := coursecredit.OrderPaymentFailed(s.app, orderID); err != nil {
			return err
		}
		return s.mark(record, status)
	}
	return nil
}

// openUnpaid opens the payment of every order placed since the last run, so the
// gateway's payment window starts at checkout and closes the order with it. An
// order whose window ended without a payment (placed while selling was paused)
// is closed here. It returns how many orders could not be handled.
func (s *service) openUnpaid() (int, error) {
	unpaid, err := coursecredit.UnpaidOrders(s.app)
	if err != nil {
		return 0, err
	}
	selling := tenancy.Allows(s.app, tenancy.ID(s.app), tenancy.Payment, tenancy.StartPayment)
	failed, now := 0, clock()
	for _, order := range unpaid {
		found, err := paymentOf(s.app, order.OrderID)
		if err != nil {
			return 0, err
		}
		switch {
		case found != nil:
			continue
		case order.Expired(now):
			err = coursecredit.OrderPaymentFailed(s.app, order.OrderID)
		case selling:
			err = s.sync(order.OrderID, true)
		default:
			continue
		}
		if err != nil {
			failed++
		}
	}
	return failed, nil
}

// cashier opens the order's payment and returns the action the client runs to pay.
func (s *service) cashier(studentID, orderID string, user auth.Claims) (any, error) {
	order, err := s.owned(studentID, orderID)
	if err != nil {
		return nil, err
	}
	if order.Status != "pending" {
		return nil, coursecredit.Fail("PAYMENT_NOT_READY", "当前订单无需再次付款", nil)
	}
	if !s.gateway.mock {
		openID := auth.ClaimString(user, "wechatOpenId")
		if openID == "" || openID != order.PayerOpenID {
			return nil, coursecredit.Fail("PAYMENT_WECHAT_IDENTITY_REQUIRED", "请使用下单时的微信身份支付", nil)
		}
	}
	if found, err := paymentOf(s.app, orderID); err != nil {
		return nil, err
	} else if found == nil && order.Expired(clock()) {
		if err := coursecredit.OrderPaymentFailed(s.app, orderID); err != nil {
			return nil, err
		}
		return nil, coursecredit.Fail("PAYMENT_WINDOW_CLOSED", "订单已超过支付时间，请重新选购", nil)
	}
	if err := s.sync(orderID, true); err != nil {
		return nil, err
	}
	record, err := paymentOf(s.app, orderID)
	if err != nil {
		return nil, err
	}
	result, err := s.gateway.refreshPayment(record.GetString("gatewayId"))
	if err != nil {
		return nil, err
	}
	if result["status"] != "pending" {
		if err := s.sync(orderID, false); err != nil {
			return nil, err
		}
		return nil, coursecredit.Fail("PAYMENT_WINDOW_CLOSED", "订单已超过支付时间，请重新选购", nil)
	}
	return result["action"], nil
}

// mockPay pays the order on the mock channel.
func (s *service) mockPay(studentID, orderID string) (any, error) {
	order, err := s.owned(studentID, orderID)
	if err != nil {
		return nil, err
	}
	if found, err := paymentOf(s.app, orderID); err != nil {
		return nil, err
	} else if found == nil && order.Expired(clock()) {
		if err := coursecredit.OrderPaymentFailed(s.app, orderID); err != nil {
			return nil, err
		}
		return nil, coursecredit.Fail("PAYMENT_WINDOW_CLOSED", "订单已超过支付时间，请重新选购", nil)
	}
	if err := s.sync(orderID, true); err != nil {
		return nil, err
	}
	record, err := paymentOf(s.app, orderID)
	if err != nil {
		return nil, err
	}
	if err := s.gateway.mockSuccess(record.GetString("gatewayId")); err != nil {
		return nil, err
	}
	if err := s.sync(orderID, false); err != nil {
		return nil, err
	}
	return coursecredit.StudentOrderView(s.app, studentID, orderID, s.gateway.mock)
}

// gatewayEvents lists the gateway's unacknowledged events of one kind.
func (s *service) gatewayEvents(prefix string) ([]map[string]any, error) {
	events, err := s.gateway.call(http.MethodGet, "/v1/events", nil, "")
	if err != nil {
		return nil, err
	}
	result := []map[string]any{}
	for _, item := range anyList(events["items"]) {
		event := asMap(item)
		if kind, _ := asMap(event["data"])["type"].(string); strings.HasPrefix(kind, prefix) {
			result = append(result, event)
		}
	}
	return result, nil
}

func (s *service) ack(event map[string]any) error {
	_, err := s.gateway.call(http.MethodPost, "/v1/events/"+jsx.String(event["id"])+"/ack", map[string]any{}, "")
	return err
}

// recover retries unsettled payments, then acknowledges payment events already reflected locally.
func (s *service) recover() (map[string]any, error) {
	rows, err := s.app.FindRecordsByFilter(payments, `status="pending"`, "created", 0, 0)
	if err != nil {
		return nil, err
	}
	failed := 0
	for _, row := range rows {
		if s.sync(row.GetString("orderId"), false) != nil {
			failed++
		}
	}
	opened, err := s.openUnpaid()
	if err != nil {
		return nil, err
	}
	failed += opened
	events, err := s.gatewayEvents("payment.")
	if err != nil {
		return nil, err
	}
	for _, event := range events {
		data := asMap(event["data"])
		payload := asMap(data["payload"])
		row, err := paymentOf(s.app, jsx.String(payload["reference"]))
		if err != nil {
			return nil, err
		}
		handled := false
		if row != nil {
			if payload["status"] == "succeeded" {
				handled = row.GetString("status") == "succeeded"
			} else {
				handled = row.GetString("status") == "failed" || row.GetString("status") == "closed"
			}
		}
		// Events for payments this service never created must not occupy the gateway's pending window.
		if row == nil || (row.GetString("gatewayId") == data["targetId"] && handled) {
			if err := s.ack(event); err != nil {
				return nil, err
			}
		}
	}
	return map[string]any{"inspected": len(rows), "unresolved": failed}, nil
}
