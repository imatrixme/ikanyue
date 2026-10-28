package coursecredit

import (
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
)

// Legacy migration: Hono's CourseCreditMigrationInventoryService, migrationPlan and
// CourseCreditMigrationService. An operator maps every legacy hour, program, session
// and attendance row explicitly; apply only commits a zero-difference preview.

var legacyCollections = []struct{ name, collection string }{
	{"students", "students"}, {"teachers", "teachers"}, {"programs", "learning_programs"},
	{"sessions", "learning_sessions"}, {"lessons", "lesson_records"}, {"attendance", "attendance_records"},
}

var migrationTargets = []struct{ name, collection string }{
	{"classes", "classes"}, {"creditTypes", "credit_types"}, {"packages", "packages"},
}

var (
	migrationAttendanceStatuses = []string{"present", "late", "leave", "absent", "cancelled"}
	migrationExpiryPolicies     = []string{"FIXED_DURATION", "TERM_END", "NO_EXPIRY"}
	migrationTeacherStatuses    = []string{"planned", "confirmed", "absent", "cancelled"}
	migrationCodeUnsafe         = regexp.MustCompile(`[^A-Za-z0-9_-]`)
)

const migrationConflict = "幂等键对应了不同迁移计划"

// optionalList is a legacy source that may no longer exist.
func optionalList(app core.App, collection string) (bool, []map[string]any, error) {
	if _, err := app.FindCachedCollectionByNameOrId(collection); err != nil {
		return false, []map[string]any{}, nil
	}
	rows, err := list(app, collection, "", "created,id")
	return err == nil, rows, err
}

func migrationInventory(app core.App) (map[string]any, error) {
	availability := map[string]any{}
	data := map[string][]map[string]any{}
	for _, source := range legacyCollections {
		available, rows, err := optionalList(app, source.collection)
		if err != nil {
			return nil, err
		}
		availability[source.name], data[source.name] = available, rows
	}
	targets := map[string]any{}
	for _, target := range migrationTargets {
		_, rows, err := optionalList(app, target.collection)
		if err != nil {
			return nil, err
		}
		items := []any{}
		for _, row := range rows {
			if target.name != "creditTypes" || isConsumableCourseCredit(row) {
				items = append(items, projectTarget(row))
			}
		}
		targets[target.name] = items
	}
	studentHours, teacherHours := legacyHours(data["students"]), legacyHours(data["teachers"])
	sessions := mergeSessions(data["sessions"], data["lessons"])
	projected := func(rows []map[string]any, project func(map[string]any) map[string]any) []any {
		items := make([]any, len(rows))
		for i, row := range rows {
			items[i] = project(row)
		}
		return items
	}
	return map[string]any{
		"availability": availability,
		"attendance":   projected(data["attendance"], projectAttendance),
		"programs":     projected(data["programs"], projectProgram),
		"sessions":     projected(sessions, projectSession),
		"studentHours": studentHours,
		"targets":      targets,
		"teacherHours": teacherHours,
		"totals": map[string]any{
			"attendance": len(data["attendance"]), "programs": len(data["programs"]), "sessions": len(sessions),
			"studentHours": sumHours(studentHours), "students": len(studentHours),
			"teacherHours": sumHours(teacherHours), "teachers": len(teacherHours),
		},
	}, nil
}

func isConsumableCourseCredit(row map[string]any) bool {
	return row["kind"] == "course" && row["consumable"] == true && row["status"] != "inactive"
}

// jsText is `String(value || "")`.
func jsText(value any) string { return jsx.String(or(value, "")) }

func projectTarget(row map[string]any) map[string]any {
	return map[string]any{
		"code": jsText(row["code"]), "id": jsText(row["id"]),
		"name":   jsText(orChain(row["name"], row["title"], row["code"], row["id"], "")),
		"status": jsText(row["status"]),
	}
}

// hasLegacyHours is a present, finite, non-zero `hours` value.
func hasLegacyHours(row map[string]any) bool {
	value, ok := row["hours"]
	if !ok {
		return false
	}
	hours := jsx.Number(value)
	return jsx.IsFinite(hours) && hours != 0
}

func legacyHours(rows []map[string]any) []any {
	items := []any{}
	for _, row := range rows {
		if hasLegacyHours(row) {
			items = append(items, map[string]any{"id": row["id"], "label": recordLabel(row), "hours": jsx.Number(row["hours"])})
		}
	}
	return items
}

func projectProgram(row map[string]any) map[string]any {
	return map[string]any{"id": row["id"], "name": jsx.String(orChain(row["name"], row["title"], recordLabel(row)))}
}

func projectSession(row map[string]any) map[string]any {
	return map[string]any{
		"endAt":     jsText(orChain(row["endAt"], row["endTime"])),
		"id":        row["id"],
		"startAt":   jsText(orChain(row["startAt"], row["startTime"], row["created"])),
		"studentId": relationValue(orChain(row["studentId"], row["userId"])),
		"teacherId": relationValue(row["teacherId"]),
		"title":     jsx.String(orChain(row["title"], row["name"], "历史课堂 "+jsx.String(row["id"]))),
	}
}

func projectAttendance(row map[string]any) map[string]any {
	return map[string]any{
		"id":        row["id"],
		"sessionId": relationValue(orChain(row["sessionId"], row["lessonId"])),
		"status":    jsText(orChain(row["attendanceStatus"], row["status"])),
		"studentId": relationValue(orChain(row["studentId"], row["userId"])),
	}
}

// mergeSessions keeps first-seen order; a lesson record replaces a session with the same id.
func mergeSessions(sessions, lessons []map[string]any) []map[string]any {
	order := []string{}
	byID := map[string]map[string]any{}
	for _, row := range append(slices.Clone(sessions), lessons...) {
		id := jsx.String(row["id"])
		if _, seen := byID[id]; !seen {
			order = append(order, id)
		}
		byID[id] = row
	}
	result := make([]map[string]any, len(order))
	for i, id := range order {
		result[i] = byID[id]
	}
	return result
}

func relationValue(value any) string {
	if values, ok := value.([]any); ok {
		if len(values) == 0 {
			return ""
		}
		return jsText(values[0])
	}
	return jsText(value)
}

func recordLabel(row map[string]any) string {
	return jsx.String(orChain(row["realName"], row["realname"], row["nickName"], row["nickname"],
		row["username"], row["sn"], row["id"], "未命名"))
}

func sumHours(items []any) float64 {
	total := 0.0
	for _, item := range items {
		total += jsx.Number(item.(map[string]any)["hours"])
	}
	return total
}

// --- plan ---

func migrationArray(value any) []map[string]any {
	values, _ := value.([]any)
	items := make([]map[string]any, len(values))
	for i, value := range values {
		item, _ := value.(map[string]any)
		if item == nil {
			item = map[string]any{}
		}
		items[i] = item
	}
	return items
}

func normalizeMigrationPlan(input any) (map[string]any, error) {
	object, ok := input.(map[string]any)
	if !ok {
		return nil, Fail("MIGRATION_PLAN_REQUIRED", "迁移计划必须是对象", nil)
	}
	plan := map[string]any{}
	for _, part := range []struct {
		name, key string
		normalize func(map[string]any) (map[string]any, error)
	}{
		{"programs", "legacyProgramId", normalizeProgram}, {"sessions", "legacySessionId", normalizeMigrationSession},
		{"studentHours", "studentId", normalizeStudentHours}, {"teacherHours", "teacherId", normalizeTeacherHours},
	} {
		items := []map[string]any{}
		for _, item := range migrationArray(object[part.name]) {
			normalized, err := part.normalize(item)
			if err != nil {
				return nil, err
			}
			items = append(items, normalized)
		}
		slices.SortStableFunc(items, func(a, b map[string]any) int {
			return strings.Compare(a[part.key].(string), b[part.key].(string))
		})
		plan[part.name] = toAny(items)
	}
	return plan, nil
}

func toAny(items []map[string]any) []any {
	result := make([]any, len(items))
	for i, item := range items {
		result[i] = item
	}
	return result
}

func normalizeStudentHours(item map[string]any) (map[string]any, error) {
	studentID, err := migrationID(item["studentId"], "MIGRATION_STUDENT_ID_REQUIRED")
	if err != nil {
		return nil, err
	}
	allocations := []any{}
	for _, allocation := range migrationArray(item["allocations"]) {
		normalized, err := normalizeAllocation(allocation)
		if err != nil {
			return nil, err
		}
		allocations = append(allocations, normalized)
	}
	if len(allocations) == 0 {
		return nil, Fail("MIGRATION_ALLOCATION_REQUIRED", "每个历史学员必须至少有一条课程点映射", nil)
	}
	return map[string]any{"allocations": allocations, "studentId": studentID}, nil
}

func normalizeAllocation(allocation map[string]any) (map[string]any, error) {
	quantity := jsx.Number(jsx.Get(allocation, "quantity"))
	if !jsx.IsInteger(quantity) || quantity <= 0 {
		return nil, Fail("MIGRATION_QUANTITY_INVALID", "迁移课程点必须是正整数", nil)
	}
	mode, _ := allocation["activationMode"].(string)
	if !slices.Contains(activationModes, mode) {
		return nil, Fail("MIGRATION_ACTIVATION_INVALID", "迁移批次必须显式选择激活方式", nil)
	}
	policy, _ := allocation["expiryPolicy"].(string)
	if !slices.Contains(migrationExpiryPolicies, policy) {
		return nil, Fail("MIGRATION_EXPIRY_INVALID", "迁移批次必须显式选择有效期策略", nil)
	}
	nonNegative := func(key string) bool {
		value := jsx.Number(jsx.Get(allocation, key))
		return jsx.IsInteger(value) && value >= 0
	}
	if policy == "FIXED_DURATION" && !nonNegative("validityDurationDays") {
		return nil, Fail("MIGRATION_VALIDITY_INVALID", "固定有效期迁移批次必须填写有效天数", nil)
	}
	if mode != "GRANT_TIME" && !nonNegative("activationDeadlineDays") {
		return nil, Fail("MIGRATION_ACTIVATION_DEADLINE_INVALID", "延迟激活迁移批次必须填写激活期限", nil)
	}
	if policy == "TERM_END" {
		if _, err := migrationDate(allocation["termEnd"], "MIGRATION_TERM_END_INVALID"); err != nil {
			return nil, err
		}
	}
	creditTypeID, err := migrationID(allocation["creditTypeId"], "MIGRATION_CREDIT_TYPE_REQUIRED")
	if err != nil {
		return nil, err
	}
	reason, err := migrationReason(allocation["reason"])
	if err != nil {
		return nil, err
	}
	var termEnd any
	if jsx.Truthy(allocation["termEnd"]) {
		if termEnd, err = migrationDate(allocation["termEnd"], "MIGRATION_TERM_END_INVALID"); err != nil {
			return nil, err
		}
	}
	return map[string]any{
		"activationDeadlineDays": nullableInteger(allocation["activationDeadlineDays"]),
		"activationMode":         mode,
		"creditTypeId":           creditTypeID,
		"expiryPolicy":           policy,
		"quantity":               quantity,
		"reason":                 reason,
		"termEnd":                termEnd,
		"validityDurationDays":   nullableInteger(allocation["validityDurationDays"]),
	}, nil
}

func normalizeTeacherHours(item map[string]any) (map[string]any, error) {
	quantity := jsx.Number(jsx.Get(item, "quantity"))
	if !jsx.IsFinite(quantity) || quantity == 0 {
		return nil, Fail("MIGRATION_TEACHER_QUANTITY_INVALID", "教师调整数量必须是非零数值", nil)
	}
	reason, err := migrationReason(item["reason"])
	if err != nil {
		return nil, err
	}
	teacherID, err := migrationID(item["teacherId"], "MIGRATION_TEACHER_ID_REQUIRED")
	if err != nil {
		return nil, err
	}
	return map[string]any{"quantity": quantity, "reason": reason, "teacherId": teacherID}, nil
}

func normalizeProgram(item map[string]any) (map[string]any, error) {
	targetType, _ := item["targetType"].(string)
	if targetType != "package" && targetType != "class" {
		return nil, Fail("MIGRATION_PROGRAM_TYPE_INVALID", "历史学习项目必须人工分类为课包或班级", nil)
	}
	programID, err := migrationID(item["legacyProgramId"], "MIGRATION_PROGRAM_ID_REQUIRED")
	if err != nil {
		return nil, err
	}
	reason, err := migrationReason(item["reason"])
	if err != nil {
		return nil, err
	}
	targetID, err := migrationID(item["targetId"], "MIGRATION_PROGRAM_TARGET_REQUIRED")
	if err != nil {
		return nil, err
	}
	return map[string]any{"legacyProgramId": programID, "reason": reason, "targetId": targetID, "targetType": targetType}, nil
}

func normalizeMigrationSession(item map[string]any) (map[string]any, error) {
	startAt, err := migrationDate(item["startAt"], "MIGRATION_SESSION_START_INVALID")
	if err != nil {
		return nil, err
	}
	endAt, err := migrationDate(item["endAt"], "MIGRATION_SESSION_END_INVALID")
	if err != nil {
		return nil, err
	}
	start, _ := millis(startAt)
	if end, _ := millis(endAt); end <= start {
		return nil, Fail("MIGRATION_SESSION_END_INVALID", "历史课堂结束时间必须晚于开始时间", nil)
	}
	attendees := []any{}
	studentIDs := []string{}
	for _, entry := range migrationArray(item["attendees"]) {
		status, _ := entry["attendanceStatus"].(string)
		if !slices.Contains(migrationAttendanceStatuses, status) {
			return nil, Fail("MIGRATION_ATTENDANCE_INVALID", "历史出勤状态无效", nil)
		}
		studentID, err := migrationID(entry["studentId"], "MIGRATION_STUDENT_ID_REQUIRED")
		if err != nil {
			return nil, err
		}
		studentIDs = append(studentIDs, studentID)
		attendees = append(attendees, map[string]any{"attendanceStatus": status, "studentId": studentID})
	}
	if err := uniqueSources(studentIDs, "MIGRATION_SESSION_STUDENT_DUPLICATE"); err != nil {
		return nil, err
	}
	teachers := []any{}
	teacherKeys := []string{}
	for _, entry := range migrationArray(item["teachers"]) {
		actualStatus := jsx.String(or(entry["actualStatus"], "confirmed"))
		role := jsx.String(or(entry["role"], "lead"))
		if !slices.Contains(teacherRoles, role) {
			return nil, Fail("MIGRATION_TEACHER_ROLE_INVALID", "历史课堂教师角色无效", nil)
		}
		if !slices.Contains(migrationTeacherStatuses, actualStatus) {
			return nil, Fail("MIGRATION_TEACHER_STATUS_INVALID", "历史课堂教师状态无效", nil)
		}
		teacherID, err := migrationID(entry["teacherId"], "MIGRATION_TEACHER_ID_REQUIRED")
		if err != nil {
			return nil, err
		}
		teacherKeys = append(teacherKeys, teacherID+":"+role)
		teachers = append(teachers, map[string]any{"actualStatus": actualStatus, "role": role, "teacherId": teacherID})
	}
	if len(uniqueStrings(teacherKeys)) != len(teacherKeys) {
		return nil, Fail("MIGRATION_SESSION_TEACHER_DUPLICATE", "历史课堂教师映射重复", nil)
	}
	attendanceIDs := []any{}
	if values, ok := item["attendanceRecordIds"].([]any); ok {
		for _, value := range values {
			attendanceIDs = append(attendanceIDs, jsx.String(value))
		}
	}
	sessionID, err := migrationID(item["legacySessionId"], "MIGRATION_SESSION_ID_REQUIRED")
	if err != nil {
		return nil, err
	}
	reason, err := migrationReason(item["reason"])
	if err != nil {
		return nil, err
	}
	creditTypeID, err := migrationID(item["requiredCreditTypeId"], "MIGRATION_CREDIT_TYPE_REQUIRED")
	if err != nil {
		return nil, err
	}
	quantity := jsx.Number(jsx.Get(item, "requiredQuantity"))
	if !jsx.IsInteger(quantity) || quantity <= 0 {
		return nil, Fail("MIGRATION_SESSION_QUANTITY_INVALID", "必须是正整数", nil)
	}
	title := strings.TrimSpace(jsText(item["title"]))
	if title == "" {
		title = "历史课堂"
	}
	return map[string]any{
		"attendanceRecordIds": attendanceIDs, "attendees": attendees, "code": jsText(item["code"]), "endAt": endAt,
		"legacySessionId": sessionID, "location": jsText(item["location"]), "reason": reason,
		"requiredCreditTypeId": creditTypeID, "requiredQuantity": quantity, "startAt": startAt,
		"teachers": teachers, "title": title,
	}, nil
}

func uniqueStrings(values []string) []string {
	result := []string{}
	for _, value := range values {
		if !slices.Contains(result, value) {
			result = append(result, value)
		}
	}
	return result
}

func uniqueSources(values []string, code string) error {
	if len(uniqueStrings(values)) != len(values) {
		return Fail(code, "迁移计划包含重复来源", nil)
	}
	return nil
}

func migrationID(value any, code string) (string, error) {
	text, _ := value.(string)
	if strings.TrimSpace(text) == "" {
		return "", Fail(code, "迁移映射缺少必要编号", nil)
	}
	return strings.TrimSpace(text), nil
}

func migrationReason(value any) (string, error) {
	text, ok := value.(string)
	if !ok || jsx.Length(strings.TrimSpace(text)) < 4 {
		return "", Fail("MIGRATION_REASON_REQUIRED", "迁移映射必须填写可审计原因", nil)
	}
	return strings.TrimSpace(text), nil
}

func migrationDate(value any, code string) (string, error) {
	ms, ok := millis(value)
	if !ok {
		return "", Fail(code, "迁移日期无效", nil)
	}
	return fromMillis(ms), nil
}

func nullableInteger(value any) any {
	if absent(value) || value == "" {
		return nil
	}
	return jsx.Number(value)
}

func planItems(plan map[string]any, name string) []map[string]any {
	values := plan[name].([]any)
	items := make([]map[string]any, len(values))
	for i, value := range values {
		items[i] = value.(map[string]any)
	}
	return items
}

func itemIDs(items []any) []string {
	result := make([]string, len(items))
	for i, item := range items {
		result[i] = jsx.String(item.(map[string]any)["id"])
	}
	return result
}

// previewMigrationPlan compares an explicit plan with the inventory: quantity
// differences and every legacy source left unmapped.
func previewMigrationPlan(inventory map[string]any, input any) (map[string]any, error) {
	plan, err := normalizeMigrationPlan(input)
	if err != nil {
		return nil, err
	}
	studentPlan, teacherPlan := planItems(plan, "studentHours"), planItems(plan, "teacherHours")
	programPlan, sessionPlan := planItems(plan, "programs"), planItems(plan, "sessions")
	keys := func(items []map[string]any, key string) []string {
		result := make([]string, len(items))
		for i, item := range items {
			result[i] = item[key].(string)
		}
		return result
	}
	for _, check := range []struct {
		values []string
		code   string
	}{
		{keys(studentPlan, "studentId"), "MIGRATION_STUDENT_DUPLICATE"}, {keys(teacherPlan, "teacherId"), "MIGRATION_TEACHER_DUPLICATE"},
		{keys(programPlan, "legacyProgramId"), "MIGRATION_PROGRAM_DUPLICATE"}, {keys(sessionPlan, "legacySessionId"), "MIGRATION_SESSION_DUPLICATE"},
	} {
		if err := uniqueSources(check.values, check.code); err != nil {
			return nil, err
		}
	}
	hoursByID := func(name string) map[string]float64 {
		result := map[string]float64{}
		for _, item := range inventory[name].([]any) {
			row := item.(map[string]any)
			result[jsx.String(row["id"])] = jsx.Number(row["hours"])
		}
		return result
	}
	studentHours, teacherHours := hoursByID("studentHours"), hoursByID("teacherHours")
	differences := []any{}
	difference := func(id string, source, mapped float64, kind string) map[string]any {
		return map[string]any{"sourceId": id, "sourceQuantity": source, "mappedQuantity": mapped, "difference": mapped - source, "type": kind}
	}
	mappedStudentHours := 0.0
	for _, mapping := range studentPlan {
		id := mapping["studentId"].(string)
		source, known := studentHours[id]
		if !known {
			return nil, Fail("MIGRATION_STUDENT_UNKNOWN", "历史学员不在盘点结果中", map[string]any{"studentId": id})
		}
		mapped := 0.0
		for _, allocation := range mapping["allocations"].([]any) {
			mapped += allocation.(map[string]any)["quantity"].(float64)
		}
		mappedStudentHours += mapped
		if mapped != source {
			differences = append(differences, difference(id, source, mapped, "student_hours"))
		}
	}
	mappedTeacherHours := 0.0
	for _, mapping := range teacherPlan {
		id := mapping["teacherId"].(string)
		source, known := teacherHours[id]
		if !known {
			return nil, Fail("MIGRATION_TEACHER_UNKNOWN", "历史教师不在盘点结果中", map[string]any{"teacherId": id})
		}
		quantity := mapping["quantity"].(float64)
		mappedTeacherHours += quantity
		if quantity != source {
			differences = append(differences, difference(id, source, quantity, "teacher_hours"))
		}
	}
	known := func(items []map[string]any, key, inventoryName, code string) error {
		ids := itemIDs(inventory[inventoryName].([]any))
		for _, item := range items {
			if !slices.Contains(ids, item[key].(string)) {
				return Fail(code, "迁移来源不在盘点结果中", map[string]any{"sourceId": item[key]})
			}
		}
		return nil
	}
	if err := known(programPlan, "legacyProgramId", "programs", "MIGRATION_PROGRAM_UNKNOWN"); err != nil {
		return nil, err
	}
	if err := known(sessionPlan, "legacySessionId", "sessions", "MIGRATION_SESSION_UNKNOWN"); err != nil {
		return nil, err
	}
	attendanceIDs := itemIDs(inventory["attendance"].([]any))
	mappedAttendance := []string{}
	for _, mapping := range sessionPlan {
		for _, id := range mapping["attendanceRecordIds"].([]any) {
			mappedAttendance = append(mappedAttendance, id.(string))
		}
	}
	if len(uniqueStrings(mappedAttendance)) != len(mappedAttendance) {
		return nil, Fail("MIGRATION_ATTENDANCE_DUPLICATE", "同一历史出勤记录不能重复映射", nil)
	}
	for _, id := range mappedAttendance {
		if !slices.Contains(attendanceIDs, id) {
			return nil, Fail("MIGRATION_ATTENDANCE_UNKNOWN", "历史出勤记录不在盘点结果中", map[string]any{"sourceId": id})
		}
	}
	unmappedOf := func(inventoryName string, mapped []string) []any {
		result := []any{}
		for _, id := range itemIDs(inventory[inventoryName].([]any)) {
			if !slices.Contains(mapped, id) {
				result = append(result, id)
			}
		}
		return result
	}
	unmapped := map[string]any{
		"attendance":   unmappedOf("attendance", mappedAttendance),
		"programs":     unmappedOf("programs", keys(programPlan, "legacyProgramId")),
		"sessions":     unmappedOf("sessions", keys(sessionPlan, "legacySessionId")),
		"studentHours": unmappedOf("studentHours", keys(studentPlan, "studentId")),
		"teacherHours": unmappedOf("teacherHours", keys(teacherPlan, "teacherId")),
	}
	ready := len(differences) == 0
	for _, items := range unmapped {
		ready = ready && len(items.([]any)) == 0
	}
	return map[string]any{
		"plan":  plan,
		"ready": ready,
		"report": map[string]any{
			"differences": differences,
			"mapped": map[string]any{
				"attendance": len(mappedAttendance), "programs": len(programPlan), "sessions": len(sessionPlan),
				"studentHours": mappedStudentHours, "teacherHours": mappedTeacherHours,
			},
			"source":   inventory["totals"],
			"unmapped": unmapped,
		},
	}, nil
}

// --- service ---

func previewMigration(app core.App, input map[string]any) (map[string]any, error) {
	inventory, err := migrationInventory(app)
	if err != nil {
		return nil, err
	}
	return previewWithInventory(inventory, orChain(input["plan"], input))
}

func previewWithInventory(inventory map[string]any, plan any) (map[string]any, error) {
	preview, err := previewMigrationPlan(inventory, plan)
	if err != nil {
		return nil, err
	}
	preview["previewHash"] = fingerprint(map[string]any{"inventory": inventorySignature(inventory), "plan": preview["plan"]})
	return preview, nil
}

// inventorySignature is what a preview hash pins: ids, hours, target statuses and totals.
func inventorySignature(inventory map[string]any) map[string]any {
	pick := func(name string, fields ...string) []any {
		items := []any{}
		for _, item := range inventory[name].([]any) {
			row := item.(map[string]any)
			picked := map[string]any{}
			for _, field := range fields {
				picked[field] = row[field]
			}
			items = append(items, picked)
		}
		return items
	}
	ids := func(name string) []any {
		result := []any{}
		for _, id := range itemIDs(inventory[name].([]any)) {
			result = append(result, id)
		}
		return result
	}
	targets := map[string]any{}
	if source, ok := inventory["targets"].(map[string]any); ok {
		for name, items := range source {
			picked := []any{}
			for _, item := range items.([]any) {
				row := item.(map[string]any)
				picked = append(picked, map[string]any{"id": row["id"], "status": row["status"]})
			}
			targets[name] = picked
		}
	}
	return map[string]any{
		"availability": inventory["availability"], "attendanceIds": ids("attendance"), "programIds": ids("programs"),
		"sessionIds": ids("sessions"), "studentHours": pick("studentHours", "id", "hours"), "targets": targets,
		"teacherHours": pick("teacherHours", "id", "hours"), "totals": inventory["totals"],
	}
}

func applyMigration(app core.App, input map[string]any) (map[string]any, error) {
	inventory, err := migrationInventory(app)
	if err != nil {
		return nil, err
	}
	return applyWithInventory(app, inventory, input)
}

func applyWithInventory(app core.App, inventory map[string]any, input map[string]any) (map[string]any, error) {
	if err := validateMigrationApply(input); err != nil {
		return nil, err
	}
	preview, err := previewWithInventory(inventory, orChain(input["plan"], map[string]any{}))
	if err != nil {
		return nil, err
	}
	if preview["previewHash"] != input["previewHash"] {
		return nil, Fail("MIGRATION_PREVIEW_STALE", "迁移预览已变化，请重新预览后再提交", nil)
	}
	report := preview["report"].(map[string]any)
	if preview["ready"] != true {
		return nil, Fail("MIGRATION_UNEXPLAINED_DIFFERENCE", "迁移仍有未解释差异", report)
	}
	scopedKey, err := scopedIdempotencyKey("applyCourseCreditMigration", input["idempotencyKey"])
	if err != nil {
		return nil, err
	}
	plan := preview["plan"].(map[string]any)
	requestHash := fingerprint(map[string]any{"plan": plan, "previewHash": preview["previewHash"]})
	if replayed, err := replay(app, scopedKey, requestHash, migrationConflict); err != nil || replayed != nil {
		return replayed, err
	}
	if err := validateMigrationReferences(app, plan); err != nil {
		return nil, err
	}

	run := migrationRun{at: iso(clock()), input: input, requestHash: requestHash, rootOperationID: ids.Record(), scopedKey: scopedKey}
	run.result = migrationResult(run.rootOperationID, preview)
	steps := []step{run.rootOperation(report)}
	for _, mapping := range planItems(plan, "studentHours") {
		steps = append(steps, run.studentMigration(mapping)...)
	}
	for _, mapping := range planItems(plan, "teacherHours") {
		steps = append(steps, run.teacherMigration(mapping)...)
	}
	for _, mapping := range planItems(plan, "programs") {
		steps = append(steps, run.operation(ids.Record(), "legacy_learning_program", mapping["legacyProgramId"].(string), "",
			map[string]any{"targetId": mapping["targetId"], "targetType": mapping["targetType"]}))
	}
	for _, mapping := range planItems(plan, "sessions") {
		steps = append(steps, run.sessionMigration(mapping)...)
	}
	steps = append(steps, outbox("course-credit.migration-completed", "migration_run", run.rootOperationID, run.result))
	return commitOrReplay(app, steps, scopedKey, requestHash, migrationConflict, "COURSE_CREDIT_BATCH_FAILED", run.result)
}

func validateMigrationApply(input map[string]any) error {
	if hash, _ := input["previewHash"].(string); hash == "" {
		return Fail("MIGRATION_PREVIEW_HASH_REQUIRED", "提交迁移前必须提供预览哈希", nil)
	}
	if key, _ := input["idempotencyKey"].(string); strings.TrimSpace(key) == "" {
		return Fail("IDEMPOTENCY_KEY_REQUIRED", "提交迁移必须提供幂等键", nil)
	}
	if actor, _ := input["actorId"].(string); actor == "" {
		return Fail("ACTOR_ID_REQUIRED", "提交迁移必须识别操作人", nil)
	}
	return nil
}

func validateMigrationReferences(app core.App, plan map[string]any) error {
	students, teachers, creditTypes := []string{}, []string{}, []string{}
	for _, mapping := range planItems(plan, "studentHours") {
		students = append(students, mapping["studentId"].(string))
		for _, allocation := range mapping["allocations"].([]any) {
			creditTypes = append(creditTypes, allocation.(map[string]any)["creditTypeId"].(string))
		}
	}
	for _, mapping := range planItems(plan, "teacherHours") {
		teachers = append(teachers, mapping["teacherId"].(string))
	}
	for _, mapping := range planItems(plan, "sessions") {
		for _, attendee := range mapping["attendees"].([]any) {
			students = append(students, attendee.(map[string]any)["studentId"].(string))
		}
		for _, teacher := range mapping["teachers"].([]any) {
			teachers = append(teachers, teacher.(map[string]any)["teacherId"].(string))
		}
		creditTypes = append(creditTypes, mapping["requiredCreditTypeId"].(string))
	}
	for _, group := range []struct {
		collection string
		ids        []string
	}{{"students", students}, {"teachers", teachers}} {
		for _, id := range uniqueStrings(group.ids) {
			if _, err := get(app, group.collection, id); err != nil {
				return err
			}
		}
	}
	for _, id := range uniqueStrings(creditTypes) {
		creditType, err := get(app, "credit_types", id)
		if err != nil {
			return err
		}
		if creditType["kind"] != "course" || creditType["consumable"] != true {
			return Fail("MIGRATION_CREDIT_TYPE_INVALID", "历史课时只能映射到可消费的特定课程点", nil)
		}
	}
	for _, mapping := range planItems(plan, "programs") {
		collection := "classes"
		if mapping["targetType"] == "package" {
			collection = "packages"
		}
		if _, err := get(app, collection, mapping["targetId"].(string)); err != nil {
			return err
		}
	}
	return nil
}

func migrationResult(operationID string, preview map[string]any) map[string]any {
	plan := preview["plan"].(map[string]any)
	report := preview["report"].(map[string]any)
	unexplained := 0
	for _, items := range report["unmapped"].(map[string]any) {
		unexplained += len(items.([]any))
	}
	return map[string]any{
		"counts": map[string]any{
			"programs": len(plan["programs"].([]any)), "sessions": len(plan["sessions"].([]any)),
			"studentMappings": len(plan["studentHours"].([]any)), "teacherAdjustments": len(plan["teacherHours"].([]any)),
		},
		"differenceCount":  len(report["differences"].([]any)),
		"operationId":      operationID,
		"previewHash":      preview["previewHash"],
		"unexplainedCount": unexplained,
	}
}

type migrationRun struct {
	at, requestHash, rootOperationID, scopedKey string
	input, result                               map[string]any
}

func (r migrationRun) actorRole() any { return or(r.input["actorRole"], "admin") }

func (r migrationRun) rootOperation(report map[string]any) step {
	data := map[string]any{
		"id": r.rootOperationID, "operationNo": operationNo("migration", r.time(), r.rootOperationID),
		"studentId": "", "type": "adjust", "status": "committed", "idempotencyKey": r.scopedKey,
		"sourceType": "legacy_migration_run", "sourceId": r.result["previewHash"],
		"requestSnapshot": map[string]any{"requestHash": r.requestHash, "previewHash": r.result["previewHash"]},
		"resultSnapshot":  r.result, "actorId": r.input["actorId"], "actorRole": r.actorRole(), "traceId": or(r.input["traceId"], ""),
	}
	for key, value := range operationAudit("legacy_migration_run", report["source"], r.result) {
		data[key] = value
	}
	return create("credit_operations", data)
}

func (r migrationRun) time() time.Time {
	ms, _ := millis(r.at)
	return time.UnixMilli(ms)
}

// operation is one mapped source's own adjust operation under the run.
func (r migrationRun) operation(operationID, sourceType, sourceID, studentID string, result map[string]any) step {
	data := map[string]any{
		"id": operationID, "operationNo": operationNo("adjust", r.time(), operationID), "studentId": studentID,
		"type": "adjust", "status": "committed", "idempotencyKey": r.scopedKey + ":" + sourceType + ":" + sourceID,
		"sourceType": sourceType, "sourceId": sourceID,
		"requestSnapshot": map[string]any{"migrationRunId": r.rootOperationID, "requestHash": r.requestHash},
		"resultSnapshot":  result, "actorId": r.input["actorId"], "actorRole": r.actorRole(), "traceId": or(r.input["traceId"], ""),
	}
	for key, value := range operationAudit("legacy_migration", map[string]any{"sourceId": sourceID}, result) {
		data[key] = value
	}
	return create("credit_operations", data)
}

func (r migrationRun) studentMigration(mapping map[string]any) []step {
	operationID := ids.Record()
	studentID := mapping["studentId"].(string)
	allocations := mapping["allocations"].([]any)
	steps := []step{r.operation(operationID, "legacy_student_hours", studentID, studentID,
		map[string]any{"batchCount": len(allocations), "studentId": studentID})}
	for _, value := range allocations {
		allocation := value.(map[string]any)
		active := allocation["activationMode"] == "GRANT_TIME"
		batchID := ids.Record()
		expiresAt := migrationExpiry(r.at, allocation, active)
		status, activationDeadline, activatedAt := "active", "", r.at
		if !active {
			status, activationDeadline, activatedAt = "unactivated", addDays(r.at, jsx.Number(allocation["activationDeadlineDays"])), ""
		}
		snapshot := copyMap(allocation)
		snapshot["sourceType"] = "legacy_student_hours"
		batch := map[string]any{
			"id": batchID, "studentId": studentID, "creditTypeId": allocation["creditTypeId"], "sourceOperationId": operationID,
			"originalQuantity": allocation["quantity"], "availableQuantity": allocation["quantity"], "frozenQuantity": 0,
			"consumedQuantity": 0, "expiredQuantity": 0, "reversedQuantity": 0, "status": status, "validFrom": r.at,
			"originalExpiresAt": expiresAt, "effectiveExpiresAt": expiresAt, "activationMode": allocation["activationMode"],
			"expiryPolicy": allocation["expiryPolicy"], "activationDeadline": activationDeadline, "activatedAt": activatedAt,
			"validityDurationDays": or(allocation["validityDurationDays"], 0), "grantSnapshot": snapshot,
			"listUnitValue": 0, "paidUnitCost": 0, "currency": "CNY", "priority": 0, "version": 1,
		}
		steps = append(steps, create("credit_batches", batch), create("credit_events", map[string]any{
			"id": ids.Record(), "operationId": operationID, "batchId": batchID, "studentId": studentID,
			"creditTypeId": allocation["creditTypeId"], "eventType": "ADJUST", "quantityDelta": allocation["quantity"],
			"bucketFrom": "", "bucketTo": "availableQuantity", "balanceSnapshot": balanceSnapshot(batch),
			"businessTime": r.at, "actorId": r.input["actorId"], "reason": allocation["reason"],
			"metadata": map[string]any{"sourceType": "legacy_student_hours"},
		}))
	}
	return steps
}

func (r migrationRun) teacherMigration(mapping map[string]any) []step {
	operationID := ids.Record()
	teacherID := mapping["teacherId"].(string)
	return []step{
		r.operation(operationID, "legacy_teacher_hours", teacherID, "", map[string]any{"quantity": mapping["quantity"], "teacherId": teacherID}),
		create("teacher_credit_events", map[string]any{
			"id": ids.Record(), "sessionTeacherId": "", "teacherId": teacherID, "ruleId": "", "eventType": "adjust",
			"quantityDelta": mapping["quantity"], "status": "confirmed", "operationId": operationID,
			"confirmationOfEventId": "", "reversalOfEventId": "", "reason": mapping["reason"],
		}),
	}
}

func (r migrationRun) sessionMigration(mapping map[string]any) []step {
	operationID, sessionID := ids.Record(), ids.Record()
	attendees, teachers := mapping["attendees"].([]any), mapping["teachers"].([]any)
	steps := []step{
		r.operation(operationID, "legacy_session", mapping["legacySessionId"].(string), "",
			map[string]any{"attendeeCount": len(attendees), "sessionId": sessionID, "teacherCount": len(teachers)}),
		create("sessions", map[string]any{
			"id": sessionID, "code": migrationSessionCode(mapping), "title": mapping["title"], "status": "completed",
			"startAt": mapping["startAt"], "endAt": mapping["endAt"], "location": mapping["location"],
			"requiredCreditTypeId": mapping["requiredCreditTypeId"], "requiredQuantity": mapping["requiredQuantity"],
			"attendanceRuleSnapshot": map[string]any{"version": 1, "present": "consume", "late": "consume", "leave": "release", "absent": "consume", "cancelled": "release"},
			"settlementRuleSnapshot": map[string]any{"version": 1, "cancelled": "release"},
			"teacherRuleSnapshot":    map[string]any{"version": 1, "source": "historical_import_no_credit"},
			"rosterVersion":          1, "version": 1, "settlementOperationId": "", "correctionBaseStatus": "", "originType": "migration",
		}),
	}
	for _, value := range attendees {
		attendee := value.(map[string]any)
		checkedInAt := ""
		if attendee["attendanceStatus"] == "present" || attendee["attendanceStatus"] == "late" {
			checkedInAt = mapping["startAt"].(string)
		}
		steps = append(steps, create("session_students", map[string]any{
			"id": ids.Record(), "sessionId": sessionID, "studentId": attendee["studentId"], "sourceClassIds": []any{},
			"attendanceStatus": attendee["attendanceStatus"], "creditStatus": "not_charged",
			"eligibilityReason": "historical_import_no_charge", "checkedInAt": checkedInAt, "settledAt": "", "version": 1,
		}))
	}
	for _, value := range teachers {
		teacher := value.(map[string]any)
		steps = append(steps, create("session_teachers", map[string]any{
			"id": ids.Record(), "sessionId": sessionID, "teacherId": teacher["teacherId"], "role": teacher["role"],
			"assignmentSource": "session_override", "actualStatus": teacher["actualStatus"], "creditStatus": "not_eligible",
		}))
	}
	return steps
}

func migrationExpiry(at string, allocation map[string]any, active bool) string {
	switch {
	case allocation["expiryPolicy"] == "TERM_END":
		value, _ := migrationDate(allocation["termEnd"], "")
		return value
	case allocation["expiryPolicy"] == "FIXED_DURATION" && active:
		return addDays(at, jsx.Number(or(allocation["validityDurationDays"], 0.0)))
	}
	return ""
}

func migrationSessionCode(mapping map[string]any) string {
	fallback := migrationCodeUnsafe.ReplaceAllString("MIG-"+jsx.String(mapping["legacySessionId"]), "-")
	return jsx.Slice(jsx.String(or(mapping["code"], fallback)), 120)
}
