package pay

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

// Ports of kanyue.pay test/operations.test.ts.

// durable recovery leases survive restart, back off, stop, and require audited reset
func TestDurableWorkLeasesBackoffAndReset(t *testing.T) {
	store := NewMemoryStore()
	now, calls := int64(1), 0
	newWork := func() *DurableWork {
		return &DurableWork{Store: store, Owner: "test", Clock: func() int64 { return now }, MaxAttempts: 2}
	}
	work := newWork()
	failing := func() (bool, error) { calls++; return false, errors.New("network") }
	must(work.Run("query", "target", failing))
	must(work.Run("query", "target", failing))
	if calls != 1 {
		t.Fatalf("calls = %d", calls)
	}
	now += 60000
	must(newWork().Run("query", "target", failing))
	if calls != 2 {
		t.Fatalf("calls = %d", calls)
	}
	now += 60000
	must(work.Run("query", "target", failing))
	if calls != 2 {
		t.Fatalf("calls = %d", calls)
	}
	row := must(store.List("work", "test", nil))[0]
	if !flag(row.Data, "exhausted") || len(must(store.List("reconciliation", "test", nil))) != 1 {
		t.Fatalf("work = %v", row.Data)
	}
	wantCode(t, work.Reset(row.ID, "admin", ""), "RETRY_REASON_REQUIRED")
	ok(t, work.Reset(row.ID, "admin", "网络恢复"))
	must(work.Run("query", "target", func() (bool, error) { return true, nil }))
	if len(must(store.List("audit", "test", nil))) != 1 {
		t.Fatal("reset not audited")
	}
}

// configured push requires explicit 204 and redacts sensitive event fields
func TestEventPushRequires204AndRedacts(t *testing.T) {
	store := NewMemoryStore()
	g := NewGateway(store, "events")
	now := int64(0)
	payment := must(g.CreatePayment(order("order", 100), "key"))
	must(g.Observe(payment.ID, map[string]any{"status": "succeeded"}))
	must(g.Poll())
	work := &DurableWork{Store: store, Owner: "events", Clock: func() int64 { return now }, MaxAttempts: 12}
	target := &EventTarget{URL: "https://business.invalid/events", Token: "token"}
	respond := func(status int) Transport {
		return func(request *http.Request) (*http.Response, error) {
			if body, _ := io.ReadAll(request.Body); strings.Contains(string(body), "fingerprint") {
				t.Fatalf("event body leaks fingerprint: %s", body)
			}
			return newResponse(status, http.Header{}, ""), nil
		}
	}
	ok(t, DeliverEvents(g, work, target, respond(200)))
	if len(must(g.Events())) != 1 {
		t.Fatal("200 acknowledged an event")
	}
	now += 60000
	ok(t, DeliverEvents(g, work, target, respond(204)))
	if len(must(g.Events())) != 0 {
		t.Fatal("204 did not acknowledge")
	}
}

// verified WeChat-format bills match payments, fees, duplicate imports, and safe exports
func TestWechatBillsMatchAndExportSafely(t *testing.T) {
	g := NewMockWechatGateway(NewMemoryStore(), "bills", testKeys(), nil)
	payment := must(g.CreatePayment(order("order", 80000), "key"))
	must(g.Observe(payment.ID, map[string]any{"status": "succeeded"}))
	must(g.Poll())
	date := chinaToday()
	bill := must(g.Adapter.Client.Bill(date))
	credentials := g.Adapter.Client.Credentials
	service := &Statements{Gateway: g.Gateway, MerchantID: credentials.MerchantID, AppID: credentials.AppID}
	importBill := func(content, source string) (map[string]any, error) {
		return service.Import(StatementImport{Date: date, Content: content, Mock: true, Source: source, ActorID: "admin"})
	}
	statement := must(importBill(bill.Content, "channel"))
	line := statement["lines"].([]any)[0].(map[string]any)
	if statement["count"] != 1.0 || statement["fees"] != 480.0 || line["difference"] != "" || len(statement["missingPayments"].([]any)) != 0 {
		t.Fatalf("statement = %v", statement)
	}
	if must(importBill(bill.Content, "channel"))["id"] != statement["id"] {
		t.Fatal("duplicate import created a new statement")
	}
	if _, err := importBill(strings.Replace(bill.Content, "800.00", "799.00", 1), "manual"); err == nil {
		t.Fatal("altered bill accepted")
	}
	if !strings.Contains(csvExport([][]any{{`=HYPERLINK("evil")`}}), `'=HYPERLINK`) {
		t.Fatal("formula not defused")
	}
	_, err := parseTradeBill(strings.Replace(bill.Content, "1900000001", "1900000002", 1), date, "1900000001", "wx0000000000000000")
	wantCode(t, err, "STATEMENT_IDENTITY_MISMATCH")
	if _, err := decimalMinor("0.001", false); err == nil {
		t.Fatal("three decimals accepted")
	}
	if must(decimalMinor("-0.01", true)) != -1 {
		t.Fatal("signed amount")
	}
	id := statement["id"].(string)
	if !strings.Contains(must(service.Export(id)), "80000") {
		t.Fatal("export misses the payment")
	}
	settlement := map[string]any{"actorId": "admin", "reference": "bank-1", "amount": 79520.0, "date": date, "evidenceHash": strings.Repeat("a", 64)}
	must(service.Settlement(id, settlement))
	if len(must(service.Detail(id))["settlements"].([]any)) != 1 {
		t.Fatal("settlement not listed")
	}
	refund := must(g.CreateRefund(map[string]any{"reference": "refund", "paymentId": payment.ID, "amount": 10000}, "refund-key"))
	if missing := must(service.Detail(id))["missingRefunds"].([]any); len(missing) != 1 || missing[0] != refund.ID {
		t.Fatalf("missingRefunds = %v", missing)
	}
	if !strings.Contains(must(service.Export(id)), "账单缺失") {
		t.Fatal("export misses the missing refund")
	}
	_, err = service.Settlement(id, with(settlement, "date", "2026-01-01"))
	wantCode(t, err, "SETTLEMENT_CONFLICT")
}

// live mode cannot be activated by provider alone or carry mock secrets
func TestLiveModeGate(t *testing.T) {
	_, err := LoadConfig(map[string]string{"NODE_ENV": "production", "PAY_PROVIDER": "wechatpay"})
	wantCode(t, err, "REAL_PROVIDER_NOT_QUALIFIED")
	_, err = LiveTransport(false)
	wantCode(t, err, "REAL_PROVIDER_NOT_QUALIFIED")
	live := map[string]string{"NODE_ENV": "production", "PAY_PROVIDER": "wechatpay", "PAY_LIVE_ENABLED": "true",
		"PAY_RELEASE_APPROVAL": "merchant-live-acceptance-approved", "PAY_SERVICE_TOKEN": strings.Repeat("s", 40),
		"PAY_WECHAT_CREDENTIALS_FILE": "/secrets/wechat.json"}
	if !must(LoadConfig(live)).Live {
		t.Fatal("approved live configuration rejected")
	}
	extend := func(pairs ...string) map[string]string {
		env := map[string]string{}
		for key, value := range live {
			env[key] = value
		}
		for i := 0; i+1 < len(pairs); i += 2 {
			env[pairs[i]] = pairs[i+1]
		}
		return env
	}
	_, err = LoadConfig(extend("PAY_MOCK_TOKEN", strings.Repeat("m", 40)))
	wantCode(t, err, "INVALID_SERVICE_SECRETS")
	_, err = LoadConfig(extend("PAY_EVENT_URL", "http://business/events", "PAY_EVENT_TOKEN", strings.Repeat("e", 40)))
	wantCode(t, err, "EVENT_URL_FORBIDDEN")
}
