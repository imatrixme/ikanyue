package coursecredit

import (
	"database/sql"
	"errors"
	"math"
	"net/http"
	"regexp"
	"slices"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/jsx"
)

// Hono's commerce CheckoutService: online orders paid through the gateway
// become course-credit orders and grants.

// CommerceConfig is how Hono's GatewayClient and commerce routes read the environment.
type CommerceConfig struct {
	GatewayURL   string
	ServiceToken string
	MockToken    string
	EventToken   string
	WechatAppID  string
	// Mock is NODE_ENV development/test with PAY_MOCK_ENABLED=true.
	Mock bool
}

type commerce struct {
	app         core.App
	gateway     *gateway
	wechatAppID string
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

// commerceUpdate claims the row's version before bumping it.
func commerceUpdate(collection string, row map[string]any, data map[string]any) []step {
	id, version := jsx.String(row["id"]), jsx.Number(row["version"])
	next := copyMap(data)
	next["version"] = version + 1
	return []step{
		create("commerce_claims", map[string]any{"id": commerceID(collection, id, version), "key": collection + ":" + id + ":" + jsx.String(version)}),
		update(collection, id, next),
	}
}

// auditOperation records a commerce step on the credit ledger's operation log.
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
func (c *commerce) offer(offerID any, draft bool) (*offerDetails, error) {
	offer, err := get(c.app, "commerce_offers", recordID(offerID))
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

func (c *commerce) catalog() (any, error) {
	offers, err := list(c.app, "commerce_offers", `status="active"`, "name")
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

func (c *commerce) checkout(studentID string, body Body, user auth.Claims) (any, error) {
	key, ok := body.Get("key").(string)
	if !ok || !commerceKey.MatchString(key) {
		return nil, Fail("CHECKOUT_KEY_REQUIRED", "请重新提交购买请求", nil)
	}
	offerID := body.Get("offerId")
	orderID := commerceID("checkout", studentID, key)
	conflict := Fail("CHECKOUT_CONFLICT", "购买请求与原订单不一致", nil)
	transaction, err := findFirst(c.app, "commerce_orders", `id="`+escape(orderID)+`"`)
	if err != nil {
		return nil, err
	}
	if transaction != nil {
		if asMap(transaction["data"])["offerId"] != offerID {
			return nil, conflict
		}
	} else if err := c.createOrder(studentID, orderID, offerID, user); err != nil {
		return nil, err
	}
	if err := c.sync(orderID); err != nil {
		return nil, err
	}
	return c.detail(studentID, orderID)
}

func (c *commerce) createOrder(studentID, orderID string, offerID any, user auth.Claims) error {
	var payerID any
	if !c.gateway.mock {
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
		payerID = binding["openId"]
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
	order["status"], order["paidAt"] = "pending", ""
	product := copyMap(asMap(order["productSnapshot"]))
	product["policy"], product["origin"], product["paidMinor"] = details.policy, "gateway", details.amount
	order["productSnapshot"] = product
	data := map[string]any{"offerId": offerID, "name": details.offer["name"], "amount": details.amount, "currency": "CNY",
		"policy": details.policy, "allocations": allocateMinor(details.amount, details.lines, details.creditTypes),
		"paymentId": "", "refunded": 0, "refundPending": false, "grantResult": nil, "createdAt": at}
	if payerID != nil {
		data["payerId"] = payerID
	}
	err = send(c.app, []step{create("orders", order), create("commerce_orders", map[string]any{
		"id": orderID, "orderId": orderID, "studentId": studentID, "status": "pending", "version": 1, "data": data,
	})})
	if err != nil {
		raced, findErr := findFirst(c.app, "commerce_orders", `id="`+escape(orderID)+`"`)
		if findErr != nil || raced == nil || asMap(raced["data"])["offerId"] != offerID {
			return err
		}
	}
	return nil
}

// sync settles an order against the gateway: create its payment, record the receipt, grant credit.
func (c *commerce) sync(orderID string) error {
	transaction, err := get(c.app, "commerce_orders", orderID)
	if err != nil {
		return err
	}
	data := asMap(transaction["data"])
	var payment map[string]any
	if !jsx.Truthy(data["paymentId"]) {
		if payment, err = c.gateway.createPayment(orderID, data["amount"], data["payerId"], data["name"]); err != nil {
			return err
		}
		next := copyMap(data)
		next["paymentId"] = payment["id"]
		if err := send(c.app, commerceUpdate("commerce_orders", transaction, map[string]any{"data": next})); err != nil {
			return err
		}
		if transaction, err = get(c.app, "commerce_orders", orderID); err != nil {
			return err
		}
		data = asMap(transaction["data"])
	} else if payment, err = c.gateway.payment(jsx.String(data["paymentId"])); err != nil {
		return err
	}
	if payment["reference"] != orderID || payment["amount"] != data["amount"] || payment["currency"] != "CNY" {
		return Fail("PAYMENT_RECEIPT_MISMATCH", "付款信息不一致，已暂停自动发课", nil)
	}
	if transaction["status"] == "completed" {
		return nil
	}
	if payment["status"] != "succeeded" {
		if (payment["status"] == "failed" || payment["status"] == "closed") && transaction["status"] != "failed" {
			return send(c.app, commerceUpdate("commerce_orders", transaction, map[string]any{"status": "failed"}))
		}
		return nil
	}
	order, err := get(c.app, "orders", orderID)
	if err != nil {
		return err
	}
	now := clock()
	if order["status"] == "pending" {
		operationID := commerceID("receipt", orderID)
		at := iso(now)
		plan := []step{auditOperation(operationID, order, "gateway_receipt", at, nil)}
		plan = append(plan, orderUpdate(order, operationID, map[string]any{"status": "paid", "paidAt": or(payment["paidAt"], at)})...)
		plan = append(plan, create("payment_events", map[string]any{"id": commerceID("payment_event", payment["id"]),
			"orderId": orderID, "providerEventId": "gateway:" + jsx.String(payment["id"]), "type": "paid",
			"amount": jsx.Number(payment["amount"]) / 100, "payloadHash": commerceID(payment["id"], payment["amount"], payment["currency"])}))
		plan = append(plan, commerceUpdate("commerce_orders", transaction, map[string]any{"status": "granting"})...)
		if err := send(c.app, plan); err != nil {
			return err
		}
	}
	if order, err = get(c.app, "orders", orderID); err != nil {
		return err
	}
	if order["status"] != "paid" && order["status"] != "granted" {
		return Fail("ORDER_NOT_GRANTABLE", "订单状态需要核对", nil)
	}
	result, err := grantOrderCredits(c.app, orderID, Actor{ID: "gateway", Role: "service", IdempotencyKey: "commerce-grant-" + orderID}, now)
	if err != nil {
		return err
	}
	if transaction, err = get(c.app, "commerce_orders", orderID); err != nil {
		return err
	}
	if transaction["status"] != "completed" {
		next := copyMap(asMap(transaction["data"]))
		next["grantResult"] = result
		return send(c.app, commerceUpdate("commerce_orders", transaction, map[string]any{"status": "completed", "data": next}))
	}
	return nil
}

func (c *commerce) owned(studentID, orderID string) (map[string]any, error) {
	row, err := get(c.app, "commerce_orders", orderID)
	if err != nil {
		return nil, err
	}
	if row["studentId"] != studentID {
		return nil, Fail("COMMERCE_ORDER_FORBIDDEN", "不能操作其他学员的订单", nil)
	}
	return row, nil
}

// grantedBatches loads the batches an order's grant created.
func grantedBatches(app core.App, data map[string]any) ([]map[string]any, error) {
	batches := []map[string]any{}
	for _, item := range anyList(asMap(data["grantResult"])["batches"]) {
		batch, err := get(app, "credit_batches", recordID(asMap(item)["batchId"]))
		if err != nil {
			return nil, err
		}
		batches = append(batches, batch)
	}
	return batches, nil
}

func (c *commerce) detail(studentID, orderID string) (map[string]any, error) {
	row, err := c.owned(studentID, orderID)
	if err != nil {
		return nil, err
	}
	batches, err := grantedBatches(c.app, asMap(row["data"]))
	if err != nil {
		return nil, err
	}
	available := 0.0
	for _, batch := range batches {
		available += jsx.Number(batch["availableQuantity"])
	}
	result := c.present(row)
	result["availableQuantity"] = available
	return result, nil
}

func (c *commerce) cashier(studentID, orderID string, user auth.Claims) (any, error) {
	row, err := c.owned(studentID, orderID)
	if err != nil {
		return nil, err
	}
	data := asMap(row["data"])
	if row["status"] != "pending" || !jsx.Truthy(data["paymentId"]) {
		return nil, Fail("PAYMENT_NOT_READY", "当前订单无需再次付款", nil)
	}
	if !c.gateway.mock {
		openID := auth.ClaimString(user, "wechatOpenId")
		if openID == "" || openID != data["payerId"] {
			return nil, Fail("PAYMENT_WECHAT_IDENTITY_REQUIRED", "请使用下单时的微信身份支付", nil)
		}
	}
	payment, err := c.gateway.refreshPayment(jsx.String(data["paymentId"]))
	if err != nil {
		return nil, err
	}
	if payment["status"] != "pending" {
		if err := c.sync(orderID); err != nil {
			return nil, err
		}
		return nil, Fail("PAYMENT_WINDOW_CLOSED", "订单已超过支付时间，请重新选购", nil)
	}
	return payment["action"], nil
}

// present is the order view students and ops share.
func (c *commerce) present(row map[string]any) map[string]any {
	data := asMap(row["data"])
	result := pick(map[string]any{"id": row["id"]}, data,
		"offerId", "name", "amount", "currency", "policy", "refunded", "refundPending", "createdAt")
	result["cancellationFees"] = or(data["cancellationFees"], 0)
	result["status"] = row["status"]
	result["mockPayment"] = c.gateway.mock && row["status"] == "pending"
	return result
}

func (c *commerce) list(studentID string) (any, error) {
	rows, err := list(c.app, "commerce_orders", `studentId="`+escape(studentID)+`"`, "-created")
	if err != nil {
		return nil, err
	}
	result := make([]any, len(rows))
	for i, row := range rows {
		result[i] = c.present(row)
	}
	return result, nil
}

func (c *commerce) mockPay(studentID, orderID string) (any, error) {
	row, err := c.owned(studentID, orderID)
	if err != nil {
		return nil, err
	}
	paymentID := asMap(row["data"])["paymentId"]
	if !jsx.Truthy(paymentID) {
		return nil, Fail("PAYMENT_NOT_READY", "支付单正在准备", nil)
	}
	if err := c.gateway.mockSuccess(jsx.String(paymentID)); err != nil {
		return nil, err
	}
	if err := c.sync(orderID); err != nil {
		return nil, err
	}
	return c.detail(studentID, orderID)
}

// gatewayEvents lists the gateway's unacknowledged events of one kind.
func (c *commerce) gatewayEvents(prefix string) ([]map[string]any, error) {
	events, err := c.gateway.call(http.MethodGet, "/v1/events", nil, "")
	if err != nil {
		return nil, err
	}
	result := []map[string]any{}
	for _, item := range anyList(events["items"]) {
		event := asMap(item)
		if kind, _ := asMap(event["data"])["type"].(string); strings.HasPrefix(kind, prefix) {
			result = append(result, event)
		}
	}
	return result, nil
}

func (c *commerce) ack(event map[string]any) error {
	_, err := c.gateway.call(http.MethodPost, "/v1/events/"+jsx.String(event["id"])+"/ack", map[string]any{}, "")
	return err
}

// recover retries unfinished orders, then acknowledges payment events already reflected locally.
func (c *commerce) recover() (map[string]any, error) {
	rows, err := list(c.app, "commerce_orders", `status!="completed"`, "created")
	if err != nil {
		return nil, err
	}
	failed := 0
	for _, row := range rows {
		if c.sync(jsx.String(row["id"])) != nil {
			failed++
		}
	}
	events, err := c.gatewayEvents("payment.")
	if err != nil {
		return nil, err
	}
	for _, event := range events {
		data := asMap(event["data"])
		payload := asMap(data["payload"])
		row, err := findFirst(c.app, "commerce_orders", `id="`+escape(jsx.String(payload["reference"]))+`"`)
		if err != nil {
			return nil, err
		}
		handled := false
		if row != nil {
			if payload["status"] == "succeeded" {
				handled = row["status"] == "completed"
			} else {
				handled = row["status"] == "failed"
			}
		}
		// Events for payments this service never created must not occupy the gateway's pending window.
		if row == nil || (asMap(row["data"])["paymentId"] == data["targetId"] && handled) {
			if err := c.ack(event); err != nil {
				return nil, err
			}
		}
	}
	return map[string]any{"inspected": len(rows), "unresolved": failed}, nil
}
