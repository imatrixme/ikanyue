package coursecredit

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/tenancy"
	"kanyue.server/internal/testkit"
)

// The order center on its own: the payment plugin is stood in for by calling
// the commands it uses (OrderPaid, RefundSucceeded, ...), which proves the core
// sells, fulfils and refunds without any plugin code.

type orderFixture struct {
	// app is scoped to the default tenant, as requests and jobs are.
	app                   core.App
	handler               http.Handler
	module                OrdersModule
	ops, student, teacher map[string]string
	studentID, offerID    string
	packageID, priceID    string
}

func (f orderFixture) call(t *testing.T, headers map[string]string, method, path string, body any) testkit.Response {
	t.Helper()
	return testkit.Call(t, f.handler, method, path, body, headers)
}

var commercePolicy = map[string]any{"version": 1, "packageRefund": "unused_paid_value", "reservationRefund": "credit",
	"cancellationTiers": []any{map[string]any{"beforeMinutes": 0, "feeBps": 0}}}

func orderSetup(t *testing.T) orderFixture {
	t.Helper()
	// The order center runs with tenant fields, as in production, so its tenant checks are real.
	base := testkit.NewApp(t)
	testkit.WithTenants(t, base)
	app := tenancy.Scope(base, tenancy.DefaultID)
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

	module := OrdersModule{Signer: signer, Enabled: true, MockPayment: true}
	f := orderFixture{
		app: app, handler: testkit.Serve(t, app, module.Register), module: module,
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

// checkout places an order without paying it.
func (f orderFixture) checkout(t *testing.T, key string) string {
	t.Helper()
	order := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders", map[string]any{"key": key, "offerId": f.offerID}), "checkout "+key)
	if order["status"] != "pending" || order["mockPayment"] != true || order["amount"] != 80000.0 {
		t.Fatalf("order = %v", order)
	}
	return order["id"].(string)
}

// buy places an order and books its payment the way the payment plugin reports it.
func (f orderFixture) buy(t *testing.T, key string) map[string]any {
	t.Helper()
	orderID := f.checkout(t, key)
	if err := OrderPaid(f.app, orderID, "pay-"+key, 80000, nil); err != nil {
		t.Fatal(err)
	}
	paid := ok(t, f.call(t, f.student, http.MethodGet, "/v1/student/commerce/orders/"+orderID, nil), "paid "+key)
	if paid["status"] != "completed" || paid["availableQuantity"] != 10.0 {
		t.Fatalf("paid = %v", paid)
	}
	return paid
}

func (f orderFixture) record(t *testing.T, collection, id string) *core.Record {
	t.Helper()
	record, err := f.app.FindRecordById(collection, id)
	if err != nil {
		t.Fatal(err)
	}
	return record
}

// setPlugin changes the default tenant's payment plugin record.
func (f orderFixture) setPlugin(t *testing.T, values map[string]any) {
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

func TestOrderCenterSellsFulfilsAndRefunds(t *testing.T) {
	f := orderSetup(t)
	catalog := f.call(t, f.student, http.MethodGet, "/v1/student/commerce/catalog", nil)
	if catalog.Code() != 10000 || !strings.Contains(fmtJSON(catalog.Body["data"]), "十节声乐课") {
		t.Fatalf("catalog = %v", catalog.Body)
	}
	paid := f.buy(t, "k1")
	orderID := paid["id"].(string)
	order := f.record(t, "orders", orderID)
	if order.GetString("status") != "granted" || order.GetString("settlement") != "online" || order.GetString("paymentRef") != "pay-k1" {
		t.Fatalf("order = %v", order.FieldsData())
	}
	if err := OrderPaid(f.app, orderID, "pay-k1", 80000, nil); err != nil {
		t.Fatalf("replayed receipt = %v", err)
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
	refundID := refund["id"].(string)
	if row := f.record(t, "order_refunds", refundID); row.GetString("settlement") != "online" || row.GetString("kind") != "package" {
		t.Fatalf("refund request = %v", row.FieldsData())
	}
	if batch := firstBatch(t, f.app, f.studentID); batch.GetFloat("availableQuantity") != 0 {
		t.Fatalf("withdrawn batch = %v", batch)
	}
	if err := RefundSucceeded(f.app, refundID, "ref1"); err != nil {
		t.Fatal(err)
	}
	if err := RefundSucceeded(f.app, refundID, "ref1"); err != nil {
		t.Fatalf("replayed refund result = %v", err)
	}
	done := ok(t, f.call(t, f.student, http.MethodGet, "/v1/student/commerce/refunds/"+refundID, nil), "refund detail")
	if done["status"] != "succeeded" {
		t.Fatalf("done = %v", done)
	}
	detail := ok(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/orders/"+orderID, nil), "ops detail")
	if detail["refunded"] != 80000.0 || detail["refundPending"] != false || detail["paymentUnavailable"] != false ||
		len(detail["refunds"].([]any)) != 1 || detail["student"].(map[string]any)["name"] != "学员甲" ||
		asMap(detail["payment"])["id"] != "pay-k1" {
		t.Fatalf("detail = %v", detail)
	}
	if _, leaked := detail["refunds"].([]any)[0].(map[string]any)["held"]; leaked {
		t.Fatal("held credit leaked")
	}

	list := ok(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/orders?search=学员&status=completed", nil), "ops list")
	if rows := items(list); len(rows) != 1 || rows[0]["paymentId"] != "pay-k1" {
		t.Fatalf("list = %v", list)
	}
	failed(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/orders?status=x", nil), 400, "INVALID_ORDER_STATUS", "status")
	failed(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/orders?from=2026-02-30", nil), 400, "INVALID_DATE_FILTER", "date")
	failed(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/orders?perPage=101", nil), 400, "INVALID_PAGINATION", "page")
	if result := f.call(t, f.teacher, http.MethodGet, "/ops/commerce/orders", nil); result.Code() != 403 {
		t.Fatalf("not ops = %v", result.Body)
	}
}

func TestRefundFailureRestoresCredit(t *testing.T) {
	f := orderSetup(t)
	orderID := f.buy(t, "k1")["id"].(string)
	failed(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/orders/"+orderID+"/refunds",
		map[string]any{"key": "r1", "expectedAmount": 80000}), 400, "COMMERCE_REASON_REQUIRED", "no reason")
	refund := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/orders/"+orderID+"/refunds",
		map[string]any{"key": "r1", "expectedAmount": 80000, "reason": "学员搬家"}), "ops refund")
	failed(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/orders/"+orderID+"/refunds",
		map[string]any{"key": "r1", "expectedAmount": 80000, "reason": "其他原因"}), 400, "REFUND_REQUEST_CONFLICT", "replay conflict")
	if err := RefundFailed(f.app, refund["id"].(string), "ref1"); err != nil {
		t.Fatal(err)
	}
	detail := ok(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/orders/"+orderID, nil), "detail")
	if detail["refundPending"] != false || detail["refunds"].([]any)[0].(map[string]any)["status"] != "failed" {
		t.Fatalf("detail = %v", detail)
	}
	if batch := firstBatch(t, f.app, f.studentID); batch.GetFloat("availableQuantity") != 10 {
		t.Fatalf("restored batch = %v", batch)
	}
	failsWith(t, ReopenRefund(f.app, refund["id"].(string), map[string]any{"id": "x", "reason": "重试"}), "REFUND_RETRY_NOT_ALLOWED")
}

// A receipt is booked only when it pays exactly what the order costs; a closed
// payment fails the order, and a late receipt still fulfils it.
func TestOrderPaidChecksTheReceipt(t *testing.T) {
	f := orderSetup(t)
	orderID := f.checkout(t, "k1")
	failsWith(t, OrderPaid(f.app, orderID, "pay-k1", 79999, nil), "PAYMENT_RECEIPT_MISMATCH")
	if order := f.record(t, "orders", orderID); order.GetString("status") != "pending" || order.GetString("paymentRef") != "" {
		t.Fatalf("mismatched receipt booked: %v", order.FieldsData())
	}
	if batches, _ := f.app.FindAllRecords("credit_batches"); len(batches) != 0 {
		t.Fatal("a mismatched receipt must not grant credit")
	}
	payable, err := PayableOrder(f.app, orderID)
	if err != nil || payable.Amount != 80000 || payable.Status != "pending" || payable.StudentID != f.studentID || payable.Name != "十节声乐课" {
		t.Fatalf("payable = %+v, %v", payable, err)
	}
	if err := OrderPaymentFailed(f.app, orderID); err != nil {
		t.Fatal(err)
	}
	if view := ok(t, f.call(t, f.student, http.MethodGet, "/v1/student/commerce/orders/"+orderID, nil), "failed"); view["status"] != "failed" {
		t.Fatalf("failed view = %v", view)
	}
	if err := OrderPaid(f.app, orderID, "pay-k1", 80000, nil); err != nil {
		t.Fatal(err)
	}
	if f.record(t, "orders", orderID).GetString("status") != "granted" {
		t.Fatal("a late receipt must still fulfil the order")
	}
	if _, err := PayableOrder(f.app, "missing"); err == nil {
		t.Fatal("unknown order")
	}
}

// Winding down stops selling but keeps every order, refund request and
// credit; disabling hands refunds still owed online to the studio.
func TestOrderCenterSurvivesThePaymentPlugin(t *testing.T) {
	f := orderSetup(t)
	first := f.buy(t, "k1")["id"].(string)
	second := f.buy(t, "k2")["id"].(string)
	f.setPlugin(t, map[string]any{"expiresAt": "2020-01-01 00:00:00.000Z"})
	for _, request := range []struct{ method, path string }{{http.MethodGet, "/v1/student/commerce/catalog"},
		{http.MethodPost, "/v1/student/commerce/orders"}} {
		result := testkit.Call(t, f.handler, request.method, request.path, map[string]any{"key": "k3", "offerId": f.offerID}, f.student)
		if result.Status != http.StatusNotFound || result.Body["message"] != "接口不存在" {
			t.Fatalf("%s while winding down = %d %v", request.path, result.Status, result.Body)
		}
	}
	if rows := f.call(t, f.student, http.MethodGet, "/v1/student/commerce/orders", nil).Body["data"].([]any); len(rows) != 2 {
		t.Fatalf("orders while winding down = %v", rows)
	}
	refund := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+first+"/refunds",
		map[string]any{"key": "r1", "expectedAmount": 80000}), "refund while winding down")
	if f.record(t, "order_refunds", refund["id"].(string)).GetString("settlement") != "online" {
		t.Fatal("a winding-down plugin still settles refunds online")
	}

	// The refund may already be at the gateway: disabling now could pay it twice.
	plugin, err := f.app.FindFirstRecordByFilter("tenant_plugins", "tenant={:tenant} && plugin={:plugin}",
		dbx.Params{"tenant": tenancy.DefaultID, "plugin": tenancy.Payment})
	if err != nil {
		t.Fatal(err)
	}
	plugin.Set("status", tenancy.Disabled)
	failsWith(t, f.app.Save(plugin), "PAYMENT_REFUNDS_IN_FLIGHT")
	if tenancy.PluginState(f.app, tenancy.DefaultID, tenancy.Payment) != tenancy.WindingDown {
		t.Fatal("a refused disable leaves the plugin winding down")
	}
	if err := RefundFailed(f.app, refund["id"].(string), "ref1"); err != nil {
		t.Fatal(err)
	}
	owed := testkit.Create(t, f.app, "order_refunds", map[string]any{"orderId": second, "studentId": f.studentID, "kind": "reservation",
		"status": "failed", "settlement": "online", "amountMinor": 10000, "held": []any{}, "version": 1})

	f.setPlugin(t, map[string]any{"status": tenancy.Disabled})
	if row := f.record(t, "order_refunds", owed.Id); row.GetString("settlement") != "offline" || row.GetString("status") != "processing" {
		t.Fatalf("a failed reservation refund is still owed; the studio takes it over: %v", row.FieldsData())
	}
	if f.record(t, "order_refunds", refund["id"].(string)).GetString("settlement") != "online" {
		t.Fatal("settled refunds keep their history")
	}
	// A refund quoted just before the disable is written after it: it must not wait for a plugin that is gone.
	stale := testkit.Create(t, f.app, "order_refunds", map[string]any{"orderId": second, "studentId": f.studentID, "kind": "reservation",
		"status": "processing", "settlement": "online", "amountMinor": 10000, "held": []any{}, "version": 1})
	if f.record(t, "order_refunds", stale.Id).GetString("settlement") != "offline" {
		t.Fatal("a refund written after disabling is settled offline")
	}
	later := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+second+"/refunds",
		map[string]any{"key": "r2", "expectedAmount": 80000}), "refund after disabling")
	if f.record(t, "order_refunds", later["id"].(string)).GetString("settlement") != "offline" {
		t.Fatal("refunds requested without the plugin are settled offline")
	}
	detail := ok(t, f.call(t, f.student, http.MethodGet, "/v1/student/commerce/orders/"+first, nil), "order without plugin")
	if detail["status"] != "completed" || detail["refundPending"] != false {
		t.Fatalf("detail = %v", detail)
	}
}

// An order inside its payment window may still be paid; disabling then would leave
// the money unbooked, so it waits until the window ends and closes the order.
func TestDisablingWaitsForOpenPaymentWindows(t *testing.T) {
	f := orderSetup(t)
	orderID := f.checkout(t, "k1")
	plugin, err := f.app.FindFirstRecordByFilter("tenant_plugins", "tenant={:tenant} && plugin={:plugin}",
		dbx.Params{"tenant": tenancy.DefaultID, "plugin": tenancy.Payment})
	if err != nil {
		t.Fatal(err)
	}
	plugin.Set("status", tenancy.Disabled)
	failsWith(t, f.app.Save(plugin), "PAYMENT_ORDERS_OPEN")
	_, err = f.app.DB().NewQuery("UPDATE orders SET created={:at} WHERE id={:id}").
		Bind(dbx.Params{"at": clock().Add(-PaymentWindow).Format(types.DefaultDateLayout), "id": orderID}).Execute()
	if err != nil {
		t.Fatal(err)
	}
	f.setPlugin(t, map[string]any{"status": tenancy.Disabled})
	if status := f.record(t, "orders", orderID).GetString("status"); status != "failed" {
		t.Fatalf("an unpaid order past its window is closed, got %s", status)
	}
}

func TestOffersAndGate(t *testing.T) {
	f := orderSetup(t)
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
	audits, err := f.app.FindRecordsByFilter("order_audit", `subjectId="`+f.offerID+`"`, "", 0, 0)
	if err != nil || len(audits) != 3 {
		t.Fatalf("audits = %d, %v", len(audits), err)
	}
	failed(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders", map[string]any{"key": "k1", "offerId": f.offerID}), 400, "OFFER_UNAVAILABLE", "withdrawn offer")

	disabled := testkit.Serve(t, testkit.NewApp(t), OrdersModule{Enabled: false}.Register)
	request := httptest.NewRequest(http.MethodGet, "/ops/commerce/orders", nil)
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
