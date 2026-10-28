package pay

import (
	"net/http"
	"regexp"
	"slices"
	"time"
)

// WechatAdapter maps gateway rows to WeChat API v3 calls and binds every result to the row it answers.
type WechatAdapter struct{ Client *WechatClient }

func (a *WechatAdapter) Prepay(payment Row) (string, error) {
	credentials := a.Client.Credentials
	created, _ := parseTime(str(payment.Data, "createdAt"))
	result, err := a.Client.request("/v3/pay/transactions/jsapi", http.MethodPost, map[string]any{
		"appid": credentials.AppID, "mchid": credentials.MerchantID, "out_trade_no": payment.ID,
		"description": payment.Data["description"], "notify_url": credentials.NotifyURL,
		"time_expire": shanghaiTime(created.Add(PaymentTTL)),
		"amount":      map[string]any{"total": num(payment.Data, "amount"), "currency": "CNY"},
		"payer":       map[string]any{"openid": payment.Data["payerId"]},
	})
	if err != nil {
		return "", err
	}
	prepayID := str(mapOf(result), "prepay_id")
	if _, err := launchParameters(prepayID, credentials); err != nil {
		return "", err
	}
	return prepayID, nil
}

func (a *WechatAdapter) Launch(prepayID string) (map[string]any, error) {
	parameters, err := launchParameters(prepayID, a.Client.Credentials)
	if err != nil {
		return nil, err
	}
	return map[string]any{"type": "wechatpay", "mock": a.Client.Mock, "parameters": parameters}, nil
}

func (a *WechatAdapter) Payment(payment Row) (map[string]any, error) {
	data, err := a.Client.request("/v3/pay/transactions/out-trade-no/"+payment.ID+"?mchid="+a.Client.Credentials.MerchantID, http.MethodGet, nil)
	if err != nil {
		return nil, err
	}
	return a.paymentResult(data, payment)
}

func (a *WechatAdapter) Close(payment Row) error {
	_, err := a.Client.request("/v3/pay/transactions/out-trade-no/"+payment.ID+"/close", http.MethodPost,
		map[string]any{"mchid": a.Client.Credentials.MerchantID})
	return err
}

func (a *WechatAdapter) Refund(refund, payment Row, transactionID string) (map[string]any, error) {
	data, err := a.Client.request("/v3/refund/domestic/refunds", http.MethodPost, map[string]any{
		"out_trade_no": payment.ID, "out_refund_no": refund.ID, "notify_url": a.Client.Credentials.NotifyURL,
		"amount": map[string]any{"total": num(payment.Data, "amount"), "refund": num(refund.Data, "amount"), "currency": "CNY"},
	})
	if err != nil {
		return nil, err
	}
	return a.refundResult(data, refund, payment, transactionID, false)
}

func (a *WechatAdapter) QueryRefund(refund, payment Row, transactionID string) (map[string]any, error) {
	data, err := a.Client.request("/v3/refund/domestic/refunds/"+refund.ID, http.MethodGet, nil)
	if err != nil {
		return nil, err
	}
	return a.refundResult(data, refund, payment, transactionID, false)
}

func objectValue(value any) (map[string]any, error) {
	if result, ok := value.(map[string]any); ok {
		return result, nil
	}
	return nil, fail("WECHAT_INVALID_RESPONSE", 502)
}

// isAmount is strict equality between a JSON number and an amount in fen.
func isAmount(value any, amount int) bool {
	actual, ok := number(value)
	return ok && actual == float64(amount)
}

var paymentStates = map[string]string{"SUCCESS": "succeeded", "REFUND": "succeeded", "NOTPAY": "pending",
	"USERPAYING": "pending", "CLOSED": "closed", "REVOKED": "closed", "PAYERROR": "failed"}

// paymentResult is an observation; receiptId is always present so a merge clears a stale one.
func (a *WechatAdapter) paymentResult(value any, payment Row) (map[string]any, error) {
	data, err := objectValue(value)
	if err != nil {
		return nil, err
	}
	amount, err := objectValue(data["amount"])
	if err != nil {
		return nil, err
	}
	credentials := a.Client.Credentials
	if data["mchid"] != credentials.MerchantID || data["appid"] != credentials.AppID || data["out_trade_no"] != payment.ID {
		return nil, fail("WECHAT_PAYMENT_IDENTITY_MISMATCH", 409)
	}
	currency, hasCurrency := amount["currency"]
	if !isAmount(amount["total"], num(payment.Data, "amount")) || (hasCurrency && currency != "CNY") {
		return nil, fail("WECHAT_AMOUNT_MISMATCH", 409)
	}
	state, _ := data["trade_state"].(string)
	status, known := paymentStates[state]
	if !known {
		return nil, fail("WECHAT_UNKNOWN_PAYMENT_STATE", 502)
	}
	var receiptID any
	observedAt := nowISO()
	if status == "succeeded" {
		if data["trade_type"] != "JSAPI" {
			return nil, fail("WECHAT_PAYER_MISMATCH", 409)
		}
		payer, err := objectValue(data["payer"])
		if err != nil {
			return nil, err
		}
		if payer["openid"] != payment.Data["payerId"] {
			return nil, fail("WECHAT_PAYER_MISMATCH", 409)
		}
		if receiptID, err = identifier(data["transaction_id"]); err != nil {
			return nil, err
		}
		successTime, ok := data["success_time"].(string)
		if _, parsed := parseTime(successTime); !ok || !parsed {
			return nil, fail("WECHAT_INVALID_SUCCESS_TIME", 502)
		}
		observedAt = successTime
	}
	return map[string]any{"targetId": payment.ID, "targetKind": "payment", "amount": num(payment.Data, "amount"),
		"status": status, "observedAt": observedAt, "receiptId": receiptID}, nil
}

func (a *WechatAdapter) refundResult(value any, refund, payment Row, transactionID string, isNotification bool) (map[string]any, error) {
	data, err := objectValue(value)
	if err != nil {
		return nil, err
	}
	amount, err := objectValue(data["amount"])
	if err != nil {
		return nil, err
	}
	// Refund query/create omit mchid; the authenticated client binds them. Notifications include it.
	mchid, hasMchid := data["mchid"]
	if (hasMchid && mchid != a.Client.Credentials.MerchantID) || data["out_trade_no"] != payment.ID ||
		data["out_refund_no"] != refund.ID || data["transaction_id"] != transactionID {
		return nil, fail("WECHAT_REFUND_IDENTITY_MISMATCH", 409)
	}
	// Refund notifications omit currency; the signed merchant/order binding fixes it to the original CNY payment.
	currency, hasCurrency := amount["currency"]
	if !isAmount(amount["total"], num(payment.Data, "amount")) || !isAmount(amount["refund"], num(refund.Data, "amount")) ||
		!(currency == "CNY" || (isNotification && !hasCurrency)) {
		return nil, fail("WECHAT_AMOUNT_MISMATCH", 409)
	}
	state := data["status"]
	if state == nil {
		state = data["refund_status"]
	}
	if !slices.Contains([]any{"SUCCESS", "CLOSED", "PROCESSING", "ABNORMAL"}, state) {
		return nil, fail("WECHAT_UNKNOWN_REFUND_STATE", 502)
	}
	createTime, ok := data["create_time"].(string)
	if _, parsed := parseTime(createTime); !isNotification && (!ok || !parsed) {
		return nil, fail("WECHAT_INVALID_REFUND_TIME", 502)
	}
	status := "pending"
	switch state {
	case "SUCCESS":
		status = "succeeded"
	case "CLOSED":
		status = "failed"
	}
	receiptID, err := identifier(data["refund_id"])
	if err != nil {
		return nil, err
	}
	result := map[string]any{"targetId": refund.ID, "targetKind": "refund", "amount": num(refund.Data, "amount"),
		"status": status, "observedAt": nowISO(), "receiptId": receiptID}
	if !isNotification {
		result["acceptedAt"] = createTime
	}
	if state == "ABNORMAL" {
		result["exception"] = "WECHAT_REFUND_ABNORMAL"
	}
	return result, nil
}

var channelIDPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

func identifier(value any) (string, error) {
	if id, ok := value.(string); ok && channelIDPattern.MatchString(id) {
		return id, nil
	}
	return "", fail("WECHAT_INVALID_CHANNEL_ID", 502)
}

// shanghaiTime is RFC 3339 with an explicit offset, e.g. 2026-09-24T10:30:00+08:00.
func shanghaiTime(at time.Time) string { return at.In(china).Format("2006-01-02T15:04:05") + "+08:00" }
