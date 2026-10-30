package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"kanyue.server/internal/migrations/orderpayment"
	"kanyue.server/internal/tenancy"
)

// legacyCommerceApp is a database as kanyue_0007 left it, with commerce rows.
func legacyCommerceApp(t *testing.T) core.App {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	for _, step := range []func(core.App) error{ensureVenues, freezeCreatedTimestamps, ensureBaseline, allowAuditActorRoles,
		EnsureRenewalReminders, addVenueCover, tenancy.EnsureSchema} {
		if err := step(app); err != nil {
			t.Fatal(err)
		}
	}
	return app
}

func seed(t *testing.T, app core.App, name, id string, fields map[string]any) {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(name)
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Id = id
	record.Load(fields)
	record.Set(tenancy.Field, tenancy.DefaultID)
	if err := app.SaveNoValidate(record); err != nil {
		t.Fatalf("seed %s: %v", name, err)
	}
}

func TestOrderPaymentSplitConvertsLegacyCommerce(t *testing.T) {
	app := legacyCommerceApp(t)
	seed(t, app, "students", "student0000001", map[string]any{"cellphone": "13900000001"})
	seed(t, app, "orders", "order000000001", map[string]any{"idempotencyKey": "k1", "orderNo": "N1", "studentId": "student0000001", "status": "granted",
		"productSnapshot": map[string]any{"packageId": "p"}})
	seed(t, app, "orders", "order000000002", map[string]any{"idempotencyKey": "k2", "orderNo": "N2", "studentId": "student0000001", "status": "paid",
		"productSnapshot": map[string]any{"packageId": "p"}})
	seed(t, app, "orders", "order000000003", map[string]any{"idempotencyKey": "k3", "orderNo": "N3", "studentId": "student0000001", "status": "granted"})
	seed(t, app, "commerce_orders", "commerce000001", map[string]any{"studentId": "student0000001", "orderId": "order000000001",
		"status": "completed", "version": 3, "data": map[string]any{"offerId": "offer", "name": "十节", "amount": 80000.0,
			"paymentId": "pay1", "payerId": "openid", "refunded": 10000.0, "refundPending": false,
			"policy": map[string]any{"version": 1}, "allocations": []any{map[string]any{"creditTypeId": "c", "quantity": 10.0, "paidMinor": 80000.0}}}})
	seed(t, app, "commerce_orders", "commerce000002", map[string]any{"studentId": "student0000001", "orderId": "order000000002",
		"status": "granting", "version": 2, "data": map[string]any{"offerId": "offer", "name": "十节", "amount": 80000.0, "paymentId": "pay2"}})
	seed(t, app, "commerce_refunds", "refund00000001", map[string]any{"orderId": "order000000001", "studentId": "student0000001",
		"status": "succeeded", "version": 2, "data": map[string]any{"amount": 10000.0, "gatewayId": "ref1", "held": []any{}}})
	seed(t, app, "commerce_audit", "audit000000001", map[string]any{"subjectId": "order000000001", "actorId": "finance",
		"action": "recovery_requested", "data": map[string]any{"reason": "核对"}})
	seed(t, app, "commerce_audit", "audit000000002", map[string]any{"subjectId": "order000000001", "actorId": "student0000001",
		"action": "refund_requested", "data": map[string]any{}})

	for range 2 {
		if err := orderpayment.Apply(app); err != nil {
			t.Fatal(err)
		}
	}

	paid, _ := app.FindRecordById("orders", "order000000001")
	if paid.GetString("settlement") != "online" || paid.GetString("paymentRef") != "pay1" || paid.GetFloat("refundedMinor") != 10000 ||
		paid.GetString("payerOpenId") != "openid" {
		t.Fatalf("paid order = %v", paid.FieldsData())
	}
	if offline, _ := app.FindRecordById("orders", "order000000003"); offline.GetString("settlement") != "offline" {
		t.Fatalf("offline order = %v", offline.FieldsData())
	}
	payments, _ := app.FindAllRecords("payment_transactions")
	states := map[string]string{}
	for _, payment := range payments {
		states[payment.GetString("orderId")] = payment.GetString("status")
	}
	if len(payments) != 2 || states["order000000001"] != "succeeded" || states["order000000002"] != "pending" {
		t.Fatalf("payments = %v", states)
	}
	refund, err := app.FindRecordById("order_refunds", "refund00000001")
	if err != nil || refund.GetString("settlement") != "online" || refund.GetFloat("amountMinor") != 10000 || refund.GetString("kind") != "package" {
		t.Fatalf("refund = %v, %v", refund, err)
	}
	if attempts, _ := app.FindAllRecords("refund_transactions"); len(attempts) != 1 || attempts[0].GetString("reference") != "refund00000001" ||
		attempts[0].GetString("paymentId") != "pay1" {
		t.Fatalf("refund transactions = %v", attempts)
	}
	if moved, _ := app.FindAllRecords("payment_audit"); len(moved) != 1 || moved[0].GetString("action") != "recovery_requested" {
		t.Fatalf("payment audit = %v", moved)
	}
	if kept, _ := app.FindAllRecords("order_audit"); len(kept) != 1 || kept[0].GetString("action") != "refund_requested" {
		t.Fatalf("order audit = %v", kept)
	}
	for _, name := range []string{"commerce_orders", "commerce_refunds", "commerce_offers", "commerce_audit"} {
		if _, err := app.FindCollectionByNameOrId(name); err == nil {
			t.Errorf("%s still exists", name)
		}
	}
}
