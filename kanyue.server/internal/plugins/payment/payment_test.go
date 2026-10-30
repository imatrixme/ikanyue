package payment

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/coursecredit"
	"kanyue.server/internal/tenancy"
	"kanyue.server/internal/testkit"
)

var (
	serviceToken = strings.Repeat("s", 32)
	mockToken    = strings.Repeat("m", 32)
	eventToken   = strings.Repeat("e", 32)
)

// fakeGateway is the payment gateway's service API, kept in memory.
type fakeGateway struct {
	mu       sync.Mutex
	payments map[string]map[string]any
	refunds  map[string]map[string]any
	order    []string
	events   []any
	acked    []string
}

func newFakeGateway(t *testing.T) (*fakeGateway, string) {
	g := &fakeGateway{payments: map[string]map[string]any{}, refunds: map[string]map[string]any{}}
	server := httptest.NewServer(http.HandlerFunc(g.serve))
	t.Cleanup(server.Close)
	return g, server.URL
}

// set changes a payment's or refund's field, as the channel would.
func (g *fakeGateway) set(id, key string, value any) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if row, ok := g.payments[id]; ok {
		row[key] = value
	}
	if row, ok := g.refunds[id]; ok {
		row[key] = value
	}
}

func (g *fakeGateway) serve(w http.ResponseWriter, r *http.Request) {
	g.mu.Lock()
	defer g.mu.Unlock()
	token := serviceToken
	if strings.HasPrefix(r.URL.Path, "/_test/") {
		token = mockToken
	}
	if r.Header.Get("Authorization") != "Bearer "+token {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	body := map[string]any{}
	_ = json.NewDecoder(r.Body).Decode(&body)
	reply := func(value any) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(value)
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	path := strings.Join(parts[:min(2, len(parts))], "/")
	switch {
	case r.Method == http.MethodPost && r.URL.Path == "/v1/payments":
		for _, row := range g.payments {
			if row["reference"] == body["reference"] {
				reply(row)
				return
			}
		}
		id := "pay" + strconv.Itoa(len(g.payments)+1)
		g.payments[id] = map[string]any{"id": id, "reference": body["reference"], "amount": body["amount"], "currency": "CNY",
			"status": "pending", "action": map[string]any{"type": "mock"}, "createdAt": "2026-01-01T00:00:00.000Z"}
		g.order = append(g.order, id)
		reply(g.payments[id])
	case path == "v1/payments":
		if row, ok := g.payments[parts[2]]; ok {
			reply(row)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	case r.Method == http.MethodPost && r.URL.Path == "/v1/refunds":
		for _, row := range g.refunds {
			if row["reference"] == body["reference"] {
				reply(row)
				return
			}
		}
		id := "ref" + strconv.Itoa(len(g.refunds)+1)
		g.refunds[id] = map[string]any{"id": id, "reference": body["reference"], "paymentId": body["paymentId"],
			"amount": body["amount"], "status": "processing", "createdAt": "2026-01-01T00:00:00.000Z"}
		reply(g.refunds[id])
	case path == "v1/refunds":
		reply(g.refunds[parts[2]])
	case path == "_test/observations":
		for _, rows := range []map[string]map[string]any{g.payments, g.refunds} {
			if row, ok := rows[parts[2]]; ok {
				row["status"] = body["status"]
			}
		}
		reply(map[string]any{})
	case path == "v1/finance":
		payments, refunds := []any{}, []any{}
		for _, id := range g.order {
			payments = append(payments, g.payments[id])
		}
		for _, row := range g.refunds {
			refunds = append(refunds, row)
		}
		reply(map[string]any{"payments": payments, "refunds": refunds, "findings": []any{}})
	case path == "v1/events" && len(parts) == 4 && parts[3] == "ack":
		g.acked = append(g.acked, parts[2])
		reply(map[string]any{})
	case path == "v1/events":
		reply(map[string]any{"items": append([]any{}, g.events...)})
	case path == "v1/reconciliation":
		reply(map[string]any{"findings": []any{}})
	default:
		reply(map[string]any{"items": []any{}})
	}
}

type paymentFixture struct {
	// app is scoped to the default tenant, as requests and jobs are.
	app                   core.App
	handler               http.Handler
	gateway               *fakeGateway
	orders                coursecredit.OrdersModule
	module                Module
	ops, student, teacher map[string]string
	studentID, offerID    string
}

func (f paymentFixture) call(t *testing.T, headers map[string]string, method, path string, body any) testkit.Response {
	t.Helper()
	return testkit.Call(t, f.handler, method, path, body, headers)
}

func ok(t *testing.T, result testkit.Response, what string) map[string]any {
	t.Helper()
	if result.Code() != 10000 {
		t.Fatalf("%s = %v", what, result.Body)
	}
	return result.Data()
}

func failed(t *testing.T, result testkit.Response, status int, code, what string) {
	t.Helper()
	if result.Code() != status || result.Body["errorCode"] != code {
		t.Fatalf("%s = %v", what, result.Body)
	}
}

func failsWith(t *testing.T, err error, code string) {
	t.Helper()
	var business *coursecredit.Error
	if !errors.As(err, &business) || business.Code != code {
		t.Fatalf("error = %v, want %s", err, code)
	}
}

// missing is a route answering like one that does not exist.
func missing(t *testing.T, result testkit.Response, what string) {
	t.Helper()
	if result.Status != http.StatusNotFound || result.Body["message"] != "接口不存在" {
		t.Fatalf("%s = %d %v", what, result.Status, result.Body)
	}
}

func paymentSetup(t *testing.T) paymentFixture {
	t.Helper()
	app := tenancy.Scope(testkit.NewApp(t), tenancy.DefaultID)
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	operator := testkit.Create(t, app, "teachers", map[string]any{"email": "ops@example.com", "password": "admin-pass-1", "realName": "财务甲"})
	teacher := testkit.Create(t, app, "teachers", map[string]any{"email": "t1@example.com", "password": "admin-pass-1"})
	student := testkit.Create(t, app, "students", map[string]any{"cellphone": "13800000000", "realName": "学员甲"})
	sign := func(id, role string, extra auth.Claims) map[string]string {
		value, err := signer.Sign(id, "S1", role, false, extra, auth.OpsTokenTTL)
		if err != nil {
			t.Fatal(err)
		}
		return testkit.Bearer(value)
	}
	spec := testkit.Create(t, app, "course_specs", map[string]any{"code": "vocal1v1", "name": "声乐一对一", "deliveryMode": "one_to_one", "durationMinutes": 60, "status": "active"})
	credit := testkit.Create(t, app, "credit_types", map[string]any{"code": "vocal1v1", "name": "一对一课时", "kind": "course", "courseSpecId": spec.Id, "consumable": true, "referenceUnitValue": 100, "status": "active"})
	pkg := testkit.Create(t, app, "packages", map[string]any{"code": "p10", "name": "十节", "saleChannel": "all", "activationMode": "GRANT_TIME", "expiryPolicy": "FIXED_DURATION", "validityDurationDays": 90, "status": "active"})
	testkit.Create(t, app, "package_grant_lines", map[string]any{"packageId": pkg.Id, "creditTypeId": credit.Id, "quantity": 10})
	price := testkit.Create(t, app, "price_versions", map[string]any{"packageId": pkg.Id, "currency": "CNY", "listAmount": 1000, "saleAmount": 800, "validFrom": "2020-01-01 00:00:00.000Z", "version": 1, "status": "active"})

	fake, base := newFakeGateway(t)
	orders := coursecredit.OrdersModule{Signer: signer, Enabled: true, MockPayment: true}
	module := Module{Signer: signer, Enabled: true, Config: Config{
		GatewayURL: base, ServiceToken: serviceToken, MockToken: mockToken, EventToken: eventToken, Mock: true}}
	f := paymentFixture{
		app: app, handler: testkit.Serve(t, app, orders.Register, module.Register), gateway: fake, orders: orders, module: module,
		ops:       sign(operator.Id, "teacher", auth.Claims{"scope": auth.OpsScope, "courseCreditCapabilities": []string{coursecredit.Finance}}),
		teacher:   sign(teacher.Id, "teacher", nil),
		student:   sign(student.Id, "student", nil),
		studentID: student.Id,
	}
	offer := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/offers", map[string]any{"key": "offer-1", "name": " 十节声乐课 ",
		"packageId": pkg.Id, "priceVersionId": price.Id, "policy": map[string]any{"version": 1, "packageRefund": "unused_paid_value",
			"reservationRefund": "credit", "cancellationTiers": []any{map[string]any{"beforeMinutes": 0, "feeBps": 0}}}}), "save offer")
	f.offerID = offer["id"].(string)
	ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/offers/"+f.offerID+"/status",
		map[string]any{"status": "active", "version": 1, "reason": "开放购买"}), "publish")
	return f
}

// checkout places an order; its payment does not exist until the cashier opens.
func (f paymentFixture) checkout(t *testing.T, key string) string {
	t.Helper()
	order := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders", map[string]any{"key": key, "offerId": f.offerID}), "checkout "+key)
	return order["id"].(string)
}

// cashier opens the order's payment at the gateway.
func (f paymentFixture) cashier(t *testing.T, orderID string) {
	t.Helper()
	result := f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+orderID+"/cashier", nil)
	if result.Code() != 10000 || result.Body["data"].(map[string]any)["type"] != "mock" {
		t.Fatalf("cashier = %v", result.Body)
	}
}

// buy places an order and pays it through the mock channel.
func (f paymentFixture) buy(t *testing.T, key string) map[string]any {
	t.Helper()
	orderID := f.checkout(t, key)
	paid := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+orderID+"/mock-pay", nil), "mock pay")
	if paid["status"] != "completed" || paid["availableQuantity"] != 10.0 {
		t.Fatalf("paid = %v", paid)
	}
	return paid
}

// event delivers a gateway callback; a delivered one answers with no body.
func (f paymentFixture) event(t *testing.T, token, body string) testkit.Response {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/internal/commerce/payment-events", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+token)
	recorder := httptest.NewRecorder()
	f.handler.ServeHTTP(recorder, request)
	result := testkit.Response{Status: recorder.Code, Body: map[string]any{}}
	if recorder.Body.Len() > 0 {
		if err := json.Unmarshal(recorder.Body.Bytes(), &result.Body); err != nil {
			t.Fatalf("payment event: invalid JSON %q", recorder.Body.String())
		}
	}
	return result
}

func (f paymentFixture) record(t *testing.T, collection, id string) *core.Record {
	t.Helper()
	record, err := f.app.FindRecordById(collection, id)
	if err != nil {
		t.Fatal(err)
	}
	return record
}

func (f paymentFixture) available(t *testing.T) float64 {
	t.Helper()
	batches, err := f.app.FindRecordsByFilter("credit_batches", "studentId={:id}", "created", 0, 0, dbx.Params{"id": f.studentID})
	if err != nil || len(batches) == 0 {
		t.Fatalf("batches = %v, %v", batches, err)
	}
	return batches[0].GetFloat("availableQuantity")
}

func (f paymentFixture) setPlugin(t *testing.T, values map[string]any) {
	t.Helper()
	plugin, err := f.app.FindFirstRecordByFilter("tenant_plugins", "tenant={:tenant} && plugin={:plugin}",
		dbx.Params{"tenant": tenancy.DefaultID, "plugin": tenancy.Payment})
	if err != nil {
		t.Fatal(err)
	}
	plugin.Load(values)
	if err := f.app.Save(plugin); err != nil {
		t.Fatal(err)
	}
}

func (f paymentFixture) service() *service {
	return &service{app: f.app, gateway: newGateway(f.module.Config)}
}

func TestPaymentCollectsAndRefunds(t *testing.T) {
	f := paymentSetup(t)
	orderID := f.checkout(t, "k1")
	if found, _ := paymentOf(f.app, orderID); found != nil {
		t.Fatal("checkout must not create a payment")
	}
	paid := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+orderID+"/mock-pay", nil), "mock pay")
	if paid["status"] != "completed" || paid["availableQuantity"] != 10.0 {
		t.Fatalf("paid = %v", paid)
	}
	payment, _ := paymentOf(f.app, orderID)
	if payment.GetString("status") != "succeeded" || payment.GetString("gatewayId") != "pay1" ||
		f.record(t, "orders", orderID).GetString("paymentRef") != "pay1" {
		t.Fatalf("payment = %v", payment.FieldsData())
	}
	failed(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+orderID+"/cashier", nil), 400, "PAYMENT_NOT_READY", "paid cashier")

	refund := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+orderID+"/refunds",
		map[string]any{"key": "r1", "expectedAmount": 80000}), "refund")
	if refund["status"] != "processing" {
		t.Fatalf("refund = %v", refund)
	}
	refundID := refund["id"].(string)
	done := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/refunds/"+refundID+"/mock-success", nil), "mock success")
	if done["status"] != "succeeded" {
		t.Fatalf("done = %v", done)
	}
	if attempt, _ := latestRefund(f.app, refundID); attempt.GetString("status") != "succeeded" || attempt.GetString("reference") != refundID {
		t.Fatalf("refund transaction = %v", attempt.FieldsData())
	}
	detail := ok(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/orders/"+orderID, nil), "ops detail")
	if detail["refunded"] != 80000.0 || detail["refundPending"] != false || asMap(detail["payment"])["id"] != "pay1" {
		t.Fatalf("detail = %v", detail)
	}
	finance := ok(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/finance", nil), "finance")
	payments := finance["payments"].([]any)
	if row := asMap(payments[0]); row["fulfillment"] != "completed" || row["name"] != "十节声乐课" || finance["mockEnabled"] != true ||
		asMap(finance["refunds"].([]any)[0])["reference"] != refundID {
		t.Fatalf("finance = %v", finance)
	}
	if result := f.call(t, f.teacher, http.MethodGet, "/ops/commerce/finance", nil); result.Code() != 403 {
		t.Fatalf("not ops = %v", result.Body)
	}
}

func TestFailedRefundRestoresAndRecovery(t *testing.T) {
	f := paymentSetup(t)
	orderID := f.buy(t, "k1")["id"].(string)
	refund := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/orders/"+orderID+"/refunds",
		map[string]any{"key": "r1", "expectedAmount": 80000, "reason": "学员搬家"}), "ops refund")
	// The recovery job sends the refund; the channel then rejects it.
	ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/recover", nil), "send refund")
	f.gateway.set("ref1", "status", "failed")
	recovered := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/orders/"+orderID+"/recover",
		map[string]any{"key": "s1", "reason": "渠道退款失败"}), "recover order")
	if recovered["refundPending"] != false || recovered["refunds"].([]any)[0].(map[string]any)["status"] != "failed" {
		t.Fatalf("recovered = %v", recovered)
	}
	if f.available(t) != 10 {
		t.Fatal("a failed package refund restores the credit")
	}
	failed(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/orders/"+orderID+"/recover",
		map[string]any{"key": "s1", "reason": "换个说法"}), 400, "RECOVERY_REQUEST_CONFLICT", "recover conflict")
	if notes, _ := f.app.FindRecordsByFilter(audit, `action="recovery_requested"`, "", 0, 0); len(notes) != 1 {
		t.Fatalf("payment audit = %v", notes)
	}
	cases := f.call(t, f.ops, http.MethodGet, "/ops/commerce/cases", nil)
	rows, _ := cases.Body["data"].([]any)
	if len(rows) != 1 || rows[0].(map[string]any)["id"] != "refund:"+refund["id"].(string) {
		t.Fatalf("cases = %v", cases.Body)
	}
	reviewed := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/cases/refund:"+refund["id"].(string),
		map[string]any{"status": "resolved", "note": "已线下核实"}), "resolve case")
	if reviewed["status"] != "resolved" {
		t.Fatalf("reviewed = %v", reviewed)
	}
	failed(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/refunds/"+refund["id"].(string)+"/retry",
		map[string]any{"reason": "再退一次"}), 400, "REFUND_RETRY_NOT_ALLOWED", "package refunds are not retried")

	// The recovery job settles a paid order without any request.
	pending := f.checkout(t, "k2")
	f.cashier(t, pending)
	f.gateway.set("pay2", "status", "succeeded")
	result := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/recover", nil), "recover all")
	if result["orders"].(map[string]any)["unresolved"] != 0.0 || f.record(t, "orders", pending).GetString("status") != "granted" {
		t.Fatalf("recover = %v", result)
	}
	closed := f.checkout(t, "k3")
	f.cashier(t, closed)
	f.gateway.set("pay3", "status", "closed")
	refreshed := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+closed+"/refresh", nil), "refresh")
	if refreshed["status"] != "failed" {
		t.Fatalf("refreshed = %v", refreshed)
	}
	if payment, _ := paymentOf(f.app, closed); payment.GetString("status") != "closed" {
		t.Fatalf("closed payment = %v", payment.FieldsData())
	}
}

// A failed reservation refund stays owed; finance retries it under a new reference.
func TestReservationRefundRetry(t *testing.T) {
	f := paymentSetup(t)
	orderID := f.buy(t, "k1")["id"].(string)
	order := f.record(t, "orders", orderID)
	order.Load(map[string]any{"pendingRefundCount": 1, "refundReservedMinor": 10000})
	if err := f.app.SaveNoValidate(order); err != nil {
		t.Fatal(err)
	}
	refund := testkit.Create(t, f.app, "order_refunds", map[string]any{"orderId": orderID, "studentId": f.studentID, "kind": "reservation",
		"status": "processing", "settlement": "online", "amountMinor": 10000, "held": []any{}, "version": 1})
	s := f.service()
	if err := s.syncRefund(refund.Id); err != nil {
		t.Fatal(err)
	}
	f.gateway.set("ref1", "status", "failed")
	if err := s.syncRefund(refund.Id); err != nil {
		t.Fatal(err)
	}
	if f.record(t, "order_refunds", refund.Id).GetString("status") != "failed" || f.record(t, "orders", orderID).GetFloat("pendingRefundCount") != 1 {
		t.Fatal("a failed reservation refund keeps its liability")
	}
	retried := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/refunds/"+refund.Id+"/retry", map[string]any{"reason": "渠道恢复后重试"}), "retry")
	if retried["status"] != "processing" {
		t.Fatalf("retried = %v", retried)
	}
	attempt, _ := latestRefund(f.app, refund.Id)
	if attempt.GetFloat("attempt") != 1 || attempt.GetString("reference") == refund.Id || attempt.GetString("gatewayId") != "ref2" {
		t.Fatalf("retry attempt = %v", attempt.FieldsData())
	}
	f.gateway.set("ref2", "status", "succeeded")
	if err := s.syncRefund(refund.Id); err != nil {
		t.Fatal(err)
	}
	if settled := f.record(t, "orders", orderID); settled.GetFloat("pendingRefundCount") != 0 || settled.GetFloat("refundedMinor") != 10000 {
		t.Fatalf("settled = %v", settled.FieldsData())
	}
}

// Hono: commerceOperations › configured payment events authenticate and reload trusted gateway state before acknowledging
func TestPaymentEventsAndJob(t *testing.T) {
	f := paymentSetup(t)
	orderID := f.checkout(t, "k1")
	event := func(token, body string) testkit.Response { return f.event(t, token, body) }
	if result := event(eventToken, `{"type":"payment.succeeded","reference":"`+orderID+`","targetId":"pay1"}`); result.Status != 503 || result.Body["error"] != "RECOVERY_PENDING" {
		t.Fatalf("before the cashier = %v", result)
	}
	f.cashier(t, orderID)
	if result := event("wrong", `{}`); result.Status != 401 || result.Body["error"] != "UNAUTHORIZED" {
		t.Fatalf("unauthorized = %v", result)
	}
	if result := event(eventToken, `{"reference":1}`); result.Status != 400 || result.Body["error"] != "INVALID_EVENT" {
		t.Fatalf("invalid = %v", result)
	}
	if result := event(eventToken, `{"type":"payment.succeeded","reference":"`+orderID+`","targetId":"other"}`); result.Status != 409 {
		t.Fatalf("mismatch = %v", result)
	}
	if result := event(eventToken, `{"type":"payment.succeeded","reference":"missing"}`); result.Status != 503 || result.Body["error"] != "RECOVERY_PENDING" {
		t.Fatalf("missing = %v", result)
	}
	if result := event(eventToken, `{"type":"payment.succeeded","reference":"`+orderID+`","targetId":"pay1"}`); result.Status != 503 || result.Body["error"] != "FULFILLMENT_PENDING" {
		t.Fatalf("pending = %v", result)
	}
	// The job starts only now: a tick racing the checkout above would fail it on the shared version claim.
	job := f.module
	job.RecoveryInterval = 20 * time.Millisecond
	job.startRecovery(f.app, f.service())
	f.gateway.set("pay1", "status", "succeeded")
	deadline := time.Now().Add(5 * time.Second)
	for f.record(t, "orders", orderID).GetString("status") != "granted" {
		if time.Now().After(deadline) {
			t.Fatal("recovery job did not complete the order")
		}
		time.Sleep(20 * time.Millisecond)
	}
	if result := event(eventToken, `{"type":"payment.succeeded","reference":"`+orderID+`","targetId":"pay1"}`); result.Status != http.StatusNoContent {
		t.Fatalf("delivered = %v", result)
	}
}

// A receipt that does not match the order is held for finance: no credit, a money case.
func TestPaymentMismatchOpensACase(t *testing.T) {
	f := paymentSetup(t)
	orderID := f.checkout(t, "k1")
	f.cashier(t, orderID)
	f.gateway.set("pay1", "amount", 1.0)
	f.gateway.set("pay1", "status", "succeeded")
	failed(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+orderID+"/refresh", nil), 400, "PAYMENT_RECEIPT_MISMATCH", "mismatch")
	if order := f.record(t, "orders", orderID); order.GetString("status") != "pending" {
		t.Fatalf("mismatched order = %v", order.FieldsData())
	}
	if payment, _ := paymentOf(f.app, orderID); payment.GetString("lastError") != receiptMismatch {
		t.Fatalf("payment = %v", payment.FieldsData())
	}
	if batches, _ := f.app.FindAllRecords("credit_batches"); len(batches) != 0 {
		t.Fatal("a mismatched receipt must not grant credit")
	}
	cases := ok(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/cases", nil), "cases")
	_ = cases
	rows := f.call(t, f.ops, http.MethodGet, "/ops/commerce/cases", nil).Body["data"].([]any)
	if len(rows) != 1 || asMap(rows[0])["id"] != "order:"+orderID || asMap(rows[0])["label"] != "付款信息不一致，已暂停自动发课" {
		t.Fatalf("cases = %v", rows)
	}
}

// Winding down (by expiry) stops new payments but settles money in flight;
// the platform pause stops new payments for every tenant; disabling removes
// every plugin route while orders stay readable.
func TestPluginLifecycle(t *testing.T) {
	f := paymentSetup(t)
	paidID := f.buy(t, "k1")["id"].(string)
	waiting := f.checkout(t, "k2")
	f.cashier(t, waiting)

	switches, err := f.app.FindCollectionByNameOrId("platform_plugins")
	if err != nil {
		t.Fatal(err)
	}
	pause := core.NewRecord(switches)
	pause.Load(map[string]any{"plugin": tenancy.Payment, "paused": true, "note": "通道故障"})
	if err := f.app.Save(pause); err != nil {
		t.Fatal(err)
	}
	missing(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+waiting+"/cashier", nil), "paused cashier")
	missing(t, f.call(t, f.student, http.MethodGet, "/v1/student/commerce/catalog", nil), "paused catalog")
	ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+waiting+"/refresh", nil), "paused refresh")
	pause.Set("paused", false)
	if err := f.app.Save(pause); err != nil {
		t.Fatal(err)
	}

	f.setPlugin(t, map[string]any{"expiresAt": "2020-01-01 00:00:00.000Z"})
	missing(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+waiting+"/cashier", nil), "expired cashier")
	missing(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+waiting+"/mock-pay", nil), "expired mock pay")
	f.gateway.set("pay2", "status", "succeeded")
	result := f.event(t, eventToken,
		`{"type":"payment.succeeded","reference":"`+waiting+`","targetId":"pay2"}`)
	if result.Status != http.StatusNoContent || f.record(t, "orders", waiting).GetString("status") != "granted" {
		t.Fatalf("callback while winding down = %v", result)
	}
	refund := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+paidID+"/refunds",
		map[string]any{"key": "r1", "expectedAmount": 80000}), "refund while winding down")
	ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/recover", nil), "recover while winding down")
	f.gateway.set("ref1", "status", "succeeded")
	ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/recover", nil), "settle while winding down")
	if f.record(t, "order_refunds", refund["id"].(string)).GetString("status") != "succeeded" {
		t.Fatal("a winding-down plugin still pays refunds out")
	}

	f.setPlugin(t, map[string]any{"status": tenancy.Disabled})
	missing(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/finance", nil), "disabled finance")
	missing(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+waiting+"/refresh", nil), "disabled refresh")
	if result := f.event(t, eventToken, `{}`); result.Status != http.StatusNotFound {
		t.Fatalf("disabled callback = %v", result)
	}
	if view := ok(t, f.call(t, f.student, http.MethodGet, "/v1/student/commerce/orders/"+waiting, nil), "order without plugin"); view["status"] != "completed" {
		t.Fatalf("order without plugin = %v", view)
	}
}

// Hono: commercePlanning › gateway client does not expose credentials or mistake transport failure for refund failure
func TestGatewayClientRequestsAndFailures(t *testing.T) {
	var header http.Header
	var body string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		header, body = r.Header.Clone(), string(raw)
		_, _ = w.Write([]byte(`{"id":"payment"}`))
	}))
	t.Cleanup(server.Close)
	config := Config{GatewayURL: server.URL, ServiceToken: serviceToken, MockToken: mockToken, Mock: true}
	payment, err := newGateway(config).createPayment("order", 100.0, nil, nil)
	if err != nil || payment["id"] != "payment" {
		t.Fatalf("payment = %v, %v", payment, err)
	}
	if header.Get("Idempotency-Key") != "order" || header.Get("Authorization") != "Bearer "+serviceToken ||
		body != `{"amount":100,"currency":"CNY","reference":"order"}` {
		t.Fatalf("request = %v %s", header, body)
	}

	closed := httptest.NewServer(http.NotFoundHandler())
	closed.Close()
	broken := config
	broken.GatewayURL = closed.URL
	_, err = newGateway(broken).payment("id")
	failsWith(t, err, "PAYMENT_RESULT_UNKNOWN")
	if strings.Contains(err.Error(), serviceToken) {
		t.Fatal("credential leaked")
	}
	production := config
	production.Mock = false
	failsWith(t, newGateway(production).mockSuccess("id"), "MOCK_PAYMENT_DISABLED")
	_, err = newGateway(Config{GatewayURL: "http://remote.example", ServiceToken: serviceToken}).payment("id")
	failsWith(t, err, "PAYMENT_TLS_REQUIRED")
}

// Hono: commercePlanning › gateway client reports non-JSON proxy failures as channel errors
func TestGatewayClientNonJSONFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte("<html>bad gateway</html>"))
	}))
	t.Cleanup(server.Close)
	_, err := newGateway(Config{GatewayURL: server.URL, ServiceToken: serviceToken}).payment("id")
	failsWith(t, err, "PAYMENT_CHANNEL_ERROR")
}

// Hono: commercePlanning › recovery acknowledges orphan events and cashier rejects closed payment windows
func TestRecoveryAcksOrphansAndCashierClosesWindow(t *testing.T) {
	f := paymentSetup(t)
	f.gateway.events = []any{map[string]any{"id": "orphan", "data": map[string]any{"type": "payment.closed", "targetId": "x",
		"payload": map[string]any{"reference": "unknown", "status": "closed"}}}}
	if _, err := f.service().recover(); err != nil {
		t.Fatal(err)
	}
	if raw, _ := json.Marshal(f.gateway.acked); string(raw) != `["orphan"]` {
		t.Fatalf("acked = %v", f.gateway.acked)
	}
	orderID := f.checkout(t, "k1")
	f.cashier(t, orderID)
	f.gateway.set("pay1", "status", "closed")
	failed(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+orderID+"/cashier", nil),
		400, "PAYMENT_WINDOW_CLOSED", "closed window")
}

// Hono: commerceRoutes › finance and recovery reject ordinary teacher, student and forced-password-change accounts
func TestRecoveryNeedsFinance(t *testing.T) {
	f := paymentSetup(t)
	signer, _ := auth.NewSigner(testkit.Secret)
	sign := func(id, role string, admin bool, extra auth.Claims) map[string]string {
		claims := auth.Claims{"scope": auth.OpsScope}
		for key, value := range extra {
			claims[key] = value
		}
		value, err := signer.Sign(id, "S1", role, admin, claims, auth.OpsTokenTTL)
		if err != nil {
			t.Fatal(err)
		}
		return testkit.Bearer(value)
	}
	for _, headers := range []map[string]string{f.student, sign("teacher", "teacher", false, nil),
		sign("admin", "teacher", true, auth.Claims{"passwordChangeRequired": true})} {
		if result := f.call(t, headers, http.MethodPost, "/ops/commerce/recover", map[string]any{}); result.Code() != 403 {
			t.Fatalf("recover allowed: %v", result.Body)
		}
	}
	for _, headers := range []map[string]string{sign("admin", "teacher", true, nil),
		sign("finance", "teacher", false, auth.Claims{"courseCreditCapabilities": []string{coursecredit.Finance}})} {
		ok(t, f.call(t, headers, http.MethodPost, "/ops/commerce/recover", map[string]any{}), "recover")
	}
}

// Hono: commerceRoutes › feature-off and production remove routes; cross-student access is denied before mutation
func TestRoutesOffInProductionAndOwnershipFirst(t *testing.T) {
	f := paymentSetup(t)
	orderID := f.checkout(t, "k1")
	f.cashier(t, orderID)
	production := f.module
	production.Config.Mock = false
	handler := testkit.Serve(t, f.app, production.Register)
	for path, headers := range map[string]map[string]string{
		"/v1/student/commerce/orders/" + orderID + "/mock-pay": f.student,
		"/ops/commerce/refunds/x/mock-success":                 f.ops,
	} {
		request := httptest.NewRequest(http.MethodPost, path, strings.NewReader("{}"))
		request.Header.Set("Authorization", headers["Authorization"])
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusNotFound {
			t.Fatalf("%s = %d", path, recorder.Code)
		}
	}
	other := testkit.Create(t, f.app, "students", map[string]any{"cellphone": "13900000002", "realName": "学员乙"})
	signer, _ := auth.NewSigner(testkit.Secret)
	token, _ := signer.Sign(other.Id, "S2", "student", false, nil, auth.OpsTokenTTL)
	f.gateway.set("pay1", "status", "succeeded")
	failed(t, f.call(t, testkit.Bearer(token), http.MethodPost, "/v1/student/commerce/orders/"+orderID+"/refresh", nil),
		403, "COMMERCE_ORDER_FORBIDDEN", "other student")
	if f.record(t, "orders", orderID).GetString("status") != "pending" {
		t.Fatal("a forbidden refresh must not sync the order")
	}

	disabled := testkit.Serve(t, testkit.NewApp(t), Module{Enabled: false}.Register)
	recorder := httptest.NewRecorder()
	disabled.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/ops/commerce/finance", nil))
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("disabled = %d", recorder.Code)
	}
}
