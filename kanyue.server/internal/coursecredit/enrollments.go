package coursecredit

import (
	"crypto/sha256"
	"encoding/hex"
	"math"
	"slices"
	"strconv"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/records"
)

// Hono's AutomaticEnrollmentService and EnrollmentRosterSyncService: an admin
// enrollment records a paid order, grants its package and optionally joins a
// class; joining future lessons of that class is a separate confirmed step.

const enrollmentConflict = "幂等键对应了不同的报课请求"

func enroll(app core.App, body Body, actor Actor, now time.Time) (map[string]any, error) {
	input := func(key string) any { return body.Get(key) }
	for _, field := range []struct{ name, code string }{
		{"studentId", "STUDENT_ID_REQUIRED"}, {"packageId", "PACKAGE_ID_REQUIRED"},
		{"priceVersionId", "PRICE_VERSION_ID_REQUIRED"},
	} {
		if _, ok := textValue(input(field.name)); !ok {
			return nil, Fail(field.code, field.name+"不能为空", nil)
		}
	}
	if _, ok := textValue(actor.IdempotencyKey); !ok {
		return nil, Fail("IDEMPOTENCY_KEY_REQUIRED", "idempotencyKey不能为空", nil)
	}
	if _, ok := textValue(actor.ID); !ok {
		return nil, Fail("ACTOR_ID_REQUIRED", "actorId不能为空", nil)
	}
	channel := or(input("channel"), "admin")
	if channel != "admin" && channel != "offline" {
		return nil, Fail("ENROLLMENT_CHANNEL_INVALID", "报课渠道无效", nil)
	}
	studentID, packageID, priceVersionID := input("studentId").(string), input("packageId").(string), input("priceVersionId").(string)
	classID := or(input("classId"), "")
	scopedKey, err := scopedIdempotencyKey("automaticEnrollment", actor.IdempotencyKey)
	if err != nil {
		return nil, err
	}
	requestHash := fingerprint(map[string]any{
		"studentId": studentID, "packageId": packageID, "priceVersionId": priceVersionID,
		"classId": classID, "paidAmount": input("paidAmount"), "payerId": or(input("payerId"), ""),
		"channel": channel, "paymentReference": or(input("paymentReference"), ""),
	})
	if result, err := replay(app, scopedKey, requestHash, enrollmentConflict); result != nil || err != nil {
		return result, err
	}

	student, err := get(app, "students", studentID)
	if err != nil {
		return nil, err
	}
	packageRecord, err := get(app, "packages", packageID)
	if err != nil {
		return nil, err
	}
	price, err := get(app, "price_versions", priceVersionID)
	if err != nil {
		return nil, err
	}
	if err := validateEnrollmentResources(packageRecord, price, packageID, now); err != nil {
		return nil, err
	}
	lines, err := list(app, "package_grant_lines", `packageId="`+records.EscapeFilter(packageID)+`"`, "creditTypeId")
	if err != nil {
		return nil, err
	}
	if len(lines) == 0 {
		return nil, Fail("ENROLLMENT_PACKAGE_EMPTY", "课包没有配置课时", nil)
	}
	creditTypes := map[string]map[string]any{}
	for _, line := range lines {
		id := relationID(line["creditTypeId"])
		creditType, err := get(app, "credit_types", id)
		if err != nil {
			return nil, err
		}
		creditTypes[id] = creditType
	}
	var classRecord map[string]any
	if jsx.Truthy(classID) {
		if classRecord, err = enrollmentClass(app, jsx.String(classID), studentID, lines); err != nil {
			return nil, err
		}
	}
	at := iso(now)
	operationID, orderID := ids.Record(), ids.Record()
	membershipID := ""
	futureLessons := []map[string]any{}
	if classRecord != nil {
		membershipID = ids.Record()
		if futureLessons, err = futureClassLessons(app, jsx.String(classRecord["id"]), at); err != nil {
			return nil, err
		}
	}
	grantSnapshot := buildGrantSnapshot(packageRecord, price, lines, creditTypes, input("paidAmount"))
	order, err := buildOrder(at, now, grantSnapshot, body, orderID, packageRecord, price, scopedKey, studentID, channel, classID)
	if err != nil {
		return nil, err
	}
	snapshotLines := grantSnapshot["lines"].([]any)
	grants := make([]grantBatch, 0, len(snapshotLines))
	for _, line := range snapshotLines {
		id := line.(map[string]any)["creditTypeId"].(string)
		grant, err := buildGrantBatch(at, creditTypes[id], line, operationID, order, map[string]any{}, actor.ID)
		if err != nil {
			return nil, err
		}
		grants = append(grants, grant)
	}

	futureCount := len(futureLessons)
	status, syncStatus := "awaiting_class_assignment", "not_required"
	if futureCount > 0 {
		syncStatus = "preview_required"
	}
	var resultClassID, resultMembershipID any
	if classRecord != nil {
		resultClassID, resultMembershipID = or(classRecord["id"], nil), membershipID
		status = "completed"
		if futureCount > 0 {
			status = "synchronizing_future_lessons"
		}
	}
	grantSummaries := make([]any, len(grants))
	for i, grant := range grants {
		grantSummaries[i] = map[string]any{
			"batchId": grant.batch["id"], "creditTypeId": grant.batch["creditTypeId"], "quantity": grant.batch["originalQuantity"],
		}
	}
	result := map[string]any{
		"operationId":  operationID,
		"orderId":      orderID,
		"studentId":    student["id"],
		"classId":      resultClassID,
		"membershipId": resultMembershipID,
		"status":       status,
		"grants":       grantSummaries,
		"sync": map[string]any{
			"futureLessonCount": futureCount, "requiresConfirmation": futureCount > 0, "status": syncStatus,
		},
	}

	reference := or(input("paymentReference"), "")
	providerEventID := or(input("paymentReference"), "admin:"+scopedKey)
	operation := map[string]any{
		"id":             operationID,
		"operationNo":    operationNo("enroll", now, operationID),
		"studentId":      studentID,
		"type":           "grant",
		"status":         "committed",
		"idempotencyKey": scopedKey,
		"sourceType":     "enrollment",
		"sourceId":       orderID,
		"requestSnapshot": map[string]any{
			"requestHash": requestHash, "classId": classID, "packageId": packageID,
		},
		"resultSnapshot": result,
		"actorId":        actor.ID,
		"actorRole":      actorRoleOr(actor, "admin"),
		"traceId":        actor.TraceID,
	}
	for key, value := range operationAudit(or(input("reason"), "admin_enrollment"), map[string]any{"studentId": studentID}, result) {
		operation[key] = value
	}
	plan := []step{
		create("orders", order),
		create("payment_events", map[string]any{
			"id":              ids.Record(),
			"orderId":         orderID,
			"providerEventId": providerEventID,
			"type":            "paid",
			"amount":          order["paidAmount"],
			"payloadHash": sha256Hex(`{"amount":` + scalarJSON(order["paidAmount"]) + `,"channel":` + scalarJSON(order["channel"]) +
				`,"reference":` + stableJSON(reference) + `}`),
		}),
		create("credit_operations", operation),
	}
	for _, grant := range grants {
		plan = append(plan, create("credit_batches", grant.batch), create("credit_events", grant.event))
	}
	if classRecord != nil {
		plan = append(plan, create("class_students", map[string]any{
			"id": membershipID, "classId": classRecord["id"], "studentId": studentID, "status": "active",
			"effectiveFrom": at, "effectiveTo": "", "sourceOrderId": orderID,
		}))
	}
	plan = append(plan,
		create("ops_audit_logs", map[string]any{
			"id": ids.Record(), "actorId": actor.ID, "actorRole": actorRoleOr(actor, "admin"),
			"action": "course_operations.enrollment.create", "resourceType": "enrollment",
			"resourceId": orderID, "outcome": "success",
			"metadata": map[string]any{"classAssigned": classRecord != nil, "futureLessonCount": futureCount},
		}),
		outbox("course-enrollment.activated", "order", orderID, result),
	)
	return commitOrReplay(app, plan, scopedKey, requestHash, enrollmentConflict, "ENROLLMENT_TRANSACTION_FAILED", result)
}

func sha256Hex(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

func validateEnrollmentResources(packageRecord, price map[string]any, packageID string, now time.Time) error {
	if packageRecord["status"] != "active" {
		return Fail("ENROLLMENT_PACKAGE_INACTIVE", "课包当前不可用", nil)
	}
	if price["packageId"] != packageID || price["status"] != "active" {
		return Fail("ENROLLMENT_PRICE_INVALID", "价格版本与课包不匹配或未启用", nil)
	}
	from, ok := millis(price["validFrom"])
	valid := ok && from <= now.UnixMilli()
	if valid && jsx.Truthy(price["validTo"]) {
		to, ok := millis(price["validTo"])
		valid = ok && to > now.UnixMilli()
	}
	if !valid {
		return Fail("ENROLLMENT_PRICE_EXPIRED", "价格版本不在有效期内", nil)
	}
	return nil
}

func enrollmentClass(app core.App, classID, studentID string, lines []map[string]any) (map[string]any, error) {
	classRecord, err := get(app, "classes", classID)
	if err != nil {
		return nil, err
	}
	if classRecord["status"] != "draft" && classRecord["status"] != "active" {
		return nil, Fail("ENROLLMENT_CLASS_CLOSED", "班级当前不能加入", nil)
	}
	matches := slices.ContainsFunc(lines, func(line map[string]any) bool {
		return line["creditTypeId"] == classRecord["defaultCreditTypeId"]
	})
	if !matches {
		return nil, Fail("ENROLLMENT_CLASS_COURSE_MISMATCH", "课包与班级课程不匹配", nil)
	}
	existing, err := findFirst(app, "class_students", `classId="`+records.EscapeFilter(classID)+
		`" && studentId="`+records.EscapeFilter(studentID)+`" && effectiveTo=""`)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, Fail("ENROLLMENT_CLASS_MEMBERSHIP_EXISTS", "学员已经在这个班级中", nil)
	}
	return classRecord, nil
}

// futureClassLessons lists the class's published lessons starting at or after `from`.
func futureClassLessons(app core.App, classID, from string) ([]map[string]any, error) {
	return list(app, "session_classes",
		`classId="`+records.EscapeFilter(classID)+`" && sessionId.startAt>="`+records.EscapeFilter(filterTime(from))+`"`+
			` && sessionId.status!="draft" && sessionId.status!="cancelled"`,
		"sessionId.startAt", "sessionId")
}

// buildGrantSnapshot splits list and paid amounts across lines by reference value.
func buildGrantSnapshot(packageRecord, price map[string]any, lines []map[string]any, creditTypes map[string]map[string]any, paidAmountInput any) map[string]any {
	listAmount := jsx.Number(price["listAmount"])
	paidAmount := enrollmentPaidAmount(price, paidAmountInput)
	weights := make([]float64, len(lines))
	total := 0.0
	for i, line := range lines {
		reference := jsx.Number(creditTypes[relationID(line["creditTypeId"])]["referenceUnitValue"])
		if reference == 0 || math.IsNaN(reference) {
			reference = 1
		}
		weights[i] = reference * jsx.Number(line["quantity"])
		total += weights[i]
	}
	days := func(key string) float64 {
		value := jsx.Number(packageRecord[key])
		if math.IsNaN(value) {
			return 0
		}
		return value
	}
	snapshotLines := make([]any, len(lines))
	for i, line := range lines {
		quantity := jsx.Number(line["quantity"])
		snapshotLines[i] = map[string]any{
			"creditTypeId":           line["creditTypeId"],
			"quantity":               quantity,
			"activationMode":         packageRecord["activationMode"],
			"activationDeadlineDays": days("activationDeadlineDays"),
			"validityDurationDays":   days("validityDurationDays"),
			"expiryPolicy":           packageRecord["expiryPolicy"],
			"listUnitValue":          roundMoney(listAmount * weights[i] / total / quantity),
			"paidUnitCost":           roundMoney(paidAmount * weights[i] / total / quantity),
			"currency":               price["currency"],
			"priority":               0,
		}
	}
	return map[string]any{
		"activationMode":         packageRecord["activationMode"],
		"activationDeadlineDays": days("activationDeadlineDays"),
		"validityDurationDays":   days("validityDurationDays"),
		"expiryPolicy":           packageRecord["expiryPolicy"],
		"lines":                  snapshotLines,
	}
}

func enrollmentPaidAmount(price map[string]any, input any) float64 {
	if _, undefined := input.(jsx.Undefined); undefined {
		return jsx.Number(price["saleAmount"])
	}
	return jsx.Number(input)
}

// roundMoney is Math.round((value + Number.EPSILON) * 100) / 100.
func roundMoney(value float64) float64 {
	return math.Floor((value+2.220446049250313e-16)*100+0.5) / 100
}

func buildOrder(at string, now time.Time, grantSnapshot map[string]any, body Body, orderID string, packageRecord, price map[string]any, scopedKey, studentID string, channel, classID any) (map[string]any, error) {
	paidAmount := enrollmentPaidAmount(price, body.Get("paidAmount"))
	if math.IsNaN(paidAmount) || math.IsInf(paidAmount, 0) || paidAmount < 0 {
		return nil, Fail("ENROLLMENT_PAID_AMOUNT_INVALID", "实付金额无效", nil)
	}
	return map[string]any{
		"id":             orderID,
		"orderNo":        "ENR-" + strconv.FormatInt(now.UnixMilli(), 10) + "-" + orderID,
		"studentId":      studentID,
		"payerId":        or(body.Get("payerId"), studentID),
		"type":           "package_purchase",
		"channel":        channel,
		"status":         "granted",
		"settlement":     "offline",
		"currency":       price["currency"],
		"listAmount":     jsx.Number(price["listAmount"]),
		"paidAmount":     paidAmount,
		"priceVersionId": price["id"],
		"productSnapshot": map[string]any{
			"packageId": packageRecord["id"], "packageCode": packageRecord["code"], "packageName": packageRecord["name"],
			"priceVersion": price["version"], "classId": classID,
		},
		"grantSnapshot":  grantSnapshot,
		"idempotencyKey": scopedKey,
		"paidAt":         at,
		"cancelledAt":    "",
		"version":        1,
	}, nil
}

// previewRosterSync lists the class's future lessons the enrolled student is not on yet.
func previewRosterSync(app core.App, orderID string, now time.Time) (map[string]any, error) {
	if orderID == "" {
		return nil, Fail("ORDER_ID_REQUIRED", "编号不能为空", nil)
	}
	order, err := get(app, "orders", orderID)
	if err != nil {
		return nil, err
	}
	snapshot, _ := order["productSnapshot"].(map[string]any)
	classID := or(snapshot["classId"], "")
	lessons := []any{}
	if !jsx.Truthy(classID) {
		return withPreviewHash(map[string]any{
			"orderId": order["id"], "studentId": order["studentId"], "classId": nil, "lessons": lessons,
		}), nil
	}
	links, err := futureClassLessons(app, jsx.String(classID), iso(now))
	if err != nil {
		return nil, err
	}
	for _, link := range links {
		session := expanded(link, "sessionId")
		sessionID := jsx.String(or(session["id"], link["sessionId"]))
		existing, err := findFirst(app, "session_students", `sessionId="`+records.EscapeFilter(sessionID)+
			`" && studentId="`+records.EscapeFilter(jsx.String(order["studentId"]))+`"`)
		if err != nil {
			return nil, err
		}
		if existing == nil {
			lessons = append(lessons, map[string]any{
				"lessonId": or(session["id"], link["sessionId"]),
				"title":    or(session["title"], ""),
				"startAt":  or(session["startAt"], nil),
				"status":   or(session["status"], "scheduled"),
			})
		}
	}
	return withPreviewHash(map[string]any{
		"orderId": order["id"], "studentId": order["studentId"], "classId": classID, "lessons": lessons,
	}), nil
}

func withPreviewHash(preview map[string]any) map[string]any {
	preview["previewHash"] = fingerprint(preview)
	return preview
}

// expanded is Hono's relation(record, field): the expanded record or {}.
func expanded(record map[string]any, field string) map[string]any {
	expand, _ := record["expand"].(map[string]any)
	switch value := expand[field].(type) {
	case map[string]any:
		return value
	case []any:
		if len(value) > 0 {
			if first, ok := value[0].(map[string]any); ok {
				return first
			}
		}
	}
	return map[string]any{}
}

func confirmRosterSync(app core.App, orderID string, body Body, actor Actor, now time.Time) (map[string]any, error) {
	if orderID == "" {
		return nil, Fail("ORDER_ID_REQUIRED", "编号不能为空", nil)
	}
	previewHash, ok := body.Get("previewHash").(string)
	if !ok || previewHash == "" {
		return nil, Fail("SYNC_PREVIEW_HASH_REQUIRED", "编号不能为空", nil)
	}
	preview, err := previewRosterSync(app, orderID, now)
	if err != nil {
		return nil, err
	}
	if preview["previewHash"] != previewHash {
		return nil, Fail("SYNC_PREVIEW_STALE", "同步预览已变化，请重新确认", nil)
	}
	previewLessons := preview["lessons"].([]any)
	wanted := []string{}
	selectionInvalid := Fail("SYNC_LESSON_SELECTION_INVALID", "选择了不在预览中的课堂", nil)
	if requested, ok := body.Get("lessonIds").([]any); ok && len(requested) > 0 {
		for _, value := range requested {
			id, ok := value.(string)
			if !ok {
				// A non-string id never matches a lesson, so the selection cannot be complete.
				return nil, selectionInvalid
			}
			if !slices.Contains(wanted, id) {
				wanted = append(wanted, id)
			}
		}
	} else {
		for _, lesson := range previewLessons {
			if id := jsx.String(lesson.(map[string]any)["lessonId"]); !slices.Contains(wanted, id) {
				wanted = append(wanted, id)
			}
		}
	}
	selected := []map[string]any{}
	for _, lesson := range previewLessons {
		item := lesson.(map[string]any)
		if slices.Contains(wanted, jsx.String(item["lessonId"])) {
			selected = append(selected, item)
		}
	}
	if len(selected) != len(wanted) {
		return nil, selectionInvalid
	}
	if _, ok := textValue(actor.IdempotencyKey); !ok {
		return nil, Fail("IDEMPOTENCY_KEY_REQUIRED", "idempotencyKey is required", nil)
	}
	if actor.ID == "" {
		return nil, Fail("ACTOR_ID_REQUIRED", "actorId is required", nil)
	}
	scopedKey, err := scopedIdempotencyKey("confirmEnrollmentRosterSync", actor.IdempotencyKey)
	if err != nil {
		return nil, err
	}
	sortedIDs := slices.Clone(wanted)
	slices.SortFunc(sortedIDs, compareUTF16)
	requestHash := fingerprint(map[string]any{"orderId": orderID, "lessonIds": sortedIDs, "previewHash": previewHash})
	if result, err := replay(app, scopedKey, requestHash, replayConflict); result != nil || err != nil {
		return result, err
	}
	operationID := ids.Record()
	sessions := make([]map[string]any, len(selected))
	for i, lesson := range selected {
		if sessions[i], err = get(app, "sessions", jsx.String(lesson["lessonId"])); err != nil {
			return nil, err
		}
	}
	synchronized := make([]any, len(sessions))
	for i, session := range sessions {
		synchronized[i] = session["id"]
	}
	result := map[string]any{
		"operationId": operationID, "orderId": orderID, "synchronizedLessonIds": synchronized, "status": "completed",
	}
	requestSnapshot := map[string]any{"orderId": orderID, "lessonIds": synchronized}
	operation := map[string]any{
		"id":                    operationID,
		"operationNo":           operationNo("adjust", now, operationID),
		"studentId":             or(preview["studentId"], ""),
		"type":                  "adjust",
		"status":                "committed",
		"idempotencyKey":        scopedKey,
		"sourceType":            "enrollment_roster_sync",
		"sourceId":              orderID,
		"reversalOfOperationId": "",
		"requestSnapshot":       map[string]any{"requestHash": requestHash, "orderId": orderID, "lessonIds": synchronized},
		"resultSnapshot":        result,
		"actorId":               actor.ID,
		"actorRole":             actorRoleOr(actor, "admin"),
		"traceId":               actor.TraceID,
	}
	for key, value := range operationAudit(or(body.Get("reason"), "adjust"), requestSnapshot, result) {
		operation[key] = value
	}
	plan := []step{create("credit_operations", operation)}
	for _, session := range sessions {
		id := jsx.String(session["id"])
		version := positiveVersion(session["version"])
		plan = append(plan,
			versionClaim("session", id, version, operationID),
			create("session_students", map[string]any{
				"id": ids.Record(), "sessionId": id, "studentId": preview["studentId"],
				"sourceClassIds": []any{preview["classId"]}, "attendanceStatus": "scheduled",
				"creditStatus": "pending", "eligibilityReason": "", "checkedInAt": "", "settledAt": "", "version": 1,
			}),
			update("sessions", id, map[string]any{
				"rosterVersion": positiveVersion(session["rosterVersion"]) + 1, "version": version + 1,
			}),
		)
	}
	plan = append(plan,
		create("ops_audit_logs", map[string]any{
			"id": ids.Record(), "actorId": actor.ID, "actorRole": actorRoleOr(actor, "admin"),
			"action": "course_operations.enrollment.sync_roster", "resourceType": "enrollment",
			"resourceId": orderID, "outcome": "success", "metadata": map[string]any{"lessonCount": len(sessions)},
		}),
		outbox("course-enrollment.roster-corrected", "order", orderID, result),
	)
	return commitOrReplay(app, plan, scopedKey, requestHash, replayConflict, "COURSE_CREDIT_BATCH_FAILED", result)
}
