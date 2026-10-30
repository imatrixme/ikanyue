package coursecredit

import (
	"database/sql"
	"errors"
	"regexp"
	"strings"
	"time"

	"kanyue.server/internal/jsx"
)

// The operators' side of the order center: online orders, refunds on a
// student's behalf and the offers on sale.

var (
	opsKey        = regexp.MustCompile(`^[\w-]{1,100}$`)
	isoDate       = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	orderStatuses = map[string]string{"pending": "pending", "granting": "paid", "completed": "granted", "failed": "failed", "refunding": ""}
)

// ValidateReason is the 2–500 character reason operators give for order and money actions.
func ValidateReason(value any) (string, error) {
	text, ok := value.(string)
	trimmed := strings.TrimSpace(text)
	if !ok || jsx.Length(trimmed) < 2 || jsx.Length(trimmed) > 500 {
		return "", Fail("COMMERCE_REASON_REQUIRED", "请填写2至500字的处理原因", nil)
	}
	return trimmed, nil
}

// displayName is a student's or teacher's display name in the finance views.
func displayName(person map[string]any) any {
	return orChain(person["realName"], person["nickName"], "未填写姓名")
}

func person(c *orderCenter, studentID any) (map[string]any, error) {
	row, err := get(c.app, "students", recordID(studentID))
	if err != nil {
		return nil, err
	}
	return map[string]any{"id": row["id"], "name": displayName(row), "cellphone": or(row["cellphone"], "")}, nil
}

func (c *orderCenter) opsOrders(query map[string]string) (any, error) {
	number := func(name string) float64 {
		if query[name] == "" {
			return 1
		}
		return jsx.Number(query[name])
	}
	pageNumber, perPage := number("page"), 20.0
	if query["perPage"] != "" {
		perPage = jsx.Number(query["perPage"])
	}
	if !isInt(pageNumber) || pageNumber <= 0 || !isInt(perPage) || perPage <= 0 || perPage > 100 {
		return nil, Fail("INVALID_PAGINATION", "分页参数无效", nil)
	}
	filters := []string{`settlement="online"`}
	search := strings.TrimSpace(query["search"])
	if jsx.Length(search) > 100 {
		return nil, Fail("INVALID_SEARCH", "搜索内容过长", nil)
	}
	if search != "" {
		value := escape(search)
		filters = append(filters, `(id~"`+value+`" || productSnapshot.offerName~"`+value+`" || studentId.realName~"`+value+
			`" || studentId.nickName~"`+value+`" || studentId.cellphone~"`+value+`")`)
	}
	if status := query["status"]; status != "" {
		stored, ok := orderStatuses[status]
		switch {
		case !ok:
			return nil, Fail("INVALID_ORDER_STATUS", "订单状态无效", nil)
		case status == "refunding":
			filters = append(filters, "pendingRefundCount>0")
		default:
			filters = append(filters, `status="`+stored+`"`)
		}
	}
	for _, bound := range []struct{ key, comparison, clock string }{{"from", ">=", "00:00:00"}, {"to", "<=", "23:59:59.999"}} {
		value := query[bound.key]
		if value == "" {
			continue
		}
		if parsed, err := time.Parse("2006-01-02", value); !isoDate.MatchString(value) || err != nil || parsed.Format("2006-01-02") != value {
			return nil, Fail("INVALID_DATE_FILTER", "日期无效", nil)
		}
		filters = append(filters, "created"+bound.comparison+`"`+filterTime(value+"T"+bound.clock+"+08:00")+`"`)
	}
	if query["from"] != "" && query["to"] != "" && query["from"] > query["to"] {
		return nil, Fail("INVALID_DATE_FILTER", "结束日期不能早于开始日期", nil)
	}
	result, err := pageOf(c.app, "orders", strings.Join(filters, " && "), "-created,-id", int(pageNumber), int(perPage))
	if err != nil {
		return nil, err
	}
	for i, row := range result.Items {
		item := c.present(row)
		if item["student"], err = person(c, row["studentId"]); err != nil {
			return nil, err
		}
		item["paymentId"] = or(row["paymentRef"], "")
		result.Items[i] = item
	}
	return result, nil
}

func (c *orderCenter) opsDetail(orderID string) (map[string]any, error) {
	order, err := onlineOrder(c.app, orderID)
	if err != nil {
		return nil, err
	}
	grant, err := fulfillment(c.app, orderID)
	if err != nil {
		return nil, err
	}
	granted, err := grantedBatches(c.app, grant)
	if err != nil {
		return nil, err
	}
	batches := make([]any, len(granted))
	for i, batch := range granted {
		credit, err := get(c.app, "credit_types", recordID(batch["creditTypeId"]))
		if err != nil {
			return nil, err
		}
		batches[i] = map[string]any{"id": batch["id"], "name": credit["name"], "original": batch["originalQuantity"],
			"available": batch["availableQuantity"], "reserved": batch["frozenQuantity"], "consumed": batch["consumedQuantity"],
			"expired": batch["expiredQuantity"], "reversed": batch["reversedQuantity"], "expiresAt": batch["effectiveExpiresAt"]}
	}
	refundRows, err := list(c.app, "order_refunds", `orderId="`+escape(orderID)+`"`, "-created")
	if err != nil {
		return nil, err
	}
	auditRows, err := list(c.app, "order_audit", `subjectId="`+escape(orderID)+`"`, "-created")
	if err != nil {
		return nil, err
	}
	var quote map[string]any
	if preview, err := c.refundPreview(jsx.String(order["studentId"]), orderID); err != nil {
		quote = map[string]any{"amount": 0, "blocked": true, "message": errorMessage(err), "lines": []any{}}
	} else {
		quote = preview.public()
	}
	result := c.present(order)
	if result["student"], err = person(c, order["studentId"]); err != nil {
		return nil, err
	}
	refunds := make([]any, len(refundRows))
	for i, item := range refundRows {
		entry := pick(map[string]any{"id": item["id"], "status": item["status"], "amount": item["amountMinor"],
			"fee": item["feeMinor"], "kind": item["kind"], "settlement": item["settlement"], "createdAt": createdAt(item)}, item, "actor")
		if jsx.Truthy(item["appointmentId"]) {
			entry["appointmentId"] = item["appointmentId"]
		}
		refunds[i] = entry
	}
	audit := make([]any, len(auditRows))
	for i, item := range auditRows {
		entry := map[string]any{"id": item["id"], "actorId": item["actorId"], "action": item["action"]}
		for key, value := range asMap(item["data"]) {
			entry[key] = value
		}
		if entry["actorName"], err = c.actorName(jsx.String(item["actorId"])); err != nil {
			return nil, err
		}
		audit[i] = entry
	}
	// The order center knows the payment that paid the order; checking it against
	// the channel is the payment plugin's reconciliation.
	var payment any
	if jsx.Truthy(order["paymentRef"]) {
		payment = map[string]any{"id": order["paymentRef"], "status": "succeeded"}
	}
	result["batches"], result["quote"], result["payment"] = batches, quote, payment
	result["paymentUnavailable"], result["refunds"], result["audit"] = false, refunds, audit
	return result, nil
}

func (c *orderCenter) actorName(actorID string) (any, error) {
	for _, collection := range []string{"teachers", "students"} {
		person, err := findFirst(c.app, collection, `id="`+escape(actorID)+`"`)
		if err != nil {
			return nil, err
		}
		if person != nil {
			return displayName(person), nil
		}
	}
	return "历史操作人", nil
}

func (c *orderCenter) opsRefund(orderID string, body Body, actorID string) (map[string]any, error) {
	reason, err := ValidateReason(body.Get("reason"))
	if err != nil {
		return nil, err
	}
	key, ok := body.Get("key").(string)
	if !ok || !opsKey.MatchString(key) {
		return nil, Fail("REFUND_KEY_REQUIRED", "请重新确认退款", nil)
	}
	order, err := onlineOrder(c.app, orderID)
	if err != nil {
		return nil, err
	}
	return c.requestRefund(jsx.String(order["studentId"]), orderID, commerceID("ops-refund", actorID, key), body.Get("expectedAmount"),
		map[string]any{"id": actorID, "role": "admin", "reason": reason})
}

func (c *orderCenter) offers() (any, error) {
	offers, err := list(c.app, "offers", "", "-created")
	if err != nil {
		return nil, err
	}
	packages, err := list(c.app, "packages", `status="active"`, "name")
	if err != nil {
		return nil, err
	}
	prices, err := list(c.app, "price_versions", "", "-created")
	if err != nil {
		return nil, err
	}
	packageItems := make([]any, len(packages))
	for i, row := range packages {
		packageItems[i] = map[string]any{"id": row["id"], "name": row["name"]}
	}
	priceItems := make([]any, len(prices))
	for i, row := range prices {
		priceItems[i] = map[string]any{"id": row["id"], "packageId": row["packageId"], "amount": row["saleAmount"],
			"currency": row["currency"], "version": row["version"]}
	}
	return map[string]any{"offers": offers, "packages": packageItems, "prices": priceItems}, nil
}

// saveOffer creates a draft offer, or edits a draft when the body names its id and version.
func (c *orderCenter) saveOffer(body Body, actorID string) (any, error) {
	name, ok := body.Get("name").(string)
	if !ok || jsx.Length(strings.TrimSpace(name)) < 2 || jsx.Length(name) > 100 {
		return nil, Fail("OFFER_NAME_REQUIRED", "请填写课程商品名称", nil)
	}
	key, ok := body.Get("key").(string)
	if !ok || !opsKey.MatchString(key) {
		return nil, Fail("OFFER_KEY_REQUIRED", "请重新提交商品", nil)
	}
	policy := asMap(body.Get("policy"))
	if err := validateCommercePolicy(policy); err != nil {
		return nil, err
	}
	tiers := anyList(policy["cancellationTiers"])
	if len(tiers) == 0 || asMap(lastOf(tiers))["beforeMinutes"] != 0.0 {
		return nil, Fail("INVALID_CANCELLATION_TIERS", "请配置直至开课时的取消规则", nil)
	}
	price, err := get(c.app, "price_versions", recordID(body.Get("priceVersionId")))
	if err != nil {
		return nil, err
	}
	if price["packageId"] != body.Get("packageId") {
		return nil, Fail("PRICE_PACKAGE_MISMATCH", "价格不属于所选课包", nil)
	}
	explicitID := body.Get("id")
	offerID := jsx.String(explicitID)
	if !jsx.Truthy(explicitID) {
		offerID = commerceID("offer", actorID, key)
	}
	if !recordPattern.MatchString(offerID) {
		return nil, Fail("INVALID_OFFER_ID", "商品编号无效", nil)
	}
	previous, err := findFirst(c.app, "offers", `id="`+escape(offerID)+`"`)
	if err != nil {
		return nil, err
	}
	fields := map[string]any{"packageId": body.Get("packageId"), "priceVersionId": body.Get("priceVersionId"),
		"name": strings.TrimSpace(name), "policy": policy, "status": "draft"}
	if previous != nil && !jsx.Truthy(explicitID) {
		// Key order is not compared: the stored policy is the same JSON value either way.
		if previous["name"] != fields["name"] || previous["packageId"] != fields["packageId"] ||
			previous["priceVersionId"] != fields["priceVersionId"] || stableJSON(previous["policy"]) != stableJSON(policy) {
			return nil, Fail("OFFER_REQUEST_CONFLICT", "此提交已创建不同内容的商品", nil)
		}
		return previous, nil
	}
	previousVersion := 0.0
	if previous != nil {
		previousVersion = jsx.Number(or(previous["version"], 0.0))
		if previous["status"] != "draft" || previousVersion != body.Get("version") {
			return nil, Fail("OFFER_VERSION_CONFLICT", "商品已发布或已变化，请新建版本", nil)
		}
	}
	var changes []step
	if previous != nil {
		row := copyMap(previous)
		row["version"] = previousVersion
		changes = claimedUpdate("offers", row, fields)
	} else {
		created := copyMap(fields)
		created["id"], created["version"] = offerID, 1
		changes = []step{create("offers", created)}
	}
	changes = append(changes, create("order_audit", map[string]any{"id": commerceID("offer-save", offerID, previousVersion),
		"actorId": actorID, "subjectId": offerID, "action": "offer_draft_saved",
		"data": map[string]any{"name": fields["name"], "policy": policy, "createdAt": iso(clock())}}))
	if err := send(c.app, changes); err != nil {
		return nil, err
	}
	return get(c.app, "offers", offerID)
}

var recordPattern = regexp.MustCompile(`^[a-z0-9]{15}$`)

// transitionOffer publishes a draft or withdraws a published offer.
func (c *orderCenter) transitionOffer(offerID string, body Body, actorID string) (any, error) {
	row, err := get(c.app, "offers", offerID)
	if err != nil {
		return nil, err
	}
	version := jsx.Number(or(row["version"], 0.0))
	if version != body.Get("version") {
		return nil, Fail("OFFER_VERSION_CONFLICT", "商品已变化，请刷新", nil)
	}
	status := body.Get("status")
	if !(status == "active" && row["status"] == "draft") && !(status == "inactive" && row["status"] == "active") {
		return nil, Fail("INVALID_OFFER_TRANSITION", "发布后只能下架；修改规则请创建新版本", nil)
	}
	reason, err := ValidateReason(body.Get("reason"))
	if err != nil {
		return nil, err
	}
	if status == "active" {
		if _, err := c.offer(offerID, true); err != nil {
			return nil, err
		}
	}
	action := "offer_withdrawn"
	if status == "active" {
		action = "offer_published"
	}
	claimed := copyMap(row)
	claimed["version"] = version
	plan := claimedUpdate("offers", claimed, map[string]any{"status": status})
	plan = append(plan, create("order_audit", map[string]any{"id": commerceID("offer-state", offerID, or(row["version"], 0)),
		"subjectId": offerID, "actorId": actorID, "action": action,
		"data": map[string]any{"reason": reason, "policy": row["policy"], "createdAt": iso(clock())}}))
	if err := send(c.app, plan); err != nil {
		return nil, err
	}
	return get(c.app, "offers", offerID)
}

// orderSummary is how money views name an order.
func orderSummary(c *orderCenter, orderID string) (*OrderSummary, error) {
	order, err := onlineOrder(c.app, orderID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	student, err := person(c, order["studentId"])
	if err != nil {
		return nil, err
	}
	product := asMap(order["productSnapshot"])
	return &OrderSummary{Name: jsx.String(product["offerName"]), Amount: jsx.Number(product["paidMinor"]),
		Status: onlineStatus(order), Student: student, CreatedAt: createdAt(order)}, nil
}
