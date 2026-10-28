package coursecredit

import (
	"net/http"
	"slices"
	"testing"
	"time"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/testkit"
)

// Admin resource cases ported from Hono's courseCreditAdminResourceCommands
// and courseCreditAdminOperationRoutes tests; conversion rules are in conversion_rules_cases_test.go.

// admin is the fixture operator as an admin actor; audit rows relate actorId to teachers.
func (f ledgerFixture) admin(t *testing.T) Actor {
	t.Helper()
	return Actor{ID: f.operatorID(t), Role: "admin", IdempotencyKey: "key", TraceID: "trace"}
}

func (f ledgerFixture) operatorID(t *testing.T) string {
	t.Helper()
	record, err := f.app.FindFirstRecordByFilter("teachers", `email="ops@example.com"`)
	if err != nil {
		t.Fatal(err)
	}
	return record.Id
}

func bodyOf(values map[string]any) Body {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	return Body{Values: values, Keys: keys}
}

func with2(base map[string]any, changes map[string]any) map[string]any {
	result := copyMap(base)
	for key, value := range changes {
		if value == nil {
			delete(result, key)
		} else {
			result[key] = value
		}
	}
	return result
}

func (f ledgerFixture) adminData() map[string]map[string]any {
	return map[string]map[string]any{
		"courseSpecs": {"code": "VOCAL", "name": "声乐", "deliveryMode": "one_to_one", "durationMinutes": 45.0, "status": "draft"},
		"packages": {"code": "P10", "name": "声乐十课时", "saleChannel": "admin", "activationMode": "GRANT_TIME",
			"activationDeadlineDays": 0.0, "validityDurationDays": 180.0, "expiryPolicy": "FIXED_DURATION", "status": "draft"},
		"grantLines": {"packageId": f.packageID, "creditTypeId": f.creditTypeID, "quantity": 10.0},
		"priceVersions": {"packageId": f.packageID, "currency": "CNY", "listAmount": 3000.0, "saleAmount": 2800.0,
			"validFrom": "2026-01-01T00:00:00Z", "validTo": "", "version": 1.0, "status": "active", "grantSnapshot": map[string]any{}},
		"classes": {"code": "C1", "name": "周末班", "courseSpecId": f.specID, "defaultCreditTypeId": f.creditTypeID,
			"termStart": "2026-02-01T00:00:00Z", "termEnd": "2026-08-01T00:00:00Z", "capacity": 10.0, "location": "A教室", "status": "draft"},
		"lessons": {"code": "L1", "title": "第一课", "status": "draft", "startAt": "2026-08-01T10:00:00Z", "endAt": "2026-08-01T11:00:00Z",
			"requiredCreditTypeId": f.creditTypeID, "requiredQuantity": 1.0, "attendanceRuleSnapshot": map[string]any{"version": 1.0},
			"settlementRuleSnapshot": map[string]any{"version": 1.0}, "teacherRuleSnapshot": map[string]any{"version": 1.0},
			"rosterVersion": 1.0, "version": 1.0},
	}
}

// Hono: courseCreditAdminResourceCommands › admin resource commands create every supported explicit resource with audit records
func TestAdminCreatesEveryResourceWithAudit(t *testing.T) {
	f := ledgerSetup(t, true)
	data := f.adminData()
	for _, name := range []string{"courseSpecs", "packages", "grantLines", "priceVersions", "classes", "lessons"} {
		result, err := createResource(f.app, name, f.admin(t), bodyOf(data[name]))
		if err != nil || result["resource"] != name {
			t.Fatalf("%s = %v, %v", name, result, err)
		}
		audit, _ := findFirst(f.app, "ops_audit_logs", `resourceId="`+result["id"].(string)+`"`)
		if audit == nil || audit["outcome"] != "success" || audit["action"] != "course_operations."+name+".create" {
			t.Fatalf("%s audit = %v", name, audit)
		}
		if name == "grantLines" && result["status"] != "active" {
			t.Fatalf("grant line status = %v", result["status"])
		}
		if name == "packages" {
			// The fixture package already grants this credit type; lines and prices go to the new package.
			data["grantLines"]["packageId"] = result["id"]
			data["priceVersions"]["packageId"] = result["id"]
		}
	}
}

// Hono: courseCreditAdminResourceCommands › resource updates are explicit, price changes create revisions, and lesson updates are version claimed
func TestAdminUpdatesRevisionsAndLessonClaims(t *testing.T) {
	f := ledgerSetup(t, true)
	course, err := updateResource(f.app, "courseSpecs", f.specID, f.admin(t), bodyOf(map[string]any{"name": "新名称"}), nil)
	if err != nil || course["id"] != f.specID || recordField(t, bookingFixture{app: f.app}, "course_specs", f.specID, "name") != "新名称" {
		t.Fatalf("course = %v, %v", course, err)
	}
	patch(t, f.app, "price_versions", f.priceID, map[string]any{"version": 2})
	revision, err := updateResource(f.app, "priceVersions", f.priceID, f.admin(t), bodyOf(map[string]any{"saleAmount": 800.0}), nil)
	if err != nil || revision["previousId"] != f.priceID || revision["version"] != 3 || revision["id"] == f.priceID {
		t.Fatalf("revision = %v, %v", revision, err)
	}
	if recordField(t, bookingFixture{app: f.app}, "price_versions", revision["id"].(string), "saleAmount") != 800.0 {
		t.Fatal("revision stores the change")
	}
	if inactive, err := setStatus(f.app, "priceVersions", f.priceID, "inactive", "reviewed", f.admin(t)); err != nil || inactive["status"] != "inactive" {
		t.Fatalf("status revision = %v, %v", inactive, err)
	}

	lesson, err := updateResource(f.app, "lessons", f.sessionID, f.admin(t), bodyOf(map[string]any{"title": "新课堂"}), nil)
	if err != nil || lesson["operationId"] == nil || recordField(t, bookingFixture{app: f.app}, "sessions", f.sessionID, "version") != 2.0 {
		t.Fatalf("lesson = %v, %v", lesson, err)
	}
	if claims, _ := f.app.FindRecordsByFilter("credit_version_claims", `entityType="session"`, "", 0, 0); len(claims) != 1 {
		t.Fatalf("claims = %d", len(claims))
	}
	// The request hash covers the lesson as read, version included, so a retry replays only
	// against the state the first attempt saw — Hono's replay test reads that same state.
	patch(t, f.app, "sessions", f.sessionID, map[string]any{"title": "第一课", "version": 1})
	replayed, err := updateResource(f.app, "lessons", f.sessionID, f.admin(t), bodyOf(map[string]any{"title": "新课堂"}), nil)
	if err != nil || replayed["replayed"] != true || replayed["operationId"] != lesson["operationId"] {
		t.Fatalf("replay = %v, %v", replayed, err)
	}
}

// Hono: courseCreditAdminResourceCommands › resource validation rejects unsupported fields, invalid statuses, and unsafe lesson edits
func TestAdminResourceValidation(t *testing.T) {
	f := ledgerSetup(t, true)
	data := f.adminData()
	_, err := normalizeResourceInput("courseSpecs", bodyOf(with2(data["courseSpecs"], map[string]any{"secret": true})), nil)
	failsWith(t, err, "ADMIN_RESOURCE_FIELD_INVALID")
	_, err = setStatus(f.app, "grantLines", "line", "active", nil, f.admin(t))
	failsWith(t, err, "ADMIN_RESOURCE_STATUS_INVALID")
	_, err = updateResource(f.app, "courseSpecs", "", f.admin(t), bodyOf(map[string]any{"name": "x"}), nil)
	failsWith(t, err, "ADMIN_RESOURCE_ID_REQUIRED")
	patch(t, f.app, "sessions", f.sessionID, map[string]any{"status": "settled"})
	_, err = updateResource(f.app, "lessons", f.sessionID, f.admin(t), bodyOf(map[string]any{"title": "x"}), nil)
	failsWith(t, err, "LESSON_IMMUTABLE_AFTER_SETTLEMENT")
	_, err = createResource(f.app, "lessons", f.admin(t), bodyOf(with2(data["lessons"], map[string]any{"status": "scheduled"})))
	failsWith(t, err, "LESSON_MUST_START_DRAFT")

	invalid := []struct {
		name    string
		changes map[string]any
		code    string
	}{
		{"courseSpecs", map[string]any{"code": ""}, "COURSE_CODE_REQUIRED"},
		{"courseSpecs", map[string]any{"name": ""}, "COURSE_NAME_REQUIRED"},
		{"courseSpecs", map[string]any{"deliveryMode": "x"}, "COURSE_DELIVERY_MODE_INVALID"},
		{"courseSpecs", map[string]any{"durationMinutes": 0.0}, "COURSE_DURATION_INVALID"},
		{"courseSpecs", map[string]any{"status": "x"}, "COURSE_STATUS_INVALID"},
		{"packages", map[string]any{"code": ""}, "PACKAGE_CODE_REQUIRED"},
		{"packages", map[string]any{"name": ""}, "PACKAGE_NAME_REQUIRED"},
		{"packages", map[string]any{"saleChannel": "x"}, "PACKAGE_CHANNEL_INVALID"},
		{"packages", map[string]any{"activationMode": "x"}, "PACKAGE_ACTIVATION_MODE_INVALID"},
		{"packages", map[string]any{"expiryPolicy": "x"}, "PACKAGE_EXPIRY_POLICY_INVALID"},
		{"packages", map[string]any{"status": "x"}, "PACKAGE_STATUS_INVALID"},
		{"packages", map[string]any{"activationDeadlineDays": -1.0}, "PACKAGE_ACTIVATION_DEADLINE_INVALID"},
		{"packages", map[string]any{"validityDurationDays": -1.0}, "PACKAGE_VALIDITY_INVALID"},
		{"packages", map[string]any{"activationMode": "FIRST_RESERVATION", "activationDeadlineDays": ""}, "PACKAGE_ACTIVATION_DEADLINE_REQUIRED"},
		{"packages", map[string]any{"expiryPolicy": "FIXED_DURATION", "validityDurationDays": ""}, "PACKAGE_VALIDITY_REQUIRED"},
		{"grantLines", map[string]any{"packageId": ""}, "PACKAGE_ID_REQUIRED"},
		{"grantLines", map[string]any{"creditTypeId": ""}, "CREDIT_TYPE_ID_REQUIRED"},
		{"grantLines", map[string]any{"quantity": 0.0}, "GRANT_QUANTITY_INVALID"},
		{"priceVersions", map[string]any{"packageId": ""}, "PACKAGE_ID_REQUIRED"},
		{"priceVersions", map[string]any{"currency": "cny"}, "PRICE_CURRENCY_INVALID"},
		{"priceVersions", map[string]any{"listAmount": -1.0}, "PRICE_LIST_AMOUNT_INVALID"},
		{"priceVersions", map[string]any{"saleAmount": -1.0}, "PRICE_SALE_AMOUNT_INVALID"},
		{"priceVersions", map[string]any{"listAmount": 100.0, "saleAmount": 101.0}, "PRICE_SALE_AMOUNT_INVALID"},
		{"priceVersions", map[string]any{"validFrom": "bad"}, "PRICE_VALID_FROM_INVALID"},
		{"priceVersions", map[string]any{"validTo": "2026-01-01", "validFrom": "2026-02-01"}, "PRICE_VALID_TO_INVALID"},
		{"priceVersions", map[string]any{"version": 0.0}, "PRICE_VERSION_INVALID"},
		{"priceVersions", map[string]any{"status": "x"}, "PRICE_STATUS_INVALID"},
		{"classes", map[string]any{"code": ""}, "CLASS_CODE_REQUIRED"},
		{"classes", map[string]any{"name": ""}, "CLASS_NAME_REQUIRED"},
		{"classes", map[string]any{"courseSpecId": ""}, "COURSE_ID_REQUIRED"},
		{"classes", map[string]any{"defaultCreditTypeId": ""}, "CREDIT_TYPE_ID_REQUIRED"},
		{"classes", map[string]any{"capacity": 0.0}, "CLASS_CAPACITY_INVALID"},
		{"classes", map[string]any{"termEnd": "2026-01-01", "termStart": "2026-02-01"}, "CLASS_TERM_INVALID"},
		{"classes", map[string]any{"status": "x"}, "CLASS_STATUS_INVALID"},
		{"lessons", map[string]any{"code": ""}, "LESSON_CODE_REQUIRED"},
		{"lessons", map[string]any{"title": ""}, "LESSON_TITLE_REQUIRED"},
		{"lessons", map[string]any{"status": "settled"}, "LESSON_STATUS_INVALID"},
		{"lessons", map[string]any{"startAt": "bad"}, "LESSON_START_INVALID"},
		{"lessons", map[string]any{"endAt": "2026-08-01T09:00:00Z"}, "LESSON_END_INVALID"},
		{"lessons", map[string]any{"requiredCreditTypeId": ""}, "CREDIT_TYPE_ID_REQUIRED"},
		{"lessons", map[string]any{"requiredQuantity": 0.0}, "LESSON_QUANTITY_INVALID"},
		{"lessons", map[string]any{"attendanceRuleSnapshot": map[string]any{}}, "ATTENDANCE_RULE_SNAPSHOT_REQUIRED"},
		{"lessons", map[string]any{"settlementRuleSnapshot": []any{}}, "SETTLEMENT_RULE_SNAPSHOT_REQUIRED"},
		{"lessons", map[string]any{"rosterVersion": 0.0}, "LESSON_ROSTER_VERSION_INVALID"},
		{"lessons", map[string]any{"version": 0.0}, "LESSON_VERSION_INVALID"},
	}
	for _, c := range invalid {
		_, err := normalizeResourceInput(c.name, bodyOf(with2(data[c.name], c.changes)), nil)
		if errorCode(err) != c.code {
			t.Fatalf("%s %v = %v, want %s", c.name, c.changes, err, c.code)
		}
	}
	// A null teacher rule snapshot is a missing one.
	lesson := with2(data["lessons"], nil)
	lesson["teacherRuleSnapshot"] = nil
	_, err = normalizeResourceInput("lessons", bodyOf(lesson), nil)
	failsWith(t, err, "TEACHER_RULE_SNAPSHOT_REQUIRED")
	for _, deadline := range []any{nil, jsx.Undefined{}} {
		pkg := with2(data["packages"], map[string]any{"activationMode": "FIRST_RESERVATION"})
		pkg["activationDeadlineDays"] = deadline
		_, err := normalizeResourceInput("packages", bodyOf(pkg), nil)
		failsWith(t, err, "PACKAGE_ACTIVATION_DEADLINE_REQUIRED")
	}
	price := with2(data["priceVersions"], nil)
	delete(price, "currency")
	_, err = normalizeResourceInput("priceVersions", bodyOf(price), nil)
	failsWith(t, err, "PRICE_CURRENCY_INVALID")

	// Status edits follow lessonTransitions; publishing a draft is its own command.
	draft := put(t, f.app, "sessions", with2(data["lessons"], map[string]any{"code": "draft", "originType": "admin"}))
	_, err = updateResource(f.app, "lessons", draft.Id, f.admin(t), bodyOf(map[string]any{"status": "scheduled"}), nil)
	failsWith(t, err, "LESSON_STATUS_TRANSITION_INVALID")
	unknown := put(t, f.app, "sessions", with2(data["lessons"], map[string]any{"code": "unknown", "status": "unknown", "originType": "admin"}))
	_, err = updateResource(f.app, "lessons", unknown.Id, f.admin(t), bodyOf(map[string]any{"status": "completed"}), nil)
	failsWith(t, err, "LESSON_STATUS_TRANSITION_INVALID")
	if _, err := updateResource(f.app, "lessons", draft.Id, Actor{ID: f.operatorID(t), IdempotencyKey: "same"}, bodyOf(map[string]any{"status": "draft"}), nil); err != nil {
		t.Fatalf("draft to draft = %v", err)
	}
	if !slices.Contains(lessonTransitions["scheduled"], "in_progress") {
		t.Fatal("scheduled lessons can start")
	}
	appointment := with2(data["lessons"], map[string]any{"originType": "appointment"})
	if normalized, _ := normalizeResourceInput("lessons", bodyOf(map[string]any{"title": "预约课堂完成态"}), appointment); normalized["originType"] != "appointment" {
		t.Fatalf("origin = %v", normalized["originType"])
	}
}

// Hono: courseCreditAdminResourceCommands › resource defaults support direct inputs, default service dependencies, and status-less updates
func TestAdminResourceDefaults(t *testing.T) {
	f := ledgerSetup(t, true)
	created, err := createResource(f.app, "courseSpecs", Actor{}, bodyOf(f.adminData()["courseSpecs"]))
	if err != nil || created["status"] != "draft" {
		t.Fatalf("created = %v, %v", created, err)
	}
	line, _ := f.app.FindFirstRecordByFilter("package_grant_lines", `packageId="`+f.packageID+`"`)
	updated, err := updateResource(f.app, "grantLines", line.Id, Actor{}, bodyOf(map[string]any{"quantity": 12.0}), nil)
	if err != nil || updated["status"] != "active" {
		t.Fatalf("updated = %v, %v", updated, err)
	}
	audit, _ := findFirst(f.app, "ops_audit_logs", `resourceId="`+line.Id+`"`)
	if audit["actorId"] != "" || audit["actorRole"] != "admin" {
		t.Fatalf("audit = %v", audit)
	}
}

// Hono: courseCreditAdminResourceCommands › package activation requires grant lines and an active price
func TestPackageActivationRequiresLinesAndPrice(t *testing.T) {
	f := ledgerSetup(t, true)
	pkg, err := createResource(f.app, "packages", f.admin(t), bodyOf(f.adminData()["packages"]))
	if err != nil {
		t.Fatal(err)
	}
	id := pkg["id"].(string)
	_, err = setStatus(f.app, "packages", id, "active", "reviewed", f.admin(t))
	failsWith(t, err, "PACKAGE_GRANT_LINES_REQUIRED")
	if _, err := createResource(f.app, "grantLines", f.admin(t), bodyOf(with2(f.adminData()["grantLines"], map[string]any{"packageId": id}))); err != nil {
		t.Fatal(err)
	}
	_, err = setStatus(f.app, "packages", id, "active", "reviewed", f.admin(t))
	failsWith(t, err, "PACKAGE_ACTIVE_PRICE_REQUIRED")
	if _, err := createResource(f.app, "priceVersions", f.admin(t), bodyOf(with2(f.adminData()["priceVersions"], map[string]any{"packageId": id}))); err != nil {
		t.Fatal(err)
	}
	if active, err := setStatus(f.app, "packages", id, "active", "reviewed", f.admin(t)); err != nil || active["status"] != "active" {
		t.Fatalf("active = %v, %v", active, err)
	}
}

// Hono: courseCreditAdminResourceCommands › new lessons receive server-owned rule snapshots and versions
func TestNewLessonsGetServerOwnedSnapshots(t *testing.T) {
	data, err := normalizeResourceInput("lessons", bodyOf(map[string]any{"code": "SCH-1", "title": "声乐课", "status": "draft",
		"startAt": "2026-09-24T02:00:00.000Z", "endAt": "2026-09-24T03:00:00.000Z", "requiredCreditTypeId": "credit", "requiredQuantity": 1.0}), nil)
	if err != nil || fmtJSON(data["attendanceRuleSnapshot"]) != `{"version":1}` || fmtJSON(data["settlementRuleSnapshot"]) != `{"version":1}` ||
		fmtJSON(data["teacherRuleSnapshot"]) != `{"version":1}` || data["rosterVersion"] != 1.0 || data["version"] != 1.0 || data["originType"] != "admin" {
		t.Fatalf("data = %v, %v", data, err)
	}
}

// Hono: courseCreditAdminResourceCommands › scheduled lessons can be completed only after they start
func TestScheduledLessonsCompleteOnlyAfterStart(t *testing.T) {
	f := ledgerSetup(t, true)
	for _, from := range []string{"scheduled", "enrollment_closed"} {
		if !slices.Contains(lessonTransitions[from], "completed") {
			t.Fatalf("%s cannot complete", from)
		}
	}
	if slices.Contains(lessonTransitions["draft"], "completed") {
		t.Fatal("drafts cannot complete")
	}
	_, err := updateResource(f.app, "lessons", f.sessionID, f.admin(t), bodyOf(map[string]any{"status": "completed"}), nil)
	failsWith(t, err, "LESSON_NOT_STARTED")
	started := time.Now().UTC().Add(-time.Hour)
	patch(t, f.app, "sessions", f.sessionID, map[string]any{"startAt": started, "endAt": started.Add(30 * time.Minute)})
	if result, err := updateResource(f.app, "lessons", f.sessionID, Actor{ID: f.operatorID(t), IdempotencyKey: "complete"}, bodyOf(map[string]any{"status": "completed"}), nil); err != nil || result["status"] != "completed" {
		t.Fatalf("complete = %v, %v", result, err)
	}
}

// adminRoutes serves the catalog, ledger and lesson modules over the ledger fixture.
func adminRoutes(t *testing.T, f ledgerFixture) (http.Handler, *auth.Signer) {
	t.Helper()
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	return testkit.Serve(t, f.app, CatalogModule{Signer: signer}.Register, LedgerModule{Signer: signer, GrantsEnabled: true}.Register,
		SessionsModule{Signer: signer, SettlementEnabled: true}.Register), signer
}

func opsHeaders(t *testing.T, signer *auth.Signer, id string, isAdmin bool, capabilities ...string) map[string]string {
	t.Helper()
	value, err := signer.Sign(id, id, "teacher", isAdmin, auth.Claims{"scope": auth.OpsScope, "courseCreditCapabilities": capabilities}, auth.OpsTokenTTL)
	if err != nil {
		t.Fatal(err)
	}
	return with(with(testkit.Bearer(value), "X-Trace-Id", "admin-trace"), "Idempotency-Key", "admin-command-key")
}

// routed fails when a request never reached a handler.
func routed(t *testing.T, result testkit.Response, what string) {
	t.Helper()
	if result.Status == http.StatusNotFound && result.Body["errorCode"] == nil {
		t.Fatalf("%s is not routed: %v", what, result.Body)
	}
}

// Hono: courseCreditAdminOperationRoutes › admin course operation routes expose every explicit resource and workflow command
func TestAdminOperationRoutesExposeCommands(t *testing.T) {
	f := ledgerSetup(t, true)
	handler, signer := adminRoutes(t, f)
	data := f.adminData()
	for _, route := range []struct {
		path, resource string
		status         bool
	}{
		{"course-specs", "courseSpecs", true}, {"packages", "packages", true}, {"grant-lines", "grantLines", false},
		{"price-versions", "priceVersions", true}, {"classes", "classes", true}, {"lessons", "lessons", true},
	} {
		headers := opsHeaders(t, signer, f.operatorID(t), true)
		created := ok(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/"+route.path, data[route.resource],
			with(headers, "Idempotency-Key", "create-"+route.path)), "create "+route.path)
		id := created["id"].(string)
		if route.resource == "packages" {
			data["grantLines"]["packageId"] = id
			data["priceVersions"]["packageId"] = id
		}
		routed(t, testkit.Call(t, handler, http.MethodPatch, "/ops/course-operations/"+route.path+"/"+id, map[string]any{},
			with(headers, "Idempotency-Key", "update-"+route.path)), "update "+route.path)
		if route.status {
			routed(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/"+route.path+"/"+id+"/status",
				map[string]any{"status": "draft", "reason": "reviewed"}, with(headers, "Idempotency-Key", "status-"+route.path)), "status "+route.path)
		}
	}
	headers := opsHeaders(t, signer, f.operatorID(t), true)
	enrolled := ok(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/enrollments", map[string]any{
		"studentId": f.studentID, "packageId": f.packageID, "priceVersionId": f.priceID, "classId": f.classID, "reason": "paid"}, headers), "enroll")
	orderID := enrolled["orderId"].(string)
	routed(t, testkit.Call(t, handler, http.MethodGet, "/ops/course-operations/enrollments/"+orderID+"/sync-preview", nil, headers), "sync preview")
	routed(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/enrollments/"+orderID+"/sync",
		map[string]any{"previewHash": "hash", "lessonIds": []any{f.sessionID}}, with(headers, "Idempotency-Key", "sync")), "sync")
	lesson := "/ops/course-operations/lessons/" + f.sessionID
	routed(t, testkit.Call(t, handler, http.MethodPost, lesson+"/students/row/attendance", map[string]any{"attendanceStatus": "present"},
		with(headers, "Idempotency-Key", "attendance")), "attendance")
	routed(t, testkit.Call(t, handler, http.MethodPost, lesson+"/attendance/all-present", map[string]any{"reason": "started"},
		with(headers, "Idempotency-Key", "all-present")), "all present")
	routed(t, testkit.Call(t, handler, http.MethodPost, lesson+"/teachers/teacher-row/actual-status", map[string]any{"actualStatus": "confirmed"},
		with(headers, "Idempotency-Key", "actual")), "actual teacher")
	routed(t, testkit.Call(t, handler, http.MethodGet, lesson+"/settlement-preview", nil, headers), "settlement preview")
	operation, _ := findFirst(f.app, "credit_operations", `type="grant"`)
	if operation["actorRole"] != "admin" {
		t.Fatalf("enrollment actor = %v", operation)
	}
}

// Hono: courseCreditAdminOperationRoutes › class enrollment needs academic capability and assigned teachers retain teacher audit identity
func TestClassEnrollmentCapabilityAndTeacherIdentity(t *testing.T) {
	f := ledgerSetup(t, true)
	handler, signer := adminRoutes(t, f)
	finance := opsHeaders(t, signer, f.operatorID(t), false, Finance)
	enrollment := map[string]any{"studentId": f.studentID, "packageId": f.packageID, "priceVersionId": f.priceID, "classId": f.classID}
	rejected(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/enrollments", enrollment, finance), 403, "finance class enrollment")
	if count, _ := f.app.CountRecords("orders"); count != 0 {
		t.Fatal("denied enrollment must not write")
	}
	delete(enrollment, "classId")
	ok(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/enrollments", enrollment, finance), "finance enrollment")

	assignment, _ := f.app.FindFirstRecordByFilter("session_teachers", `sessionId="`+f.sessionID+`"`)
	teacher := opsHeaders(t, signer, assignment.GetString("teacherId"), false, Teacher)
	row := put(t, f.app, "session_students", map[string]any{"sessionId": f.sessionID, "studentId": f.studentID,
		"attendanceStatus": "scheduled", "creditStatus": "pending", "version": 1})
	started := time.Now().UTC().Add(-time.Hour)
	patch(t, f.app, "sessions", f.sessionID, map[string]any{"startAt": started, "endAt": started.Add(30 * time.Minute)})
	marked := ok(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-operations/lessons/"+f.sessionID+"/students/"+row.Id+"/attendance",
		map[string]any{"attendanceStatus": "late"}, teacher), "teacher attendance")
	operation, _ := get(f.app, "credit_operations", marked["operationId"].(string))
	if operation == nil || operation["actorRole"] != "teacher" {
		t.Fatalf("attendance operation = %v", operation)
	}
}

// Hono: courseCreditAdminOperationRoutes › resource capability helper rejects unknown resource capabilities
func TestTeachingScopeFollowsCapability(t *testing.T) {
	if !globalTeachingScope(auth.Claims{"id": "operator", "role": "teacher", "courseCreditCapabilities": []any{Academic}}) ||
		globalTeachingScope(auth.Claims{"id": "operator", "role": "teacher", "courseCreditCapabilities": []any{Teacher}}) {
		t.Fatal("academic operators see every lesson, teachers only theirs")
	}
	// Unknown capabilities never pass a capability check.
	failsWith(t, RequireCapability(auth.Claims{"role": "teacher", "isAdmin": false}, "course_credit.unknown"), "COURSE_CREDIT_CAPABILITY_REQUIRED")
}
