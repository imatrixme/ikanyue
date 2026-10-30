// Package orderpayment splits online purchase into the core order center and the
// payment plugin's money records. The order center owns offers, orders (with
// their refund rules and running refund totals), refund requests and their
// audit; the payment plugin owns payment and refund transactions, money cases,
// its claims and audit. It lives apart from package migrations so the test kit
// can build the same schema.
package orderpayment

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/dbutils"

	"kanyue.server/internal/records"
	"kanyue.server/internal/tenancy"
)

// renames keep data and ids: the collections only change owner.
var renames = [][2]string{
	{"commerce_offers", "offers"},
	{"commerce_claims", "order_claims"},
	{"commerce_audit", "order_audit"},
	{"commerce_cases", "payment_cases"},
}

// pluginActions are audit entries about money handling, which move to payment_audit.
var pluginActions = []string{"recovery_requested", "exception_reviewed"}

// Apply builds the split schema with its tenant fields, converts legacy rows and
// drops the legacy collections.
func Apply(app core.App) error {
	if err := Schema(app); err != nil {
		return err
	}
	if err := tenancy.EnsureSchema(app); err != nil {
		return err
	}
	if err := Convert(app); err != nil {
		return err
	}
	return DropLegacy(app)
}

// Schema renames the shared collections, extends orders and creates the new
// collections. It is idempotent.
func Schema(app core.App) error {
	for _, pair := range renames {
		if err := rename(app, pair[0], pair[1]); err != nil {
			return err
		}
	}
	orders, err := app.FindCollectionByNameOrId("orders")
	if err != nil {
		return err
	}
	if orders.Fields.GetByName("settlement") == nil {
		orders.Fields.Add(
			// settlement says whether money moves offline between student and studio or through the payment plugin.
			&core.SelectField{Name: "settlement", MaxSelect: 1, Values: []string{"offline", "online"}},
			&core.TextField{Name: "payerOpenId", Max: 200},
			&core.NumberField{Name: "refundedMinor"},
			&core.NumberField{Name: "refundReservedMinor"},
			&core.NumberField{Name: "pendingRefundCount"},
			&core.NumberField{Name: "cancellationFeeMinor"},
			// paymentRef is the payment that paid the order, as the payment plugin reported it.
			&core.TextField{Name: "paymentRef", Max: 100},
		)
		orders.AddIndex("idx_orders_settlement_created", false, "settlement, created", "")
		if err := app.Save(orders); err != nil {
			return err
		}
	}
	students, err := app.FindCollectionByNameOrId("students")
	if err != nil {
		return err
	}
	return ensure(app,
		collection("order_refunds", func(c *core.Collection) {
			c.Fields.Add(
				&core.RelationField{Name: "orderId", CollectionId: orders.Id, MaxSelect: 1, Required: true},
				&core.RelationField{Name: "studentId", CollectionId: students.Id, MaxSelect: 1, Required: true},
				&core.SelectField{Name: "kind", Required: true, MaxSelect: 1, Values: []string{"package", "reservation"}},
				// processing is owed and not yet settled; settlement says who settles it.
				&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"processing", "succeeded", "failed"}},
				&core.SelectField{Name: "settlement", Required: true, MaxSelect: 1, Values: []string{"offline", "online"}},
				&core.NumberField{Name: "amountMinor"},
				&core.NumberField{Name: "feeMinor"},
				&core.TextField{Name: "appointmentId", Max: 100},
				&core.JSONField{Name: "held"},
				&core.JSONField{Name: "actor"},
				&core.NumberField{Name: "version", Required: true},
			)
			c.AddIndex("idx_order_refunds_order", false, "orderId, created", "")
			c.AddIndex("idx_order_refunds_status", false, "status, settlement", "")
		}),
		collection("payment_transactions", func(c *core.Collection) {
			c.Fields.Add(
				&core.TextField{Name: "orderId", Required: true, Max: 100},
				&core.TextField{Name: "reference", Required: true, Max: 100},
				&core.TextField{Name: "gatewayId", Max: 100},
				&core.NumberField{Name: "amountMinor", Required: true},
				&core.TextField{Name: "currency", Required: true, Max: 10},
				&core.TextField{Name: "payerId", Max: 200},
				&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"pending", "succeeded", "failed", "closed"}},
				&core.TextField{Name: "lastError", Max: 100},
				&core.NumberField{Name: "version", Required: true},
			)
			c.AddIndex("idx_payment_transactions_order", true, "orderId", "")
			c.AddIndex("idx_payment_transactions_status", false, "status", "")
		}),
		collection("refund_transactions", func(c *core.Collection) {
			c.Fields.Add(
				&core.TextField{Name: "refundId", Required: true, Max: 100},
				&core.TextField{Name: "orderId", Required: true, Max: 100},
				&core.TextField{Name: "paymentId", Max: 100},
				&core.TextField{Name: "reference", Required: true, Max: 100},
				&core.TextField{Name: "gatewayId", Max: 100},
				&core.NumberField{Name: "amountMinor", Required: true},
				&core.NumberField{Name: "attempt"},
				&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"processing", "succeeded", "failed"}},
				&core.NumberField{Name: "version", Required: true},
			)
			c.AddIndex("idx_refund_transactions_reference", true, "reference", "")
			c.AddIndex("idx_refund_transactions_refund", false, "refundId, attempt", "")
		}),
		collection("payment_claims", func(c *core.Collection) {
			c.Fields.Add(&core.TextField{Name: "key", Required: true, Max: 300})
			c.AddIndex("idx_payment_claim", true, "key", "")
		}),
		collection("payment_audit", func(c *core.Collection) {
			c.Fields.Add(
				&core.TextField{Name: "subjectId", Required: true, Max: 200},
				&core.TextField{Name: "actorId", Required: true, Max: 100},
				&core.TextField{Name: "action", Required: true, Max: 100},
				&core.JSONField{Name: "data"},
			)
			c.AddIndex("idx_payment_audit_subject", false, "subjectId", "")
		}),
	)
}

func collection(name string, build func(*core.Collection)) *core.Collection {
	c := core.NewBaseCollection(name)
	build(c)
	c.Fields.Add(
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	return c
}

func ensure(app core.App, collections ...*core.Collection) error {
	for _, c := range collections {
		if _, err := app.FindCollectionByNameOrId(c.Name); err == nil {
			continue
		} else if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err := app.Save(c); err != nil {
			return err
		}
	}
	return nil
}

// rename moves a collection and its indexes to the new name.
func rename(app core.App, from, to string) error {
	c, err := app.FindCollectionByNameOrId(from)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	// A database built before its migrations were recorded rebuilds the legacy
	// collection empty; the renamed one already holds the data.
	if _, err := app.FindCollectionByNameOrId(to); err == nil {
		if total, err := app.CountRecords(from); err != nil || total > 0 {
			return fmt.Errorf("%s and %s both exist: %v", from, to, err)
		}
		return app.Delete(c)
	}
	c.Name = to
	for i, raw := range c.Indexes {
		index := dbutils.ParseIndex(raw)
		index.TableName = to
		index.IndexName = strings.Replace(index.IndexName, "commerce", strings.SplitN(to, "_", 2)[0], 1)
		c.Indexes[i] = index.Build()
	}
	return app.Save(c)
}

// Convert splits each legacy commerce order and refund into the order
// center's order and refund request and the plugin's transactions.
func Convert(app core.App) error {
	if err := convertOrders(app); err != nil {
		return err
	}
	if err := convertRefunds(app); err != nil {
		return err
	}
	if err := moveAudit(app); err != nil {
		return err
	}
	// Every order that was not bought online was settled offline.
	_, err := app.DB().NewQuery("UPDATE {{orders}} SET [[settlement]]='offline' WHERE [[settlement]]='' OR [[settlement]] IS NULL").Execute()
	return err
}

func legacy(app core.App, name string) ([]*core.Record, error) {
	if _, err := app.FindCollectionByNameOrId(name); errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	} else if err != nil {
		return nil, err
	}
	return app.FindAllRecords(name)
}

func data(record *core.Record) map[string]any {
	value, _ := records.JSON(record)["data"].(map[string]any)
	if value == nil {
		value = map[string]any{}
	}
	return value
}

func number(value any) float64 {
	n, _ := value.(float64)
	return n
}

func text(value any) string {
	s, _ := value.(string)
	return s
}

// create saves a converted row with its source's tenant and timestamps.
func create(app core.App, name, id string, source *core.Record, fields map[string]any) error {
	if _, err := app.FindRecordById(name, id); err == nil {
		return nil
	}
	target, err := app.FindCollectionByNameOrId(name)
	if err != nil {
		return err
	}
	record := core.NewRecord(target)
	record.Id = id
	record.Load(fields)
	if target.Fields.GetByName("tenant") != nil {
		record.Set("tenant", source.GetString("tenant"))
	}
	if err := app.SaveNoValidate(record); err != nil {
		return err
	}
	_, err = app.DB().NewQuery("UPDATE {{" + name + "}} SET [[created]]={:created} WHERE [[id]]={:id}").
		Bind(map[string]any{"created": source.GetString("created"), "id": id}).Execute()
	return err
}

func convertOrders(app core.App) error {
	rows, err := legacy(app, "commerce_orders")
	if err != nil {
		return err
	}
	for _, row := range rows {
		values := data(row)
		order, err := app.FindRecordById("orders", row.GetString("orderId"))
		if err != nil {
			return err
		}
		product := map[string]any{}
		_ = json.Unmarshal([]byte(order.GetString("productSnapshot")), &product)
		product["offerId"], product["offerName"], product["allocations"] = values["offerId"], values["name"], values["allocations"]
		product["paidMinor"], product["policy"], product["origin"] = values["amount"], values["policy"], "gateway"
		order.Set("productSnapshot", product)
		pending := number(values["pendingRefundCount"])
		if values["pendingRefundCount"] == nil && values["refundPending"] == true {
			pending = 1
		}
		status := row.GetString("status")
		order.Load(map[string]any{"settlement": "online", "payerOpenId": text(values["payerId"]),
			"refundedMinor": number(values["refunded"]), "refundReservedMinor": number(values["refundReservedAmount"]),
			"pendingRefundCount": pending, "cancellationFeeMinor": number(values["cancellationFees"])})
		paid := status == "completed" || status == "granting"
		if paid {
			order.Set("paymentRef", text(values["paymentId"]))
		}
		if status == "failed" && order.GetString("status") == "pending" {
			order.Set("status", "failed")
		}
		if err := app.SaveNoValidate(order); err != nil {
			return err
		}
		if text(values["paymentId"]) == "" {
			continue
		}
		// A payment is marked succeeded once the order center booked it and granted
		// the credit; a granting order stays pending so the plugin finishes it.
		state := map[string]string{"completed": "succeeded", "failed": "failed"}[status]
		if state == "" {
			state = "pending"
		}
		err = create(app, "payment_transactions", hashID("payment", order.Id), row, map[string]any{
			"orderId": order.Id, "reference": order.Id, "gatewayId": values["paymentId"], "amountMinor": values["amount"],
			"currency": "CNY", "payerId": text(values["payerId"]), "status": state, "version": 1})
		if err != nil {
			return err
		}
	}
	return nil
}

func convertRefunds(app core.App) error {
	rows, err := legacy(app, "commerce_refunds")
	if err != nil {
		return err
	}
	for _, row := range rows {
		values := data(row)
		kind := text(values["kind"])
		if kind == "" {
			kind = "package"
		}
		err := create(app, "order_refunds", row.Id, row, map[string]any{
			"orderId": row.GetString("orderId"), "studentId": row.GetString("studentId"), "kind": kind,
			"status": row.GetString("status"), "settlement": "online", "amountMinor": values["amount"],
			"feeMinor": number(values["fee"]), "appointmentId": text(values["appointmentId"]), "held": values["held"],
			"actor": values["actor"], "version": row.GetFloat("version")})
		if err != nil {
			return err
		}
		if text(values["gatewayId"]) == "" {
			continue
		}
		payment, err := app.FindRecordById("payment_transactions", hashID("payment", row.GetString("orderId")))
		if err != nil {
			return err
		}
		reference := text(values["gatewayReference"])
		if reference == "" {
			reference = row.Id
		}
		attempt := number(values["attempt"])
		err = create(app, "refund_transactions", hashID("refund-transaction", row.Id, attempt), row, map[string]any{
			"refundId": row.Id, "orderId": row.GetString("orderId"), "paymentId": payment.GetString("gatewayId"),
			"reference": reference, "gatewayId": values["gatewayId"], "amountMinor": values["amount"], "attempt": attempt,
			"status": row.GetString("status"), "version": 1})
		if err != nil {
			return err
		}
	}
	return nil
}

// moveAudit hands money-handling audit entries to the payment plugin.
func moveAudit(app core.App) error {
	if _, err := app.FindCollectionByNameOrId("order_audit"); errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	rows, err := app.FindAllRecords("order_audit")
	if err != nil {
		return err
	}
	for _, row := range rows {
		if !slices.Contains(pluginActions, row.GetString("action")) {
			continue
		}
		err := create(app, "payment_audit", row.Id, row, map[string]any{"subjectId": row.GetString("subjectId"),
			"actorId": row.GetString("actorId"), "action": row.GetString("action"), "data": data(row)})
		if err != nil {
			return err
		}
		if err := app.Delete(row); err != nil {
			return err
		}
	}
	return nil
}

// DropLegacy removes the converted collections.
func DropLegacy(app core.App) error {
	for _, name := range []string{"commerce_refunds", "commerce_orders"} {
		c, err := app.FindCollectionByNameOrId(name)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return err
		}
		if err := app.Delete(c); err != nil {
			return err
		}
	}
	return nil
}

// hashID names a converted row after its source, so a rerun finds it.
func hashID(parts ...any) string {
	raw, _ := json.Marshal(parts)
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])[:15]
}
