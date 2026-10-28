package coursecredit

import (
	"reflect"
	"slices"
	"testing"
	"time"
)

// Ops query cases ported from Hono's courseCreditOpsQueryService tests, over stored
// records instead of a mock repository: filters are checked by what they return.

type opsQueryFixture struct {
	ledgerFixture
	source string
}

func opsQuerySetup(t *testing.T) opsQueryFixture {
	t.Helper()
	f := ledgerSetup(t, true)
	source := put(t, f.app, "credit_operations", map[string]any{"type": "grant", "status": "committed", "operationNo": "source",
		"idempotencyKey": "source", "studentId": f.studentID}).Id
	return opsQueryFixture{f, source}
}

func (f opsQueryFixture) learner(t *testing.T, name string) string {
	t.Helper()
	return put(t, f.app, "students", map[string]any{"realName": name}).Id
}

func (f opsQueryFixture) batch(t *testing.T, studentID string, changes map[string]any) string {
	t.Helper()
	return put(t, f.app, "credit_batches", with2(map[string]any{"studentId": studentID, "creditTypeId": f.creditTypeID,
		"sourceOperationId": f.source, "originalQuantity": 10, "availableQuantity": 0, "frozenQuantity": 0, "consumedQuantity": 0,
		"expiredQuantity": 0, "reversedQuantity": 0, "status": "active", "activationMode": "GRANT_TIME",
		"validFrom": "2026-01-01 00:00:00.000Z", "effectiveExpiresAt": "2099-12-31 00:00:00.000Z", "version": 1}, changes)).Id
}

func (f opsQueryFixture) order(t *testing.T, no, status string) string {
	t.Helper()
	return put(t, f.app, "orders", map[string]any{"orderNo": no, "idempotencyKey": no, "studentId": f.studentID, "type": "purchase", "channel": "mock",
		"status": status, "currency": "CNY", "listAmount": 3000, "paidAmount": 2800, "priceVersionId": f.priceID,
		"productSnapshot": map[string]any{"packageName": "声乐十课时"}, "grantSnapshot": map[string]any{"lines": []any{map[string]any{"quantity": 10}}},
		"version": 1}).Id
}

func pageItems(t *testing.T, result any) []map[string]any {
	t.Helper()
	switch value := result.(type) {
	case page:
		return value.Items
	case map[string]any:
		raw, _ := value["items"].([]any)
		items := make([]map[string]any, len(raw))
		for i, item := range raw {
			items[i], _ = item.(map[string]any)
		}
		return items
	}
	t.Fatalf("unexpected page %T", result)
	return nil
}

func itemValues(items []map[string]any, key string) []any {
	values := make([]any, len(items))
	for i, item := range items {
		values[i] = item[key]
	}
	return values
}

// Hono: courseCreditOpsQueryService › ops resource queries use allowlisted fields, status filters, and pagination
func TestOpsResourceQueriesFilterAndPaginate(t *testing.T) {
	f := opsQuerySetup(t)
	for i := range 11 {
		f.order(t, "O-"+string(rune('a'+i)), "paid")
	}
	f.order(t, "O-pending", "pending")
	result, err := listResource(f.app, "orders", map[string]string{"page": "2", "perPage": "10", "status": "paid"})
	if err != nil || result.Page != 2 || result.TotalItems != 11 || len(result.Items) != 1 {
		t.Fatalf("result = %+v, %v", result, err)
	}
	item := result.Items[0]
	if item["studentId"] != f.studentID || item["paidAmount"] != 2800.0 ||
		!reflect.DeepEqual(item["productSnapshot"], map[string]any{"packageName": "声乐十课时"}) ||
		!reflect.DeepEqual(item["grantSnapshot"], map[string]any{"lines": []any{map[string]any{"quantity": 10.0}}}) {
		t.Fatalf("item = %v", item)
	}
	if _, ok := item["payerSecret"]; ok || len(item) != len(resources["orders"].fields) {
		t.Fatalf("fields = %v", item)
	}
}

// Hono: courseCreditOpsQueryService › workspace detail filters are allowlisted and audit metadata remains structured
func TestOpsWorkspaceFiltersAndAuditMetadata(t *testing.T) {
	f := opsQuerySetup(t)
	put(t, f.app, "ops_audit_logs", map[string]any{"actorId": "teacher", "actorRole": "teacher", "action": "course_operations.lesson.attendance",
		"resourceType": "session", "resourceId": "lesson", "outcome": "success", "metadata": map[string]any{"attendanceStatus": "present"}})
	put(t, f.app, "ops_audit_logs", map[string]any{"actorId": "other", "actorRole": "teacher", "action": "course_operations.lesson.attendance",
		"resourceType": "session", "resourceId": "lesson", "outcome": "success", "metadata": map[string]any{}})
	result, err := listResource(f.app, "auditLogs", map[string]string{"actorId": "teacher", "resourceType": "session",
		"resourceId": "lesson", "outcome": "success", "ignored": "x"})
	if err != nil || len(result.Items) != 1 || !reflect.DeepEqual(result.Items[0]["metadata"], map[string]any{"attendanceStatus": "present"}) {
		t.Fatalf("result = %+v, %v", result, err)
	}

	present := put(t, f.app, "session_students", map[string]any{"sessionId": f.sessionID, "studentId": f.studentID,
		"attendanceStatus": "present", "creditStatus": "reserved", "version": 1}).Id
	put(t, f.app, "session_students", map[string]any{"sessionId": f.sessionID, "studentId": f.learner(t, "乙"),
		"attendanceStatus": "present", "creditStatus": "pending", "version": 1})
	rows, err := listResource(f.app, "sessionStudents", map[string]string{"sessionId": f.sessionID, "studentId": f.studentID,
		"attendanceStatus": "present", "creditStatus": "reserved"})
	if err != nil || len(rows.Items) != 1 || rows.Items[0]["id"] != present {
		t.Fatalf("rows = %+v, %v", rows, err)
	}
}

// Hono: courseCreditOpsQueryService › enrollment projections expose immutable workflow status without unrelated operation data
func TestOpsEnrollmentProjection(t *testing.T) {
	f := opsQuerySetup(t)
	put(t, f.app, "credit_operations", map[string]any{"type": "grant", "status": "committed", "operationNo": "enroll", "idempotencyKey": "enroll",
		"studentId": f.studentID, "sourceType": "enrollment", "sourceId": "order", "requestSnapshot": map[string]any{"packageId": "package"},
		"resultSnapshot": map[string]any{"status": "synchronizing_future_lessons", "sync": map[string]any{"futureLessonCount": 3}}})
	put(t, f.app, "credit_operations", map[string]any{"type": "grant", "status": "committed", "operationNo": "other", "idempotencyKey": "other",
		"studentId": f.studentID, "sourceType": "order", "sourceId": "order"})
	result, err := listResource(f.app, "enrollments", map[string]string{"studentId": f.studentID, "sourceId": "order"})
	if err != nil || len(result.Items) != 1 {
		t.Fatalf("result = %+v, %v", result, err)
	}
	if !reflect.DeepEqual(result.Items[0]["resultSnapshot"], map[string]any{"status": "synchronizing_future_lessons",
		"sync": map[string]any{"futureLessonCount": 3.0}}) {
		t.Fatalf("item = %v", result.Items[0])
	}
	if _, ok := result.Items[0]["sourceType"]; ok {
		t.Fatal("unrelated operation fields leaked")
	}
}

// Hono: courseCreditOpsQueryService › every Admin workspace resource supports list and detail projections
func TestOpsEveryResourceListsAndGets(t *testing.T) {
	f := opsQuerySetup(t)
	f.order(t, "O-1", "paid")
	for name, config := range resources {
		listed, err := listResource(f.app, name, map[string]string{})
		if err != nil {
			t.Fatalf("%s list = %v", name, err)
		}
		if len(listed.Items) == 0 {
			continue
		}
		id := listed.Items[0]["id"].(string)
		detail, err := getResource(f.app, name, id)
		if err != nil || detail["id"] != id || len(detail) != len(config.fields) {
			t.Fatalf("%s detail = %v, %v", name, detail, err)
		}
	}
}

// Hono: courseCreditOpsQueryService › ops resource validation rejects unsupported resources, filters, and missing records
func TestOpsResourceValidation(t *testing.T) {
	f := opsQuerySetup(t)
	_, err := listResource(f.app, "orders", map[string]string{"status": "unknown"})
	failsWith(t, err, "OPS_FILTER_STATUS_INVALID")
	_, err = getResource(f.app, "orders", "")
	failsWith(t, err, "OPS_RESOURCE_ID_REQUIRED")
	_, err = getResource(f.app, "orders", "missing")
	failsWith(t, err, "OPS_RESOURCE_NOT_FOUND")
	// A record outside the resource's base filter is not found either.
	_, err = getResource(f.app, "enrollments", f.source)
	failsWith(t, err, "OPS_RESOURCE_NOT_FOUND")
}

// Hono: courseCreditOpsQueryService › credit account list groups batch buckets and paginates by student
func TestOpsAccountListGroupsBatches(t *testing.T) {
	f := opsQuerySetup(t)
	a, b := f.learner(t, "甲"), f.learner(t, "乙")
	f.batch(t, b, map[string]any{"status": "pending", "availableQuantity": 2})
	f.batch(t, a, map[string]any{"availableQuantity": 3, "frozenQuantity": 1})
	f.batch(t, a, map[string]any{"consumedQuantity": 4, "expiredQuantity": 1})
	ordered := []string{a, b}
	slices.Sort(ordered)
	first, err := listAccounts(f.app, map[string]string{"page": "1", "perPage": "1"})
	if err != nil || first.(map[string]any)["totalItems"] != 2 || first.(map[string]any)["totalPages"] != 2 {
		t.Fatalf("first = %v, %v", first, err)
	}
	accounts, _ := listAccounts(f.app, map[string]string{"studentIds": a + "," + b})
	items := pageItems(t, accounts)
	if !reflect.DeepEqual(itemValues(items, "studentId"), []any{ordered[0], ordered[1]}) {
		t.Fatalf("order = %v", itemValues(items, "studentId"))
	}
	for _, item := range items {
		if item["studentId"] == a && (item["batchCount"] != 2 || item["availableQuantity"] != 3.0 || item["frozenQuantity"] != 1.0 ||
			item["consumedQuantity"] != 4.0 || item["expiredQuantity"] != 1.0) {
			t.Fatalf("a = %v", item)
		}
		if item["studentId"] == b && item["unactivatedQuantity"] != 2.0 {
			t.Fatalf("b = %v", item)
		}
	}
}

// Hono: courseCreditOpsQueryService › credit account detail exposes auditable cost fields without raw snapshots
func TestOpsAccountDetail(t *testing.T) {
	f := opsQuerySetup(t)
	batch := f.batch(t, f.studentID, map[string]any{"listUnitValue": 300, "paidUnitCost": 280, "currency": "CNY",
		"grantSnapshot": map[string]any{"private": true}})
	put(t, f.app, "credit_events", map[string]any{"studentId": f.studentID, "creditTypeId": f.creditTypeID, "operationId": f.source,
		"batchId": batch, "eventType": "GRANT", "quantityDelta": 10, "bucketFrom": "", "bucketTo": "availableQuantity",
		"businessTime": "2026-07-01 00:00:00.000Z", "reason": "admin enrollment"})
	result, err := getAccount(f.app, f.studentID)
	if err != nil {
		t.Fatal(err)
	}
	account := result.(map[string]any)
	projected := account["batches"].([]any)[0].(map[string]any)
	if account["studentId"] != f.studentID || projected["creditTypeId"] != f.creditTypeID || projected["sourceOperationId"] != f.source ||
		projected["paidUnitCost"] != 280.0 {
		t.Fatalf("account = %v", account)
	}
	if _, ok := projected["grantSnapshot"]; ok {
		t.Fatal("raw grant snapshot leaked")
	}
	event := account["events"].([]any)[0].(map[string]any)
	if event["eventType"] != "GRANT" || event["quantityDelta"] != 10.0 {
		t.Fatalf("event = %v", event)
	}
	other, _ := getAccount(f.app, f.learner(t, "乙"))
	if other.(map[string]any)["batchCount"] != 0 {
		t.Fatalf("other = %v", other)
	}
}

// Hono: courseCreditOpsQueryService › settlement exception workspace aggregates every operational failure class
func TestOpsSettlementExceptions(t *testing.T) {
	s := settlementSetup(t, func(f settlementFixture) map[string]any {
		return map[string]any{"status": "correction_pending", "correctionBaseStatus": "completed", "settlementOperationId": f.source}
	})
	patch(t, s.app, "session_students", s.students["present"], map[string]any{"creditStatus": "credit_insufficient", "eligibilityReason": "余额不足"})
	patch(t, s.app, "session_credit_allocations", s.allocations["leave"], map[string]any{"status": "expired"})
	failed := put(t, s.app, "credit_operations", map[string]any{"type": "settle_session", "status": "failed", "operationNo": "failed",
		"idempotencyKey": "failed", "studentId": s.studentID, "requestSnapshot": map[string]any{"sessionId": "lesson-3"},
		"resultSnapshot": map[string]any{"errorCode": "DB_DOWN", "message": "写入失败"}}).Id
	run := put(t, s.app, "reconciliation_runs", map[string]any{"scope": "full", "status": "failed", "startedAt": "2026-08-18 00:00:00.000Z"}).Id
	put(t, s.app, "reconciliation_exceptions", map[string]any{"runId": run, "batchId": s.batches["present"], "code": "DUPLICATE_EVENT",
		"status": "open", "detectedAt": "2099-08-18 05:00:00.000Z"})
	put(t, s.app, "reconciliation_exceptions", map[string]any{"runId": run, "batchId": s.batches["present"], "code": "BALANCE_MISMATCH",
		"status": "open", "detectedAt": "2099-08-18 06:00:00.000Z"})

	result, err := listSettlementExceptions(s.app, map[string]string{"page": "1", "perPage": "10"})
	if err != nil {
		t.Fatal(err)
	}
	items := pageItems(t, result)
	kinds := itemValues(items, "kind")
	if len(items) != 5 || kinds[0] != "duplicate" {
		t.Fatalf("kinds = %v", kinds)
	}
	for _, kind := range []string{"correction_pending", "failed_operation", "expired_release", "credit_insufficient"} {
		if !slices.Contains(kinds, any(kind)) {
			t.Fatalf("kinds = %v", kinds)
		}
	}
	for i := 1; i < len(items); i++ {
		if items[i-1]["detectedAt"].(string) < items[i]["detectedAt"].(string) {
			t.Fatalf("not newest first: %v", itemValues(items, "detectedAt"))
		}
	}
	for _, item := range items {
		if item["kind"] == "expired_release" && item["sessionId"] != s.sessionID {
			t.Fatalf("expired = %v", item)
		}
	}
	filtered, _ := listSettlementExceptions(s.app, map[string]string{"kind": "failed_operation", "studentId": s.studentID})
	if rows := pageItems(t, filtered); len(rows) != 1 || rows[0]["id"] != failed || rows[0]["reason"] != "写入失败" || rows[0]["sessionId"] != "lesson-3" {
		t.Fatalf("filtered = %v", rows)
	}
}

// Hono: courseCreditOpsQueryService › ops projection helpers normalize relations, empty accounts, and empty pages
func TestOpsProjectionHelpers(t *testing.T) {
	if !slices.Contains(resources["reconciliationRuns"].statuses, "pending") {
		t.Fatal("reconciliation run statuses")
	}
	if got := project(map[string]any{"id": "one", "tags": []any{"a", map[string]any{"id": "b"}}}, []string{"id", "tags", "missing"}, nil); !reflect.DeepEqual(got,
		map[string]any{"id": "one", "tags": []any{"a", "b"}, "missing": nil}) {
		t.Fatalf("project = %v", got)
	}
	if got := project(map[string]any{"metadata": map[string]any{"safe": true}}, []string{"metadata"}, []string{"metadata"}); !reflect.DeepEqual(got,
		map[string]any{"metadata": map[string]any{"safe": true}}) {
		t.Fatalf("raw = %v", got)
	}
	if relationOrValue(map[string]any{"id": "record"}) != "record" || relationOrValue(nil) != nil {
		t.Fatal("relationOrValue")
	}
	if got := accountOf(map[string]*account{}, "student"); !reflect.DeepEqual(got, map[string]any{"studentId": "student", "batchCount": 0,
		"availableQuantity": 0.0, "frozenQuantity": 0.0, "consumedQuantity": 0.0, "expiredQuantity": 0.0, "unactivatedQuantity": 0.0}) {
		t.Fatalf("empty account = %v", got)
	}
	if got := arrayPage([]any{}, 1, 20); !reflect.DeepEqual(got, map[string]any{"page": 1, "perPage": 20, "totalItems": 0, "totalPages": 0, "items": []any{}}) {
		t.Fatalf("empty page = %v", got)
	}
	if order, accounts := groupAccounts(nil); len(order) != 0 || len(accounts) != 0 {
		t.Fatal("empty group")
	}
	if !reflect.DeepEqual(uniqueRelations([]map[string]any{{"studentId": "one"}, {"studentId": map[string]any{"id": "one"}}}, "studentId"), []string{"one"}) {
		t.Fatal("uniqueRelations")
	}
}

// Hono: courseCreditOpsQueryService › account list narrows by student ids
// (renewal candidates moved to /ops/course-credits/renewals).
func TestOpsAccountStudentIDs(t *testing.T) {
	f := opsQuerySetup(t)
	students := map[string]string{}
	for name, changes := range map[string]map[string]any{
		"renew":  {"availableQuantity": 1, "consumedQuantity": 9},
		"fresh":  {"availableQuantity": 0},
		"plenty": {"availableQuantity": 8, "consumedQuantity": 2},
	} {
		students[name] = f.learner(t, name)
		f.batch(t, students[name], changes)
	}
	all, err := listAccounts(f.app, map[string]string{"perPage": "100"})
	if err != nil || len(pageItems(t, all)) != 3 {
		t.Fatalf("all = %v, %v", all, err)
	}
	narrowed, _ := listAccounts(f.app, map[string]string{"studentIds": students["renew"] + ", " + students["plenty"] + "," + students["renew"]})
	if len(pageItems(t, narrowed)) != 2 {
		t.Fatalf("narrowed = %v", narrowed)
	}
	if !reflect.DeepEqual(idList("a, b ,,a"), []string{"a", "b"}) {
		t.Fatalf("idList = %v", idList("a, b ,,a"))
	}
}

// Hono: courseCreditOpsQueryService › session lists accept a start-time range for today and assigned lessons
func TestOpsSessionStartRange(t *testing.T) {
	f := opsQuerySetup(t)
	session := func(code, start string) string {
		return put(t, f.app, "sessions", map[string]any{"code": code, "title": code, "status": "scheduled", "startAt": start,
			"endAt": start, "requiredCreditTypeId": f.creditTypeID, "requiredQuantity": 1, "originType": "class",
			"attendanceRuleSnapshot": map[string]any{"version": 1}, "settlementRuleSnapshot": map[string]any{"version": 1},
			"teacherRuleSnapshot": map[string]any{"version": 1}}).Id
	}
	today := session("today", "2026-10-18 01:00:00.000Z")
	session("yesterday", "2026-10-17 15:59:00.000Z")
	session("tomorrow", "2026-10-18 16:00:00.000Z")
	result, err := listResource(f.app, "sessions", map[string]string{"from": "2026-10-18T00:00:00+08:00", "to": "2026-10-19T00:00:00+08:00", "status": "scheduled"})
	if err != nil || len(result.Items) != 1 || result.Items[0]["id"] != today {
		t.Fatalf("result = %+v, %v", result, err)
	}
	if _, err := listResource(f.app, "orders", map[string]string{"from": "ignored"}); err != nil {
		t.Fatal(err)
	}
	_, err = listResource(f.app, "sessions", map[string]string{"from": "not-a-date"})
	failsWith(t, err, "OPS_FILTER_DATE_INVALID")
	assigned, err := listAssignedLessons(f.app, map[string]any{"isAdmin": true}, map[string]string{"from": "2026-10-18T00:00:00Z", "to": "2026-10-18T02:00:00Z"})
	if err != nil || len(assigned.Items) != 1 || assigned.Items[0]["id"] != today {
		t.Fatalf("assigned = %+v, %v", assigned, err)
	}
}

// Hono: courseCreditOpsQueryService › student overview joins balance, the next upcoming lesson and the latest follow-up
func TestOpsStudentOverview(t *testing.T) {
	f := opsQuerySetup(t)
	now := time.Date(2026, 10, 18, 0, 0, 0, 0, time.UTC)
	one, two := f.learner(t, "一"), f.learner(t, "二")
	f.batch(t, one, map[string]any{"availableQuantity": 2, "consumedQuantity": 8})
	f.batch(t, one, map[string]any{"availableQuantity": 1, "frozenQuantity": 1})
	lesson := func(code, title, start string) string {
		return put(t, f.app, "sessions", map[string]any{"code": code, "title": title, "status": "scheduled", "startAt": start,
			"endAt": start, "requiredCreditTypeId": f.creditTypeID, "requiredQuantity": 1, "originType": "class",
			"attendanceRuleSnapshot": map[string]any{"version": 1}, "settlementRuleSnapshot": map[string]any{"version": 1},
			"teacherRuleSnapshot": map[string]any{"version": 1}}).Id
	}
	early := lesson("early", "视唱练耳", "2026-10-19 01:00:00.000Z")
	late := lesson("late", "声乐一对一", "2026-10-20 01:00:00.000Z")
	past := lesson("past", "已上", "2026-10-17 01:00:00.000Z")
	for _, id := range []string{late, early, past} {
		put(t, f.app, "session_students", map[string]any{"sessionId": id, "studentId": one, "attendanceStatus": "scheduled", "creditStatus": "reserved", "version": 1})
	}
	followUp, err := recordFollowUp(f.app, two, Body{Values: map[string]any{"status": "declined", "note": "暂不续", "snoozeUntil": "2026-11-01T00:00:00.000Z"}},
		Actor{ID: f.operatorID(t), Role: "admin"}, now)
	if err != nil {
		t.Fatal(err)
	}
	result, err := studentOverview(f.app, map[string]string{"studentIds": one + "," + two}, now)
	if err != nil {
		t.Fatal(err)
	}
	items := pageItems(t, result)
	if items[0]["availableQuantity"] != 3.0 || items[0]["frozenQuantity"] != 1.0 || items[0]["followUp"] != nil {
		t.Fatalf("one = %v", items[0])
	}
	next := items[0]["nextLesson"].(map[string]any)
	if next["id"] != early || next["title"] != "视唱练耳" || next["status"] != "scheduled" {
		t.Fatalf("next = %v", next)
	}
	stored := items[1]["followUp"].(map[string]any)
	if items[1]["nextLesson"] != nil || stored["id"] != followUp["id"] || stored["studentId"] != two || stored["status"] != "declined" ||
		stored["note"] != "暂不续" || stored["snoozeUntil"] != "2026-11-01T00:00:00.000Z" || stored["actorId"] != f.operatorID(t) {
		t.Fatalf("two = %v", items[1])
	}
	_, err = studentOverview(f.app, map[string]string{"studentIds": ""}, now)
	failsWith(t, err, "STUDENT_IDS_INVALID")
	if rows, err := listFollowUps(f.app, nil); err != nil || len(rows) != 0 {
		t.Fatalf("follow ups = %v, %v", rows, err)
	}
}

// assignedSetup links the ledger fixture's teacher to class c1 and session s1, each with one student.
func assignedSetup(t *testing.T) (opsQueryFixture, string) {
	t.Helper()
	f := opsQuerySetup(t)
	teacher := f.operatorID(t)
	put(t, f.app, "class_teachers", map[string]any{"classId": f.classID, "teacherId": teacher, "role": "lead", "status": "active",
		"effectiveFrom": "2026-01-01 00:00:00.000Z"})
	put(t, f.app, "class_students", map[string]any{"classId": f.classID, "studentId": f.studentID, "status": "active",
		"effectiveFrom": "2026-01-01 00:00:00.000Z"})
	put(t, f.app, "session_students", map[string]any{"sessionId": f.sessionID, "studentId": f.studentID,
		"attendanceStatus": "scheduled", "creditStatus": "reserved", "version": 1})
	// Rows the teacher does not teach stay out of their views.
	other := f.learner(t, "旁人")
	class := put(t, f.app, "classes", map[string]any{"code": "c2", "name": "别的班", "courseSpecId": f.specID,
		"defaultCreditTypeId": f.creditTypeID, "status": "active", "capacity": 8}).Id
	put(t, f.app, "class_students", map[string]any{"classId": class, "studentId": other, "status": "active", "effectiveFrom": "2026-01-01 00:00:00.000Z"})
	return f, teacher
}

// Hono: courseCreditOpsQueryService › assigned student and lesson queries scope teacher data to explicit teaching relations
func TestOpsAssignedQueriesScopeTeacher(t *testing.T) {
	f, teacherID := assignedSetup(t)
	teacher := map[string]any{"id": teacherID, "role": "teacher", "courseCreditCapabilities": []any{Teacher}}
	students, err := listAssignedStudents(f.app, teacher, map[string]string{"status": "active"})
	if err != nil || len(students.Items) != 1 {
		t.Fatalf("students = %+v, %v", students, err)
	}
	student := students.Items[0]
	if student["id"] != f.studentID || student["realName"] != "学员甲" ||
		student["classAssignments"].([]map[string]any)[0]["classId"] != f.classID ||
		student["lessonAssignments"].([]map[string]any)[0]["sessionId"] != f.sessionID {
		t.Fatalf("student = %v", student)
	}
	classes, err := listAssignedClasses(f.app, teacher, map[string]string{"status": "active"})
	if err != nil || len(classes.Items) != 1 || classes.Items[0]["id"] != f.classID ||
		classes.Items[0]["students"].([]map[string]any)[0]["studentId"] != f.studentID ||
		classes.Items[0]["teachers"].([]map[string]any)[0]["teacherId"] != teacherID {
		t.Fatalf("classes = %+v, %v", classes, err)
	}
	lessons, err := listAssignedLessons(f.app, teacher, map[string]string{"status": "scheduled"})
	if err != nil || len(lessons.Items) != 1 || lessons.Items[0]["id"] != f.sessionID ||
		lessons.Items[0]["students"].([]map[string]any)[0]["studentId"] != f.studentID ||
		lessons.Items[0]["teachers"].([]map[string]any)[0]["teacherId"] != teacherID {
		t.Fatalf("lessons = %+v, %v", lessons, err)
	}
}

// Hono: courseCreditOpsQueryService › academic assigned views use global scope while unassigned teachers receive empty pages
func TestOpsAssignedQueriesGlobalAndEmpty(t *testing.T) {
	f, _ := assignedSetup(t)
	stranger := map[string]any{"id": "stranger", "role": "teacher", "courseCreditCapabilities": []any{Teacher}}
	empty := emptyPage(1, 20)
	for name, run := range map[string]func(map[string]any, map[string]string) (page, error){
		"students": func(u map[string]any, q map[string]string) (page, error) { return listAssignedStudents(f.app, u, q) },
		"classes":  func(u map[string]any, q map[string]string) (page, error) { return listAssignedClasses(f.app, u, q) },
		"lessons":  func(u map[string]any, q map[string]string) (page, error) { return listAssignedLessons(f.app, u, q) },
	} {
		if got, err := run(stranger, map[string]string{}); err != nil || !reflect.DeepEqual(got, empty) {
			t.Fatalf("%s = %+v, %v", name, got, err)
		}
	}
	academic := map[string]any{"id": "academic", "role": "teacher", "courseCreditCapabilities": []any{Academic}}
	if students, err := listAssignedStudents(f.app, academic, map[string]string{"keyword": "学员甲"}); err != nil || len(students.Items) != 1 || students.Items[0]["id"] != f.studentID {
		t.Fatalf("students = %+v, %v", students, err)
	}
	if classes, err := listAssignedClasses(f.app, academic, map[string]string{"classId": f.classID}); err != nil || len(classes.Items) != 1 {
		t.Fatalf("classes = %+v, %v", classes, err)
	}
	lessons, err := listAssignedLessons(f.app, academic, map[string]string{"sessionId": f.sessionID})
	if err != nil || len(lessons.Items) != 1 || len(lessons.Items[0]["students"].([]map[string]any)) != 1 ||
		len(lessons.Items[0]["teachers"].([]map[string]any)) != 1 {
		t.Fatalf("lessons = %+v, %v", lessons, err)
	}
	_, err = listAssignedStudents(f.app, map[string]any{"id": "none", "role": "teacher", "courseCreditCapabilities": []any{}}, map[string]string{})
	failsWith(t, err, "COURSE_CREDIT_CAPABILITY_REQUIRED")
}
