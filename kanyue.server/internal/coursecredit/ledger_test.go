package coursecredit

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/testkit"
)

type ledgerFixture struct {
	app                                    core.App
	handler                                http.Handler
	ops, plain, student, teacher           map[string]string
	studentID, creditTypeID, specID        string
	packageID, priceID, classID, sessionID string
}

func ledgerSetup(t *testing.T, grants bool) ledgerFixture {
	t.Helper()
	app := testkit.NewApp(t)
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	teacher := testkit.Create(t, app, "teachers", map[string]any{"email": "ops@example.com", "password": "admin-pass-1"})
	student := testkit.Create(t, app, "students", map[string]any{"cellphone": "13800000000", "realName": "学员甲"})
	sign := func(id, role string, extra auth.Claims) map[string]string {
		value, err := signer.Sign(id, "S1", role, false, extra, auth.OpsTokenTTL)
		if err != nil {
			t.Fatal(err)
		}
		return testkit.Bearer(value)
	}
	ops := func(capabilities ...string) map[string]string {
		return sign(teacher.Id, "teacher", auth.Claims{"scope": auth.OpsScope, "courseCreditCapabilities": capabilities})
	}
	spec := testkit.Create(t, app, "course_specs", map[string]any{"code": "vocal", "name": "声乐课程点", "deliveryMode": "group", "durationMinutes": 60, "status": "active"})
	credit := testkit.Create(t, app, "credit_types", map[string]any{"code": "vocal", "name": "声乐课时", "kind": "course", "courseSpecId": spec.Id, "consumable": true, "referenceUnitValue": 100, "status": "active"})
	pkg := testkit.Create(t, app, "packages", map[string]any{"code": "p10", "name": "十节", "saleChannel": "all", "activationMode": "GRANT_TIME", "expiryPolicy": "FIXED_DURATION", "validityDurationDays": 90, "status": "active"})
	testkit.Create(t, app, "package_grant_lines", map[string]any{"packageId": pkg.Id, "creditTypeId": credit.Id, "quantity": 10})
	price := testkit.Create(t, app, "price_versions", map[string]any{"packageId": pkg.Id, "currency": "CNY", "listAmount": 1000, "saleAmount": 800, "validFrom": "2020-01-01 00:00:00.000Z", "version": 1, "status": "active"})
	class := testkit.Create(t, app, "classes", map[string]any{"code": "c1", "name": "周六班", "courseSpecId": spec.Id, "defaultCreditTypeId": credit.Id, "status": "active", "capacity": 8})
	start := time.Now().UTC().Add(48 * time.Hour)
	session := testkit.Create(t, app, "sessions", map[string]any{"code": "s1", "title": "第一课", "status": "scheduled", "startAt": start, "endAt": start.Add(time.Hour), "requiredCreditTypeId": credit.Id, "requiredQuantity": 1, "rosterVersion": 1, "version": 1,
		"originType": "class", "attendanceRuleSnapshot": map[string]any{"mode": "manual"}, "settlementRuleSnapshot": map[string]any{"mode": "consume"}, "teacherRuleSnapshot": map[string]any{"mode": "none"}})
	testkit.Create(t, app, "session_classes", map[string]any{"sessionId": session.Id, "classId": class.Id})
	testkit.Create(t, app, "session_teachers", map[string]any{"sessionId": session.Id, "teacherId": teacher.Id, "role": "lead", "assignmentSource": "class_default", "actualStatus": "planned", "creditStatus": "pending"})

	handler := testkit.Serve(t, app, LedgerModule{Signer: signer, GrantsEnabled: grants}.Register)
	return ledgerFixture{
		app: app, handler: handler,
		ops: ops(Finance, Academic, Settlement, Audit), plain: ops(Teacher),
		student:   sign(student.Id, "student", nil),
		teacher:   sign(teacher.Id, "teacher", nil),
		studentID: student.Id, creditTypeID: credit.Id, specID: spec.Id,
		packageID: pkg.Id, priceID: price.Id, classID: class.Id, sessionID: session.Id,
	}
}

func (f ledgerFixture) call(t *testing.T, method, url string, body any, key string) testkit.Response {
	t.Helper()
	headers := f.ops
	if key != "" {
		headers = with(f.ops, "Idempotency-Key", key)
	}
	return testkit.Call(t, f.handler, method, url, body, headers)
}

func ok(t *testing.T, result testkit.Response, what string) map[string]any {
	t.Helper()
	if result.Code() != 10000 {
		t.Fatalf("%s = %v", what, result.Body)
	}
	return result.Data()
}

func failed(t *testing.T, result testkit.Response, status int, code, what string) {
	t.Helper()
	if result.Code() != status || result.Body["errorCode"] != code {
		t.Fatalf("%s = %v", what, result.Body)
	}
}

func items(data map[string]any) []map[string]any {
	raw, _ := data["items"].([]any)
	result := make([]map[string]any, len(raw))
	for i, item := range raw {
		result[i], _ = item.(map[string]any)
	}
	return result
}

func firstBatch(t *testing.T, app core.App, studentID string) *core.Record {
	t.Helper()
	batches, err := app.FindRecordsByFilter("credit_batches", `studentId="`+studentID+`"`, "created", 0, 0)
	if err != nil || len(batches) == 0 {
		t.Fatalf("batches = %v, %v", batches, err)
	}
	return batches[0]
}

func TestEnrollmentGrantsPackageAndReplays(t *testing.T) {
	f := ledgerSetup(t, true)
	body := map[string]any{"studentId": f.studentID, "packageId": f.packageID, "priceVersionId": f.priceID, "reason": "到店报名"}

	failed(t, f.call(t, http.MethodPost, "/ops/course-operations/enrollments", body, ""), 400, "IDEMPOTENCY_KEY_REQUIRED", "missing key")
	plain := testkit.Call(t, f.handler, http.MethodPost, "/ops/course-operations/enrollments", body, with(f.plain, "Idempotency-Key", "e1"))
	failed(t, plain, 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "teacher only")

	created := ok(t, f.call(t, http.MethodPost, "/ops/course-operations/enrollments", body, "e1"), "enroll")
	if created["status"] != "awaiting_class_assignment" || len(created["grants"].([]any)) != 1 || created["operationId"] == nil || created["traceId"] == "" {
		t.Fatalf("enrollment = %v", created)
	}
	replayed := ok(t, f.call(t, http.MethodPost, "/ops/course-operations/enrollments", body, "e1"), "replay")
	if replayed["replayed"] != true || replayed["orderId"] != created["orderId"] {
		t.Fatalf("replay = %v", replayed)
	}
	changed := map[string]any{"studentId": f.studentID, "packageId": f.packageID, "priceVersionId": f.priceID, "paidAmount": 1}
	failed(t, f.call(t, http.MethodPost, "/ops/course-operations/enrollments", changed, "e1"), 400, "IDEMPOTENCY_CONFLICT", "conflict")

	batch := firstBatch(t, f.app, f.studentID)
	if batch.GetInt("availableQuantity") != 10 || batch.GetString("status") != "active" || batch.GetFloat("paidUnitCost") != 80 || batch.GetFloat("listUnitValue") != 100 {
		t.Fatalf("batch = %v", batch.FieldsData())
	}
	order := ok(t, f.call(t, http.MethodGet, "/ops/course-credits/orders/"+created["orderId"].(string), nil, ""), "order")
	if order["status"] != "granted" || order["paidAmount"] != float64(800) || order["channel"] != "admin" {
		t.Fatalf("order = %v", order)
	}
	enrollments := ok(t, f.call(t, http.MethodGet, "/ops/course-credits/enrollments?studentId="+f.studentID, nil, ""), "enrollments")
	if enrollments["totalItems"] != float64(1) || items(enrollments)[0]["sourceId"] != created["orderId"] {
		t.Fatalf("enrollments = %v", enrollments)
	}
	audits := ok(t, f.call(t, http.MethodGet, "/ops/course-credits/audit-logs?resourceType=enrollment", nil, ""), "audit logs")
	if audits["totalItems"] != float64(1) || items(audits)[0]["action"] != "course_operations.enrollment.create" {
		t.Fatalf("audit logs = %v", audits)
	}

	accounts := ok(t, f.call(t, http.MethodGet, "/ops/course-credits/accounts?studentIds="+f.studentID, nil, ""), "accounts")
	if account := items(accounts)[0]; accounts["totalItems"] != float64(1) || account["availableQuantity"] != float64(10) || account["batchCount"] != float64(1) {
		t.Fatalf("accounts = %v", accounts)
	}
	detail := ok(t, f.call(t, http.MethodGet, "/ops/course-credits/accounts/"+f.studentID, nil, ""), "account")
	events, _ := detail["events"].([]any)
	event, _ := events[0].(map[string]any)
	source, _ := event["source"].(map[string]any)
	creditType, _ := event["creditType"].(map[string]any)
	if len(events) != 1 || event["eventType"] != "GRANT" || source["type"] != "enrollment" || creditType["courseSpec"] == nil {
		t.Fatalf("account detail = %v", detail)
	}
	overview := ok(t, f.call(t, http.MethodGet, "/ops/course-credits/student-overview?studentIds="+f.studentID+",missing", nil, ""), "overview")
	rows := items(overview)
	if len(rows) != 2 || rows[0]["availableQuantity"] != float64(10) || rows[0]["nextLesson"] != nil || rows[1]["batchCount"] != float64(0) {
		t.Fatalf("overview = %v", overview)
	}
	failed(t, f.call(t, http.MethodGet, "/ops/course-credits/student-overview", nil, ""), 400, "STUDENT_IDS_INVALID", "no ids")
}

func TestEnrollmentWithClassSyncsFutureLessons(t *testing.T) {
	f := ledgerSetup(t, true)
	body := map[string]any{"studentId": f.studentID, "packageId": f.packageID, "priceVersionId": f.priceID, "classId": f.classID}
	finance := testkit.Call(t, f.handler, http.MethodPost, "/ops/course-operations/enrollments", body,
		with(f.plain, "Idempotency-Key", "c1"))
	failed(t, finance, 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "class needs capabilities")

	created := ok(t, f.call(t, http.MethodPost, "/ops/course-operations/enrollments", body, "c1"), "enroll")
	sync, _ := created["sync"].(map[string]any)
	if created["status"] != "synchronizing_future_lessons" || sync["futureLessonCount"] != float64(1) || created["classId"] != f.classID {
		t.Fatalf("enrollment = %v", created)
	}
	failed(t, f.call(t, http.MethodPost, "/ops/course-operations/enrollments", body, "c2"), 400, "ENROLLMENT_CLASS_MEMBERSHIP_EXISTS", "second join")

	orderID := created["orderId"].(string)
	preview := ok(t, f.call(t, http.MethodGet, "/ops/course-operations/enrollments/"+orderID+"/sync-preview", nil, ""), "preview")
	lessons, _ := preview["lessons"].([]any)
	if len(lessons) != 1 || preview["previewHash"] == "" {
		t.Fatalf("preview = %v", preview)
	}
	failed(t, f.call(t, http.MethodPost, "/ops/course-operations/enrollments/"+orderID+"/sync", map[string]any{"previewHash": "stale"}, "s1"),
		400, "SYNC_PREVIEW_STALE", "stale preview")
	confirmed := ok(t, f.call(t, http.MethodPost, "/ops/course-operations/enrollments/"+orderID+"/sync",
		map[string]any{"previewHash": preview["previewHash"]}, "s1"), "confirm")
	if ids, _ := confirmed["synchronizedLessonIds"].([]any); len(ids) != 1 || ids[0] != f.sessionID {
		t.Fatalf("confirm = %v", confirmed)
	}
	session, err := f.app.FindRecordById("sessions", f.sessionID)
	if err != nil || session.GetInt("rosterVersion") != 2 || session.GetInt("version") != 2 {
		t.Fatalf("session = %v, %v", session, err)
	}
	again := ok(t, f.call(t, http.MethodGet, "/ops/course-operations/enrollments/"+orderID+"/sync-preview", nil, ""), "preview again")
	if lessons, _ := again["lessons"].([]any); len(lessons) != 0 {
		t.Fatalf("lessons after sync = %v", again)
	}
}

func TestGrantOrderCreditsHonoursFeatureGate(t *testing.T) {
	disabled := ledgerSetup(t, false)
	failed(t, disabled.call(t, http.MethodPost, "/ops/course-credits/orders/x/grant", nil, "g1"), 400, "COURSE_CREDIT_FEATURE_DISABLED", "disabled")

	f := ledgerSetup(t, true)
	order := testkit.Create(t, f.app, "orders", map[string]any{
		"orderNo": "O-1", "studentId": f.studentID, "payerId": f.studentID, "type": "package_purchase", "channel": "admin",
		"status": "paid", "currency": "CNY", "listAmount": 500, "paidAmount": 500, "priceVersionId": f.priceID, "version": 1,
		"idempotencyKey": "order-1", "productSnapshot": map[string]any{"packageId": f.packageID},
		"grantSnapshot": map[string]any{"activationMode": "FIRST_RESERVATION", "activationDeadlineDays": 30, "expiryPolicy": "NO_EXPIRY",
			"lines": []any{map[string]any{"creditTypeId": f.creditTypeID, "quantity": 5, "listUnitValue": 100, "paidUnitCost": 100}}},
	})
	failed(t, f.call(t, http.MethodPost, "/ops/course-credits/orders/"+order.Id+"/grant", nil, ""), 400, "IDEMPOTENCY_KEY_REQUIRED", "no key")
	granted := ok(t, f.call(t, http.MethodPost, "/ops/course-credits/orders/"+order.Id+"/grant", nil, "g1"), "grant")
	batches, _ := granted["batches"].([]any)
	summary, _ := batches[0].(map[string]any)
	if len(batches) != 1 || summary["activationMode"] != "FIRST_RESERVATION" || summary["activationDeadline"] == nil || summary["effectiveExpiresAt"] != nil {
		t.Fatalf("grant = %v", granted)
	}
	refreshed, _ := f.app.FindRecordById("orders", order.Id)
	if refreshed.GetString("status") != "granted" || refreshed.GetInt("version") != 2 {
		t.Fatalf("order = %v", refreshed.FieldsData())
	}
	failed(t, f.call(t, http.MethodPost, "/ops/course-credits/orders/"+order.Id+"/grant", nil, "g2"), 400, "ORDER_NOT_PAID", "second grant")
	if batch := firstBatch(t, f.app, f.studentID); batch.GetString("status") != "unactivated" || batch.GetInt("availableQuantity") != 5 {
		t.Fatalf("batch = %v", batch.FieldsData())
	}
}

func TestExpiryRestoreExtendAndReconciliation(t *testing.T) {
	f := ledgerSetup(t, true)
	ok(t, f.call(t, http.MethodPost, "/ops/course-operations/enrollments",
		map[string]any{"studentId": f.studentID, "packageId": f.packageID, "priceVersionId": f.priceID}, "e1"), "enroll")
	batch := firstBatch(t, f.app, f.studentID)
	batch.Set("effectiveExpiresAt", time.Now().UTC().Add(-time.Hour))
	if err := f.app.Save(batch); err != nil {
		t.Fatal(err)
	}

	failed(t, f.call(t, http.MethodPost, "/ops/course-credits/workers/expiry/run", map[string]any{"limit": 0}, ""), 400, "EXPIRY_LIMIT_INVALID", "limit")
	expired := ok(t, f.call(t, http.MethodPost, "/ops/course-credits/workers/expiry/run", nil, ""), "expiry")
	if expired["expiredBatches"] != float64(1) || expired["expiredQuantity"] != float64(10) {
		t.Fatalf("expiry = %v", expired)
	}
	if again := ok(t, f.call(t, http.MethodPost, "/ops/course-credits/workers/expiry/run", nil, ""), "rerun"); again["scanned"] != float64(0) {
		t.Fatalf("an expired batch is not due again: %v", again)
	}
	batch, _ = f.app.FindRecordById("credit_batches", batch.Id)
	if batch.GetString("status") != "expired" || batch.GetInt("expiredQuantity") != 10 {
		t.Fatalf("expired batch = %v", batch.FieldsData())
	}

	base := "/ops/course-credits/batches/" + batch.Id
	restored := ok(t, f.call(t, http.MethodPost, base+"/restore-expired",
		map[string]any{"quantity": 2, "validityDurationDays": 10, "reason": "学员申诉"}, "r1"), "restore")
	if restored["operationId"] == nil {
		t.Fatalf("restore = %v", restored)
	}
	failed(t, f.call(t, http.MethodPost, base+"/extend",
		map[string]any{"newExpiresAt": time.Now().UTC().Add(240 * time.Hour).Format(time.RFC3339), "reason": "延期"}, "x1"),
		400, "NO_REMAINING_CREDIT", "extend fully expired batch")

	run := ok(t, f.call(t, http.MethodPost, "/ops/course-credits/reconciliation/runs", map[string]any{"scope": "full"}, ""), "reconcile")
	if run["status"] != "passed" || run["batchCount"] != float64(2) || run["differenceCount"] != float64(0) {
		t.Fatalf("reconciliation = %v", run)
	}
	failed(t, f.call(t, http.MethodPost, "/ops/course-credits/reconciliation/runs", map[string]any{"scope": "incremental"}, ""),
		400, "RECONCILIATION_SINCE_REQUIRED", "since")

	batch, _ = f.app.FindRecordById("credit_batches", batch.Id)
	batch.Set("availableQuantity", batch.GetInt("availableQuantity")+1)
	batch.Set("expiredQuantity", batch.GetInt("expiredQuantity")-1)
	if err := f.app.Save(batch); err != nil {
		t.Fatal(err)
	}
	broken := ok(t, f.call(t, http.MethodPost, "/ops/course-credits/reconciliation/runs",
		map[string]any{"scope": "incremental", "since": time.Now().UTC().Add(-time.Hour).Format(time.RFC3339)}, ""), "broken")
	if broken["status"] != "failed" || broken["differenceCount"] != float64(2) {
		t.Fatalf("broken reconciliation = %v", broken)
	}
	exceptions := ok(t, f.call(t, http.MethodGet, "/ops/course-credits/reconciliation/exceptions?status=open", nil, ""), "exceptions")
	if exceptions["totalItems"] != float64(2) || items(exceptions)[0]["code"] != "BUCKET_MISMATCH" {
		t.Fatalf("exceptions = %v", exceptions)
	}
	runs := ok(t, f.call(t, http.MethodGet, "/ops/course-credits/reconciliation/runs", nil, ""), "runs")
	if runs["totalItems"] != float64(2) || items(runs)[0]["status"] == nil {
		t.Fatalf("runs = %v", runs)
	}
}

func TestSettlementExceptionsCombineSources(t *testing.T) {
	f := ledgerSetup(t, true)
	roster := testkit.Create(t, f.app, "session_students", map[string]any{
		"sessionId": f.sessionID, "studentId": f.studentID, "attendanceStatus": "scheduled",
		"creditStatus": "credit_insufficient", "eligibilityReason": "NO_CREDIT", "version": 1,
	})
	testkit.Create(t, f.app, "credit_operations", map[string]any{
		"operationNo": "reserve-1", "studentId": f.studentID, "type": "reserve", "status": "failed", "idempotencyKey": "k1",
		"sourceType": "session", "sourceId": f.sessionID, "resultSnapshot": map[string]any{"errorCode": "duplicate_reserve"},
		"reason": "reserve", "outcome": "failed", "beforeSummary": map[string]any{"keyCount": 0}, "afterSummary": map[string]any{"keyCount": 0},
	})
	result := ok(t, f.call(t, http.MethodGet, "/ops/course-credits/settlement-exceptions", nil, ""), "exceptions")
	kinds := map[any]map[string]any{}
	for _, item := range items(result) {
		kinds[item["kind"]] = item
	}
	if result["totalItems"] != float64(2) || kinds["credit_insufficient"]["reason"] != "NO_CREDIT" ||
		kinds["duplicate"]["sessionId"] != f.sessionID || kinds["duplicate"]["reason"] != "DUPLICATE_RESERVE" {
		t.Fatalf("settlement exceptions = %v", result)
	}
	filtered := ok(t, f.call(t, http.MethodGet, "/ops/course-credits/settlement-exceptions?kind=duplicate", nil, ""), "filtered")
	if filtered["totalItems"] != float64(1) {
		t.Fatalf("kind filter = %v", filtered)
	}
	got := ok(t, f.call(t, http.MethodGet, "/ops/course-credits/settlement-exceptions/"+roster.Id, nil, ""), "get")
	if got["creditStatus"] != "credit_insufficient" {
		t.Fatalf("settlement exception = %v", got)
	}
}

func TestStudentLearningViews(t *testing.T) {
	f := ledgerSetup(t, true)
	ok(t, f.call(t, http.MethodPost, "/ops/course-operations/enrollments",
		map[string]any{"studentId": f.studentID, "packageId": f.packageID, "priceVersionId": f.priceID, "classId": f.classID}, "e1"), "enroll")
	testkit.Create(t, f.app, "session_students", map[string]any{
		"sessionId": f.sessionID, "studentId": f.studentID, "attendanceStatus": "scheduled", "creditStatus": "conversion_required", "version": 1,
	})
	get := func(url string) testkit.Response {
		return testkit.Call(t, f.handler, http.MethodGet, url, nil, f.student)
	}

	failed(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/student/learning/overview", nil, f.teacher), 403, "STUDENT_LEARNING_STUDENT_REQUIRED", "teacher")
	overview := ok(t, get("/v1/student/learning/overview"), "overview")
	courses, _ := overview["courses"].([]any)
	course, _ := courses[0].(map[string]any)
	next, _ := overview["nextLesson"].(map[string]any)
	teachers, _ := next["teacherSummary"].(map[string]any)
	if len(courses) != 1 || course["courseName"] != "声乐课时" || course["remainingLessons"] != float64(10) || course["validUntil"] == nil {
		t.Fatalf("courses = %v", courses)
	}
	if next["lessonId"] != f.sessionID || next["lessonHourResult"] != "needs_help" || teachers["count"] != float64(1) {
		t.Fatalf("next lesson = %v", next)
	}
	if warnings, _ := overview["warnings"].([]any); len(warnings) != 1 {
		t.Fatalf("warnings = %v", overview["warnings"])
	}
	if records, _ := overview["recentRecords"].([]any); len(records) != 1 || records[0].(map[string]any)["title"] != "新增课时" {
		t.Fatalf("records = %v", overview["recentRecords"])
	}

	detail := ok(t, get("/v1/student/learning/courses/"+f.specID), "course")
	if sources, _ := detail["sources"].([]any); len(sources) != 1 || detail["courseId"] != f.specID {
		t.Fatalf("course = %v", detail)
	}
	failed(t, get("/v1/student/learning/courses/missing"), 400, "LEARNING_COURSE_NOT_FOUND", "missing course")
	lessons := ok(t, get("/v1/student/learning/lessons?scope=upcoming"), "lessons")
	if lessons["totalItems"] != float64(1) {
		t.Fatalf("lessons = %v", lessons)
	}
	failed(t, get("/v1/student/learning/lessons?scope=past"), 400, "LEARNING_LESSON_SCOPE_INVALID", "scope")
	if lesson := ok(t, get("/v1/student/learning/lessons/"+f.sessionID), "lesson"); lesson["notice"] == "" {
		t.Fatalf("lesson = %v", lesson)
	}
	failed(t, get("/v1/student/learning/lessons/missing"), 400, "LEARNING_LESSON_NOT_FOUND", "missing lesson")
	if records := ok(t, get("/v1/student/learning/records?courseId="+f.specID), "records"); records["totalItems"] != float64(1) {
		t.Fatalf("records = %v", records)
	}

	// Course names are sanitized, but an English internal term is a contract violation.
	spec, _ := f.app.FindRecordById("course_specs", f.specID)
	spec.Set("name", "Course Credit 入门")
	if err := f.app.Save(spec); err != nil {
		t.Fatal(err)
	}
	violation := get("/v1/student/learning/records")
	failed(t, violation, 400, "STUDENT_LEARNING_CONTRACT_VIOLATION", "violation")
	if details, _ := violation.Body["details"].(map[string]any); !strings.HasPrefix(details["path"].(string), "data.items[0].course.name") {
		t.Fatalf("violation details = %v", violation.Body["details"])
	}
}

func TestLearningSanitizesAndKeepsKeyOrder(t *testing.T) {
	if got := sanitizeStudentText("课程点批次冻结"); got != "课时来源已安排" {
		t.Fatalf("sanitize = %q", got)
	}
	raw, err := object{{"b", 1}, {"a", object{{"z", nil}, {"y", []any{"x"}}}}}.MarshalJSON()
	if err != nil || string(raw) != `{"b":1,"a":{"z":null,"y":["x"]}}` {
		t.Fatalf("ordered JSON = %s, %v", raw, err)
	}
	if err := assertLearning(object{{"items", []any{object{{"batchId", "x"}}}}}, "data"); err == nil ||
		err.(*Error).Details["path"] != "data.items[0].batchId" {
		t.Fatalf("forbidden key = %v", err)
	}
	if expiryLimitOf := func(v any) error { _, err := expiryLimit(v); return err }; expiryLimitOf(201.0) == nil || expiryLimitOf(200.0) != nil {
		t.Fatal("expiry limit bounds")
	}
}
