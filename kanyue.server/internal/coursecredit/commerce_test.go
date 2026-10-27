package coursecredit

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
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

// set changes a payment's or refund's status, as the channel would.
func (g *fakeGateway) set(id, status string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if row, ok := g.payments[id]; ok {
		row["status"] = status
	}
	if row, ok := g.refunds[id]; ok {
		row["status"] = status
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

type commerceFixture struct {
	app                   core.App
	handler               http.Handler
	gateway               *fakeGateway
	module                CommerceModule
	ops, student, teacher map[string]string
	studentID, offerID    string
	packageID, priceID    string
}

func (f commerceFixture) call(t *testing.T, headers map[string]string, method, path string, body any) testkit.Response {
	t.Helper()
	return testkit.Call(t, f.handler, method, path, body, headers)
}

var commercePolicy = map[string]any{"version": 1, "packageRefund": "unused_paid_value", "reservationRefund": "credit",
	"cancellationTiers": []any{map[string]any{"beforeMinutes": 0, "feeBps": 0}}}

func commerceSetup(t *testing.T) commerceFixture {
	t.Helper()
	app := testkit.NewApp(t)
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
	module := CommerceModule{Signer: signer, Enabled: true, Config: CommerceConfig{
		GatewayURL: base, ServiceToken: serviceToken, MockToken: mockToken, EventToken: eventToken, Mock: true}}
	f := commerceFixture{
		app: app, handler: testkit.Serve(t, app, module.Register), gateway: fake, module: module,
		ops:       sign(operator.Id, "teacher", auth.Claims{"scope": auth.OpsScope, "courseCreditCapabilities": []string{Finance}}),
		teacher:   sign(teacher.Id, "teacher", nil),
		student:   sign(student.Id, "student", nil),
		studentID: student.Id, packageID: pkg.Id, priceID: price.Id,
	}
	offer := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/offers", map[string]any{"key": "offer-1", "name": " 十节声乐课 ",
		"packageId": pkg.Id, "priceVersionId": price.Id, "policy": commercePolicy}), "save offer")
	f.offerID = offer["id"].(string)
	published := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/offers/"+f.offerID+"/status",
		map[string]any{"status": "active", "version": 1, "reason": "开放购买"}), "publish")
	if published["status"] != "active" || published["version"] != 2.0 {
		t.Fatalf("published = %v", published)
	}
	return f
}

// buy places an order and pays it through the mock channel.
func (f commerceFixture) buy(t *testing.T, key string) map[string]any {
	t.Helper()
	order := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders", map[string]any{"key": key, "offerId": f.offerID}), "checkout "+key)
	if order["status"] != "pending" || order["mockPayment"] != true || order["amount"] != 80000.0 {
		t.Fatalf("order = %v", order)
	}
	paid := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+order["id"].(string)+"/mock-pay", nil), "mock pay")
	if paid["status"] != "completed" || paid["availableQuantity"] != 10.0 {
		t.Fatalf("paid = %v", paid)
	}
	return paid
}

func (f commerceFixture) record(t *testing.T, collection, id string) *core.Record {
	t.Helper()
	record, err := f.app.FindRecordById(collection, id)
	if err != nil {
		t.Fatal(err)
	}
	return record
}

func TestCommerceCheckoutPayRefund(t *testing.T) {
	f := commerceSetup(t)
	catalog := f.call(t, f.student, http.MethodGet, "/v1/student/commerce/catalog", nil)
	if catalog.Code() != 10000 || !strings.Contains(fmtJSON(catalog.Body["data"]), "十节声乐课") {
		t.Fatalf("catalog = %v", catalog.Body)
	}
	paid := f.buy(t, "k1")
	orderID := paid["id"].(string)
	if f.record(t, "orders", orderID).GetString("status") != "granted" {
		t.Fatal("order not granted")
	}
	replay := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders", map[string]any{"key": "k1", "offerId": f.offerID}), "replay")
	if replay["id"] != orderID || replay["status"] != "completed" {
		t.Fatalf("replay = %v", replay)
	}
	failed(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders", map[string]any{"key": "k1", "offerId": "x"}), 400, "CHECKOUT_CONFLICT", "conflict")
	failed(t, f.call(t, f.teacher, http.MethodGet, "/v1/student/commerce/orders", nil), 403, "STUDENT_LEARNING_STUDENT_REQUIRED", "teacher")

	preview := ok(t, f.call(t, f.student, http.MethodGet, "/v1/student/commerce/orders/"+orderID+"/refund-preview", nil), "preview")
	if preview["amount"] != 80000.0 || preview["blocked"] != false {
		t.Fatalf("preview = %v", preview)
	}
	failed(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+orderID+"/refunds",
		map[string]any{"key": "r1", "expectedAmount": 1}), 400, "REFUND_QUOTE_CHANGED", "stale quote")
	refund := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+orderID+"/refunds",
		map[string]any{"key": "r1", "expectedAmount": 80000}), "refund")
	if refund["status"] != "processing" || refund["amount"] != 80000.0 {
		t.Fatalf("refund = %v", refund)
	}
	if batch := firstBatch(t, f.app, f.studentID); batch.GetFloat("availableQuantity") != 0 {
		t.Fatalf("withdrawn batch = %v", batch)
	}
	done := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/refunds/"+refund["id"].(string)+"/mock-success", nil), "mock success")
	if done["status"] != "succeeded" {
		t.Fatalf("done = %v", done)
	}
	detail := ok(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/orders/"+orderID, nil), "ops detail")
	if detail["refunded"] != 80000.0 || detail["refundPending"] != false || detail["paymentUnavailable"] != false ||
		len(detail["refunds"].([]any)) != 1 || detail["student"].(map[string]any)["name"] != "学员甲" {
		t.Fatalf("detail = %v", detail)
	}
	if _, leaked := detail["refunds"].([]any)[0].(map[string]any)["gatewayId"]; leaked {
		t.Fatal("gatewayId leaked")
	}

	list := ok(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/orders?search=学员&status=completed", nil), "ops list")
	if rows := items(list); len(rows) != 1 || rows[0]["paymentId"] != "pay1" {
		t.Fatalf("list = %v", list)
	}
	failed(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/orders?status=x", nil), 400, "INVALID_ORDER_STATUS", "status")
	failed(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/orders?from=2026-02-30", nil), 400, "INVALID_DATE_FILTER", "date")
	failed(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/orders?perPage=101", nil), 400, "INVALID_PAGINATION", "page")
	finance := ok(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/finance", nil), "finance")
	payment := finance["payments"].([]any)[0].(map[string]any)
	if payment["fulfillment"] != "completed" || payment["name"] != "十节声乐课" || finance["mockEnabled"] != true ||
		finance["refunds"].([]any)[0].(map[string]any)["reference"] != refund["id"] {
		t.Fatalf("finance = %v", finance)
	}
	if result := f.call(t, f.teacher, http.MethodGet, "/ops/commerce/finance", nil); result.Code() != 403 {
		t.Fatalf("not ops = %v", result.Body)
	}
}

func TestCommerceFailedRefundRestoresAndRecovery(t *testing.T) {
	f := commerceSetup(t)
	orderID := f.buy(t, "k1")["id"].(string)
	failed(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/orders/"+orderID+"/refunds",
		map[string]any{"key": "r1", "expectedAmount": 80000}), 400, "COMMERCE_REASON_REQUIRED", "no reason")
	refund := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/orders/"+orderID+"/refunds",
		map[string]any{"key": "r1", "expectedAmount": 80000, "reason": "学员搬家"}), "ops refund")
	failed(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/orders/"+orderID+"/refunds",
		map[string]any{"key": "r1", "expectedAmount": 80000, "reason": "其他原因"}), 400, "REFUND_REQUEST_CONFLICT", "replay conflict")
	f.gateway.set("ref1", "failed")
	recovered := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/orders/"+orderID+"/recover",
		map[string]any{"key": "s1", "reason": "渠道退款失败"}), "recover order")
	if recovered["refundPending"] != false || recovered["refunds"].([]any)[0].(map[string]any)["status"] != "failed" {
		t.Fatalf("recovered = %v", recovered)
	}
	if batch := firstBatch(t, f.app, f.studentID); batch.GetFloat("availableQuantity") != 10 {
		t.Fatalf("restored batch = %v", batch)
	}
	failed(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/orders/"+orderID+"/recover",
		map[string]any{"key": "s1", "reason": "换个说法"}), 400, "RECOVERY_REQUEST_CONFLICT", "recover conflict")
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

	// The recovery job settles a paid order without any request.
	pending := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders", map[string]any{"key": "k2", "offerId": f.offerID}), "checkout k2")
	f.gateway.set("pay2", "succeeded")
	result := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/recover", nil), "recover all")
	if result["orders"].(map[string]any)["unresolved"] != 0.0 || f.record(t, "commerce_orders", pending["id"].(string)).GetString("status") != "completed" {
		t.Fatalf("recover = %v", result)
	}
	failedOrder := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders", map[string]any{"key": "k3", "offerId": f.offerID}), "checkout k3")
	f.gateway.set("pay3", "closed")
	refreshed := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+failedOrder["id"].(string)+"/refresh", nil), "refresh")
	if refreshed["status"] != "failed" {
		t.Fatalf("refreshed = %v", refreshed)
	}
}

// Hono: commerceOperations › configured payment events authenticate and reload trusted gateway state before acknowledging
func TestCommercePaymentEventsAndJob(t *testing.T) {
	f := commerceSetup(t)
	order := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders", map[string]any{"key": "k1", "offerId": f.offerID}), "checkout")
	orderID := order["id"].(string)
	event := func(token, body string) testkit.Response {
		return testkit.Raw(t, f.handler, http.MethodPost, "/internal/commerce/payment-events", body, testkit.Bearer(token))
	}
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
	job.startRecovery(f.app, &commerce{app: f.app, gateway: newGateway(job.Config)})
	f.gateway.set("pay1", "succeeded")
	deadline := time.Now().Add(5 * time.Second)
	for f.record(t, "commerce_orders", orderID).GetString("status") != "completed" {
		if time.Now().After(deadline) {
			t.Fatal("recovery job did not complete the order")
		}
		time.Sleep(20 * time.Millisecond)
	}
	request := httptest.NewRequest(http.MethodPost, "/internal/commerce/payment-events",
		strings.NewReader(`{"type":"payment.succeeded","reference":"`+orderID+`","targetId":"pay1"}`))
	request.Header.Set("Authorization", "Bearer "+eventToken)
	recorder := httptest.NewRecorder()
	f.handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("delivered = %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestCommerceOffersAndGate(t *testing.T) {
	f := commerceSetup(t)
	body := map[string]any{"key": "offer-1", "name": "十节声乐课", "packageId": f.packageID, "priceVersionId": f.priceID, "policy": commercePolicy}
	replay := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/offers", body), "replay")
	if replay["id"] != f.offerID || replay["status"] != "active" {
		t.Fatalf("replay = %v", replay)
	}
	body["name"] = "改名"
	failed(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/offers", body), 400, "OFFER_REQUEST_CONFLICT", "conflict")
	body["id"], body["version"] = f.offerID, 2
	failed(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/offers", body), 400, "OFFER_VERSION_CONFLICT", "published")
	failed(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/offers/"+f.offerID+"/status",
		map[string]any{"status": "active", "version": 2, "reason": "再次发布"}), 400, "INVALID_OFFER_TRANSITION", "transition")
	withdrawn := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/offers/"+f.offerID+"/status",
		map[string]any{"status": "inactive", "version": 2, "reason": "停止销售"}), "withdraw")
	if withdrawn["status"] != "inactive" {
		t.Fatalf("withdrawn = %v", withdrawn)
	}
	listed := ok(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/offers", nil), "offers")
	if len(listed["offers"].([]any)) != 1 || len(listed["prices"].([]any)) != 1 {
		t.Fatalf("offers = %v", listed)
	}
	audits, err := f.app.FindRecordsByFilter("commerce_audit", `subjectId="`+f.offerID+`"`, "", 0, 0)
	if err != nil || len(audits) != 3 {
		t.Fatalf("audits = %d, %v", len(audits), err)
	}
	failed(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders", map[string]any{"key": "k1", "offerId": f.offerID}), 400, "OFFER_UNAVAILABLE", "withdrawn offer")

	disabled := testkit.Serve(t, testkit.NewApp(t), CommerceModule{Enabled: false}.Register)
	request := httptest.NewRequest(http.MethodGet, "/ops/commerce/finance", nil)
	recorder := httptest.NewRecorder()
	disabled.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("disabled = %d", recorder.Code)
	}
}

// fmtJSON renders a decoded value for substring checks.
func fmtJSON(value any) string {
	raw, _ := json.Marshal(value)
	return string(raw)
}
