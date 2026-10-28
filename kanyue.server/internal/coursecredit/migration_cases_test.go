package coursecredit

import (
	"encoding/json"
	"net/http"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/testkit"
)

// Ports of Hono's courseCreditMigrationPlan, courseCreditMigrationService and
// courseCreditMigrationRoutes tests.

func migrationFailed(t *testing.T, err error, code string) {
	t.Helper()
	if errorCode(err) != code {
		t.Fatalf("error = %v (%s), want %s", err, errorCode(err), code)
	}
}

// legacyCollection adds a legacy source table with the given text fields and autodates.
func legacyCollection(t *testing.T, app core.App, name string, fields ...string) {
	t.Helper()
	collection := core.NewBaseCollection(name)
	for _, field := range fields {
		collection.Fields.Add(&core.TextField{Name: field})
	}
	collection.Fields.Add(&core.JSONField{Name: "userId"}, &core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true})
	if err := app.Save(collection); err != nil {
		t.Fatal(err)
	}
}

// addHours gives an existing collection the legacy `hours` number field.
func addHours(t *testing.T, app core.App, name string) {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(name)
	if err != nil {
		t.Fatal(err)
	}
	collection.Fields.Add(&core.NumberField{Name: "hours"})
	if err := app.Save(collection); err != nil {
		t.Fatal(err)
	}
}

// Hono: courseCreditMigrationPlan › migration inventory discovers optional legacy sources without exposing account payloads
func TestMigrationInventoryDiscoversLegacySources(t *testing.T) {
	app := testkit.NewApp(t)
	addHours(t, app, "students")
	addHours(t, app, "teachers")
	legacyCollection(t, app, "learning_programs", "title")
	legacyCollection(t, app, "lesson_records", "name", "startTime", "endTime", "teacherId")
	legacyCollection(t, app, "attendance_records", "lessonId", "status")
	student := testkit.Create(t, app, "students", map[string]any{"realName": "学员甲", "hours": 4, "password": "private"})
	testkit.Create(t, app, "students", map[string]any{"nickName": "学员乙"})
	teacher := testkit.Create(t, app, "teachers", map[string]any{"email": "legacy@example.com", "password": "admin-pass-1", "nickName": "教师甲", "hours": 2.5})
	program := testkit.Create(t, app, "learning_programs", map[string]any{"title": "旧声乐项目"})
	lesson := testkit.Create(t, app, "lesson_records", map[string]any{"name": "历史课次", "startTime": "2026-01-01T10:00:00Z",
		"endTime": "2026-01-01T11:00:00Z", "userId": []any{student.Id}, "teacherId": teacher.Id})
	testkit.Create(t, app, "attendance_records", map[string]any{"lessonId": lesson.Id, "userId": student.Id, "status": "present"})
	spec := testkit.Create(t, app, "course_specs", map[string]any{"code": "voice", "name": "声乐", "deliveryMode": "one_to_one", "durationMinutes": 60, "status": "active"})
	credit := testkit.Create(t, app, "credit_types", map[string]any{"code": "VOICE", "name": "声乐课时", "kind": "course", "courseSpecId": spec.Id,
		"consumable": true, "referenceUnitValue": 1, "status": "active"})
	testkit.Create(t, app, "credit_types", map[string]any{"code": "UNIVERSAL", "name": "通用", "kind": "universal", "consumable": false, "referenceUnitValue": 1, "status": "active"})

	inventory, err := migrationInventory(app)
	if err != nil {
		t.Fatal(err)
	}
	availability := inventory["availability"].(map[string]any)
	if availability["sessions"] != false || availability["lessons"] != true {
		t.Fatalf("availability = %v", availability)
	}
	if hours := inventory["studentHours"].([]any); len(hours) != 1 || hours[0].(map[string]any)["label"] != "学员甲" || hours[0].(map[string]any)["hours"] != 4.0 {
		t.Fatalf("student hours = %v", hours)
	}
	if hours := inventory["teacherHours"].([]any); len(hours) != 1 || hours[0].(map[string]any)["label"] != "教师甲" || hours[0].(map[string]any)["hours"] != 2.5 {
		t.Fatalf("teacher hours = %v", hours)
	}
	if programs := inventory["programs"].([]any); programs[0].(map[string]any)["id"] != program.Id || programs[0].(map[string]any)["name"] != "旧声乐项目" {
		t.Fatalf("programs = %v", programs)
	}
	if sessions := inventory["sessions"].([]any); sessions[0].(map[string]any)["studentId"] != student.Id || sessions[0].(map[string]any)["title"] != "历史课次" {
		t.Fatalf("sessions = %v", sessions)
	}
	if attendance := inventory["attendance"].([]any); attendance[0].(map[string]any)["sessionId"] != lesson.Id {
		t.Fatalf("attendance = %v", attendance)
	}
	if types := inventory["targets"].(map[string]any)["creditTypes"].([]any); len(types) != 1 ||
		types[0].(map[string]any)["id"] != credit.Id || types[0].(map[string]any)["name"] != "声乐课时" {
		t.Fatalf("credit types = %v", types)
	}
	totals := inventory["totals"].(map[string]any)
	if totals["attendance"] != 1 || totals["programs"] != 1 || totals["sessions"] != 1 || totals["studentHours"] != 4.0 ||
		totals["students"] != 1 || totals["teacherHours"] != 2.5 || totals["teachers"] != 1 {
		t.Fatalf("totals = %v", totals)
	}
	encoded, _ := json.Marshal(inventory)
	if strings.Contains(string(encoded), "private") || strings.Contains(string(encoded), "password") {
		t.Fatalf("inventory leaks account payload: %s", encoded)
	}
}

func planInventory() map[string]any {
	return map[string]any{
		"availability": map[string]any{"students": true, "teachers": true, "programs": true, "sessions": true, "lessons": false, "attendance": true},
		"attendance":   []any{map[string]any{"id": "attendance", "sessionId": "session", "studentId": "student", "status": "present"}},
		"programs":     []any{map[string]any{"id": "program", "name": "旧项目"}},
		"sessions":     []any{map[string]any{"id": "session", "title": "旧课堂"}},
		"studentHours": []any{map[string]any{"id": "student", "label": "学员", "hours": 4.0}},
		"teacherHours": []any{map[string]any{"id": "teacher", "label": "教师", "hours": 2.5}},
		"totals": map[string]any{"attendance": 1, "programs": 1, "sessions": 1, "studentHours": 4.0,
			"students": 1, "teacherHours": 2.5, "teachers": 1},
	}
}

// fullMigrationPlan maps every planInventory source; ids rename the placeholders.
func fullMigrationPlan(ids map[string]string) map[string]any {
	id := func(name string) string {
		if value, ok := ids[name]; ok {
			return value
		}
		return name
	}
	plan := map[string]any{}
	if err := json.Unmarshal([]byte(`{
		"studentHours": [{"studentId": "`+id("student")+`", "allocations": [{"creditTypeId": "`+id("credit")+`", "quantity": 4,
			"activationMode": "GRANT_TIME", "expiryPolicy": "FIXED_DURATION", "validityDurationDays": 180, "reason": "人工核对旧课时"}]}],
		"teacherHours": [{"teacherId": "`+id("teacher")+`", "quantity": 2.5, "reason": "人工核对教师旧课时"}],
		"programs": [{"legacyProgramId": "program", "targetType": "class", "targetId": "`+id("class")+`", "reason": "教务人工确认分类"}],
		"sessions": [{"legacySessionId": "session", "code": "MIG-SESSION", "title": "历史课堂",
			"startAt": "2026-01-01T10:00:00Z", "endAt": "2026-01-01T11:00:00Z", "location": "旧教室",
			"requiredCreditTypeId": "`+id("credit")+`", "requiredQuantity": 1, "reason": "历史课堂无扣点导入",
			"attendanceRecordIds": ["attendance"],
			"attendees": [{"studentId": "`+id("student")+`", "attendanceStatus": "present"}],
			"teachers": [{"teacherId": "`+id("teacher")+`", "role": "lead", "actualStatus": "confirmed"}]}]
	}`), &plan); err != nil {
		panic(err)
	}
	return plan
}

// Hono: courseCreditMigrationPlan › zero-difference explicit mappings are release-ready
func TestMigrationZeroDifferencePlanIsReady(t *testing.T) {
	preview, err := previewMigrationPlan(planInventory(), fullMigrationPlan(nil))
	if err != nil {
		t.Fatal(err)
	}
	report := preview["report"].(map[string]any)
	if preview["ready"] != true || len(report["differences"].([]any)) != 0 {
		t.Fatalf("preview = %v", preview)
	}
	for name, items := range report["unmapped"].(map[string]any) {
		if len(items.([]any)) != 0 {
			t.Fatalf("unmapped %s = %v", name, items)
		}
	}
	mapped := report["mapped"].(map[string]any)
	if mapped["studentHours"] != 4.0 || mapped["teacherHours"] != 2.5 {
		t.Fatalf("mapped = %v", mapped)
	}
	session := preview["plan"].(map[string]any)["sessions"].([]any)[0].(map[string]any)
	if session["attendees"].([]any)[0].(map[string]any)["attendanceStatus"] != "present" || session["startAt"] != "2026-01-01T10:00:00.000Z" {
		t.Fatalf("session = %v", session)
	}
}

// Hono: courseCreditMigrationPlan › preview reports unexplained quantities and every unmapped legacy source
func TestMigrationPreviewReportsDifferencesAndUnmapped(t *testing.T) {
	preview, err := previewMigrationPlan(planInventory(), jsonMap(t, `{"studentHours": [{"studentId": "student", "allocations": [{
		"creditTypeId": "credit", "quantity": 3, "activationMode": "GRANT_TIME", "expiryPolicy": "NO_EXPIRY", "reason": "人工核对旧课时"}]}]}`))
	if err != nil {
		t.Fatal(err)
	}
	report := preview["report"].(map[string]any)
	difference := report["differences"].([]any)[0].(map[string]any)
	if preview["ready"] != false || difference["sourceId"] != "student" || difference["sourceQuantity"] != 4.0 ||
		difference["mappedQuantity"] != 3.0 || difference["difference"] != -1.0 || difference["type"] != "student_hours" {
		t.Fatalf("difference = %v", difference)
	}
	unmapped := report["unmapped"].(map[string]any)
	for name, want := range map[string]string{"programs": "program", "sessions": "session", "teacherHours": "teacher", "attendance": "attendance"} {
		if !slices.Equal(unmapped[name].([]any), []any{want}) {
			t.Fatalf("unmapped %s = %v", name, unmapped[name])
		}
	}
}

// Hono: courseCreditMigrationPlan › migration plan rejects guesses, duplicates, invalid dates, and incomplete policies
func TestMigrationPlanRejectsIncompleteInput(t *testing.T) {
	allocation := func(changes string) map[string]any {
		return jsonMap(t, `{"studentHours": [{"studentId": "student", "allocations": [`+changes+`]}]}`)
	}
	base := `"creditTypeId": "credit", "reason": "人工核对旧课时"`
	session := func(edit func(map[string]any)) map[string]any {
		plan := fullMigrationPlan(nil)
		edit(plan["sessions"].([]any)[0].(map[string]any))
		return map[string]any{"sessions": plan["sessions"]}
	}
	for code, input := range map[string]any{
		"MIGRATION_PLAN_REQUIRED":               nil,
		"MIGRATION_ALLOCATION_REQUIRED":         allocation(""),
		"MIGRATION_QUANTITY_INVALID":            allocation(`{` + base + `, "quantity": 0, "activationMode": "GRANT_TIME", "expiryPolicy": "NO_EXPIRY"}`),
		"MIGRATION_ACTIVATION_DEADLINE_INVALID": allocation(`{` + base + `, "quantity": 4, "activationMode": "FIRST_CHECK_IN", "expiryPolicy": "NO_EXPIRY"}`),
		"MIGRATION_VALIDITY_INVALID":            allocation(`{` + base + `, "quantity": 4, "activationMode": "GRANT_TIME", "expiryPolicy": "FIXED_DURATION"}`),
		"MIGRATION_TERM_END_INVALID":            allocation(`{` + base + `, "quantity": 4, "activationMode": "GRANT_TIME", "expiryPolicy": "TERM_END"}`),
		"MIGRATION_PROGRAM_TYPE_INVALID": jsonMap(t, `{"programs": [{"legacyProgramId": "program", "targetType": "guess",
			"targetId": "target", "reason": "人工确认分类"}]}`),
		"MIGRATION_SESSION_END_INVALID": session(func(item map[string]any) { item["endAt"] = "invalid" }),
		"MIGRATION_SESSION_STUDENT_DUPLICATE": session(func(item map[string]any) {
			item["attendees"] = []any{map[string]any{"studentId": "student", "attendanceStatus": "present"},
				map[string]any{"studentId": "student", "attendanceStatus": "late"}}
		}),
		"MIGRATION_SESSION_TEACHER_DUPLICATE": session(func(item map[string]any) {
			item["teachers"] = []any{map[string]any{"teacherId": "teacher"}, map[string]any{"teacherId": "teacher", "role": "lead"}}
		}),
	} {
		_, err := normalizeMigrationPlan(input)
		migrationFailed(t, err, code)
	}
	// Teacher roles and statuses default to an attending lead.
	plan, err := normalizeMigrationPlan(session(func(item map[string]any) { item["teachers"] = []any{map[string]any{"teacherId": " teacher "}} }))
	if err != nil {
		t.Fatal(err)
	}
	teacher := plan["sessions"].([]any)[0].(map[string]any)["teachers"].([]any)[0].(map[string]any)
	if teacher["teacherId"] != "teacher" || teacher["role"] != "lead" || teacher["actualStatus"] != "confirmed" {
		t.Fatalf("teacher defaults = %v", teacher)
	}
}

// Hono: courseCreditMigrationPlan › preview rejects unknown and multiply-used source records
func TestMigrationPreviewRejectsUnknownAndDuplicateSources(t *testing.T) {
	unknownAttendance := fullMigrationPlan(nil)
	unknownAttendance["sessions"].([]any)[0].(map[string]any)["attendanceRecordIds"] = []any{"missing"}
	duplicateStudent := fullMigrationPlan(nil)
	duplicateStudent["studentHours"] = append(duplicateStudent["studentHours"].([]any), duplicateStudent["studentHours"].([]any)[0])
	unknownProgram := fullMigrationPlan(nil)
	unknownProgram["programs"].([]any)[0].(map[string]any)["legacyProgramId"] = "missing"
	for code, plan := range map[string]map[string]any{
		"MIGRATION_ATTENDANCE_UNKNOWN": unknownAttendance, "MIGRATION_STUDENT_DUPLICATE": duplicateStudent,
		"MIGRATION_PROGRAM_UNKNOWN": unknownProgram,
	} {
		_, err := previewMigrationPlan(planInventory(), plan)
		migrationFailed(t, err, code)
	}
}

// Hono: courseCreditMigrationPlan › inventory helper contracts handle alternate legacy shapes and real errors
func TestMigrationInventoryHelpers(t *testing.T) {
	if !hasLegacyHours(map[string]any{"hours": "1.5"}) || hasLegacyHours(map[string]any{"hours": 0.0}) || hasLegacyHours(map[string]any{}) {
		t.Fatal("hasLegacyHours")
	}
	if recordLabel(map[string]any{"username": "account"}) != "account" || recordLabel(map[string]any{}) != "未命名" {
		t.Fatal("recordLabel")
	}
	if hours := legacyHours([]map[string]any{{"id": "id", "sn": "S1", "hours": "2"}}); hours[0].(map[string]any)["label"] != "S1" || hours[0].(map[string]any)["hours"] != 2.0 {
		t.Fatalf("legacyHours = %v", hours)
	}
	if projectProgram(map[string]any{"id": "id"})["name"] != "id" ||
		projectSession(map[string]any{"id": "id", "created": "2026-01-01"})["title"] != "历史课堂 id" ||
		projectAttendance(map[string]any{"id": "id", "studentId": []any{"student"}})["studentId"] != "student" ||
		projectTarget(map[string]any{"id": "id", "code": "CODE"})["name"] != "CODE" {
		t.Fatal("projections")
	}
	if empty := projectTarget(map[string]any{}); empty["code"] != "" || empty["id"] != "" || empty["name"] != "" || empty["status"] != "" {
		t.Fatalf("empty target = %v", empty)
	}
	if merged := mergeSessions([]map[string]any{{"id": "same", "title": "first"}}, []map[string]any{{"id": "same", "title": "second"}}); len(merged) != 1 || merged[0]["title"] != "second" {
		t.Fatalf("merged = %v", merged)
	}
	// A legacy collection that exists but cannot be listed is a real error, not an absent source.
	app := testkit.NewApp(t)
	broken := core.NewBaseCollection("learning_programs")
	broken.Fields.Add(&core.TextField{Name: "title"})
	if err := app.Save(broken); err != nil {
		t.Fatal(err)
	}
	if available, _, err := optionalList(app, "learning_programs"); err == nil || available {
		t.Fatalf("unsortable source = %v %v", available, err)
	}
	if available, rows, err := optionalList(app, "learning_sessions"); err != nil || available || len(rows) != 0 {
		t.Fatalf("missing source = %v %v %v", available, rows, err)
	}
}

type migrationFixture struct {
	app                                     core.App
	studentID, teacherID, creditID, classID string
	inventory                               map[string]any
}

// migrationSetup has real targets for planInventory's sources.
func migrationSetup(t *testing.T) migrationFixture {
	t.Helper()
	app := testkit.NewApp(t)
	student := testkit.Create(t, app, "students", map[string]any{"realName": "学员"})
	teacher := testkit.Create(t, app, "teachers", map[string]any{"email": "migrate@example.com", "password": "admin-pass-1"})
	spec := testkit.Create(t, app, "course_specs", map[string]any{"code": "voice", "name": "声乐", "deliveryMode": "one_to_one", "durationMinutes": 60, "status": "active"})
	credit := testkit.Create(t, app, "credit_types", map[string]any{"code": "VOICE", "name": "声乐课时", "kind": "course", "courseSpecId": spec.Id,
		"consumable": true, "referenceUnitValue": 1, "status": "active"})
	class := testkit.Create(t, app, "classes", map[string]any{"code": "c1", "name": "周六班", "courseSpecId": spec.Id, "defaultCreditTypeId": credit.Id, "status": "active", "capacity": 8})
	inventory := planInventory()
	inventory["studentHours"].([]any)[0].(map[string]any)["id"] = student.Id
	inventory["teacherHours"].([]any)[0].(map[string]any)["id"] = teacher.Id
	return migrationFixture{app: app, studentID: student.Id, teacherID: teacher.Id, creditID: credit.Id, classID: class.Id, inventory: inventory}
}

func (f migrationFixture) plan() map[string]any {
	return fullMigrationPlan(map[string]string{"student": f.studentID, "teacher": f.teacherID, "credit": f.creditID, "class": f.classID})
}

func (f migrationFixture) command(t *testing.T, plan map[string]any) map[string]any {
	t.Helper()
	preview, err := previewWithInventory(f.inventory, plan)
	if err != nil {
		t.Fatal(err)
	}
	return map[string]any{"actorId": "admin", "actorRole": "admin", "idempotencyKey": "migration-key", "plan": plan,
		"previewHash": preview["previewHash"], "traceId": "trace-migration"}
}

func countRows(t *testing.T, app core.App, collection, filter string) int {
	t.Helper()
	rows, err := app.FindRecordsByFilter(collection, filter, "", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	return len(rows)
}

// Hono: courseCreditMigrationService › approved zero-difference migration commits batches, adjustments, classification, and no-charge history atomically
func TestMigrationApplyCommitsEverything(t *testing.T) {
	f := migrationSetup(t)
	result, err := applyWithInventory(f.app, f.inventory, f.command(t, f.plan()))
	if err != nil {
		t.Fatal(err)
	}
	counts := result["counts"].(map[string]any)
	if result["replayed"] != false || result["differenceCount"] != 0 || result["unexplainedCount"] != 0 ||
		counts["programs"] != 1 || counts["sessions"] != 1 || counts["studentMappings"] != 1 || counts["teacherAdjustments"] != 1 {
		t.Fatalf("result = %v", result)
	}
	root := findFirstMap(t, f.app, "credit_operations", `sourceType="legacy_migration_run"`)
	if root["id"] != result["operationId"] || root["idempotencyKey"] != "applyCourseCreditMigration:migration-key" {
		t.Fatalf("root = %v", root)
	}
	batch := findFirstMap(t, f.app, "credit_batches", `studentId="`+f.studentID+`"`)
	validFrom, _ := millis(batch["validFrom"])
	expires, _ := millis(batch["effectiveExpiresAt"])
	if batch["originalQuantity"] != 4.0 || batch["availableQuantity"] != 4.0 || batch["expiryPolicy"] != "FIXED_DURATION" ||
		batch["status"] != "active" || expires-validFrom != 180*dayMillis {
		t.Fatalf("batch = %v", batch)
	}
	if event := findFirstMap(t, f.app, "credit_events", `batchId="`+batch["id"].(string)+`"`); event["eventType"] != "ADJUST" || event["quantityDelta"] != 4.0 {
		t.Fatalf("event = %v", event)
	}
	if teacherEvent := findFirstMap(t, f.app, "teacher_credit_events", `teacherId="`+f.teacherID+`"`); teacherEvent["eventType"] != "adjust" ||
		teacherEvent["sessionTeacherId"] != "" || teacherEvent["status"] != "confirmed" || teacherEvent["quantityDelta"] != 2.5 {
		t.Fatalf("teacher event = %v", teacherEvent)
	}
	session := findFirstMap(t, f.app, "sessions", `originType="migration"`)
	if session["status"] != "completed" || session["code"] != "MIG-SESSION" {
		t.Fatalf("session = %v", session)
	}
	if roster := findFirstMap(t, f.app, "session_students", `sessionId="`+session["id"].(string)+`"`); roster["creditStatus"] != "not_charged" ||
		roster["eligibilityReason"] != "historical_import_no_charge" || roster["checkedInAt"] == "" {
		t.Fatalf("roster = %v", roster)
	}
	if countRows(t, f.app, "session_credit_allocations", "") != 0 || countRows(t, f.app, "credit_operations", "") != 5 {
		t.Fatal("unexpected allocations or operations")
	}
	findFirstMap(t, f.app, "outbox_events", `topic="course-credit.migration-completed"`)
}

// Hono: courseCreditMigrationService › migration apply replays the committed root operation without writing again
func TestMigrationApplyReplays(t *testing.T) {
	f := migrationSetup(t)
	command := f.command(t, f.plan())
	first, err := applyWithInventory(f.app, f.inventory, command)
	if err != nil {
		t.Fatal(err)
	}
	second, err := applyWithInventory(f.app, f.inventory, command)
	if err != nil {
		t.Fatal(err)
	}
	if first["replayed"] != false || second["replayed"] != true || second["operationId"] != first["operationId"] ||
		countRows(t, f.app, "credit_batches", "") != 1 {
		t.Fatalf("replay = %v", second)
	}
	other := f.plan()
	other["programs"].([]any)[0].(map[string]any)["reason"] = "另一次人工确认分类"
	_, err = applyWithInventory(f.app, f.inventory, f.command(t, other))
	migrationFailed(t, err, "IDEMPOTENCY_CONFLICT")
}

// Hono: courseCreditMigrationService › migration rejects stale previews, unexplained differences, and invalid references before writing
func TestMigrationApplyRejectsBeforeWriting(t *testing.T) {
	f := migrationSetup(t)
	stale := f.command(t, f.plan())
	stale["previewHash"] = "stale"
	_, err := applyWithInventory(f.app, f.inventory, stale)
	migrationFailed(t, err, "MIGRATION_PREVIEW_STALE")

	incomplete := f.plan()
	incomplete["teacherHours"] = []any{}
	_, err = applyWithInventory(f.app, f.inventory, f.command(t, incomplete))
	migrationFailed(t, err, "MIGRATION_UNEXPLAINED_DIFFERENCE")

	universal := testkit.Create(t, f.app, "credit_types", map[string]any{"code": "ANY", "name": "通用", "kind": "universal", "consumable": false, "referenceUnitValue": 1, "status": "active"})
	f.creditID = universal.Id
	_, err = applyWithInventory(f.app, f.inventory, f.command(t, f.plan()))
	migrationFailed(t, err, "MIGRATION_CREDIT_TYPE_INVALID")
	if countRows(t, f.app, "credit_operations", "") != 0 {
		t.Fatal("rejected migration wrote operations")
	}
}

// Hono: courseCreditMigrationService › migration storage failures retain stable codes and can race into a replay
func TestMigrationStorageFailureKeepsStableCode(t *testing.T) {
	f := migrationSetup(t)
	collection, err := f.app.FindCollectionByNameOrId("teacher_credit_events")
	if err != nil {
		t.Fatal(err)
	}
	if err := f.app.Delete(collection); err != nil {
		t.Fatal(err)
	}
	_, err = applyWithInventory(f.app, f.inventory, f.command(t, f.plan()))
	migrationFailed(t, err, "COURSE_CREDIT_BATCH_FAILED")
	if countRows(t, f.app, "credit_batches", "") != 0 {
		t.Fatal("failed migration was not atomic")
	}
}

// Hono: courseCreditMigrationService › empty production inventory produces a valid no-op migration receipt
// Hono: courseCreditMigrationRoutes › migration inventory, preview, and apply require combined academic and finance scope
func TestMigrationRoutesOnEmptyInventory(t *testing.T) {
	app := testkit.NewApp(t)
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	handler := testkit.Serve(t, app, MigrationModule{Signer: signer, Enabled: true}.Register)
	operator := opsHeaders(t, signer, "operator", false, Finance, Academic)
	inventory := ok(t, testkit.Call(t, handler, http.MethodGet, "/ops/course-credits/migration/inventory", nil, operator), "inventory")
	if availability := inventory["availability"].(map[string]any); availability["students"] != true || availability["programs"] != false {
		t.Fatalf("availability = %v", availability)
	}
	preview := ok(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/migration/preview", map[string]any{"plan": map[string]any{}}, operator), "preview")
	if preview["ready"] != true || preview["previewHash"] == "" {
		t.Fatalf("preview = %v", preview)
	}
	applied := ok(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/migration/apply",
		map[string]any{"plan": map[string]any{}, "previewHash": preview["previewHash"]}, operator), "apply")
	counts := applied["counts"].(map[string]any)
	if counts["programs"] != 0.0 || counts["sessions"] != 0.0 || counts["studentMappings"] != 0.0 || counts["teacherAdjustments"] != 0.0 {
		t.Fatalf("apply = %v", applied)
	}
	root := findFirstMap(t, app, "credit_operations", `id="`+applied["operationId"].(string)+`"`)
	if root["actorId"] != "operator" || root["actorRole"] != "teacher" || root["idempotencyKey"] != "applyCourseCreditMigration:admin-command-key" {
		t.Fatalf("root = %v", root)
	}
	if countRows(t, app, "credit_batches", "") != 0 {
		t.Fatal("no-op migration wrote batches")
	}

	financeOnly := opsHeaders(t, signer, "finance", false, Finance)
	failed(t, testkit.Call(t, handler, http.MethodGet, "/ops/course-credits/migration/inventory", nil, financeOnly), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "finance only")
}

// Hono: courseCreditMigrationRoutes › production migration apply stays closed until its dedicated flag is enabled
func TestMigrationApplyFeatureGate(t *testing.T) {
	app := testkit.NewApp(t)
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	handler := testkit.Serve(t, app, MigrationModule{Signer: signer}.Register)
	operator := opsHeaders(t, signer, "operator", false, Finance, Academic)
	ok(t, testkit.Call(t, handler, http.MethodGet, "/ops/course-credits/migration/inventory", nil, operator), "inventory")
	failed(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/migration/apply",
		map[string]any{"plan": map[string]any{}, "previewHash": "hash"}, operator), 400, "COURSE_CREDIT_FEATURE_DISABLED", "gated apply")
}

// Hono: courseCreditMigrationService › migration helper contracts cover expiry, codes, signatures, validation, and missing references
func TestMigrationServiceHelpers(t *testing.T) {
	now := "2026-08-18T00:00:00.000Z"
	if addDays(now, 1) != "2026-08-19T00:00:00.000Z" ||
		migrationExpiry(now, map[string]any{"expiryPolicy": "TERM_END", "termEnd": "2026-12-31T00:00:00Z"}, true) != "2026-12-31T00:00:00.000Z" ||
		migrationExpiry(now, map[string]any{"expiryPolicy": "NO_EXPIRY"}, true) != "" ||
		migrationExpiry(now, map[string]any{"expiryPolicy": "FIXED_DURATION", "validityDurationDays": 30.0}, false) != "" {
		t.Fatal("expiry")
	}
	if migrationSessionCode(map[string]any{"legacySessionId": "legacy id"}) != "MIG-legacy-id" ||
		migrationSessionCode(map[string]any{"legacySessionId": "id", "code": "CUSTOM"}) != "CUSTOM" {
		t.Fatal("session code")
	}
	if signature := inventorySignature(planInventory()); signature["studentHours"].([]any)[0].(map[string]any)["hours"] != 4.0 {
		t.Fatalf("signature = %v", signature)
	}
	result := migrationResult("operation", map[string]any{"previewHash": "hash",
		"report": map[string]any{"differences": []any{}, "unmapped": map[string]any{"a": []any{}, "b": []any{"x"}}},
		"plan":   map[string]any{"programs": []any{}, "sessions": []any{}, "studentHours": []any{}, "teacherHours": []any{}}})
	if result["unexplainedCount"] != 1 {
		t.Fatalf("result = %v", result)
	}
	migrationFailed(t, validateMigrationApply(map[string]any{}), "MIGRATION_PREVIEW_HASH_REQUIRED")
	migrationFailed(t, validateMigrationApply(map[string]any{"previewHash": "hash"}), "IDEMPOTENCY_KEY_REQUIRED")
	migrationFailed(t, validateMigrationApply(map[string]any{"previewHash": "hash", "idempotencyKey": "key"}), "ACTOR_ID_REQUIRED")
	f := migrationSetup(t)
	plan, err := normalizeMigrationPlan(fullMigrationPlan(map[string]string{"student": "missingstudent1", "credit": f.creditID, "class": f.classID, "teacher": f.teacherID}))
	if err != nil {
		t.Fatal(err)
	}
	if err := validateMigrationReferences(f.app, plan); err == nil {
		t.Fatal("missing student reference accepted")
	}
}
