package coursecredit

import (
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"

	"kanyue.server/internal/jsx"
)

// Hono's CommerceOperations, CommerceOffers, CommerceCases and financeView:
// the finance workspace over online orders.

var (
	opsKey        = regexp.MustCompile(`^[\w-]{1,100}$`)
	isoDate       = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	orderStatuses = []string{"pending", "granting", "completed", "failed", "refunding"}
)

func validateReason(value any) (string, error) {
	text, ok := value.(string)
	trimmed := strings.TrimSpace(text)
	if !ok || jsx.Length(trimmed) < 2 || jsx.Length(trimmed) > 500 {
		return "", Fail("COMMERCE_REASON_REQUIRED", "请填写2至500字的处理原因", nil)
	}
	return trimmed, nil
}

// personName is a student's or teacher's display name in the finance views.
func displayName(person map[string]any) any {
	return orChain(person["realName"], person["nickName"], "未填写姓名")
}

func (c *commerce) person(studentID any) (map[string]any, error) {
	row, err := get(c.app, "students", recordID(studentID))
	if err != nil {
		return nil, err
	}
	return map[string]any{"id": row["id"], "name": displayName(row), "cellphone": or(row["cellphone"], "")}, nil
}

func (c *commerce) opsOrders(query map[string]string) (any, error) {
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
	filters := []string{}
	search := strings.TrimSpace(query["search"])
	if jsx.Length(search) > 100 {
		return nil, Fail("INVALID_SEARCH", "搜索内容过长", nil)
	}
	if search != "" {
		value := escape(search)
		filters = append(filters, `(id~"`+value+`" || data.name~"`+value+`" || studentId.realName~"`+value+
			`" || studentId.nickName~"`+value+`" || studentId.cellphone~"`+value+`")`)
	}
	if status := query["status"]; status != "" {
		if !slices.Contains(orderStatuses, status) {
			return nil, Fail("INVALID_ORDER_STATUS", "订单状态无效", nil)
		}
		if status == "refunding" {
			filters = append(filters, "data.refundPending=true")
		} else {
			filters = append(filters, `status="`+status+`"`)
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
	result, err := pageOf(c.app, "commerce_orders", strings.Join(filters, " && "), "-created,-id", int(pageNumber), int(perPage))
	if err != nil {
		return nil, err
	}
	for i, row := range result.Items {
		item := c.present(row)
		if item["student"], err = c.person(row["studentId"]); err != nil {
			return nil, err
		}
		item["paymentId"] = or(asMap(row["data"])["paymentId"], "")
		result.Items[i] = item
	}
	return result, nil
}

func (c *commerce) opsDetail(orderID string) (map[string]any, error) {
	row, err := get(c.app, "commerce_orders", orderID)
	if err != nil {
		return nil, err
	}
	data := asMap(row["data"])
	granted, err := grantedBatches(c.app, data)
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
	refundRows, err := list(c.app, "commerce_refunds", `orderId="`+escape(orderID)+`"`, "-created")
	if err != nil {
		return nil, err
	}
	auditRows, err := list(c.app, "commerce_audit", `subjectId="`+escape(orderID)+`"`, "-created")
	if err != nil {
		return nil, err
	}
	var quote map[string]any
	if preview, err := c.refundPreview(jsx.String(row["studentId"]), orderID); err != nil {
		quote = map[string]any{"amount": 0, "blocked": true, "message": errorMessage(err), "lines": []any{}}
	} else {
		quote = preview.public()
	}
	var payment any
	paymentUnavailable := false
	if jsx.Truthy(data["paymentId"]) {
		if found, err := c.gateway.payment(jsx.String(data["paymentId"])); err != nil {
			paymentUnavailable = true
		} else {
			payment = found
		}
	}
	result := c.present(row)
	if result["student"], err = c.person(row["studentId"]); err != nil {
		return nil, err
	}
	refunds := make([]any, len(refundRows))
	for i, item := range refundRows {
		entry := map[string]any{"id": item["id"], "status": item["status"]}
		for key, value := range asMap(item["data"]) {
			entry[key] = value
		}
		delete(entry, "gatewayId")
		delete(entry, "held")
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
	result["batches"], result["quote"], result["payment"] = batches, quote, payment
	result["paymentUnavailable"], result["refunds"], result["audit"] = paymentUnavailable, refunds, audit
	return result, nil
}

func (c *commerce) actorName(actorID string) (any, error) {
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

func (c *commerce) opsRefund(orderID string, body Body, actorID string) (map[string]any, error) {
	reason, err := validateReason(body.Get("reason"))
	if err != nil {
		return nil, err
	}
	key, ok := body.Get("key").(string)
	if !ok || !opsKey.MatchString(key) {
		return nil, Fail("REFUND_KEY_REQUIRED", "请重新确认退款", nil)
	}
	row, err := get(c.app, "commerce_orders", orderID)
	if err != nil {
		return nil, err
	}
	return c.requestRefund(jsx.String(row["studentId"]), orderID, commerceID("ops-refund", actorID, key), body.Get("expectedAmount"),
		map[string]any{"id": actorID, "role": "admin", "reason": reason})
}

func (c *commerce) recoverOrder(orderID string, body Body, actorID string) (map[string]any, error) {
	reason, err := validateReason(body.Get("reason"))
	if err != nil {
		return nil, err
	}
	key, ok := body.Get("key").(string)
	if !ok || !opsKey.MatchString(key) {
		return nil, Fail("RECOVERY_KEY_REQUIRED", "请重新提交同步请求", nil)
	}
	if _, err := get(c.app, "commerce_orders", orderID); err != nil {
		return nil, err
	}
	auditID := commerceID("recover", orderID, actorID, key)
	conflict := Fail("RECOVERY_REQUEST_CONFLICT", "同步请求与原请求不一致", nil)
	previous, err := findFirst(c.app, "commerce_audit", `id="`+escape(auditID)+`"`)
	if err != nil {
		return nil, err
	}
	if previous != nil && asMap(previous["data"])["reason"] != reason {
		return nil, conflict
	}
	if previous == nil {
		err := send(c.app, []step{create("commerce_audit", map[string]any{"id": auditID, "subjectId": orderID, "actorId": actorID,
			"action": "recovery_requested", "data": map[string]any{"reason": reason, "createdAt": iso(clock())}})})
		if err != nil {
			replay, findErr := findFirst(c.app, "commerce_audit", `id="`+escape(auditID)+`"`)
			if findErr != nil || replay == nil || asMap(replay["data"])["reason"] != reason {
				return nil, err
			}
		}
	}
	if err := c.sync(orderID); err != nil {
		return nil, err
	}
	refunds, err := list(c.app, "commerce_refunds", `orderId="`+escape(orderID)+`" && status="processing"`, "")
	if err != nil {
		return nil, err
	}
	for _, refund := range refunds {
		if err := c.syncRefund(jsx.String(refund["id"])); err != nil {
			return nil, err
		}
	}
	return c.opsDetail(orderID)
}

func (c *commerce) offers() (any, error) {
	offers, err := list(c.app, "commerce_offers", "", "-created")
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
func (c *commerce) saveOffer(body Body, actorID string) (any, error) {
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
	previous, err := findFirst(c.app, "commerce_offers", `id="`+escape(offerID)+`"`)
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
		changes = commerceUpdate("commerce_offers", row, fields)
	} else {
		created := copyMap(fields)
		created["id"], created["version"] = offerID, 1
		changes = []step{create("commerce_offers", created)}
	}
	changes = append(changes, create("commerce_audit", map[string]any{"id": commerceID("offer-save", offerID, previousVersion),
		"actorId": actorID, "subjectId": offerID, "action": "offer_draft_saved",
		"data": map[string]any{"name": fields["name"], "policy": policy, "createdAt": iso(clock())}}))
	if err := send(c.app, changes); err != nil {
		return nil, err
	}
	return get(c.app, "commerce_offers", offerID)
}

var recordPattern = regexp.MustCompile(`^[a-z0-9]{15}$`)

// transitionOffer publishes a draft or withdraws a published offer.
func (c *commerce) transitionOffer(offerID string, body Body, actorID string) (any, error) {
	row, err := get(c.app, "commerce_offers", offerID)
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
	reason, err := validateReason(body.Get("reason"))
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
	plan := commerceUpdate("commerce_offers", claimed, map[string]any{"status": status})
	plan = append(plan, create("commerce_audit", map[string]any{"id": commerceID("offer-state", offerID, or(row["version"], 0)),
		"subjectId": offerID, "actorId": actorID, "action": action,
		"data": map[string]any{"reason": reason, "policy": row["policy"], "createdAt": iso(clock())}}))
	if err := send(c.app, plan); err != nil {
		return nil, err
	}
	return get(c.app, "commerce_offers", offerID)
}

func (c *commerce) finance() (map[string]any, error) {
	return c.gateway.call(http.MethodGet, "/v1/finance", nil, "")
}

// cases lists what finance must look at: stuck orders and refunds, and gateway findings.
func (c *commerce) cases() ([]map[string]any, error) {
	orders, err := list(c.app, "commerce_orders", `status!="completed"`, "")
	if err != nil {
		return nil, err
	}
	refunds, err := list(c.app, "commerce_refunds", `status!="succeeded"`, "")
	if err != nil {
		return nil, err
	}
	finance, err := c.finance()
	if err != nil {
		return nil, err
	}
	records, err := list(c.app, "commerce_cases", "", "")
	if err != nil {
		return nil, err
	}
	results := []map[string]any{}
	add := func(subjectID, orderID any, kind, label string, at, evidence any) {
		item := map[string]any{"id": subjectID, "orderId": orderID, "kind": kind, "label": label, "createdAt": at,
			"status": "open", "note": ""}
		if evidence != nil {
			item["evidence"] = evidence
		}
		for _, record := range records {
			if record["subjectId"] == subjectID {
				item["status"], item["note"] = record["status"], or(asMap(record["data"])["note"], "")
				break
			}
		}
		results = append(results, item)
	}
	now := clock().UnixMilli()
	old := func(at any) bool {
		ms, ok := millis(at)
		return ok && now-ms >= 15*60000
	}
	for _, order := range orders {
		data := asMap(order["data"])
		if order["status"] == "granting" || old(data["createdAt"]) {
			label := "订单长期未完成"
			if order["status"] == "granting" {
				label = "收款后课时未到账"
			}
			add("order:"+jsx.String(order["id"]), order["id"], "order", label, data["createdAt"], nil)
		}
	}
	for _, refund := range refunds {
		data := asMap(refund["data"])
		if refund["status"] == "failed" || old(data["createdAt"]) {
			label := "退款长期处理中"
			if refund["status"] == "failed" {
				label = "退款失败，需核实后重新申请"
			}
			add("refund:"+jsx.String(refund["id"]), refund["orderId"], "refund", label, data["createdAt"], nil)
		}
	}
	payments, gatewayRefunds := anyList(finance["payments"]), anyList(finance["refunds"])
	for _, item := range anyList(finance["findings"]) {
		finding := asMap(item)
		data := asMap(finding["data"])
		related := findByID(payments, data["targetId"])
		if related == nil {
			if refund := findByID(gatewayRefunds, data["targetId"]); refund != nil {
				related = findByID(payments, refund["paymentId"])
			}
		}
		add("gateway:"+jsx.String(finding["id"]), or(related["reference"], ""), "gateway", "渠道核对异常", data["occurredAt"], data)
	}
	for _, record := range records {
		data := asMap(record["data"])
		item := asMap(data["item"])
		if item == nil || slices.ContainsFunc(results, func(result map[string]any) bool { return result["id"] == record["subjectId"] }) {
			continue
		}
		entry := copyMap(item)
		entry["status"], entry["note"] = record["status"], data["note"]
		results = append(results, entry)
	}
	details := map[string]map[string]any{}
	for _, item := range results {
		orderID := jsx.String(item["orderId"])
		if !jsx.Truthy(item["orderId"]) {
			continue
		}
		if _, ok := details[orderID]; !ok {
			order, err := findFirst(c.app, "commerce_orders", `id="`+escape(orderID)+`"`)
			if err != nil {
				return nil, err
			}
			detail := map[string]any{}
			if order != nil {
				data := asMap(order["data"])
				if detail["student"], err = c.person(order["studentId"]); err != nil {
					return nil, err
				}
				detail["orderName"], detail["amount"] = data["name"], data["amount"]
			}
			details[orderID] = detail
		}
		for key, value := range details[orderID] {
			item[key] = value
		}
	}
	slices.SortStableFunc(results, func(a, b map[string]any) int {
		if order := strings.Compare(jsx.String(a["status"]), jsx.String(b["status"])); order != 0 {
			return order
		}
		return strings.Compare(jsx.String(b["createdAt"]), jsx.String(a["createdAt"]))
	})
	return results, nil
}

func findByID(items []any, id any) map[string]any {
	for _, item := range items {
		if entry := asMap(item); entry["id"] == id {
			return entry
		}
	}
	return nil
}

// updateCase records a finance review; resolving requires the underlying problem to be gone.
func (c *commerce) updateCase(subjectID string, body Body, actorID string) (any, error) {
	note, err := validateReason(body.Get("note"))
	if err != nil {
		return nil, err
	}
	status := body.Get("status")
	if status != "open" && status != "resolved" {
		return nil, Fail("INVALID_CASE_STATUS", "处理状态无效", nil)
	}
	cases, err := c.cases()
	if err != nil {
		return nil, err
	}
	var item map[string]any
	for _, entry := range cases {
		if entry["id"] == subjectID {
			item = entry
			break
		}
	}
	if item == nil {
		return nil, Fail("CASE_NOT_FOUND", "异常记录不存在", nil)
	}
	if status == "resolved" {
		if err := c.caseResolved(subjectID, item); err != nil {
			return nil, err
		}
	}
	row, err := findFirst(c.app, "commerce_cases", `subjectId="`+escape(subjectID)+`"`)
	if err != nil {
		return nil, err
	}
	caseID, at := commerceID("case", subjectID), iso(clock())
	data := map[string]any{"note": note, "actorId": actorID, "at": at, "item": item}
	var plan []step
	nextVersion := 1.0
	if row != nil {
		plan = commerceUpdate("commerce_cases", row, map[string]any{"status": status, "data": data})
		nextVersion = jsx.Number(row["version"]) + 1
	} else {
		plan = []step{create("commerce_cases", map[string]any{"id": caseID, "subjectId": subjectID, "status": status, "version": 1, "data": data})}
	}
	plan = append(plan, create("commerce_audit", map[string]any{"id": commerceID("case-audit", caseID, nextVersion),
		"subjectId": orChain(item["orderId"], subjectID), "actorId": actorID, "action": "exception_reviewed",
		"data": map[string]any{"reason": note, "status": status, "createdAt": at}}))
	if err := send(c.app, plan); err != nil {
		return nil, err
	}
	return map[string]any{"status": status}, nil
}

func (c *commerce) caseResolved(subjectID string, item map[string]any) error {
	unresolved := func(message string) error { return Fail("CASE_STILL_UNRESOLVED", message, nil) }
	switch item["kind"] {
	case "order":
		row, err := get(c.app, "commerce_orders", recordID(item["orderId"]))
		if err != nil {
			return err
		}
		if row["status"] != "completed" && row["status"] != "failed" {
			return unresolved("订单尚未完成处理")
		}
	case "refund":
		row, err := get(c.app, "commerce_refunds", subjectID[min(7, len(subjectID)):])
		if err != nil {
			return err
		}
		if row["status"] == "processing" || (asMap(row["data"])["kind"] == "reservation" && row["status"] != "succeeded") {
			return unresolved("退款尚未完成，不能关闭待退款项")
		}
	case "gateway":
		targetID := asMap(item["evidence"])["targetId"]
		result, err := c.gateway.call(http.MethodPost, "/v1/reconciliation", map[string]any{}, "")
		if err != nil {
			return err
		}
		for _, finding := range anyList(result["findings"]) {
			if asMap(finding)["targetId"] == targetID {
				return unresolved("当前仍存在渠道差异")
			}
		}
		finance, err := c.finance()
		if err != nil {
			return err
		}
		entity := findByID(append(slices.Clone(anyList(finance["payments"])), anyList(finance["refunds"])...), targetID)
		work, err := c.gateway.call(http.MethodGet, "/v1/work", nil, "")
		if err != nil {
			return err
		}
		related := []map[string]any{}
		for _, row := range anyList(work["items"]) {
			if entry := asMap(row); asMap(entry["data"])["targetId"] == targetID {
				related = append(related, entry)
			}
		}
		for _, row := range related {
			data := asMap(row["data"])
			if jsx.Truthy(data["exhausted"]) || jsx.Truthy(data["lastError"]) {
				return unresolved("自动恢复任务仍需处理")
			}
		}
		settled := len(related) > 0
		for _, row := range related {
			settled = settled && jsx.Truthy(asMap(row["data"])["done"])
		}
		if entity != nil {
			settled = slices.Contains([]any{"succeeded", "failed", "closed"}, entity["status"])
		}
		if !settled {
			return unresolved("渠道结果仍未确定")
		}
	}
	return nil
}

// financeView joins the gateway's money view with the orders it belongs to.
func (c *commerce) financeView() (any, error) {
	summary, err := c.finance()
	if err != nil {
		return nil, err
	}
	rows, err := list(c.app, "commerce_orders", "", "-created")
	if err != nil {
		return nil, err
	}
	people := map[string]map[string]any{}
	orders := map[any]map[string]any{}
	for _, row := range rows {
		orders[row["id"]] = row
		studentID := jsx.String(row["studentId"])
		if _, ok := people[studentID]; ok {
			continue
		}
		student, err := get(c.app, "students", studentID)
		if err != nil {
			return nil, err
		}
		people[studentID] = pick(map[string]any{"name": displayName(student)}, student, "cellphone")
	}
	payments := []any{}
	for _, item := range anyList(summary["payments"]) {
		payment := copyMap(asMap(item))
		row := orders[payment["reference"]]
		payment["name"], payment["student"], payment["fulfillment"] = "待核对订单", nil, "unmatched"
		if row != nil {
			payment["name"] = or(asMap(row["data"])["name"], "待核对订单")
			payment["fulfillment"] = or(row["status"], "unmatched")
			if person, ok := people[jsx.String(row["studentId"])]; ok {
				payment["student"] = person
			}
		}
		payments = append(payments, payment)
	}
	business, err := list(c.app, "commerce_refunds", "", "")
	if err != nil {
		return nil, err
	}
	refunds := []any{}
	for _, item := range anyList(summary["refunds"]) {
		refund := asMap(item)
		payment := findByID(payments, refund["paymentId"])
		var source map[string]any
		for _, row := range business {
			if asMap(row["data"])["gatewayId"] == refund["id"] {
				source = row
				break
			}
		}
		entry := pick(map[string]any{}, refund, "id", "amount", "status", "createdAt")
		entry["reference"], entry["name"], entry["student"] = refund["reference"], "待核对订单", nil
		if source != nil {
			entry["reference"] = or(source["id"], refund["reference"])
		}
		if payment != nil {
			entry["name"], entry["student"] = or(payment["name"], "待核对订单"), or(payment["student"], nil)
		}
		refunds = append(refunds, entry)
	}
	result := copyMap(summary)
	result["payments"], result["refunds"], result["mockEnabled"] = payments, refunds, c.gateway.mock
	return result, nil
}
