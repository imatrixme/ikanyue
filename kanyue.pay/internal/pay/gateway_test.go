package pay

import (
	"math"
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"
)

// Ports of kanyue.pay test/gateway.test.ts.

var (
	serviceToken = strings.Repeat("service-test-", 4)
	mockToken    = strings.Repeat("mock-test-", 5)
)

func testConfig(t *testing.T, extra map[string]string) Config {
	t.Helper()
	env := map[string]string{"NODE_ENV": "test", "PAY_SERVICE_TOKEN": serviceToken, "PAY_MOCK_TOKEN": mockToken}
	for key, value := range extra {
		env[key] = value
	}
	return must(LoadConfig(env))
}

func setup() *Gateway { return NewGateway(NewMemoryStore(), "kanyue") }

func order(reference string, amount int) map[string]any {
	return map[string]any{"reference": reference, "amount": amount, "currency": "CNY"}
}

func paid(t *testing.T, g *Gateway, reference string, amount int) Row {
	t.Helper()
	payment := must(g.CreatePayment(order(reference, amount), "purchase-1"))
	must(g.Observe(payment.ID, map[string]any{"status": "succeeded"}))
	must(g.Poll())
	return must(g.Owned(payment.ID, "payment"))
}

func with(input map[string]any, key string, value any) map[string]any {
	copied := map[string]any{}
	for name, item := range input {
		copied[name] = item
	}
	copied[key] = value
	return copied
}

// gateway money lifecycle › payment replay, payload conflict and amount validation
func TestPaymentReplayConflictAndAmounts(t *testing.T) {
	g := setup()
	input := order("order-1", 240000)
	rows := make([]Row, 2)
	errs := concurrently(
		func() (err error) { rows[0], err = g.CreatePayment(input, "a"); return },
		func() (err error) { rows[1], err = g.CreatePayment(input, "a"); return })
	if succeeded(errs) != 2 || rows[0].ID != rows[1].ID || str(rows[0].Data, "status") != "pending" {
		t.Fatalf("replay = %v %v", rows, errs)
	}
	_, err := g.CreatePayment(with(input, "amount", 1), "a")
	wantCode(t, err, "IDEMPOTENCY_CONFLICT")
	_, err = g.CreatePayment(with(input, "reference", "different-order"), "a")
	wantCode(t, err, "IDEMPOTENCY_CONFLICT")
	_, err = g.CreatePayment(with(input, "currency", "USD"), "b")
	wantCode(t, err, "UNSUPPORTED_CURRENCY")
	for _, value := range []any{0, -1, 0.1, math.NaN(), math.Inf(1), "100", float64(9007199254740991)} {
		_, err := minorUnits(value)
		wantCode(t, err, "INVALID_AMOUNT")
	}
}

// gateway money lifecycle › duplicate observations and restart retain exactly one paid event
func TestDuplicateObservationsKeepOnePaidEvent(t *testing.T) {
	g := setup()
	payment := paid(t, g, "order-1", 240000)
	must(g.Observe(payment.ID, map[string]any{"status": "succeeded"}))
	restarted := NewGateway(g.Store, "kanyue")
	must(restarted.Poll())
	events := must(restarted.Events())
	if len(events) != 1 || str(events[0].Data, "type") != "payment.succeeded" {
		t.Fatalf("events = %v", events)
	}
	ok(t, restarted.Acknowledge(events[0].ID))
	ok(t, restarted.Acknowledge(events[0].ID))
	if len(must(restarted.Events())) != 0 {
		t.Fatal("event still listed")
	}
}

// gateway money lifecycle › concurrent refunds reserve funds atomically
func TestConcurrentRefundsReserveAtomically(t *testing.T) {
	g := setup()
	payment := paid(t, g, "order-1", 10000)
	errs := concurrently(
		func() error {
			_, err := g.CreateRefund(map[string]any{"reference": "refund-1", "paymentId": payment.ID, "amount": 7000}, "r1")
			return err
		},
		func() error {
			_, err := g.CreateRefund(map[string]any{"reference": "refund-2", "paymentId": payment.ID, "amount": 7000}, "r2")
			return err
		})
	if succeeded(errs) != 1 || num(must(g.Owned(payment.ID, "payment")).Data, "reserved") != 7000 {
		t.Fatalf("errs = %v", errs)
	}
}

// gateway money lifecycle › partial refund replay, failed refund release and cumulative cap
func TestPartialRefundReplayReleaseAndCap(t *testing.T) {
	g := setup()
	payment := paid(t, g, "order-1", 10000)
	input := map[string]any{"reference": "refund-1", "paymentId": payment.ID, "amount": 3000}
	refund := must(g.CreateRefund(input, "r1"))
	if must(g.CreateRefund(input, "r1")).ID != refund.ID {
		t.Fatal("refund replay created a new refund")
	}
	_, err := g.CreateRefund(with(input, "reference", "other-refund"), "r1")
	wantCode(t, err, "IDEMPOTENCY_CONFLICT")
	_, err = g.CreateRefund(with(input, "amount", 2000), "r1")
	wantCode(t, err, "IDEMPOTENCY_CONFLICT")
	must(g.Observe(refund.ID, map[string]any{"status": "succeeded"}))
	must(g.Poll())
	must(g.Poll())
	second := must(g.CreateRefund(with(with(input, "reference", "r2"), "amount", 7000), "r2"))
	must(g.Observe(second.ID, map[string]any{"status": "failed"}))
	must(g.Poll())
	_, err = g.Observe(second.ID, map[string]any{"status": "succeeded"})
	wantCode(t, err, "REFUND_FAILURE_IS_FINAL")
	state := must(g.Owned(payment.ID, "payment")).Data
	if num(state, "refunded") != 3000 || num(state, "reserved") != 0 {
		t.Fatalf("payment = %v", state)
	}
	_, err = g.CreateRefund(with(with(input, "reference", "r3"), "amount", 7001), "r3")
	wantCode(t, err, "REFUND_EXCEEDS_AVAILABLE")
	finance := must(FinancialSummary(g.Store, "kanyue"))
	if finance["captured"] != 10000 || finance["refunded"] != 3000 || finance["fees"] != nil || finance["settled"] != nil {
		t.Fatalf("finance = %v", finance)
	}
}

// gateway money lifecycle › closed payment accepts a late receipt instead of losing money
func TestClosedPaymentAcceptsLateReceipt(t *testing.T) {
	g := setup()
	p := must(g.CreatePayment(order("late", 100), "a"))
	must(g.ClosePayment(p.ID))
	must(g.ClosePayment(p.ID))
	must(g.Observe(p.ID, map[string]any{"status": "succeeded"}))
	must(g.Poll())
	if !flag(must(g.Owned(p.ID, "payment")).Data, "late") {
		t.Fatal("late payment not flagged")
	}
	if findings := must(g.Store.List("reconciliation", "kanyue", nil)); str(findings[0].Data, "reason") != "LATE_PAYMENT_SUCCESS" {
		t.Fatalf("findings = %v", findings)
	}
	_, err := g.ClosePayment(p.ID)
	wantCode(t, err, "PAYMENT_NOT_CLOSABLE")
	_, err = g.Observe(p.ID, map[string]any{"status": "failed"})
	wantCode(t, err, "CAPTURE_IS_IMMUTABLE")
}

// gateway money lifecycle › mismatched provider amount is quarantined and reconciliation is durable
func TestAmountMismatchQuarantinedAndReconciled(t *testing.T) {
	g := setup()
	p := must(g.CreatePayment(order("mismatch", 100), "a"))
	must(g.Observe(p.ID, map[string]any{"status": "succeeded", "amount": 99}))
	if result := must(g.Poll()); result.Errors[0].Code != "PROVIDER_AMOUNT_MISMATCH" {
		t.Fatalf("poll = %v", result)
	}
	if str(must(g.Owned(p.ID, "payment")).Data, "status") != "pending" {
		t.Fatal("mismatched amount was applied")
	}
	report := must(Reconcile(g.Store, "kanyue", nowISO()))
	if report["findings"].([]any)[0].(map[string]any)["reason"] != "AMOUNT_MISMATCH" {
		t.Fatalf("report = %v", report)
	}
	must(Reconcile(g.Store, "kanyue", nowISO()))
	if len(must(g.Store.List("reconciliation", "kanyue", nil))) != 1 {
		t.Fatal("reconciliation finding duplicated")
	}
}

// gateway money lifecycle › capture before close is not overwritten and ownership is enforced
func TestCaptureBeforeCloseAndOwnership(t *testing.T) {
	g := setup()
	p := must(g.CreatePayment(order("race", 100), "a"))
	must(g.Observe(p.ID, map[string]any{"status": "succeeded"}))
	_, err := g.ClosePayment(p.ID)
	wantCode(t, err, "PAYMENT_ALREADY_CAPTURED")
	_, err = NewGateway(g.Store, "other").Owned(p.ID, "payment")
	wantCode(t, err, "NOT_FOUND")
	_, err = g.CreateRefund(map[string]any{"reference": "r", "paymentId": p.ID, "amount": 1}, "r")
	wantCode(t, err, "PAYMENT_NOT_CAPTURED")
}

// gateway money lifecycle › unpaid payments close after the payment window and emit a closed event
func TestUnpaidPaymentsCloseAfterWindow(t *testing.T) {
	store := NewMemoryStore()
	old := iso(time.Now().Add(-PaymentTTL - time.Second))
	g := &Gateway{Store: store, Owner: "kanyue", Clock: func() string { return old }}
	stale := must(g.CreatePayment(order("stale", 100), "stale"))
	fresh := must(NewGateway(store, "kanyue").CreatePayment(order("fresh", 100), "fresh"))
	must(g.Poll())
	if str(must(g.Owned(stale.ID, "payment")).Data, "status") != "closed" || str(must(g.Owned(fresh.ID, "payment")).Data, "status") != "pending" {
		t.Fatal("payment window not applied")
	}
	if types := eventTypes(t, g); !reflect.DeepEqual(types, []string{"payment.closed"}) {
		t.Fatalf("events = %v", types)
	}
}

// gateway money lifecycle › polling only revisits unapplied provider results and unacknowledged events
func TestPollingRevisitsOnlyOpenWork(t *testing.T) {
	g := setup()
	open := Where{"applied": Not{true}, "status": Not{"pending"}}
	payment := must(g.CreatePayment(order("applied", 100), "applied"))
	must(g.Observe(payment.ID, map[string]any{"status": "succeeded"}))
	if len(must(g.Store.List("provider", "kanyue", open))) != 1 {
		t.Fatal("observation not open")
	}
	must(g.Poll())
	if len(must(g.Store.List("provider", "kanyue", open))) != 0 {
		t.Fatal("applied observation still open")
	}
	event := must(g.Events())[0]
	ok(t, g.Acknowledge(event.ID))
	if len(must(g.Store.List("event", "kanyue", Where{"acknowledged": false}))) != 0 || len(must(g.Events())) != 0 {
		t.Fatal("acknowledged event still listed")
	}
}

// gateway money lifecycle › memory store simulates all-or-nothing optimistic transactions
func TestMemoryStoreIsAllOrNothing(t *testing.T) {
	store := NewMemoryStore()
	row := fresh(recordID("one"), "payment", "kanyue", map[string]any{})
	wantCode(t, store.Commit([]Mutation{insert(row), insert(row)}), "CONCURRENT_CHANGE")
	if must(store.Get(row.ID)) != nil {
		t.Fatal("partial commit")
	}
}

// HTTP and startup security › requires independent credentials for service and mock controls
func TestServiceAndMockCredentialsAreIndependent(t *testing.T) {
	handler := serve(t, setup(), testConfig(t, nil))
	if call(t, handler, http.MethodGet, "/health", "", nil).Status != 200 ||
		call(t, handler, http.MethodGet, "/v1/finance", "", nil).Status != 401 ||
		call(t, handler, http.MethodPost, "/_test/poll", "", bearerHeader(serviceToken)).Status != 401 {
		t.Fatal("credential separation broken")
	}
	headers := bearerHeader(serviceToken, "Idempotency-Key", "a")
	created := call(t, handler, http.MethodPost, "/v1/payments", `{"reference":"api","amount":100,"currency":"CNY"}`, headers)
	if created.Status != 201 || created.Body["fingerprint"] != nil || mapOf(created.Body["action"])["type"] != "mock" {
		t.Fatalf("created = %v", created)
	}
	id := created.Body["id"].(string)
	if call(t, handler, http.MethodPost, "/_test/observations/"+id, `{"status":"succeeded"}`, bearerHeader(mockToken)).Status != 200 ||
		call(t, handler, http.MethodPost, "/_test/poll", "", bearerHeader(mockToken)).Status != 200 {
		t.Fatal("mock controls rejected")
	}
	for body, status := range map[string]int{"null": 400, "{": 400, strings.Repeat("x", 20000): 413} {
		if result := call(t, handler, http.MethodPost, "/v1/payments", body, headers); result.Status != status {
			t.Fatalf("%.10s = %v", body, result)
		}
	}
}

// HTTP and startup security › mock and unqualified live adapters fail closed
// (PB_TLS_REQUIRED is gone: PocketBase is embedded, there is no remote store URL.)
func TestUnqualifiedProvidersFailClosed(t *testing.T) {
	for code, env := range map[string]map[string]string{
		"MOCK_FORBIDDEN_IN_PRODUCTION": {"NODE_ENV": "production"},
		"REAL_PROVIDER_NOT_QUALIFIED":  {"PAY_PROVIDER": "wechat"},
		"INVALID_SERVICE_SECRETS":      {"PAY_SERVICE_TOKEN": "short", "PAY_MOCK_TOKEN": mockToken},
	} {
		_, err := LoadConfig(env)
		wantCode(t, err, code)
	}
	_, err := LoadConfig(map[string]string{"PAY_SERVICE_TOKEN": serviceToken, "PAY_MOCK_TOKEN": serviceToken})
	wantCode(t, err, "INVALID_SERVICE_SECRETS")
}
