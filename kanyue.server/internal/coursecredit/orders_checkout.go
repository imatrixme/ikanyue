package coursecredit

import (
	"database/sql"
	"errors"
	"math"
	"regexp"
	"slices"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/tenancy"
)

// The order center's selling side: offers become online orders whose credit is
// granted once the payment plugin reports the money received.

type orderCenter struct {
	app         core.App
	wechatAppID string
	mock        bool
}

// scoped is c reading and writing through app, a request's tenant scope.
func (c *orderCenter) scoped(app core.App) *orderCenter {
	bound := *c
	bound.app = app
	return &bound
}

var commerceKey = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,100}$`)

// recordID is how the JS SDK puts a value into a record URL; empty values fail as a missing id.
func recordID(value any) string {
	if !jsx.Truthy(value) {
		return ""
	}
	return jsx.String(value)
}

// isNotFound is a PocketBase 404 as Hono's SDK saw it.
func isNotFound(err error) bool {
	var store *storeError
	return errors.Is(err, sql.ErrNoRows) || (errors.As(err, &store) && store.status == 404)
}

// errorMessage is `error.message` for a failure Hono caught.
func errorMessage(err error) string {
	var business *Error
	var store *storeError
	switch {
	case errors.As(err, &business):
		return business.Message
	case errors.As(err, &store):
		return store.message
	case errors.Is(err, sql.ErrNoRows):
		return "The requested resource wasn't found."
	}
	return err.Error()
}

// pick copies the keys present in source, the way destructuring drops undefined ones.
func pick(target, source map[string]any, keys ...string) map[string]any {
	for _, key := range keys {
		if value, ok := source[key]; ok {
			target[key] = value
		}
	}
	return target
}

// amountMinor converts a CNY amount to fen, rejecting sub-fen precision.
func amountMinor(value any) (float64, error) {
	scaled := jsx.Number(value) * 100
	minor := math.Floor(scaled + 0.5)
	if !isInt(minor) || math.Abs(minor) > maxSafeInteger || minor <= 0 || minor > 100000000 || !(math.Abs(scaled-minor) < 0.00001) {
		return 0, Fail("INVALID_COMMERCE_AMOUNT", "课程价格必须是精确到分的正数", nil)
	}
	return minor, nil
}

const maxSafeInteger = 9007199254740991

func isSafeInt(value any) bool {
	return isInt(value) && math.Abs(value.(float64)) <= maxSafeInteger
}

// claimedUpdate claims an order center row's version in order_claims before bumping it.
func claimedUpdate(collection string, row map[string]any, data map[string]any) []step {
	id, version := jsx.String(row["id"]), jsx.Number(row["version"])
	next := copyMap(data)
	next["version"] = version + 1
	return []step{
		create("order_claims", map[string]any{"id": commerceID(collection, id, version), "key": collection + ":" + id + ":" + jsx.String(version)}),
		update(collection, id, next),
	}
}

// auditOperation records an order step on the credit ledger's operation log.
func auditOperation(operationID string, order map[string]any, reason, at string, actor map[string]any) step {
	request := map[string]any{"orderId": order["id"]}
	actorID, actorRole := order["studentId"], any("service")
	if actor != nil {
		request["actor"] = actor
		actorID, actorRole = or(actor["id"], order["studentId"]), or(actor["role"], "service")
	}
	return create("credit_operations", map[string]any{
		"id": operationID, "operationNo": "COM-" + operationID, "studentId": order["studentId"],
		"type": "adjust", "status": "committed", "idempotencyKey": "commerce:" + operationID,
		"sourceType": "order", "sourceId": order["id"], "actorId": actorID, "actorRole": actorRole,
		"requestSnapshot": request, "resultSnapshot": map[string]any{"orderId": order["id"]},
		"reason": reason, "outcome": "committed", "beforeSummary": map[string]any{"status": order["status"]},
		"afterSummary": map[string]any{"reason": reason, "at": at},
	})
}

func orderUpdate(order map[string]any, operationID string, data map[string]any) []step {
	id, version := jsx.String(order["id"]), jsx.Number(order["version"])
	next := copyMap(data)
	next["version"] = version + 1
	return []step{
		create("credit_version_claims", map[string]any{"id": commerceID("claim", id, version), "entityType": "order",
			"entityId": id, "expectedVersion": version, "operationId": operationID}),
		update("orders", id, next),
	}
}

// allocateMinor splits the paid amount across lines by reference value; the last line takes the remainder.
func allocateMinor(amount float64, lines []map[string]any, creditTypes map[string]map[string]any) []any {
	weights := make([]float64, len(lines))
	total := 0.0
	for i, line := range lines {
		reference := jsx.Number(creditTypes[jsx.String(line["creditTypeId"])]["referenceUnitValue"])
		if reference == 0 || math.IsNaN(reference) {
			reference = 1
		}
		weights[i] = reference * jsx.Number(line["quantity"])
		total += weights[i]
	}
	remainder := amount
	result := make([]any, len(lines))
	for i, line := range lines {
		paid := remainder
		if i < len(lines)-1 {
			paid = math.Floor(amount * weights[i] / total)
		}
		remainder -= paid
		result[i] = map[string]any{"creditTypeId": line["creditTypeId"], "quantity": line["quantity"], "paidMinor": paid}
	}
	return result
}

type offerDetails struct {
	offer, packageRecord, price map[string]any
	lines                       []map[string]any
	creditTypes                 map[string]map[string]any
	amount                      float64
	policy                      map[string]any
}

// offer loads a sellable offer and checks everything checkout will rely on.
func (c *orderCenter) offer(offerID any, draft bool) (*offerDetails, error) {
	offer, err := get(c.app, "offers", recordID(offerID))
	if err != nil {
		return nil, err
	}
	if offer["status"] != "active" && !(draft && offer["status"] == "draft") {
		return nil, Fail("OFFER_UNAVAILABLE", "该课程暂不可购买", nil)
	}
	packageRecord, err := get(c.app, "packages", recordID(offer["packageId"]))
	if err != nil {
		return nil, err
	}
	price, err := get(c.app, "price_versions", recordID(offer["priceVersionId"]))
	if err != nil {
		return nil, err
	}
	if err := validateEnrollmentResources(packageRecord, price, jsx.String(packageRecord["id"]), clock()); err != nil {
		return nil, err
	}
	if !slices.Contains([]any{"wechat", "all"}, packageRecord["saleChannel"]) || price["currency"] != "CNY" {
		return nil, Fail("OFFER_CHANNEL_UNAVAILABLE", "该课程尚未开放在线购买", nil)
	}
	lines, err := list(c.app, "package_grant_lines", `packageId="`+escape(jsx.String(packageRecord["id"]))+`"`, "id")
	if err != nil {
		return nil, err
	}
	if len(lines) == 0 || len(lines) > 10 {
		return nil, Fail("INVALID_GRANT_LINES", "课程内容尚未配置", nil)
	}
	seen := map[any]bool{}
	for _, line := range lines {
		seen[line["creditTypeId"]] = true
	}
	if len(seen) != len(lines) {
		return nil, Fail("INVALID_GRANT_LINES", "同类课时必须合并为一项", nil)
	}
	creditTypes := map[string]map[string]any{}
	for _, line := range lines {
		credit, err := get(c.app, "credit_types", recordID(line["creditTypeId"]))
		if err != nil {
			return nil, err
		}
		quantity := line["quantity"]
		if credit["kind"] != "course" || credit["status"] != "active" || !jsx.Truthy(credit["consumable"]) ||
			!isInt(quantity) || quantity.(float64) <= 0 {
			return nil, Fail("INVALID_COURSE_OFFER", "课程内容暂不可购买", nil)
		}
		creditTypes[jsx.String(credit["id"])] = credit
	}
	policy := asMap(offer["policy"])
	if err := validateCommercePolicy(policy); err != nil {
		return nil, err
	}
	tiers := anyList(policy["cancellationTiers"])
	if policy["reservationRefund"] != "cash" {
		only, _ := lastOf(tiers).(map[string]any)
		if len(tiers) != 1 || only["beforeMinutes"] != 0.0 || only["feeBps"] != 0.0 {
			return nil, Fail("COMMERCE_TIERED_CANCELLATION_NOT_ENABLED", "该课程的阶梯退费流程尚未开放，暂不能购买", nil)
		}
	}
	amount, err := amountMinor(price["saleAmount"])
	if err != nil {
		return nil, err
	}
	return &offerDetails{offer: offer, packageRecord: packageRecord, price: price, lines: lines,
		creditTypes: creditTypes, amount: amount, policy: copyMap(policy)}, nil
}

func (c *orderCenter) catalog() (any, error) {
	offers, err := list(c.app, "offers", `status="active"`, "name")
	if err != nil {
		return nil, err
	}
	results := []any{}
	for _, offer := range offers {
		details, err := c.offer(offer["id"], false)
		if err != nil {
			var business *Error
			if errors.As(err, &business) || isNotFound(err) {
				continue
			}
			return nil, err
		}
		quantity := 0.0
		for _, line := range details.lines {
			quantity += jsx.Number(line["quantity"])
		}
		results = append(results, map[string]any{"id": offer["id"], "name": offer["name"], "amount": details.amount,
			"currency": "CNY", "policy": details.policy, "quantity": quantity,
			"validityDays": details.packageRecord["validityDurationDays"]})
	}
	return results, nil
}

// checkout places an online order; the student pays it at the payment plugin's cashier.
func (c *orderCenter) checkout(studentID string, body Body, user auth.Claims) (any, error) {
	key, ok := body.Get("key").(string)
	if !ok || !commerceKey.MatchString(key) {
		return nil, Fail("CHECKOUT_KEY_REQUIRED", "请重新提交购买请求", nil)
	}
	offerID := body.Get("offerId")
	orderID := commerceID("checkout", studentID, key)
	existing, err := findFirst(c.app, "orders", `id="`+escape(orderID)+`"`)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		if asMap(existing["productSnapshot"])["offerId"] != offerID {
			return nil, Fail("CHECKOUT_CONFLICT", "购买请求与原订单不一致", nil)
		}
	} else if err := c.createOrder(studentID, orderID, offerID, user); err != nil {
		return nil, err
	}
	return c.detail(studentID, orderID)
}

func (c *orderCenter) createOrder(studentID, orderID string, offerID any, user auth.Claims) error {
	payer := ""
	if !c.mock {
		openID := auth.ClaimString(user, "wechatOpenId")
		if openID == "" || c.wechatAppID == "" {
			return Fail("PAYMENT_WECHAT_IDENTITY_REQUIRED", "请先使用微信登录，再支付课程订单", nil)
		}
		binding, err := findFirst(c.app, "wechat_identities", `principalType="student" && principalId="`+escape(studentID)+
			`" && appId="`+escape(c.wechatAppID)+`" && openId="`+escape(openID)+`" && status="active"`)
		if err != nil {
			return err
		}
		if binding == nil {
			return Fail("PAYMENT_WECHAT_IDENTITY_REQUIRED", "微信支付身份已变化，请重新登录", nil)
		}
		payer = jsx.String(binding["openId"])
	}
	details, err := c.offer(offerID, false)
	if err != nil {
		return err
	}
	now := clock()
	at := iso(now)
	snapshot := buildGrantSnapshot(details.packageRecord, details.price, details.lines, details.creditTypes, jsx.Undefined{})
	if details.policy["reservationRefund"] == "cash" {
		for _, line := range anyList(snapshot["lines"]) {
			asMap(line)["commerceOrderId"] = orderID
		}
	}
	order, err := buildOrder(at, now, snapshot, Body{Values: map[string]any{}}, orderID, details.packageRecord, details.price,
		"commerce:"+orderID, studentID, "wechat", "")
	if err != nil {
		return err
	}
	order["status"], order["paidAt"], order["settlement"], order["payerOpenId"] = "pending", "", "online", payer
	product := copyMap(asMap(order["productSnapshot"]))
	product["policy"], product["origin"], product["paidMinor"] = details.policy, "gateway", details.amount
	product["offerId"], product["offerName"] = offerID, details.offer["name"]
	product["allocations"] = allocateMinor(details.amount, details.lines, details.creditTypes)
	order["productSnapshot"] = product
	if err := send(c.app, []step{create("orders", order)}); err != nil {
		raced, findErr := findFirst(c.app, "orders", `id="`+escape(orderID)+`"`)
		if findErr != nil || raced == nil || asMap(raced["productSnapshot"])["offerId"] != offerID {
			return err
		}
	}
	return nil
}

// onlineOrder loads an order bought online; other orders are not found here.
func onlineOrder(app core.App, orderID string) (map[string]any, error) {
	order, err := get(app, "orders", orderID)
	if err != nil {
		return nil, err
	}
	if order["settlement"] != "online" {
		return nil, sql.ErrNoRows
	}
	return order, nil
}

func (c *orderCenter) owned(studentID, orderID string) (map[string]any, error) {
	order, err := onlineOrder(c.app, orderID)
	if err != nil {
		return nil, err
	}
	if order["studentId"] != studentID {
		return nil, Fail("COMMERCE_ORDER_FORBIDDEN", "不能操作其他学员的订单", nil)
	}
	return order, nil
}

// fulfillment is the grant that delivered an order's credit, or nil before it.
func fulfillment(app core.App, orderID string) (map[string]any, error) {
	operation, err := findFirst(app, "credit_operations", `type="grant" && sourceType="order" && sourceId="`+escape(orderID)+`"`)
	if err != nil || operation == nil {
		return nil, err
	}
	return asMap(operation["resultSnapshot"]), nil
}

// grantedBatches loads the batches an order's grant created.
func grantedBatches(app core.App, grant map[string]any) ([]map[string]any, error) {
	batches := []map[string]any{}
	for _, item := range anyList(grant["batches"]) {
		batch, err := get(app, "credit_batches", recordID(asMap(item)["batchId"]))
		if err != nil {
			return nil, err
		}
		batches = append(batches, batch)
	}
	return batches, nil
}

func (c *orderCenter) detail(studentID, orderID string) (map[string]any, error) {
	order, err := c.owned(studentID, orderID)
	if err != nil {
		return nil, err
	}
	return c.studentView(order)
}

func (c *orderCenter) studentView(order map[string]any) (map[string]any, error) {
	grant, err := fulfillment(c.app, jsx.String(order["id"]))
	if err != nil {
		return nil, err
	}
	batches, err := grantedBatches(c.app, grant)
	if err != nil {
		return nil, err
	}
	available := 0.0
	for _, batch := range batches {
		available += jsx.Number(batch["availableQuantity"])
	}
	result := c.present(order)
	result["availableQuantity"] = available
	return result, nil
}

// onlineStatuses name an online order's progress: paid becomes granting until its credit lands.
var onlineStatuses = map[any]string{"pending": "pending", "paid": "granting", "granted": "completed", "failed": "failed"}

func onlineStatus(order map[string]any) string {
	if status, ok := onlineStatuses[order["status"]]; ok {
		return status
	}
	return jsx.String(order["status"])
}

// createdAt is a record's created time in the ISO form clients parse everywhere.
func createdAt(row map[string]any) string {
	return strings.Replace(jsx.String(row["created"]), " ", "T", 1)
}

// present is the order view students and ops share.
func (c *orderCenter) present(order map[string]any) map[string]any {
	product := asMap(order["productSnapshot"])
	status := onlineStatus(order)
	return map[string]any{"id": order["id"], "offerId": product["offerId"], "name": product["offerName"],
		"amount": product["paidMinor"], "currency": order["currency"], "policy": product["policy"],
		"refunded": jsx.Number(order["refundedMinor"]), "refundPending": jsx.Number(order["pendingRefundCount"]) > 0,
		"cancellationFees": jsx.Number(order["cancellationFeeMinor"]), "createdAt": createdAt(order),
		"status": status, "mockPayment": c.mock && status == "pending"}
}

func (c *orderCenter) list(studentID string) (any, error) {
	rows, err := list(c.app, "orders", `settlement="online" && studentId="`+escape(studentID)+`"`, "-created")
	if err != nil {
		return nil, err
	}
	result := make([]any, len(rows))
	for i, row := range rows {
		result[i] = c.present(row)
	}
	return result, nil
}

// settleWithoutPayment runs as payment is disabled. Money that may still move
// online blocks it, because nobody would book it afterwards: a processing
// online refund may already be at the gateway (settling it offline as well would
// pay it twice), and an order inside its payment window may still be paid.
// Winding down finishes both. Unpaid orders past their window are closed;
// failed reservation refunds are still owed and nobody could retry them online,
// so the studio takes them over.
func settleWithoutPayment(app core.App) error {
	inFlight, err := list(app, "order_refunds", `status="processing" && settlement="online"`, "")
	if err != nil {
		return err
	}
	if len(inFlight) > 0 {
		return Fail("PAYMENT_REFUNDS_IN_FLIGHT", "还有线上退款在处理中，请先把支付插件设为收尾，等退款完成后再停用",
			map[string]any{"refunds": len(inFlight)})
	}
	unpaid, err := UnpaidOrders(app)
	if err != nil {
		return err
	}
	now := clock()
	for _, order := range unpaid {
		if !order.Expired(now) {
			return Fail("PAYMENT_ORDERS_OPEN", "还有订单在支付时间内，学员仍可能付款；请先把支付插件设为收尾，30 分钟后再停用", nil)
		}
	}
	for _, order := range unpaid {
		if err := OrderPaymentFailed(app, order.OrderID); err != nil {
			return err
		}
	}
	owed, err := list(app, "order_refunds", `status="failed" && settlement="online" && kind="reservation"`, "")
	if err != nil {
		return err
	}
	for _, row := range owed {
		if err := send(app, claimedUpdate("order_refunds", row, map[string]any{"settlement": "offline", "status": "processing"})); err != nil {
			return err
		}
	}
	return nil
}

// refundSettlement is how a new refund request will be settled: online while the
// payment plugin can still finish money, otherwise by the studio offline.
func refundSettlement(app core.App) string {
	if tenancy.Allows(app, tenancy.ID(app), tenancy.Payment, tenancy.SettleMoney) {
		return "online"
	}
	return "offline"
}
