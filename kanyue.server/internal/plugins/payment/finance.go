package payment

import (
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/coursecredit"
	"kanyue.server/internal/jsx"
)

// The finance workspace's money side: the gateway's money view, money cases
// that need a person, and pushing one order's payment and refunds again.

func (s *service) finance() (map[string]any, error) {
	return s.gateway.call(http.MethodGet, "/v1/finance", nil, "")
}

// financeView joins the gateway's money view with the orders it paid for.
func (s *service) financeView() (any, error) {
	summary, err := s.finance()
	if err != nil {
		return nil, err
	}
	references := []string{}
	for _, item := range anyList(summary["payments"]) {
		references = append(references, jsx.String(asMap(item)["reference"]))
	}
	orders, err := coursecredit.OrderSummaries(s.app, references)
	if err != nil {
		return nil, err
	}
	payments := []any{}
	for _, item := range anyList(summary["payments"]) {
		payment := copyMap(asMap(item))
		payment["name"], payment["student"], payment["fulfillment"] = "待核对订单", nil, "unmatched"
		if order := orders[jsx.String(payment["reference"])]; order != nil {
			payment["name"], payment["student"], payment["fulfillment"] = or(order.Name, "待核对订单"), order.Student, or(order.Status, "unmatched")
		}
		payments = append(payments, payment)
	}
	attempts, err := s.app.FindAllRecords(refunds)
	if err != nil {
		return nil, err
	}
	results := []any{}
	for _, item := range anyList(summary["refunds"]) {
		refund := asMap(item)
		payment := findByID(payments, refund["paymentId"])
		entry := pick(map[string]any{}, refund, "id", "amount", "status", "createdAt")
		entry["reference"], entry["name"], entry["student"] = refund["reference"], "待核对订单", nil
		for _, attempt := range attempts {
			if attempt.GetString("gatewayId") == refund["id"] {
				entry["reference"] = attempt.GetString("refundId")
				break
			}
		}
		if payment != nil {
			entry["name"], entry["student"] = or(payment["name"], "待核对订单"), payment["student"]
		}
		results = append(results, entry)
	}
	result := copyMap(summary)
	result["payments"], result["refunds"], result["mockEnabled"] = payments, results, s.gateway.mock
	return result, nil
}

// cases lists what finance must look at: payments and refunds that did not
// settle on their own, and the gateway's reconciliation findings.
func (s *service) cases() ([]map[string]any, error) {
	unsettled, err := s.app.FindRecordsByFilter(payments, `status!="succeeded" || lastError!=""`, "created", 0, 0)
	if err != nil {
		return nil, err
	}
	owed, err := coursecredit.OnlineRefunds(s.app, "processing", "failed")
	if err != nil {
		return nil, err
	}
	finance, err := s.finance()
	if err != nil {
		return nil, err
	}
	reviews, err := s.app.FindAllRecords(cases)
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
		for _, review := range reviews {
			if review.GetString("subjectId") == subjectID {
				item["status"], item["note"] = review.GetString("status"), or(reviewData(review)["note"], "")
				break
			}
		}
		results = append(results, item)
	}
	now := clock().UnixMilli()
	old := func(at string) bool {
		created, err := time.Parse(time.RFC3339Nano, at)
		return err == nil && now-created.UnixMilli() >= 15*60000
	}
	for _, record := range unsettled {
		orderID, at := record.GetString("orderId"), createdAt(record)
		order, err := coursecredit.PayableOrder(s.app, orderID)
		if err != nil {
			return nil, err
		}
		label := ""
		switch {
		case record.GetString("lastError") != "":
			label = "付款信息不一致，已暂停自动发课"
		case order.Status == "granting":
			label = "收款后课时未到账"
		case order.Status != "completed" && old(at):
			label = "订单长期未完成"
		default:
			continue
		}
		add("order:"+orderID, orderID, "order", label, at, nil)
	}
	for _, refund := range owed {
		if refund.Status == "failed" || old(refund.CreatedAt) {
			label := "退款长期处理中"
			if refund.Status == "failed" {
				label = "退款失败，需核实后重新申请"
			}
			add("refund:"+refund.ID, refund.OrderID, "refund", label, refund.CreatedAt, nil)
		}
	}
	gatewayPayments, gatewayRefunds := anyList(finance["payments"]), anyList(finance["refunds"])
	for _, item := range anyList(finance["findings"]) {
		finding := asMap(item)
		data := asMap(finding["data"])
		related := findByID(gatewayPayments, data["targetId"])
		if related == nil {
			if refund := findByID(gatewayRefunds, data["targetId"]); refund != nil {
				related = findByID(gatewayPayments, refund["paymentId"])
			}
		}
		add("gateway:"+jsx.String(finding["id"]), or(related["reference"], ""), "gateway", "渠道核对异常", data["occurredAt"], data)
	}
	for _, review := range reviews {
		data := reviewData(review)
		item := asMap(data["item"])
		if item == nil || slices.ContainsFunc(results, func(result map[string]any) bool { return result["id"] == review.GetString("subjectId") }) {
			continue
		}
		entry := copyMap(item)
		entry["status"], entry["note"] = review.GetString("status"), data["note"]
		results = append(results, entry)
	}
	orderIDs := []string{}
	for _, item := range results {
		orderIDs = append(orderIDs, jsx.String(item["orderId"]))
	}
	orders, err := coursecredit.OrderSummaries(s.app, orderIDs)
	if err != nil {
		return nil, err
	}
	for _, item := range results {
		if !jsx.Truthy(item["orderId"]) {
			continue
		}
		if order := orders[jsx.String(item["orderId"])]; order != nil {
			item["student"], item["orderName"], item["amount"] = order.Student, order.Name, order.Amount
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

// updateCase records a finance review; resolving requires the underlying problem to be gone.
func (s *service) updateCase(subjectID string, body coursecredit.Body, actorID string) (any, error) {
	reason, err := coursecredit.ValidateReason(body.Get("note"))
	if err != nil {
		return nil, err
	}
	status := body.Get("status")
	if status != "open" && status != "resolved" {
		return nil, coursecredit.Fail("INVALID_CASE_STATUS", "处理状态无效", nil)
	}
	open, err := s.cases()
	if err != nil {
		return nil, err
	}
	var item map[string]any
	for _, entry := range open {
		if entry["id"] == subjectID {
			item = entry
			break
		}
	}
	if item == nil {
		return nil, coursecredit.Fail("CASE_NOT_FOUND", "异常记录不存在", nil)
	}
	if status == "resolved" {
		if err := s.caseResolved(subjectID, item); err != nil {
			return nil, err
		}
	}
	review, err := first(s.app, cases, "subjectId={:subject}", "", dbx.Params{"subject": subjectID})
	if err != nil {
		return nil, err
	}
	caseID, at := hashID("case", subjectID), iso(clock())
	data := map[string]any{"note": reason, "actorId": actorID, "at": at, "item": item}
	nextVersion := 1.0
	if review != nil {
		nextVersion = review.GetFloat("version") + 1
		err = change(s.app, review, map[string]any{"status": status, "data": data})
	} else {
		_, err = insert(s.app, cases, caseID, map[string]any{"subjectId": subjectID, "status": status, "version": 1, "data": data})
	}
	if err != nil {
		return nil, err
	}
	err = note(s.app, hashID("case-audit", caseID, nextVersion), jsx.String(or(item["orderId"], subjectID)), actorID,
		"exception_reviewed", map[string]any{"reason": reason, "status": status, "createdAt": at})
	if err != nil {
		return nil, err
	}
	return map[string]any{"status": status}, nil
}

func (s *service) caseResolved(subjectID string, item map[string]any) error {
	unresolved := func(message string) error { return coursecredit.Fail("CASE_STILL_UNRESOLVED", message, nil) }
	switch item["kind"] {
	case "order":
		order, err := coursecredit.PayableOrder(s.app, jsx.String(item["orderId"]))
		if err != nil {
			return err
		}
		if order.Status != "completed" && order.Status != "failed" {
			return unresolved("订单尚未完成处理")
		}
	case "refund":
		refund, err := coursecredit.RefundOf(s.app, strings.TrimPrefix(subjectID, "refund:"))
		if err != nil {
			return err
		}
		if refund.Status == "processing" || (refund.Kind == "reservation" && refund.Status != "succeeded") {
			return unresolved("退款尚未完成，不能关闭待退款项")
		}
	case "gateway":
		targetID := asMap(item["evidence"])["targetId"]
		result, err := s.gateway.call(http.MethodPost, "/v1/reconciliation", map[string]any{}, "")
		if err != nil {
			return err
		}
		for _, finding := range anyList(result["findings"]) {
			if asMap(finding)["targetId"] == targetID {
				return unresolved("当前仍存在渠道差异")
			}
		}
		finance, err := s.finance()
		if err != nil {
			return err
		}
		entity := findByID(append(slices.Clone(anyList(finance["payments"])), anyList(finance["refunds"])...), targetID)
		work, err := s.gateway.call(http.MethodGet, "/v1/work", nil, "")
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

// recoverOrder pushes one order's payment and refunds to the gateway again at an operator's request.
func (s *service) recoverOrder(orderID string, body coursecredit.Body, actorID string) (map[string]any, error) {
	reason, err := coursecredit.ValidateReason(body.Get("reason"))
	if err != nil {
		return nil, err
	}
	key, ok := body.Get("key").(string)
	if !ok || !opsKey.MatchString(key) {
		return nil, coursecredit.Fail("RECOVERY_KEY_REQUIRED", "请重新提交同步请求", nil)
	}
	if _, err := coursecredit.PayableOrder(s.app, orderID); err != nil {
		return nil, err
	}
	auditID := hashID("recover", orderID, actorID, key)
	previous, err := first(s.app, audit, "id={:id}", "", dbx.Params{"id": auditID})
	if err != nil {
		return nil, err
	}
	if previous == nil {
		err = note(s.app, auditID, orderID, actorID, "recovery_requested", map[string]any{"reason": reason, "createdAt": iso(clock())})
		if err != nil {
			return nil, err
		}
		previous, err = first(s.app, audit, "id={:id}", "", dbx.Params{"id": auditID})
		if err != nil {
			return nil, err
		}
	}
	if previous == nil || reviewData(previous)["reason"] != reason {
		return nil, coursecredit.Fail("RECOVERY_REQUEST_CONFLICT", "同步请求与原请求不一致", nil)
	}
	if err := s.sync(orderID, false); err != nil {
		return nil, err
	}
	owed, err := coursecredit.OnlineRefunds(s.app, "processing")
	if err != nil {
		return nil, err
	}
	for _, refund := range owed {
		if refund.OrderID != orderID {
			continue
		}
		if err := s.syncRefund(refund.ID); err != nil {
			return nil, err
		}
	}
	return coursecredit.OpsOrderView(s.app, orderID, s.gateway.mock)
}

func findByID(items []any, id any) map[string]any {
	for _, item := range items {
		if entry := asMap(item); entry["id"] == id {
			return entry
		}
	}
	return nil
}

// reviewData is a record's JSON data field.
func reviewData(record *core.Record) map[string]any {
	value := map[string]any{}
	_ = record.UnmarshalJSONField("data", &value)
	return value
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

func copyMap(source map[string]any) map[string]any {
	result := make(map[string]any, len(source))
	for key, value := range source {
		result[key] = value
	}
	return result
}

// createdAt is a record's created time in ISO form.
func createdAt(record *core.Record) string {
	return jsx.ISO(record.GetDateTime("created").Time())
}

func iso(at time.Time) string { return jsx.ISO(at) }

// clock is Date.now(): millisecond precision.
func clock() time.Time {
	return time.Now().UTC().Truncate(time.Millisecond)
}

var opsKey = regexp.MustCompile(`^[\w-]{1,100}$`)
