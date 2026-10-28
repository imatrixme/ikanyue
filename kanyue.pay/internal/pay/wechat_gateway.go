package pay

import (
	"errors"
	"net/http"
	"slices"
	"time"
)

// WechatGateway drives the WeChat channel for payments it creates; generic
// mock-provider payments recorded earlier keep their own path.
type WechatGateway struct {
	*Gateway
	Adapter *WechatAdapter
	// Work leases channel queries in production; nil queries on every poll.
	Work     *DurableWork
	mockPeer *WechatMock
}

// NewMockWechatGateway talks to the signed in-process peer with keys.
func NewMockWechatGateway(store Store, owner string, keys *MockKeys, work *DurableWork) *WechatGateway {
	peer := &WechatMock{Store: store, Owner: owner, Keys: keys}
	return &WechatGateway{Gateway: &Gateway{Store: store, Owner: owner, Clock: nowISO, Channel: "wechatpay"},
		Adapter: &WechatAdapter{Client: &WechatClient{Credentials: keys.Credentials, Transport: peer.Transport, Mock: true}},
		Work:    work, mockPeer: peer}
}

func NewLiveWechatGateway(store Store, owner string, adapter *WechatAdapter, work *DurableWork) *WechatGateway {
	return &WechatGateway{Gateway: &Gateway{Store: store, Owner: owner, Clock: nowISO, Channel: "wechatpay"}, Adapter: adapter, Work: work}
}

func (w *WechatGateway) Mock() (*WechatMock, error) {
	if w.mockPeer == nil {
		return nil, fail("MOCK_PAYMENT_DISABLED", 403)
	}
	return w.mockPeer, nil
}

func (w *WechatGateway) legacy() *Gateway {
	generic := *w.Gateway
	generic.Channel = ""
	return &generic
}

func (w *WechatGateway) channelPayment(payment Row) bool {
	return str(payment.Data, "channel") == "wechatpay"
}

func (w *WechatGateway) CreatePayment(input map[string]any, key string) (Row, error) {
	previous, err := w.Store.Get(recordID("payment", w.Owner, input["reference"]))
	if err != nil {
		return Row{}, err
	}
	if previous != nil && previous.Kind == "payment" && previous.Owner == w.Owner && !w.channelPayment(*previous) {
		return w.legacy().CreatePayment(input, key)
	}
	request := map[string]any{}
	for name, value := range input {
		request[name] = value
	}
	if request["payerId"] == nil && w.mockPeer != nil {
		request["payerId"] = "mock_" + recordID(w.Owner, input["reference"])
	}
	if request["description"] == nil {
		request["description"] = "Kanyue-course-order"
	}
	payment, err := w.Gateway.CreatePayment(request, key)
	if err != nil {
		return Row{}, err
	}
	if err := w.prepare(payment); err != nil {
		return Row{}, err
	}
	return w.Owned(payment.ID, "payment")
}

func (w *WechatGateway) Action(payment Row) (map[string]any, error) {
	if !w.channelPayment(payment) {
		return map[string]any{"type": "mock", "paymentId": payment.ID}, nil
	}
	if prepayID := str(payment.Data, "prepayId"); prepayID != "" {
		return w.Adapter.Launch(prepayID)
	}
	return map[string]any{"type": "pending"}, nil
}

// prepare requests the prepay id once; it stays valid longer than the payment window.
func (w *WechatGateway) prepare(payment Row) error {
	if str(payment.Data, "status") != "pending" || str(payment.Data, "prepayId") != "" || paymentExpired(payment, time.Now()) {
		return nil
	}
	prepayID, err := w.Adapter.Prepay(payment)
	if err != nil {
		return err
	}
	return retryErr(func() error {
		current, err := w.Owned(payment.ID, "payment")
		if err != nil || str(current.Data, "prepayId") != "" || str(current.Data, "status") != "pending" {
			return err
		}
		return w.Store.Commit([]Mutation{update(next(current, map[string]any{"prepayId": prepayID, "prepayAt": w.Clock()}))})
	})
}

func (w *WechatGateway) CreateRefund(input map[string]any, key string) (Row, error) {
	refund, err := w.Gateway.CreateRefund(input, key)
	if err != nil {
		return Row{}, err
	}
	payment, err := w.Owned(str(refund.Data, "paymentId"), "payment")
	if err != nil {
		return Row{}, err
	}
	if w.channelPayment(payment) && str(refund.Data, "status") == "processing" {
		if err := w.syncRefund(refund, payment); err != nil {
			return Row{}, err
		}
	}
	return w.Owned(refund.ID, "refund")
}

func (w *WechatGateway) ClosePayment(id string) (Row, error) {
	payment, err := w.Owned(id, "payment")
	if err != nil {
		return Row{}, err
	}
	if !w.channelPayment(payment) {
		return w.Gateway.ClosePayment(id)
	}
	switch str(payment.Data, "status") {
	case "closed":
		return payment, nil
	case "pending":
	default:
		return Row{}, fail("PAYMENT_NOT_CLOSABLE", 409)
	}
	if err := w.Adapter.Close(payment); err != nil {
		return Row{}, err
	}
	receipt, err := w.Adapter.Payment(payment)
	if err != nil {
		return Row{}, err
	}
	if err := w.receive(receipt); err != nil {
		return Row{}, err
	}
	return w.Owned(id, "payment")
}

// Observe moves the mock channel; it returns state the gateway already knows, not an unverified receipt.
func (w *WechatGateway) Observe(id string, input map[string]any) (Row, error) {
	observation, err := w.Owned(recordID("provider", id), "provider")
	if err != nil {
		return Row{}, err
	}
	var refund Row
	paymentID := id
	if str(observation.Data, "targetKind") != "payment" {
		if refund, err = w.Owned(id, "refund"); err != nil {
			return Row{}, err
		}
		paymentID = str(refund.Data, "paymentId")
	}
	payment, err := w.Owned(paymentID, "payment")
	if err != nil {
		return Row{}, err
	}
	if !w.channelPayment(payment) {
		return w.Gateway.Observe(id, input)
	}
	if str(observation.Data, "targetKind") == "payment" {
		err = w.prepare(payment)
	} else {
		err = w.syncRefund(refund, payment)
	}
	if err != nil {
		return Row{}, err
	}
	peer, err := w.Mock()
	if err != nil {
		return Row{}, err
	}
	return observation, peer.Observe(id, input)
}

func (w *WechatGateway) Poll() (PollResult, error) {
	errorsFound := []PollError{}
	payments, err := w.Store.List("payment", w.Owner, Where{"status": "pending", "channel": "wechatpay"})
	if err != nil {
		return PollResult{}, err
	}
	for _, payment := range payments {
		if w.Work != nil {
			result, err := w.Work.Run("payment-query", payment.ID, func() (bool, error) { return w.RecoverTarget(payment.ID, "payment") })
			if err != nil {
				return PollResult{}, err
			}
			if result.Error != "" {
				errorsFound = append(errorsFound, PollError{payment.ID, result.Error})
			}
			continue
		}
		if err := w.queryPayment(payment); err != nil {
			issue, err := w.issue(payment.ID, err)
			if err != nil {
				return PollResult{}, err
			}
			errorsFound = append(errorsFound, issue)
		}
	}
	refunds, err := w.Store.List("refund", w.Owner, Where{"status": "processing"})
	if err != nil {
		return PollResult{}, err
	}
	for _, refund := range refunds {
		payment, err := w.Owned(str(refund.Data, "paymentId"), "payment")
		if err != nil {
			return PollResult{}, err
		}
		if !w.channelPayment(payment) {
			continue
		}
		if w.Work != nil {
			result, err := w.Work.Run("refund-query", refund.ID, func() (bool, error) { return w.RecoverTarget(refund.ID, "refund") })
			if err != nil {
				return PollResult{}, err
			}
			if result.Error != "" {
				errorsFound = append(errorsFound, PollError{refund.ID, result.Error})
			}
			continue
		}
		if err := w.syncRefund(refund, payment); err != nil {
			issue, err := w.issue(refund.ID, err)
			if err != nil {
				return PollResult{}, err
			}
			errorsFound = append(errorsFound, issue)
		}
	}
	generic, err := w.Gateway.Poll()
	if err != nil {
		return PollResult{}, err
	}
	return PollResult{Inspected: generic.Inspected, Errors: append(errorsFound, generic.Errors...)}, nil
}

func (w *WechatGateway) queryPayment(payment Row) error {
	receipt, err := w.Adapter.Payment(payment)
	if missing(err) {
		if err := w.prepare(payment); err != nil {
			return err
		}
		receipt, err = w.Adapter.Payment(payment)
	}
	if err != nil {
		return err
	}
	if err := w.receive(receipt); err != nil {
		return err
	}
	return w.closeIfExpired(payment.ID)
}

// RecoverTarget queries the channel for one payment or refund and reports whether it is final.
func (w *WechatGateway) RecoverTarget(id, kind string) (bool, error) {
	if kind == "refund" {
		refund, err := w.Owned(id, "refund")
		if err != nil || str(refund.Data, "status") != "processing" {
			return err == nil, err
		}
		payment, err := w.Owned(str(refund.Data, "paymentId"), "payment")
		if err != nil {
			return false, err
		}
		if err := w.syncRefund(refund, payment); err != nil {
			return false, err
		}
		current, err := w.Owned(id, "refund")
		return err == nil && str(current.Data, "status") != "processing", err
	}
	payment, err := w.Owned(id, "payment")
	if err != nil || !w.channelPayment(payment) {
		return err == nil, err
	}
	receipt, err := w.Adapter.Payment(payment)
	if err == nil {
		err = w.receive(receipt)
	} else if missing(err) {
		err = w.prepare(payment)
	}
	if err != nil {
		return false, err
	}
	if err := w.closeIfExpired(id); err != nil {
		return false, err
	}
	current, err := w.Owned(id, "payment")
	return err == nil && str(current.Data, "status") != "pending", err
}

// closeIfExpired closes with the channel so a late payment is impossible; a capture
// that raced the close is picked up on the next query.
func (w *WechatGateway) closeIfExpired(id string) error {
	current, err := w.Owned(id, "payment")
	if err != nil || str(current.Data, "status") != "pending" {
		return err
	}
	if paymentExpired(current, time.Now()) {
		_, err = w.ClosePayment(id)
		return err
	}
	return w.prepare(current)
}

func (w *WechatGateway) syncRefund(refund, payment Row) error {
	source, err := w.Owned(recordID("provider", payment.ID), "provider")
	if err != nil {
		return err
	}
	transactionID := str(source.Data, "receiptId")
	if transactionID == "" {
		return fail("WECHAT_PAYMENT_RECEIPT_REQUIRED", 409)
	}
	receipt, err := w.Adapter.QueryRefund(refund, payment, transactionID)
	if missing(err) {
		receipt, err = w.Adapter.Refund(refund, payment, transactionID)
	}
	if err != nil {
		return err
	}
	return w.receive(receipt)
}

// Notification verifies and applies a WeChat callback. No remote calls happen
// before acknowledgement; only durable local transitions.
func (w *WechatGateway) Notification(headers http.Header, raw string) error {
	notice, err := decodeNotification(headers, raw, w.Adapter.Client.Credentials)
	if err != nil {
		return err
	}
	data, err := objectValue(notice.Data)
	if err != nil {
		return err
	}
	var receipt map[string]any
	if notice.Type == "TRANSACTION.SUCCESS" {
		if data["trade_state"] != "SUCCESS" {
			return fail("WECHAT_NOTIFICATION_STATE_MISMATCH", 400)
		}
		payment, err := w.Owned(jsString(data["out_trade_no"]), "payment")
		if err != nil {
			return err
		}
		if !w.channelPayment(payment) {
			return fail("WECHAT_CHANNEL_MISMATCH", 409)
		}
		if receipt, err = w.Adapter.paymentResult(data, payment); err != nil {
			return err
		}
	} else {
		_, hasStatus := data["status"]
		if !slices.Contains([]string{"REFUND.SUCCESS", "REFUND.CLOSED", "REFUND.ABNORMAL"}, notice.Type) ||
			notice.Type != "REFUND."+jsString(data["refund_status"]) || hasStatus {
			return fail("WECHAT_NOTIFICATION_STATE_MISMATCH", 400)
		}
		if data["mchid"] != w.Adapter.Client.Credentials.MerchantID {
			return fail("WECHAT_REFUND_IDENTITY_MISMATCH", 409)
		}
		refund, err := w.Owned(jsString(data["out_refund_no"]), "refund")
		if err != nil {
			return err
		}
		payment, err := w.Owned(str(refund.Data, "paymentId"), "payment")
		if err != nil {
			return err
		}
		if !w.channelPayment(payment) {
			return fail("WECHAT_CHANNEL_MISMATCH", 409)
		}
		source, err := w.Owned(recordID("provider", payment.ID), "provider")
		if err != nil {
			return err
		}
		if str(source.Data, "receiptId") == "" {
			return fail("WECHAT_PAYMENT_RECEIPT_REQUIRED", 409)
		}
		if receipt, err = w.Adapter.refundResult(data, refund, payment, str(source.Data, "receiptId"), true); err != nil {
			return err
		}
	}
	return w.receive(receipt)
}

// receive merges a verified channel result into the provider observation and applies it.
func (w *WechatGateway) receive(receipt map[string]any) error {
	targetID := str(receipt, "targetId")
	id := recordID("provider", targetID)
	err := retryErr(func() error {
		previous, err := w.Owned(id, "provider")
		if err != nil {
			return err
		}
		was, status := str(previous.Data, "status"), str(receipt, "status")
		if str(previous.Data, "receiptId") != "" && str(receipt, "receiptId") != "" && previous.Data["receiptId"] != receipt["receiptId"] {
			return fail("WECHAT_RECEIPT_ID_CHANGED", 409)
		}
		if (was == "succeeded" && status != "succeeded") || (status == "pending" && was != "pending") {
			return nil
		}
		if str(receipt, "targetKind") == "refund" && was == "failed" && status != "failed" {
			return fail("WECHAT_REFUND_CLOSED_IS_FINAL", 409)
		}
		if was == status && previous.Data["receiptId"] == receipt["receiptId"] && previous.Data["exception"] == receipt["exception"] &&
			(str(receipt, "acceptedAt") == "" || previous.Data["acceptedAt"] == receipt["acceptedAt"]) {
			return nil
		}
		patch := map[string]any{}
		for key, value := range receipt {
			patch[key] = value
		}
		patch["exception"], patch["applied"] = receipt["exception"], false
		return w.Store.Commit([]Mutation{update(next(previous, patch))})
	})
	if err != nil {
		return err
	}
	if exception := str(receipt, "exception"); exception != "" {
		if _, err := w.issue(targetID, errors.New(exception)); err != nil {
			return err
		}
	}
	current, err := w.Owned(id, "provider")
	if err != nil || str(current.Data, "status") == "pending" {
		return err
	}
	return retryErr(func() error { return w.accept(id) })
}

// issue records a durable finding for an unresolved channel problem.
func (w *WechatGateway) issue(targetID string, cause error) (PollError, error) {
	code := codeOf(cause)
	if code == "" {
		code = "WECHAT_SYNC_UNRESOLVED"
		if cause.Error() == "WECHAT_REFUND_ABNORMAL" {
			code = cause.Error()
		}
	}
	id := recordID("wechat-issue", targetID, code)
	err := retryErr(func() error {
		if existing, err := w.Store.Get(id); err != nil || existing != nil {
			return err
		}
		return w.Store.Commit([]Mutation{insert(w.fresh(id, "reconciliation", map[string]any{
			"targetId": targetID, "reason": code, "occurredAt": w.Clock()}))})
	})
	return PollError{ID: targetID, Code: code}, err
}

func missing(err error) bool {
	var coded *Error
	return errors.As(err, &coded) && coded.ChannelStatus == 404 &&
		(coded.Channel == "ORDER_NOT_EXIST" || coded.Channel == "RESOURCE_NOT_EXISTS")
}
