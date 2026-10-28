package coursecredit

import (
	"math"
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/jsx"
	"kanyue.server/internal/records"
)

// Ledger read models of Hono's CourseCreditOpsQueryService: credit accounts
// per student, the renewal overview and settlement exceptions.

func init() {
	for name, config := range map[string]resource{
		"orders": {
			collection: "orders", sort: "-created",
			fields: []string{"id", "orderNo", "studentId", "payerId", "type", "channel", "status",
				"currency", "listAmount", "paidAmount", "priceVersionId", "paidAt",
				"productSnapshot", "grantSnapshot", "cancelledAt", "version", "created", "updated"},
			statuses:     []string{"pending", "paid", "granted", "cancelled", "failed", "reversal_pending", "reversed"},
			filterFields: []string{"studentId", "priceVersionId"},
			rawFields:    []string{"productSnapshot", "grantSnapshot"},
		},
		"enrollments": {
			collection: "credit_operations", sort: "-created",
			fields: []string{"id", "operationNo", "studentId", "status", "sourceId", "requestSnapshot",
				"resultSnapshot", "actorId", "actorRole", "traceId", "created", "updated"},
			statuses:     []string{"pending", "committed", "failed", "reversed"},
			baseFilter:   `sourceType="enrollment"`,
			filterFields: []string{"studentId", "sourceId"},
			rawFields:    []string{"requestSnapshot", "resultSnapshot"},
		},
		"settlementExceptions": {
			collection: "session_students", sort: "-updated",
			fields: []string{"id", "sessionId", "studentId", "attendanceStatus", "creditStatus",
				"eligibilityReason", "checkedInAt", "settledAt", "version", "created", "updated"},
			baseFilter: `creditStatus="credit_insufficient" || creditStatus="conversion_required"`,
		},
		"reconciliationRuns": {
			collection: "reconciliation_runs", sort: "-startedAt",
			fields:   []string{"id", "scope", "status", "startedAt", "finishedAt", "differenceCount", "created"},
			statuses: []string{"pending", "running", "passed", "failed"},
		},
		"reconciliationExceptions": {
			collection: "reconciliation_exceptions", sort: "-detectedAt",
			fields: []string{"id", "runId", "batchId", "code", "field", "expectedValue", "actualValue",
				"status", "detectedAt", "created"},
			statuses: []string{"open", "acknowledged", "resolved"},
		},
		"auditLogs": {
			collection: "ops_audit_logs", sort: "-created",
			fields:       []string{"id", "actorId", "actorRole", "action", "resourceType", "resourceId", "outcome", "metadata", "created"},
			filterFields: []string{"actorId", "resourceType", "resourceId", "outcome"},
			rawFields:    []string{"metadata"},
		},
	} {
		resources[name] = config
	}
}

// quantity is Hono's quantity(): a positive finite number or 0.
func quantity(value any) float64 {
	number := jsx.Number(value)
	if math.IsNaN(number) || math.IsInf(number, 0) || number <= 0 {
		return 0
	}
	return number
}

type account struct {
	StudentID           string  `json:"studentId"`
	BatchCount          int     `json:"batchCount"`
	AvailableQuantity   float64 `json:"availableQuantity"`
	FrozenQuantity      float64 `json:"frozenQuantity"`
	ConsumedQuantity    float64 `json:"consumedQuantity"`
	ExpiredQuantity     float64 `json:"expiredQuantity"`
	UnactivatedQuantity float64 `json:"unactivatedQuantity"`
}

func (a account) asMap() map[string]any {
	return map[string]any{
		"studentId": a.StudentID, "batchCount": a.BatchCount, "availableQuantity": a.AvailableQuantity,
		"frozenQuantity": a.FrozenQuantity, "consumedQuantity": a.ConsumedQuantity,
		"expiredQuantity": a.ExpiredQuantity, "unactivatedQuantity": a.UnactivatedQuantity,
	}
}

// groupAccounts sums batches per student, keeping first-seen order.
func groupAccounts(batches []map[string]any) ([]string, map[string]*account) {
	order := []string{}
	accounts := map[string]*account{}
	for _, batch := range batches {
		studentID := relationID(batch["studentId"])
		item, ok := accounts[studentID]
		if !ok {
			item = &account{StudentID: studentID}
			accounts[studentID] = item
			order = append(order, studentID)
		}
		item.BatchCount++
		item.AvailableQuantity += quantity(batch["availableQuantity"])
		item.FrozenQuantity += quantity(batch["frozenQuantity"])
		item.ConsumedQuantity += quantity(batch["consumedQuantity"])
		item.ExpiredQuantity += quantity(batch["expiredQuantity"])
		if batch["status"] == "pending" || batch["status"] == "unactivated" {
			item.UnactivatedQuantity += quantity(batch["availableQuantity"])
		}
	}
	return order, accounts
}

func accountOf(accounts map[string]*account, studentID string) map[string]any {
	if item, ok := accounts[studentID]; ok {
		return item.asMap()
	}
	return account{StudentID: studentID}.asMap()
}

// idList splits a comma-separated id list, trimmed and de-duplicated.
func idList(value string) []string {
	return uniqueIDs(strings.Split(value, ","))
}

func listAccounts(app core.App, query map[string]string) (any, error) {
	pageNumber, perPage, err := pagination(query)
	if err != nil {
		return nil, err
	}
	studentIDs := idList(query["studentIds"])
	filter := ""
	if len(studentIDs) > 0 {
		filter = anyFilter("studentId", studentIDs)
	}
	batches, err := list(app, "credit_batches", filter, "studentId,created")
	if err != nil {
		return nil, err
	}
	order, accounts := groupAccounts(batches)
	items := []any{}
	slices.SortStableFunc(order, strings.Compare)
	for _, studentID := range order {
		items = append(items, accounts[studentID].asMap())
	}
	return arrayPage(items, pageNumber, perPage), nil
}

// arrayPage pages an in-memory list like Hono's arrayPage.
func arrayPage(items []any, pageNumber, perPage int) map[string]any {
	totalPages := 0
	if len(items) > 0 {
		totalPages = (len(items) + perPage - 1) / perPage
	}
	start := min((pageNumber-1)*perPage, len(items))
	end := min(start+perPage, len(items))
	return map[string]any{
		"page": pageNumber, "perPage": perPage, "totalItems": len(items), "totalPages": totalPages,
		"items": slices.Clone(items[start:end]),
	}
}

func studentOverview(app core.App, query map[string]string, now time.Time) (any, error) {
	studentIDs := idList(query["studentIds"])
	if len(studentIDs) == 0 || len(studentIDs) > 100 {
		return nil, Fail("STUDENT_IDS_INVALID", "请提供 1 到 100 个学员编号", nil)
	}
	batches, err := list(app, "credit_batches", anyFilter("studentId", studentIDs), "studentId,created")
	if err != nil {
		return nil, err
	}
	upcoming, err := list(app, "sessions", `startAt>="`+records.EscapeFilter(filterTime(iso(now)))+
		`" && status!="draft" && status!="cancelled" && status!="settled"`, "startAt")
	if err != nil {
		return nil, err
	}
	followUps, err := listFollowUps(app, studentIDs)
	if err != nil {
		return nil, err
	}
	roster := []map[string]any{}
	if len(upcoming) > 0 {
		lessonIDs := make([]string, len(upcoming))
		for i, lesson := range upcoming {
			lessonIDs[i] = jsx.String(lesson["id"])
		}
		roster, err = list(app, "session_students", anyFilter("studentId", studentIDs)+" && "+
			anyFilter("sessionId", lessonIDs)+` && attendanceStatus!="cancelled"`, "studentId")
		if err != nil {
			return nil, err
		}
	}
	lessonOrder := map[string]int{}
	for i, lesson := range upcoming {
		lessonOrder[jsx.String(lesson["id"])] = i
	}
	_, accounts := groupAccounts(batches)
	items := make([]any, len(studentIDs))
	for i, studentID := range studentIDs {
		next := -1
		for _, row := range roster {
			if relationID(row["studentId"]) != studentID {
				continue
			}
			if index, ok := lessonOrder[relationID(row["sessionId"])]; ok && (next < 0 || index < next) {
				next = index
			}
		}
		item := accountOf(accounts, studentID)
		item["nextLesson"] = nil
		if next >= 0 {
			lesson := upcoming[next]
			item["nextLesson"] = map[string]any{
				"id": lesson["id"], "title": or(lesson["title"], ""), "startAt": lesson["startAt"], "status": lesson["status"],
			}
		}
		item["followUp"] = nil
		for _, followUp := range followUps {
			if followUp["studentId"] == studentID {
				item["followUp"] = followUp
				break
			}
		}
		items[i] = item
	}
	return map[string]any{"items": items}, nil
}

func getAccount(app core.App, studentID string) (any, error) {
	if studentID == "" {
		return nil, Fail("STUDENT_ID_REQUIRED", "Student id is required", nil)
	}
	filter := `studentId="` + records.EscapeFilter(studentID) + `"`
	batches, err := list(app, "credit_batches", filter, "effectiveExpiresAt,priority,created")
	if err != nil {
		return nil, err
	}
	events, err := list(app, "credit_events", filter, "-businessTime,-created",
		"creditTypeId", "creditTypeId.courseSpecId", "operationId")
	if err != nil {
		return nil, err
	}
	_, accounts := groupAccounts(batches)
	result := accountOf(accounts, studentID)
	projected := make([]any, len(batches))
	for i, batch := range batches {
		projected[i] = map[string]any{
			"id":                 batch["id"],
			"creditTypeId":       relationID(batch["creditTypeId"]),
			"sourceOperationId":  relationID(batch["sourceOperationId"]),
			"status":             batch["status"],
			"originalQuantity":   quantity(batch["originalQuantity"]),
			"availableQuantity":  quantity(batch["availableQuantity"]),
			"frozenQuantity":     quantity(batch["frozenQuantity"]),
			"consumedQuantity":   quantity(batch["consumedQuantity"]),
			"expiredQuantity":    quantity(batch["expiredQuantity"]),
			"effectiveExpiresAt": or(batch["effectiveExpiresAt"], nil),
			"activationDeadline": or(batch["activationDeadline"], nil),
			"activatedAt":        or(batch["activatedAt"], nil),
			"listUnitValue":      numberOrZero(batch["listUnitValue"]),
			"paidUnitCost":       numberOrZero(batch["paidUnitCost"]),
			"currency":           or(batch["currency"], ""),
			"created":            or(batch["created"], nil),
		}
	}
	mapped := []any{}
	for i, event := range events {
		if i == 100 {
			break
		}
		mapped = append(mapped, mapEvent(event))
	}
	result["batches"] = projected
	result["events"] = mapped
	return result, nil
}

// numberOrZero is `Number(value) || 0`.
func numberOrZero(value any) float64 {
	number := jsx.Number(value)
	if math.IsNaN(number) {
		return 0
	}
	return number
}

func mapEvent(event map[string]any) map[string]any {
	creditType := expanded(event, "creditTypeId")
	operation := expanded(event, "operationId")
	var source any
	if jsx.Truthy(operation["id"]) {
		source = map[string]any{
			"id":          or(relationID(operation["sourceId"]), nil),
			"operationNo": or(operation["operationNo"], ""),
			"type":        or(operation["sourceType"], ""),
		}
	}
	return map[string]any{
		"id":                event["id"],
		"operationId":       relationID(event["operationId"]),
		"batchId":           relationID(event["batchId"]),
		"creditType":        mapCreditType(creditType, relationID(event["creditTypeId"]), expanded(creditType, "courseSpecId")),
		"eventType":         event["eventType"],
		"quantityDelta":     numberOrZero(event["quantityDelta"]),
		"bucketFrom":        or(event["bucketFrom"], nil),
		"bucketTo":          or(event["bucketTo"], nil),
		"businessTime":      or(event["businessTime"], nil),
		"reason":            or(event["reason"], ""),
		"reversalOfEventId": or(relationID(event["reversalOfEventId"]), nil),
		"source":            source,
		"created":           or(event["created"], nil),
	}
}

func mapCreditType(record map[string]any, fallbackID string, courseSpec map[string]any) map[string]any {
	var spec any
	if jsx.Truthy(courseSpec["id"]) {
		spec = map[string]any{"id": courseSpec["id"], "code": or(courseSpec["code"], ""), "name": or(courseSpec["name"], "")}
	}
	return map[string]any{
		"id":         or(or(record["id"], fallbackID), ""),
		"code":       or(record["code"], ""),
		"name":       or(record["name"], ""),
		"kind":       or(record["kind"], ""),
		"courseSpec": spec,
	}
}

var settlementOperationTypes = []string{"reserve", "consume", "release", "expire", "settle_session", "reverse_session_settlement"}

func listSettlementExceptions(app core.App, query map[string]string) (any, error) {
	pageNumber, perPage, err := pagination(query)
	if err != nil {
		return nil, err
	}
	types := make([]string, len(settlementOperationTypes))
	for i, kind := range settlementOperationTypes {
		types[i] = `type="` + kind + `"`
	}
	sources := []struct {
		collection, filter, sort string
		expand                   []string
	}{
		{"session_students", `creditStatus="credit_insufficient" || creditStatus="conversion_required"`, "-updated", nil},
		{"session_credit_allocations", `status="expired"`, "-updated", []string{"sessionStudentId"}},
		{"credit_operations", `status="failed" && (` + strings.Join(types, " || ") + `)`, "-updated", nil},
		{"sessions", `status="correction_pending"`, "-updated", nil},
		{"reconciliation_exceptions", `status="open" || status="acknowledged"`, "-detectedAt", nil},
	}
	rows := make([][]map[string]any, len(sources))
	for i, source := range sources {
		if rows[i], err = list(app, source.collection, source.filter, source.sort, source.expand...); err != nil {
			return nil, err
		}
	}
	items := []map[string]any{}
	for _, record := range rows[0] {
		items = append(items, exception(record, "", map[string]any{
			"kind": record["creditStatus"], "resourceType": "session_student",
			"sessionId": snapshotID(record["sessionId"]), "studentId": snapshotID(record["studentId"]),
			"status": "open", "reason": or(record["eligibilityReason"], record["creditStatus"]),
		}))
	}
	for _, record := range rows[1] {
		roster, _ := asMap(record["expand"])["sessionStudentId"].(map[string]any)
		items = append(items, exception(record, "", map[string]any{
			"kind": "expired_release", "resourceType": "session_credit_allocation",
			"sessionId": snapshotID(roster["sessionId"]), "studentId": snapshotID(roster["studentId"]),
			"status": "open", "reason": "预留课时在释放时已过期",
			"quantity": numberOrZero(record["quantity"]), "batchId": snapshotID(record["batchId"]),
		}))
	}
	for _, record := range rows[2] {
		result := plainObject(record["resultSnapshot"])
		nested := plainObject(result["error"])
		code := strings.ToUpper(stringOf(or(or(result["errorCode"], nested["code"]), or(result["code"], ""))))
		message := stringOf(or(result["message"], or(nested["message"], "")))
		kind := "failed_operation"
		if strings.Contains(code, "DUPLICATE") {
			kind = "duplicate"
		}
		sessionID := snapshotValue(record, "sessionId")
		if sessionID == nil && record["sourceType"] == "session" {
			sessionID = or(stringOf(or(record["sourceId"], "")), nil)
		}
		items = append(items, exception(record, "", map[string]any{
			"kind": kind, "resourceType": "credit_operation", "sessionId": sessionID,
			"studentId": snapshotID(record["studentId"]), "status": "failed",
			"reason":        or(or(message, code), or(record["reason"], "课时操作失败")),
			"operationType": or(record["type"], ""),
		}))
	}
	for _, record := range rows[3] {
		items = append(items, exception(record, "", map[string]any{
			"kind": "correction_pending", "resourceType": "session", "sessionId": record["id"], "studentId": nil,
			"status": "correction_pending", "reason": or(record["correctionReason"], "课堂结算已撤回，等待教务更正"),
		}))
	}
	for _, record := range rows[4] {
		if !strings.Contains(strings.ToUpper(stringOf(or(record["code"], ""))), "DUPLICATE") {
			continue
		}
		items = append(items, exception(record, stringOf(or(record["detectedAt"], "")), map[string]any{
			"kind": "duplicate", "resourceType": "reconciliation_exception",
			"sessionId": snapshotValue(record, "sessionId"), "studentId": snapshotValue(record, "studentId"),
			"status": or(record["status"], "open"), "reason": or(record["code"], "DUPLICATE_EVENT"),
			"batchId": snapshotID(record["batchId"]),
		}))
	}
	slices.SortStableFunc(items, func(left, right map[string]any) int {
		return strings.Compare(stringOf(or(right["detectedAt"], "")), stringOf(or(left["detectedAt"], "")))
	})
	filtered := []any{}
	for _, item := range items {
		if mismatch(query, "kind", item) || mismatch(query, "status", item) ||
			mismatch(query, "sessionId", item) || mismatch(query, "studentId", item) {
			continue
		}
		filtered = append(filtered, item)
	}
	return arrayPage(filtered, pageNumber, perPage), nil
}

func exception(record map[string]any, detectedAt string, fields map[string]any) map[string]any {
	item := map[string]any{
		"id": record["id"], "resourceId": record["id"],
		"detectedAt": or(detectedAt, or(record["updated"], or(record["created"], nil))),
	}
	for key, value := range fields {
		item[key] = value
	}
	return item
}

// mismatch is `query[key] && item[key] !== query[key]`.
func mismatch(query map[string]string, key string, item map[string]any) bool {
	value := query[key]
	return value != "" && item[key] != value
}

// snapshotID is settlementExceptionProjection's relationId: id, value or null.
func snapshotID(value any) any {
	if object, ok := value.(map[string]any); ok {
		return or(object["id"], nil)
	}
	if _, ok := value.([]any); ok {
		return nil
	}
	return or(value, nil)
}

func snapshotValue(record map[string]any, field string) any {
	return or(snapshotID(plainObject(record["resultSnapshot"])[field]),
		or(snapshotID(plainObject(record["requestSnapshot"])[field]), nil))
}

func plainObject(value any) map[string]any {
	if object, ok := value.(map[string]any); ok {
		return object
	}
	return map[string]any{}
}

func stringOf(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return jsx.String(value)
}
