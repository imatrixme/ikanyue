package pay

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"
)

// Ports of kanyue.pay test/wechat.test.ts: WeChat API v3 against a signed persistent HTTP peer.

func wechatSetup() *WechatGateway {
	return NewMockWechatGateway(NewMemoryStore(), "contract", testKeys(), nil)
}

var wechatInput = map[string]any{"reference": "order-1", "amount": 10000, "currency": "CNY", "payerId": "openid_test", "description": "课程套餐"}

func createWechat(g *WechatGateway) (Row, error) { return g.CreatePayment(wechatInput, "purchase") }

func peer(t *testing.T, g *WechatGateway) *WechatMock {
	t.Helper()
	return must(g.Mock())
}

func deliver(t *testing.T, g *WechatGateway, targetID string) {
	t.Helper()
	header, raw := must2(peer(t, g).Notification(targetID))
	ok(t, g.Notification(header, raw))
}

func must2[A, B any](a A, b B, err error) (A, B) {
	if err != nil {
		panic(err)
	}
	return a, b
}

func payWechat(t *testing.T, g *WechatGateway) Row {
	t.Helper()
	row := must(createWechat(g))
	must(g.Observe(row.ID, map[string]any{"status": "succeeded"}))
	deliver(t, g, row.ID)
	return must(g.Owned(row.ID, "payment"))
}

func rsaVerify(message, signature string, key *rsa.PublicKey) bool {
	raw, err := base64.StdEncoding.DecodeString(signature)
	sum := sha256.Sum256([]byte(message))
	return err == nil && rsa.VerifyPKCS1v15(key, crypto.SHA256, sum[:], raw) == nil
}

// callback is an independent fixture encoder: it signs the exact wire bytes, including the AES-GCM tag.
func callback(kind string, data any, timestamp int64) (http.Header, string) {
	random := make([]byte, 6)
	rand.Read(random)
	nonceValue := hex.EncodeToString(random)
	raw := string(jsonBytes(map[string]any{"id": "fixture-event", "event_type": kind, "resource_type": "encrypt-resource",
		"resource": map[string]any{"algorithm": "AEAD_AES_256_GCM", "nonce": nonceValue, "associated_data": "fixture",
			"ciphertext": encrypt(testKeys().Credentials.APIV3Key, nonceValue, "fixture", jsonBytes(data))}}))
	return signFixture(raw, timestamp), raw
}

func signFixture(raw string, timestamp int64) http.Header {
	header := http.Header{}
	header.Set("Wechatpay-Timestamp", strconv.FormatInt(timestamp, 10))
	header.Set("Wechatpay-Nonce", "fixture-nonce")
	header.Set("Wechatpay-Serial", mockPlatformSerial)
	header.Set("Wechatpay-Signature", rsaSign(fmt.Sprintf("%d\nfixture-nonce\n%s\n", timestamp, raw), testKeys().PlatformPrivateKey))
	return header
}

func merged(base map[string]any, patch map[string]any) map[string]any {
	result := map[string]any{}
	for key, value := range base {
		result[key] = value
	}
	for key, value := range patch {
		result[key] = value
	}
	return result
}

func status(t *testing.T, g *WechatGateway, id, kind string) string {
	t.Helper()
	return str(must(g.Owned(id, kind)).Data, "status")
}

// prepay is pending and launch signature uses the small-program canonical string
func TestWechatPrepayAndLaunchSignature(t *testing.T) {
	g := wechatSetup()
	payment := must(createWechat(g))
	if str(payment.Data, "status") != "pending" || str(payment.Data, "prepayId") != "wxmock"+payment.ID {
		t.Fatalf("payment = %v", payment.Data)
	}
	action := must(g.Adapter.Launch(str(payment.Data, "prepayId")))
	p := action["parameters"].(map[string]any)
	message := fmt.Sprintf("%s\n%s\n%s\n%s\n", p["appId"], p["timeStamp"], p["nonceStr"], p["package"])
	if !rsaVerify(message, p["paySign"].(string), testKeys().MerchantPublicKey) || action["mock"] != true {
		t.Fatalf("action = %v", action)
	}
	if must(createWechat(g)).ID != payment.ID {
		t.Fatal("replay created a new payment")
	}
	_, err := g.CreatePayment(with(wechatInput, "payerId", "another-payer"), "purchase")
	wantCode(t, err, "IDEMPOTENCY_CONFLICT")
	if len(must(g.Events())) != 0 || len(must(g.Store.List("wechat_mock", "contract", nil))) != 1 {
		t.Fatal("prepay emitted events or duplicated channel orders")
	}
}

// lost prepay response is recovered using query after restart without another channel order
func TestWechatLostPrepayRecovered(t *testing.T) {
	g := wechatSetup()
	peer(t, g).Fault(FaultTimeoutAfter, "")
	_, err := createWechat(g)
	wantCode(t, err, "MOCK_RESPONSE_LOST")
	restarted := NewMockWechatGateway(g.Store, g.Owner, testKeys(), nil)
	payment := must(createWechat(restarted))
	if len(must(g.Store.List("wechat_mock", "contract", nil))) != 1 {
		t.Fatal("second channel order")
	}
	must(restarted.Observe(payment.ID, map[string]any{"status": "succeeded"}))
	if result := must(restarted.Poll()); len(result.Errors) != 0 {
		t.Fatalf("poll = %v", result)
	}
	if status(t, restarted, payment.ID, "payment") != "succeeded" {
		t.Fatal("payment not captured")
	}
}

// invalid signatures and server errors never create a trusted paid receipt
func TestWechatUntrustedResponsesNeverPay(t *testing.T) {
	for _, fault := range []string{FaultBadSignature, FaultHTTP500, FaultTimeoutBefore} {
		g := wechatSetup()
		peer(t, g).Fault(fault, "")
		if _, err := createWechat(g); err == nil {
			t.Fatalf("%s accepted", fault)
		}
		payments := must(g.Store.List("payment", g.Owner, nil))
		if str(payments[0].Data, "status") != "pending" || len(must(g.Events())) != 0 || len(must(g.Poll()).Errors) != 0 {
			t.Fatalf("%s: payment = %v", fault, payments[0].Data)
		}
	}
}

// duplicate encrypted notifications and subsequent queries grant one stable event
func TestWechatDuplicateNotificationsOneEvent(t *testing.T) {
	g := wechatSetup()
	payment := payWechat(t, g)
	header, raw := must2(peer(t, g).Notification(payment.ID))
	ok(t, g.Notification(header, raw))
	ok(t, g.Notification(header, raw))
	must(g.Poll())
	if count(eventTypes(t, g.Gateway), "payment.succeeded") != 1 || num(must(g.Owned(payment.ID, "payment")).Data, "amount") != 10000 {
		t.Fatal("duplicate notifications changed the ledger")
	}
}

// tampering, sign probes, unknown keys and stale notifications are rejected
func TestWechatTamperedNotificationsRejected(t *testing.T) {
	g := wechatSetup()
	payment := must(createWechat(g))
	must(g.Observe(payment.ID, map[string]any{"status": "succeeded"}))
	header, raw := must2(peer(t, g).Notification(payment.ID))
	wantCode(t, g.Notification(header, raw+" "), "WECHAT_SIGNATURE_INVALID")
	for _, probe := range [][3]string{
		{"Wechatpay-Signature", "WECHATPAY/SIGNTEST/fake", "WECHAT_SIGNATURE_INVALID"},
		{"Wechatpay-Serial", "__proto__", "WECHAT_UNKNOWN_SIGNING_KEY"},
		{"Wechatpay-Timestamp", strconv.FormatInt(seconds()-301, 10), "WECHAT_STALE_SIGNATURE"},
	} {
		changed := header.Clone()
		changed.Set(probe[0], probe[1])
		wantCode(t, g.Notification(changed, raw), probe[2])
	}
	if status(t, g, payment.ID, "payment") != "pending" {
		t.Fatal("tampered notification applied")
	}
}

// valid signatures cannot bypass merchant, app, reference, payer or amount binding
func TestWechatSignedButMisboundPaymentRejected(t *testing.T) {
	g := wechatSetup()
	payment := must(createWechat(g))
	must(g.Observe(payment.ID, map[string]any{"status": "succeeded"}))
	valid := peer(t, g).PaymentWire(must(peer(t, g).Get(payment.ID)))
	for _, mutation := range []map[string]any{{"mchid": "wrong"}, {"appid": "wrong"}, {"out_trade_no": recordID("unknown")},
		{"payer": map[string]any{"openid": "wrong"}}, {"amount": map[string]any{"total": 9999, "currency": "CNY"}},
		{"amount": map[string]any{"total": 10000, "currency": "USD"}}, {"trade_type": "NATIVE"}} {
		header, raw := callback("TRANSACTION.SUCCESS", merged(valid, mutation), seconds())
		if err := g.Notification(header, raw); err == nil {
			t.Fatalf("%v accepted", mutation)
		}
	}
	if status(t, g, payment.ID, "payment") != "pending" {
		t.Fatal("misbound notification applied")
	}
}

// prepay carries the payment window and expired payments are closed with the channel
func TestWechatPaymentWindow(t *testing.T) {
	g := wechatSetup()
	payment := must(createWechat(g))
	channel := must(g.Store.Get(recordID("wechat-mock", g.Owner, payment.ID)))
	created, _ := parseTime(str(payment.Data, "createdAt"))
	if str(mapOf(channel.Data["request"]), "time_expire") != shanghaiTime(created.Add(PaymentTTL)) {
		t.Fatalf("channel request = %v", channel.Data["request"])
	}
	if at, _ := time.Parse(time.RFC3339, "2026-09-24T02:30:00Z"); shanghaiTime(at) != "2026-09-24T10:30:00+08:00" {
		t.Fatal(shanghaiTime(at))
	}
	current := must(g.Owned(payment.ID, "payment"))
	ok(t, g.Store.Commit([]Mutation{update(next(current, map[string]any{"createdAt": iso(time.Now().Add(-PaymentTTL - time.Second))}))}))
	if result := must(g.Poll()); len(result.Errors) != 0 {
		t.Fatalf("poll = %v", result)
	}
	if status(t, g, payment.ID, "payment") != "closed" ||
		str(must(g.Store.Get(recordID("wechat-mock", g.Owner, payment.ID))).Data, "state") != "CLOSED" {
		t.Fatal("expired payment not closed with the channel")
	}
}

// close verifies a signed empty response; late success remains visible
func TestWechatCloseAndLateSuccess(t *testing.T) {
	g := wechatSetup()
	payment := must(createWechat(g))
	if str(must(g.ClosePayment(payment.ID)).Data, "status") != "closed" {
		t.Fatal("close")
	}
	// Polling no longer re-reads closed payments; a late capture arrives through the signed notification.
	must(g.Observe(payment.ID, map[string]any{"status": "succeeded"}))
	deliver(t, g, payment.ID)
	if !flag(must(g.Owned(payment.ID, "payment")).Data, "late") {
		t.Fatal("late flag")
	}
	late := false
	for _, row := range must(g.Store.List("reconciliation", g.Owner, nil)) {
		late = late || str(row.Data, "reason") == "LATE_PAYMENT_SUCCESS"
	}
	if !late {
		t.Fatal("late finding")
	}
	_, err := g.ClosePayment(payment.ID)
	wantCode(t, err, "PAYMENT_NOT_CLOSABLE")
}

// a valid RSA signature does not make an invalid AES authentication tag acceptable
func TestWechatRSADoesNotExcuseBadAESTag(t *testing.T) {
	g := wechatSetup()
	payment := must(createWechat(g))
	must(g.Observe(payment.ID, map[string]any{"status": "succeeded"}))
	_, raw := callback("TRANSACTION.SUCCESS", peer(t, g).PaymentWire(must(peer(t, g).Get(payment.ID))), seconds())
	var envelope map[string]any
	ok(t, json.Unmarshal([]byte(raw), &envelope))
	resource := envelope["resource"].(map[string]any)
	bytes, _ := base64.StdEncoding.DecodeString(resource["ciphertext"].(string))
	bytes[len(bytes)-1] ^= 1
	resource["ciphertext"] = base64.StdEncoding.EncodeToString(bytes)
	raw = string(jsonBytes(envelope))
	wantCode(t, g.Notification(signFixture(raw, seconds()), raw), "WECHAT_NOTIFICATION_DECRYPTION_FAILED")
	if status(t, g, payment.ID, "payment") != "pending" {
		t.Fatal("undecryptable notification applied")
	}
}

// refund notifications bind original transaction and amount without inventing a currency field
func TestWechatRefundNotificationBinding(t *testing.T) {
	g := wechatSetup()
	payment := payWechat(t, g)
	refund := must(g.CreateRefund(map[string]any{"paymentId": payment.ID, "reference": "r1", "amount": 3000}, "r1"))
	credentials := testKeys().Credentials
	amount := map[string]any{"total": 10000, "refund": 3000, "payer_total": 10000, "payer_refund": 3000}
	valid := map[string]any{"mchid": credentials.MerchantID, "out_trade_no": payment.ID, "out_refund_no": refund.ID,
		"transaction_id": "420000" + payment.ID, "refund_id": "503000" + refund.ID, "refund_status": "SUCCESS", "amount": amount}
	for _, mutation := range []map[string]any{{"mchid": "other"}, {"transaction_id": "other"}, {"out_trade_no": recordID("other")},
		{"amount": merged(amount, map[string]any{"refund": 3001})}, {"amount": merged(amount, map[string]any{"currency": "USD"})}} {
		header, raw := callback("REFUND.SUCCESS", merged(valid, mutation), seconds())
		if err := g.Notification(header, raw); err == nil {
			t.Fatalf("%v accepted", mutation)
		}
	}
	header, raw := callback("REFUND.SUCCESS", valid, seconds())
	ok(t, g.Notification(header, raw))
	if num(must(g.Owned(payment.ID, "payment")).Data, "refunded") != 3000 {
		t.Fatal("valid refund notification not applied")
	}
}

// concurrent WeChat refunds cannot overspend in either gateway or mock channel
func TestWechatConcurrentRefunds(t *testing.T) {
	g := wechatSetup()
	payment := payWechat(t, g)
	refundWith := func(reference string) func() error {
		return func() error {
			_, err := g.CreateRefund(map[string]any{"paymentId": payment.ID, "reference": reference, "amount": 7000}, reference)
			return err
		}
	}
	if errs := concurrently(refundWith("r1"), refundWith("r2")); succeeded(errs) != 1 {
		t.Fatalf("errs = %v", errs)
	}
	if num(must(g.Owned(payment.ID, "payment")).Data, "reserved") != 7000 || num(must(peer(t, g).Get(payment.ID)).Data, "reserved") != 7000 {
		t.Fatal("overspent")
	}
}

// lost refund response reserves principal; abnormal remains pending; query eventually settles once
func TestWechatLostRefundAbnormalThenSettles(t *testing.T) {
	g := wechatSetup()
	payment := payWechat(t, g)
	request := map[string]any{"paymentId": payment.ID, "reference": "refund-1", "amount": 3000}
	peer(t, g).Fault(FaultTimeoutAfter, "/v3/refund/domestic/refunds")
	_, err := g.CreateRefund(request, "refund")
	wantCode(t, err, "MOCK_RESPONSE_LOST")
	if num(must(g.Owned(payment.ID, "payment")).Data, "reserved") != 3000 {
		t.Fatal("principal not reserved")
	}
	restarted := NewMockWechatGateway(g.Store, g.Owner, testKeys(), nil)
	refund := must(restarted.CreateRefund(request, "refund"))
	if str(refund.Data, "status") != "processing" || len(must(g.Store.List("wechat_mock", g.Owner, nil))) != 2 {
		t.Fatalf("refund = %v", refund.Data)
	}
	must(restarted.Observe(refund.ID, map[string]any{"status": "abnormal"}))
	deliver(t, restarted, refund.ID)
	if num(must(restarted.Owned(payment.ID, "payment")).Data, "reserved") != 3000 || status(t, restarted, refund.ID, "refund") != "processing" {
		t.Fatal("abnormal refund released or finalized")
	}
	must(restarted.Observe(refund.ID, map[string]any{"status": "succeeded"}))
	must(restarted.Poll())
	must(restarted.Poll())
	result := must(restarted.Owned(payment.ID, "payment")).Data
	if num(result, "refunded") != 3000 || num(result, "reserved") != 0 || count(eventTypes(t, restarted.Gateway), "refund.succeeded") != 1 {
		t.Fatalf("payment = %v", result)
	}
}

// closed refund releases funds and cannot later be retried with different content
func TestWechatClosedRefundIsFinal(t *testing.T) {
	g := wechatSetup()
	payment := payWechat(t, g)
	refund := must(g.CreateRefund(map[string]any{"paymentId": payment.ID, "reference": "refund-1", "amount": 4000}, "r1"))
	must(g.Observe(refund.ID, map[string]any{"status": "failed"}))
	deliver(t, g, refund.ID)
	if num(must(g.Owned(payment.ID, "payment")).Data, "reserved") != 0 {
		t.Fatal("closed refund kept its reservation")
	}
	_, err := g.Observe(refund.ID, map[string]any{"status": "succeeded"})
	wantCode(t, err, "REFUND_FAILURE_IS_FINAL")
	_, err = g.CreateRefund(map[string]any{"paymentId": payment.ID, "reference": "refund-1", "amount": 1}, "r1")
	wantCode(t, err, "IDEMPOTENCY_CONFLICT")
}

// bill metadata is signed and download content is hash-checked without response signatures
func TestWechatBillIntegrity(t *testing.T) {
	g := wechatSetup()
	payment := payWechat(t, g)
	date := chinaToday()
	bill := must(g.Adapter.Client.Bill(date))
	if !strings.Contains(bill.Content, payment.ID) || !bill.Mock {
		t.Fatalf("bill = %v", bill)
	}
	credentials := testKeys().Credentials
	tampered := &WechatClient{Credentials: credentials, Mock: true, Transport: func(request *http.Request) (*http.Response, error) {
		if request.URL.Path == "/v3/billdownload/file" {
			return newResponse(200, http.Header{}, "tampered"), nil
		}
		return peer(t, g).Transport(request)
	}}
	_, err := tampered.Bill(date)
	wantCode(t, err, "WECHAT_BILL_HASH_MISMATCH")
	malicious := &WechatClient{Credentials: credentials, Mock: true, Transport: func(*http.Request) (*http.Response, error) {
		return peer(t, g).Signed(map[string]any{"hash_type": "SHA1", "hash_value": strings.Repeat("0", 40),
			"download_url": "http://127.0.0.1:18190/private"}, 200), nil
	}}
	_, err = malicious.Bill(date)
	wantCode(t, err, "WECHAT_BILL_URL_FORBIDDEN")
}

// legacy mock records are never submitted to the WeChat peer
func TestWechatLegacyMockPaymentsStayOffChannel(t *testing.T) {
	g := wechatSetup()
	legacy := NewGateway(g.Store, g.Owner)
	old := must(legacy.CreatePayment(order("old", 100), "old"))
	retried := must(g.CreatePayment(order("old", 100), "old"))
	if retried.ID != old.ID || retried.Data["channel"] != nil {
		t.Fatalf("retried = %v", retried.Data)
	}
	must(g.Observe(old.ID, map[string]any{"status": "succeeded"}))
	must(g.Poll())
	if status(t, g, old.ID, "payment") != "succeeded" || len(must(g.Store.List("wechat_mock", g.Owner, nil))) != 0 {
		t.Fatal("legacy payment reached the channel")
	}
}

// public callback has cryptographic auth; test controls and internal endpoints still require separate tokens
func TestWechatHTTPAuthentication(t *testing.T) {
	g := wechatSetup()
	payment := must(createWechat(g))
	cfg := must(LoadConfig(map[string]string{"NODE_ENV": "test", "PAY_PROVIDER": "wechatpay-mock",
		"PAY_SERVICE_TOKEN": strings.Repeat("s", 40), "PAY_MOCK_TOKEN": strings.Repeat("m", 40)}))
	handler := serve(t, g, cfg)
	if call(t, handler, http.MethodPost, "/callbacks/wechatpay", "{}", nil).Status != 401 ||
		call(t, handler, http.MethodPost, "/_test/wechatpay/notify/"+payment.ID, "", nil).Status != 401 ||
		call(t, handler, http.MethodGet, "/v1/providers/wechatpay/bills/2026-09-06", "", nil).Status != 401 {
		t.Fatal("unauthenticated access")
	}
	detail := call(t, handler, http.MethodGet, "/v1/payments/"+payment.ID, "", bearerHeader(cfg.Token)).Body
	action := mapOf(detail["action"])
	if action["type"] != "wechatpay" || action["mock"] != true || detail["payerId"] != nil || detail["fingerprint"] != nil {
		t.Fatalf("detail = %v", detail)
	}
	must(g.Observe(payment.ID, map[string]any{"status": "succeeded"}))
	header, raw := must2(peer(t, g).Notification(payment.ID))
	if result := call(t, handler, http.MethodPost, "/callbacks/wechatpay", raw, header); result.Status != 204 {
		t.Fatalf("callback = %v", result)
	}
	_, err := LoadConfig(map[string]string{"NODE_ENV": "production", "PAY_PROVIDER": "wechatpay-mock"})
	wantCode(t, err, "MOCK_FORBIDDEN")
	_, err = LoadConfig(map[string]string{"NODE_ENV": "development", "PAY_PROVIDER": "wechatpay"})
	wantCode(t, err, "REAL_PROVIDER_NOT_QUALIFIED")
}

// canonical verification accepts empty 204 body and rejects changed bytes
func TestWechatCanonicalVerification(t *testing.T) {
	header, _ := peer(t, wechatSetup()).SignedParts(nil, http.StatusNoContent)
	keys := testKeys().Credentials.PublicKeys
	ok(t, verifyResponse(header, "", keys, seconds()))
	wantCode(t, verifyResponse(header, "{}", keys, seconds()), "WECHAT_SIGNATURE_INVALID")
}
