package coursecredit

import (
	"encoding/json"
	"math"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/tenancy"
	"kanyue.server/internal/testkit"
)

// Order center cases ported from Hono's commerce*.test.js; payment cases live in plugins/payment.

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
	app := tenancy.Scope(testkit.NewApp(t), tenancy.DefaultID)
	order := put(t, app, "orders", map[string]any{"studentId": "s", "status": "granted", "settlement": "online", "currency": "CNY",
		"paymentRef": "payment", "refundedMinor": 0, "refundReservedMinor": 0, "pendingRefundCount": 0, "version": 1,
		"productSnapshot": jsonMap(t, `{"origin":"gateway","paidMinor":80000,
			"policy":{"version":2,"packageRefund":"unused_paid_value","reservationRefund":"cash","cancellationTiers":[{"beforeMinutes":60,"feeBps":0},{"beforeMinutes":0,"feeBps":5000}]},
			"allocations":[{"creditTypeId":"c","quantity":4,"paidMinor":80000}]}`)})
	put(t, app, "credit_operations", map[string]any{"type": "grant", "sourceType": "order", "sourceId": order.Id,
		"resultSnapshot": jsonMap(t, `{"operationId":"grant","batches":[{"batchId":"batch"}]}`)})
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
	patch(t, f.app, "orders", f.order.Id, map[string]any{key: value})
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
	if created := stepFor(plan, "order_refunds", true); created.data["kind"] != "reservation" {
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
	f.setOrderData(t, "refundReservedMinor", 79999)
	_, err := f.quote(false)
	failsWith(t, err, "CASH_REFUND_PRINCIPAL_CONFLICT")
	f.setOrderData(t, "refundReservedMinor", 0)
	f.batch["sourceOperationId"] = "other"
	_, err = f.quote(false)
	failsWith(t, err, "CASH_RESERVATION_SOURCE_MISMATCH")
}

// Hono: commerceCancellation › definitive reservation refund failure retains liability and does not restore credits
func TestReservationRefundFailureKeepsLiability(t *testing.T) {
	f := orderSetup(t)
	orderID := f.buy(t, "k1")["id"].(string)
	patch(t, f.app, "orders", orderID, map[string]any{"pendingRefundCount": 1, "refundReservedMinor": 10000})
	refund := testkit.Create(t, f.app, "order_refunds", map[string]any{"orderId": orderID, "studentId": f.studentID, "kind": "reservation",
		"status": "processing", "settlement": "online", "amountMinor": 10000, "held": []any{}, "version": 1})
	if err := RefundFailed(f.app, refund.Id, "refX"); err != nil {
		t.Fatal(err)
	}
	kept := f.record(t, "orders", orderID)
	if kept.GetFloat("pendingRefundCount") != 1 || kept.GetFloat("refundReservedMinor") != 10000 {
		t.Fatalf("order = %v", kept.FieldsData())
	}
	if f.record(t, "order_refunds", refund.Id).GetString("status") != "failed" {
		t.Fatal("refund status")
	}
	if batch := firstBatch(t, f.app, f.studentID); batch.GetInt("availableQuantity") != 10 || batch.GetInt("version") != 1 {
		t.Fatalf("credits must not be touched: %v", batch.FieldsData())
	}
	// The liability stays owed until the payment plugin retries it.
	if err := ReopenRefund(f.app, refund.Id, map[string]any{"id": "finance", "reason": "渠道恢复后重试"}); err != nil {
		t.Fatal(err)
	}
	if f.record(t, "order_refunds", refund.Id).GetString("status") != "processing" {
		t.Fatal("reopened refund")
	}
	if audits, _ := f.app.FindRecordsByFilter("order_audit", `action="refund_retried"`, "", 0, 0); len(audits) != 1 {
		t.Fatalf("retry audit = %v", audits)
	}
	if err := RefundSucceeded(f.app, refund.Id, "refY"); err != nil {
		t.Fatal(err)
	}
	if paid := f.record(t, "orders", orderID); paid.GetFloat("pendingRefundCount") != 0 || paid.GetFloat("refundedMinor") != 10000 ||
		paid.GetFloat("refundReservedMinor") != 0 {
		t.Fatalf("settled liability = %v", paid.FieldsData())
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
	f := orderSetup(t)
	orderID := f.buy(t, "k1")["id"].(string)
	count := func(created string) float64 {
		t.Helper()
		if _, err := f.app.DB().NewQuery("UPDATE orders SET created={:created} WHERE id={:id}").
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
	f := orderSetup(t)
	orderID := f.buy(t, "k1")["id"].(string)
	failed(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/orders/"+orderID+"/refunds",
		map[string]any{"key": "r0", "expectedAmount": 80000, "reason": ""}), 400, "COMMERCE_REASON_REQUIRED", "empty reason")
	refund := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/commerce/orders/"+orderID+"/refunds",
		map[string]any{"key": "r1", "expectedAmount": 80000, "reason": " 学员申请 ", "actorId": "spoofed"}), "refund")
	operator, err := f.app.FindAuthRecordByEmail("teachers", "ops@example.com")
	if err != nil {
		t.Fatal(err)
	}
	row, _ := get(f.app, "order_refunds", refund["id"].(string))
	if actor := asMap(row["actor"]); fmtJSON(actor) != fmtJSON(map[string]any{"id": operator.Id, "reason": "学员申请", "role": "admin"}) {
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

// Hono: commercePlanning › student order payload names its offer so clients can reuse a pending order
func TestCommerceOrderViewNamesOffer(t *testing.T) {
	view := (&orderCenter{}).present(map[string]any{"id": "order", "status": "pending",
		"productSnapshot": map[string]any{"offerId": "offer", "offerName": "单节课", "paidMinor": 24000.0}})
	if view["offerId"] != "offer" || view["name"] != "单节课" || view["mockPayment"] != false {
		t.Fatalf("view = %v", view)
	}
}

// refundFixture is a paid order whose single batch the test reshapes.
func refundFixture(t *testing.T) (orderFixture, string, string) {
	t.Helper()
	f := orderSetup(t)
	orderID := f.buy(t, "k1")["id"].(string)
	return f, orderID, firstBatch(t, f.app, f.studentID).Id
}

func (f orderFixture) previewAmount(t *testing.T, orderID string) map[string]any {
	t.Helper()
	return ok(t, f.call(t, f.student, http.MethodGet, "/v1/student/commerce/orders/"+orderID+"/refund-preview", nil), "preview")
}

// Hono: commerceRefund › discounted partial use refunds original paid allocation and clamps principal
func TestRefundPreviewUsesPaidAllocationAndClamps(t *testing.T) {
	f, orderID, batchID := refundFixture(t)
	row, _ := get(f.app, "orders", orderID)
	product := asMap(row["productSnapshot"])
	allocation := asMap(anyList(product["allocations"])[0])
	allocation["paidMinor"], product["paidMinor"] = 80001, 80001
	patch(t, f.app, "orders", orderID, map[string]any{"productSnapshot": product})
	patch(t, f.app, "credit_batches", batchID, map[string]any{"availableQuantity": 3, "consumedQuantity": 7})
	for refunded, want := range map[float64]float64{0: 24000, 79999: 2, 90000: 0} {
		patch(t, f.app, "orders", orderID, map[string]any{"refundedMinor": refunded})
		if amount := f.previewAmount(t, orderID)["amount"]; amount != want {
			t.Fatalf("refunded %v previews %v", refunded, amount)
		}
	}
	patch(t, f.app, "orders", orderID, map[string]any{"refundedMinor": 0})
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
	f := orderSetup(t)
	if result := f.call(t, nil, http.MethodGet, "/v1/student/commerce/catalog", nil); result.Code() != 403 {
		t.Fatalf("anonymous = %v", result.Body)
	}
	failed(t, f.call(t, f.teacher, http.MethodGet, "/v1/student/commerce/catalog", nil), 403, "STUDENT_LEARNING_STUDENT_REQUIRED", "teacher")
	order := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/commerce/orders",
		map[string]any{"key": "k1", "offerId": f.offerID, "studentId": "other"}), "checkout")
	if f.record(t, "orders", order["id"].(string)).GetString("studentId") != f.studentID {
		t.Fatal("order must belong to the token's student")
	}
	if result := testkit.Raw(t, f.handler, http.MethodPost, "/v1/student/commerce/orders", "null", f.student); result.Code() != 400 {
		t.Fatalf("null body = %v", result.Body)
	}
}
