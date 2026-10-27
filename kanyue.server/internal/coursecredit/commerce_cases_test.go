package coursecredit

import (
	"encoding/json"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/testkit"
)

// Commerce cases ported from Hono's commerce*.test.js.

// put saves a record without validation, for fixtures whose relations the code under test never follows.
func put(t *testing.T, app core.App, collection string, fields map[string]any) *core.Record {
	t.Helper()
	target, err := app.FindCollectionByNameOrId(collection)
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(target)
	for key, value := range fields {
		record.Set(key, value)
	}
	if err := app.SaveNoValidate(record); err != nil {
		t.Fatalf("put %s: %v", collection, err)
	}
	return record
}

// patch changes stored fields without validation.
func patch(t *testing.T, app core.App, collection, id string, fields map[string]any) {
	t.Helper()
	record, err := app.FindRecordById(collection, id)
	if err != nil {
		t.Fatal(err)
	}
	for key, value := range fields {
		record.Set(key, value)
	}
	if err := app.SaveNoValidate(record); err != nil {
		t.Fatal(err)
	}
}

// jsonMap decodes a JSON object the way stored records reach the services.
func jsonMap(t *testing.T, text string) map[string]any {
	t.Helper()
	value := map[string]any{}
	if err := json.Unmarshal([]byte(text), &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func stepFor(plan []step, collection string, create bool) *step {
	for i := range plan {
		if plan[i].collection == collection && (plan[i].id == "") == create {
			return &plan[i]
		}
	}
	return nil
}

const cashAt = "2026-09-06T00:00:00Z"

type cashFixture struct {
	app                            core.App
	order                          *core.Record
	batch, allocation, appointment map[string]any
}

func cashSetup(t *testing.T) cashFixture {
	t.Helper()
	app := testkit.NewApp(t)
	order := put(t, app, "commerce_orders", map[string]any{"studentId": "s", "orderId": "order", "status": "completed", "version": 1,
		"data": jsonMap(t, `{"amount":80000,"refunded":0,"paymentId":"payment","refundPending":false,
			"policy":{"version":2,"packageRefund":"unused_paid_value","reservationRefund":"cash","cancellationTiers":[{"beforeMinutes":60,"feeBps":0},{"beforeMinutes":0,"feeBps":5000}]},
			"grantResult":{"operationId":"grant","batches":[{"batchId":"batch"}]},"allocations":[{"creditTypeId":"c","quantity":4,"paidMinor":80000}]}`)})
	batch := jsonMap(t, `{"id":"batch","studentId":"s","creditTypeId":"c","sourceOperationId":"grant","originalQuantity":4,"availableQuantity":3,
		"frozenQuantity":1,"reversedQuantity":0,"consumedQuantity":0,"expiredQuantity":0,"version":1}`)
	batch["grantSnapshot"] = map[string]any{"commerceOrderId": order.Id}
	return cashFixture{app: app, order: order, batch: batch,
		allocation:  map[string]any{"id": "a", "batchId": "batch", "quantity": 1.0},
		appointment: map[string]any{"id": "appointment", "studentId": "s", "requestedStartAt": "2026-09-06T00:30:00Z"}}
}

func (f cashFixture) quote(institution bool) (*cashQuote, error) {
	return reservationQuote(f.app, f.appointment, []map[string]any{f.allocation}, map[string]map[string]any{"batch": f.batch}, cashAt, institution)
}

func (f cashFixture) setOrderData(t *testing.T, key string, value any) {
	t.Helper()
	row, err := get(f.app, "commerce_orders", f.order.Id)
	if err != nil {
		t.Fatal(err)
	}
	data := asMap(row["data"])
	data[key] = value
	patch(t, f.app, "commerce_orders", f.order.Id, map[string]any{"data": data})
}

// Hono: commerceCancellation › cash cancellation uses original discount allocation and inclusive server receipt thresholds
func TestCashCancellationQuoteUsesPaidAllocationAndThresholds(t *testing.T) {
	f := cashSetup(t)
	refundable := func(institution bool) float64 {
		t.Helper()
		quote, err := f.quote(institution)
		if err != nil || quote == nil {
			t.Fatalf("quote = %v, %v", quote, err)
		}
		return quote.refundable
	}
	if refundable(false) != 10000 || refundable(true) != 20000 {
		t.Fatal("paid unit 20000 with 50% fee inside an hour, none for institution cancellations")
	}
	f.appointment["requestedStartAt"] = "2026-09-06T01:00:00Z"
	if quote, _ := f.quote(false); quote.fee != 0 {
		t.Fatalf("exactly an hour ahead is free: %v", quote.fee)
	}
	f.appointment["requestedStartAt"] = "2026-09-05T23:59:59Z"
	if refundable(false) != 0 {
		t.Fatal("a started lesson refunds nothing")
	}
	f.batch["grantSnapshot"] = map[string]any{}
	if quote, err := f.quote(false); quote != nil || err != nil {
		t.Fatalf("credit not bought online = %v, %v", quote, err)
	}
}

// Hono: commerceCancellation › cash cancellation atomically retires reserved credit and records refund liability, never releases it
func TestCashCancellationPlanRetiresCreditAndRecordsLiability(t *testing.T) {
	f := cashSetup(t)
	quote, err := f.quote(false)
	if err != nil {
		t.Fatal(err)
	}
	student := map[string]any{"id": "roster", "version": 1.0}
	input := map[string]any{"actorId": "s", "actorRole": "student", "reason": "课程取消", "expectedRefundAmount": 10000.0, "expectedFee": 10000.0}
	plan, refund, err := cashCancellationPlan(quote, f.appointment, student, input, "op", cashAt)
	if err != nil {
		t.Fatal(err)
	}
	change := stepFor(plan, "credit_batches", false)
	if change.data["frozenQuantity"] != 0.0 || change.data["reversedQuantity"] != 1.0 {
		t.Fatalf("batch change = %v", change.data)
	}
	if _, released := change.data["availableQuantity"]; released {
		t.Fatal("cash cancellation must not release credit")
	}
	if created := stepFor(plan, "commerce_refunds", true); asMap(created.data["data"])["kind"] != "reservation" {
		t.Fatalf("refund = %v", created)
	}
	if refund["amount"] != 10000.0 || refund["status"] != "processing" {
		t.Fatalf("refund = %v", refund)
	}
	input["expectedFee"] = 0.0
	_, _, err = cashCancellationPlan(quote, f.appointment, student, input, "op", cashAt)
	failsWith(t, err, "CANCELLATION_QUOTE_CHANGED")
}

// Hono: commerceCancellation › source mismatch and concurrently reserved principal cannot create a refund
func TestCashCancellationRejectsReservedPrincipalAndSourceMismatch(t *testing.T) {
	f := cashSetup(t)
	f.setOrderData(t, "refundReservedAmount", 79999)
	_, err := f.quote(false)
	failsWith(t, err, "CASH_REFUND_PRINCIPAL_CONFLICT")
	f.setOrderData(t, "refundReservedAmount", 0)
	f.batch["sourceOperationId"] = "other"
	_, err = f.quote(false)
	failsWith(t, err, "CASH_RESERVATION_SOURCE_MISMATCH")
}

// Hono: commerceCancellation › definitive reservation refund failure retains liability and does not restore credits
func TestReservationRefundFailureKeepsLiability(t *testing.T) {
	f := commerceSetup(t)
	orderID := f.buy(t, "k1")["id"].(string)
	row, err := get(f.app, "commerce_orders", orderID)
	if err != nil {
		t.Fatal(err)
	}
	data := asMap(row["data"])
	data["refundPending"], data["pendingRefundCount"], data["refundReservedAmount"] = true, 1, 10000
	patch(t, f.app, "commerce_orders", orderID, map[string]any{"data": data})
	refund := testkit.Create(t, f.app, "commerce_refunds", map[string]any{"orderId": orderID, "studentId": f.studentID,
		"status": "processing", "version": 1, "data": map[string]any{"amount": 10000, "kind": "reservation", "gatewayId": "refX", "held": []any{}}})
	f.gateway.mu.Lock()
	f.gateway.refunds["refX"] = map[string]any{"id": "refX", "reference": refund.Id, "paymentId": data["paymentId"], "amount": 10000, "status": "failed"}
	f.gateway.mu.Unlock()

	if err := (&commerce{app: f.app, gateway: newGateway(f.module.Config)}).syncRefund(refund.Id); err != nil {
		t.Fatal(err)
	}
	after, _ := get(f.app, "commerce_orders", orderID)
	kept := asMap(after["data"])
	if kept["refundPending"] != true || kept["refundReservedAmount"] != 10000.0 || kept["pendingRefundCount"] != 1.0 {
		t.Fatalf("order data = %v", kept)
	}
	if f.record(t, "commerce_refunds", refund.Id).GetString("status") != "failed" {
		t.Fatal("refund status")
	}
	if batch := firstBatch(t, f.app, f.studentID); batch.GetInt("availableQuantity") != 10 || batch.GetInt("version") != 1 {
		t.Fatalf("credits must not be touched: %v", batch.FieldsData())
	}
}

// Hono: commerceOperations › rescheduling preserves the student cancellation action
func TestRescheduledAppointmentKeepsCancelAction(t *testing.T) {
	if studentAppointment(map[string]any{"status": "rescheduled"})["canCancel"] != true ||
		studentAppointment(map[string]any{"status": "cancelled"})["canCancel"] != false {
		t.Fatal("canCancel")
	}
}

// Hono: commerceOperations › order filters use China calendar days and reject invalid or reversed dates
func TestCommerceOrderFiltersUseChinaDays(t *testing.T) {
	f := commerceSetup(t)
	orderID := f.buy(t, "k1")["id"].(string)
	count := func(created string) float64 {
		t.Helper()
		if _, err := f.app.DB().NewQuery("UPDATE commerce_orders SET created={:created} WHERE id={:id}").
			Bind(map[string]any{"created": created, "id": orderID}).Execute(); err != nil {
			t.Fatal(err)
		}
		return ok(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/orders?from=2026-09-06&to=2026-09-06", nil), "list")["totalItems"].(float64)
	}
	for created, want := range map[string]float64{
		"2026-09-05 15:59:59.999Z": 0, "2026-09-05 16:00:00.000Z": 1,
		"2026-09-06 15:59:59.999Z": 1, "2026-09-06 16:00:00.000Z": 0,
	} {
		if got := count(created); got != want {
			t.Fatalf("created %s counted %v", created, got)
		}
	}
	failed(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/orders?from=2026-02-30", nil), 400, "INVALID_DATE_FILTER", "invalid")
	failed(t, f.call(t, f.ops, http.MethodGet, "/ops/commerce/orders?from=2026-09-06&to=2026-09-05", nil), 400, "INVALID_DATE_FILTER", "reversed")
}

// Hono: commerceOperations › Admin refund forwards authenticated actor and trimmed reason, never client actor
func TestCommerceOpsRefundUsesAuthenticatedActor(t *testing.T) {
	f := commerceSetup(t)
	orderID := f.buy(t, "k1")["id"].(string)
	failed(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/orders/"+orderID+"/refunds",
		map[string]any{"key": "r0", "expectedAmount": 80000, "reason": ""}), 400, "COMMERCE_REASON_REQUIRED", "empty reason")
	refund := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/orders/"+orderID+"/refunds",
		map[string]any{"key": "r1", "expectedAmount": 80000, "reason": " 学员申请 ", "actorId": "spoofed"}), "refund")
	operator, err := f.app.FindAuthRecordByEmail("teachers", "ops@example.com")
	if err != nil {
		t.Fatal(err)
	}
	row, _ := get(f.app, "commerce_refunds", refund["id"].(string))
	if actor := asMap(asMap(row["data"])["actor"]); fmtJSON(actor) != fmtJSON(map[string]any{"id": operator.Id, "reason": "学员申请", "role": "admin"}) {
		t.Fatalf("actor = %v", actor)
	}
	if row["studentId"] != f.studentID {
		t.Fatalf("refund owner = %v", row["studentId"])
	}
}

// Hono: commerceOperations › legacy cancellation preview needs no commerce collections or feature flag
func TestCancellationPreviewWithoutCommerce(t *testing.T) {
	f := bookingSetup(t, true)
	appointmentID := f.request(t, f.slots(t)[40], "r1")["appointmentId"].(string)
	ok(t, f.call(t, f.teacher, http.MethodPost, "/v1/teacher/appointments/"+appointmentID+"/confirm", nil, "c1"), "confirm")
	preview := ok(t, f.call(t, f.student, http.MethodGet, "/v1/student/appointments/"+appointmentID+"/cancellation-preview", nil, ""), "preview")
	if preview["mode"] != "credit" {
		t.Fatalf("preview = %v", preview)
	}
	other := testkit.Create(t, f.app, "students", map[string]any{"cellphone": "13900000002", "realName": "学员乙"})
	token, err := f.signer.Sign(other.Id, "S2", "student", false, nil, auth.OpsTokenTTL)
	if err != nil {
		t.Fatal(err)
	}
	failed(t, f.call(t, testkit.Bearer(token), http.MethodGet, "/v1/student/appointments/"+appointmentID+"/cancellation-preview", nil, ""),
		403, "APPOINTMENT_STUDENT_FORBIDDEN", "other student")
}

var tieredPolicy = `{"version":1,"packageRefund":"unused_paid_value","cancellationTiers":[
	{"beforeMinutes":1440,"feeBps":0},{"beforeMinutes":360,"feeBps":2000},{"beforeMinutes":0,"feeBps":10000}]}`

// Hono: commercePlanning › deadline equality and institution cancellation use exact integer money
func TestCancellationQuoteDeadlinesUseIntegerMoney(t *testing.T) {
	policy := jsonMap(t, tieredPolicy)
	start := "2026-09-10T10:00:00+08:00"
	for received, want := range map[string]float64{
		"2026-09-09T10:00:00+08:00": 24000, "2026-09-09T10:00:01+08:00": 19200,
		"2026-09-10T04:00:00+08:00": 19200, "2026-09-10T04:00:01+08:00": 0,
	} {
		quote, err := cancellationQuote(policy, start, received, 24000, false)
		if err != nil || quote.refundable != want {
			t.Fatalf("%s = %v, %v", received, quote, err)
		}
	}
	if quote, _ := cancellationQuote(policy, start, "2026-09-10T11:00:00+08:00", 24000, true); quote.refundable != 24000 {
		t.Fatal("institution cancellations refund in full")
	}
	if _, err := cancellationQuote(policy, "invalid", start, 100, false); err == nil {
		t.Fatal("invalid start")
	}
}

// Hono: commercePlanning › invalid pricing and ambiguous tiers fail instead of changing consumer money
func TestCommercePricingAndTiersFailClosed(t *testing.T) {
	for value, want := range map[float64]float64{2400: 240000, 0.01: 1} {
		if got, err := amountMinor(value); err != nil || got != want {
			t.Fatalf("amountMinor(%v) = %v, %v", value, got, err)
		}
	}
	for _, value := range []float64{-1, 0, 1.001, math.NaN(), math.Inf(1)} {
		if _, err := amountMinor(value); err == nil {
			t.Fatalf("amountMinor(%v) accepted", value)
		}
	}
	reversed := jsonMap(t, tieredPolicy)
	tiers := reversed["cancellationTiers"].([]any)
	reversed["cancellationTiers"] = []any{tiers[2], tiers[1], tiers[0]}
	if validateCommercePolicy(reversed) == nil {
		t.Fatal("reversed tiers accepted")
	}
	over := jsonMap(t, tieredPolicy)
	over["cancellationTiers"] = []any{map[string]any{"beforeMinutes": 0.0, "feeBps": 10001.0}}
	if validateCommercePolicy(over) == nil {
		t.Fatal("fee above 100% accepted")
	}
	lines := []map[string]any{}
	types := map[string]map[string]any{}
	for _, id := range []string{"a", "b", "c"} {
		lines = append(lines, map[string]any{"creditTypeId": id, "quantity": 1.0})
		types[id] = map[string]any{"referenceUnitValue": 1.0}
	}
	paid := []float64{}
	for _, line := range allocateMinor(100, lines, types) {
		paid = append(paid, line.(map[string]any)["paidMinor"].(float64))
	}
	if fmtJSON(paid) != "[33,33,34]" {
		t.Fatalf("allocation = %v", paid)
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
	config := CommerceConfig{GatewayURL: server.URL, ServiceToken: serviceToken, MockToken: mockToken, Mock: true}
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
	_, err = newGateway(CommerceConfig{GatewayURL: "http://remote.example", ServiceToken: serviceToken}).payment("id")
	failsWith(t, err, "PAYMENT_TLS_REQUIRED")
}

// Hono: commercePlanning › gateway client reports non-JSON proxy failures as channel errors
func TestGatewayClientNonJSONFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte("<html>bad gateway</html>"))
	}))
	t.Cleanup(server.Close)
	_, err := newGateway(CommerceConfig{GatewayURL: server.URL, ServiceToken: serviceToken}).payment("id")
	failsWith(t, err, "PAYMENT_CHANNEL_ERROR")
}

// Hono: commercePlanning › recovery acknowledges orphan events and cashier rejects closed payment windows
func TestCommerceRecoveryAcksOrphansAndCashierClosesWindow(t *testing.T) {
	f := commerceSetup(t)
	f.gateway.events = []any{map[string]any{"id": "orphan", "data": map[string]any{"type": "payment.closed", "targetId": "x",
		"payload": map[string]any{"reference": "unknown", "status": "closed"}}}}
	if _, err := (&commerce{app: f.app, gateway: newGateway(f.module.Config)}).recover(); err != nil {
		t.Fatal(err)
	}
	if fmtJSON(f.gateway.acked) != `["orphan"]` {
		t.Fatalf("acked = %v", f.gateway.acked)
	}
	order := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders", map[string]any{"key": "k1", "offerId": f.offerID}), "checkout")
	f.gateway.set("pay1", "closed")
	failed(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders/"+order["id"].(string)+"/cashier", nil),
		400, "PAYMENT_WINDOW_CLOSED", "closed window")
}

// Hono: commercePlanning › student order payload names its offer so clients can reuse a pending order
func TestCommerceOrderViewNamesOffer(t *testing.T) {
	view := (&commerce{gateway: newGateway(CommerceConfig{})}).present(map[string]any{"id": "order", "status": "pending",
		"data": map[string]any{"offerId": "offer", "name": "单节课", "amount": 24000.0}})
	if view["offerId"] != "offer" || view["mockPayment"] != false {
		t.Fatalf("view = %v", view)
	}
}

// refundFixture is a paid order whose single batch the test reshapes.
func refundFixture(t *testing.T) (commerceFixture, string, string) {
	t.Helper()
	f := commerceSetup(t)
	orderID := f.buy(t, "k1")["id"].(string)
	return f, orderID, firstBatch(t, f.app, f.studentID).Id
}

func (f commerceFixture) previewAmount(t *testing.T, orderID string) map[string]any {
	t.Helper()
	return ok(t, f.call(t, f.student, http.MethodGet, "/v1/student/commerce/orders/"+orderID+"/refund-preview", nil), "preview")
}

// Hono: commerceRefund › discounted partial use refunds original paid allocation and clamps principal
func TestRefundPreviewUsesPaidAllocationAndClamps(t *testing.T) {
	f, orderID, batchID := refundFixture(t)
	row, _ := get(f.app, "commerce_orders", orderID)
	data := asMap(row["data"])
	allocation := asMap(anyList(data["allocations"])[0])
	allocation["paidMinor"], data["amount"] = 80001, 80001
	patch(t, f.app, "commerce_orders", orderID, map[string]any{"data": data})
	patch(t, f.app, "credit_batches", batchID, map[string]any{"availableQuantity": 3, "consumedQuantity": 7})
	for refunded, want := range map[float64]float64{0: 24000, 79999: 2, 90000: 0} {
		data["refunded"] = refunded
		patch(t, f.app, "commerce_orders", orderID, map[string]any{"data": data})
		if amount := f.previewAmount(t, orderID)["amount"]; amount != want {
			t.Fatalf("refunded %v previews %v", refunded, amount)
		}
	}
	data["refunded"] = 0
	patch(t, f.app, "commerce_orders", orderID, map[string]any{"data": data})
	patch(t, f.app, "credit_batches", batchID, map[string]any{"availableQuantity": 0, "consumedQuantity": 10})
	if amount := f.previewAmount(t, orderID)["amount"]; amount != 0.0 {
		t.Fatalf("used up = %v", amount)
	}
}

// Hono: commerceRefund › offline provenance and reserved credits prevent cash refund execution
func TestRefundBlockedByOfflineOriginAndReservations(t *testing.T) {
	f, orderID, batchID := refundFixture(t)
	patch(t, f.app, "credit_batches", batchID, map[string]any{"availableQuantity": 9, "frozenQuantity": 1})
	if preview := f.previewAmount(t, orderID); preview["blocked"] != true {
		t.Fatalf("preview = %v", preview)
	}
	refunds := "/v1/student/commerce/orders/" + orderID + "/refunds"
	failed(t, f.call(t, f.student, http.MethodPost, refunds, map[string]any{"key": "r1", "expectedAmount": 72000}), 400, "REFUND_HAS_RESERVATIONS", "reserved")
	failed(t, f.call(t, f.student, http.MethodPost, refunds, map[string]any{"key": "r1"}), 400, "REFUND_QUOTE_REQUIRED", "no quote")
	order := f.record(t, "orders", orderID)
	order.Set("productSnapshot", map[string]any{"origin": "offline"})
	if err := f.app.SaveNoValidate(order); err != nil {
		t.Fatal(err)
	}
	failed(t, f.call(t, f.student, http.MethodGet, "/v1/student/commerce/orders/"+orderID+"/refund-preview", nil), 400, "OFFLINE_REFUND_MANUAL_ONLY", "offline")
}

// Hono: commerceRefund › withdrawal uses whole credits; definitive failure restores or expires them without reopening reservations
func TestRefundMovementWithdrawRestoreExpire(t *testing.T) {
	batch := jsonMap(t, `{"id":"batch","studentId":"student","creditTypeId":"course","originalQuantity":4,"availableQuantity":3,
		"frozenQuantity":0,"consumedQuantity":1,"expiredQuantity":0,"reversedQuantity":0,"status":"active","version":1}`)
	changes := func(plan []step, err error) map[string]any {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		return stepFor(plan, "credit_batches", false).data
	}
	withdrawn := changes(refundMovement(batch, "withdraw", "2026-09-06T00:00:00Z", 3, false, nil, nil))
	if withdrawn["availableQuantity"] != 0.0 || withdrawn["reversedQuantity"] != 3.0 {
		t.Fatalf("withdrawn = %v", withdrawn)
	}
	held := copyMap(batch)
	for key, value := range withdrawn {
		held[key] = value
	}
	held["effectiveExpiresAt"] = "2026-09-07T00:00:00Z"
	restored := changes(refundMovement(held, "restore", "2026-09-06T01:00:00Z", 3, true, "active", nil))
	if restored["availableQuantity"] != 3.0 || restored["reversedQuantity"] != 0.0 || restored["status"] != "active" {
		t.Fatalf("restored = %v", restored)
	}
	expired := changes(refundMovement(held, "expire", "2026-09-08T00:00:00Z", 3, true, "active", nil))
	if expired["availableQuantity"] != 0.0 || expired["expiredQuantity"] != 3.0 || expired["status"] != "expired" {
		t.Fatalf("expired = %v", expired)
	}
	if _, err := refundMovement(batch, "restore", "2026-09-06T01:00:00Z", 3, true, "active", nil); err == nil {
		t.Fatal("restoring more than was withdrawn")
	}
}

// Hono: commerceRoutes › commerce requires student authentication and forwards ownership from token
func TestCommerceRoutesRequireStudentAndUseTokenOwner(t *testing.T) {
	f := commerceSetup(t)
	if result := f.call(t, nil, http.MethodGet, "/v1/student/commerce/catalog", nil); result.Code() != 403 {
		t.Fatalf("anonymous = %v", result.Body)
	}
	failed(t, f.call(t, f.teacher, http.MethodGet, "/v1/student/commerce/catalog", nil), 403, "STUDENT_LEARNING_STUDENT_REQUIRED", "teacher")
	order := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders",
		map[string]any{"key": "k1", "offerId": f.offerID, "studentId": "other"}), "checkout")
	if f.record(t, "commerce_orders", order["id"].(string)).GetString("studentId") != f.studentID {
		t.Fatal("order must belong to the token's student")
	}
	if result := testkit.Raw(t, f.handler, http.MethodPost, "/v1/student/commerce/orders", "null", f.student); result.Code() != 400 {
		t.Fatalf("null body = %v", result.Body)
	}
}

// Hono: commerceRoutes › finance and recovery reject ordinary teacher, student and forced-password-change accounts
func TestCommerceRecoveryNeedsFinance(t *testing.T) {
	f := commerceSetup(t)
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
		sign("finance", "teacher", false, auth.Claims{"courseCreditCapabilities": []string{Finance}})} {
		ok(t, f.call(t, headers, http.MethodPost, "/ops/commerce/recover", map[string]any{}), "recover")
	}
}

// Hono: commerceRoutes › feature-off and production remove routes; cross-student access is denied before mutation
func TestCommerceRoutesOffInProductionAndOwnershipFirst(t *testing.T) {
	f := commerceSetup(t)
	order := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders", map[string]any{"key": "k1", "offerId": f.offerID}), "checkout")
	production := f.module
	production.Config.Mock = false
	handler := testkit.Serve(t, f.app, production.Register)
	for path, headers := range map[string]map[string]string{
		"/v1/student/commerce/orders/" + order["id"].(string) + "/mock-pay": f.student,
		"/ops/commerce/refunds/x/mock-success":                              f.ops,
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
	f.gateway.set("pay1", "succeeded")
	failed(t, f.call(t, testkit.Bearer(token), http.MethodPost, "/v1/student/commerce/orders/"+order["id"].(string)+"/refresh", nil),
		403, "COMMERCE_ORDER_FORBIDDEN", "other student")
	if f.record(t, "commerce_orders", order["id"].(string)).GetString("status") != "pending" {
		t.Fatal("a forbidden refresh must not sync the order")
	}
}
