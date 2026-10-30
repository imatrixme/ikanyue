package coursecredit

import (
	"bytes"
	"encoding/json"
	"math"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"golang.org/x/text/collate"
	"golang.org/x/text/language"

	"kanyue.server/internal/jsx"
	"kanyue.server/internal/records"
)

// Hono's StudentLearningService: the student-facing course, lesson and record
// views. They speak in lessons, never in credits, batches or operations, and
// every response passes assertLearning before it leaves.

const (
	upcomingLessonLimit = 3
	relationChunkSize   = 40
	recentRecordLimit   = 3
	expiryWarningDays   = 30
	learningNoticeText  = "当前课时安排需要教务老师处理，请联系教学管理。"
)

var lessonScopes = []string{"all", "upcoming", "completed"}

// object is a JSON object that keeps insertion order, so contract violations
// are found in the same order as Hono's Object.entries walk.
type object []field

type field struct {
	key   string
	value any
}

func (o object) MarshalJSON() ([]byte, error) {
	var buffer bytes.Buffer
	buffer.WriteByte('{')
	for i, item := range o {
		if i > 0 {
			buffer.WriteByte(',')
		}
		key, err := json.Marshal(item.key)
		if err != nil {
			return nil, err
		}
		value, err := json.Marshal(item.value)
		if err != nil {
			return nil, err
		}
		buffer.Write(key)
		buffer.WriteByte(':')
		buffer.Write(value)
	}
	buffer.WriteByte('}')
	return buffer.Bytes(), nil
}

func (o object) get(key string) any {
	for _, item := range o {
		if item.key == key {
			return item.value
		}
	}
	return nil
}

func (o object) set(key string, value any) object {
	for i, item := range o {
		if item.key == key {
			o[i].value = value
			return o
		}
	}
	return append(o, field{key, value})
}

var forbiddenLearningKeys = []string{
	"batchid", "bucketfrom", "bucketto", "credittypeid", "conversionrule", "conversionrules", "eventtype",
	"frozenquantity", "idempotencykey", "metadata", "operationid", "operationno", "sourceoperationid",
}

var forbiddenLearningTerms = []string{
	"课程点", "批次", "冻结", "兑换规则", "操作号", "冲正", "结算账本",
	"course credit", "credit type", "conversion rule", "operation number", "settlement ledger",
}

var studentTermReplacements = strings.NewReplacer(
	"课程点", "课时", "批次", "来源", "冻结", "已安排", "兑换规则", "课程安排",
	"操作号", "记录编号", "冲正", "更正", "结算账本", "上课记录",
)

// sanitizeStudentText swaps internal terms for student wording; non-strings become "".
func sanitizeStudentText(value any) string {
	text, _ := value.(string)
	return studentTermReplacements.Replace(text)
}

// assertLearning is assertStudentLearningProjection.
func assertLearning(value any, path string) error {
	switch v := value.(type) {
	case []any:
		for i, item := range v {
			if err := assertLearning(item, path+"["+strconv.Itoa(i)+"]"); err != nil {
				return err
			}
		}
	case object:
		for _, item := range v {
			if slices.Contains(forbiddenLearningKeys, strings.ToLower(item.key)) {
				return Fail("STUDENT_LEARNING_CONTRACT_VIOLATION", "学习信息包含内部字段",
					map[string]any{"path": path + "." + item.key})
			}
			if err := assertLearning(item.value, path+"."+item.key); err != nil {
				return err
			}
		}
	case string:
		lower := strings.ToLower(v)
		for _, term := range forbiddenLearningTerms {
			if strings.Contains(lower, strings.ToLower(term)) {
				return Fail("STUDENT_LEARNING_CONTRACT_VIOLATION", "学习信息包含内部术语",
					map[string]any{"path": path, "term": term})
			}
		}
	}
	return nil
}

func checked(value any) (any, error) {
	if err := assertLearning(value, "data"); err != nil {
		return nil, err
	}
	return value, nil
}

func requiredLearningID(value, code, message string) error {
	if value == "" {
		return Fail(code, message, nil)
	}
	return nil
}

type learning struct {
	app core.App
	now time.Time
}

func (l learning) courseBatches(studentID string) ([]map[string]any, error) {
	return list(l.app, "credit_batches",
		`studentId="`+records.EscapeFilter(studentID)+`" && status!="cancelled" && creditTypeId.kind="course"`,
		"effectiveExpiresAt,priority,created", "creditTypeId", "creditTypeId.courseSpecId")
}

var lessonExpand = []string{"sessionId", "sessionId.requiredCreditTypeId", "sessionId.requiredCreditTypeId.courseSpecId"}

func lessonFilter(studentID, courseID, scope string, now time.Time) string {
	parts := []string{`studentId="` + records.EscapeFilter(studentID) + `"`}
	if courseID != "" {
		parts = append(parts, `sessionId.requiredCreditTypeId.courseSpecId="`+records.EscapeFilter(courseID)+`"`)
	}
	switch scope {
	case "upcoming":
		parts = append(parts, `sessionId.startAt>="`+filterTime(iso(now))+`"`, `sessionId.status!="cancelled"`)
	case "completed":
		parts = append(parts, `(sessionId.status="completed" || sessionId.status="settled")`)
	}
	return strings.Join(parts, " && ")
}

func recordFilter(studentID, courseID string) string {
	filter := `studentId="` + records.EscapeFilter(studentID) + `"`
	if courseID != "" {
		filter += ` && creditTypeId.courseSpecId="` + records.EscapeFilter(courseID) + `"`
	}
	return filter
}

var recordExpand = []string{"creditTypeId", "creditTypeId.courseSpecId"}

// sources loads what overview and course share: batches, roster and the latest records.
func (l learning) sources(studentID string) ([]map[string]any, []map[string]any, page, error) {
	batches, err := l.courseBatches(studentID)
	if err != nil {
		return nil, nil, page{}, err
	}
	roster, err := list(l.app, "session_students", lessonFilter(studentID, "", "", l.now), "sessionId.startAt", lessonExpand...)
	if err != nil {
		return nil, nil, page{}, err
	}
	latest, err := pageOf(l.app, "credit_events", recordFilter(studentID, ""), "-businessTime,-created", 1, recentRecordLimit, recordExpand...)
	if err != nil {
		return nil, nil, page{}, err
	}
	return batches, roster, latest, nil
}

func (l learning) overview(studentID string) (any, error) {
	if err := requiredLearningID(studentID, "STUDENT_ID_REQUIRED", "学员编号不能为空"); err != nil {
		return nil, err
	}
	batches, roster, latest, err := l.sources(studentID)
	if err != nil {
		return nil, err
	}
	courses := buildCourseSummaries(batches, l.now)
	contexts, err := loadLessonContexts(l.app, roster)
	if err != nil {
		return nil, err
	}
	upcoming := []object{}
	for _, record := range roster {
		lesson := mapLesson(record, contexts[sessionIDOf(record)])
		if isUpcomingLesson(lesson, l.now) {
			upcoming = append(upcoming, lesson)
		}
	}
	slices.SortStableFunc(upcoming, compareLessonStart)
	upcoming = upcoming[:min(len(upcoming), upcomingLessonLimit)]
	var next any
	if len(upcoming) > 0 {
		next = upcoming[0]
	}
	return checked(object{
		{"nextLesson", next},
		{"upcomingLessons", anySlice(upcoming)},
		{"courses", anySlice(courses)},
		{"warnings", buildLearningWarnings(roster, contexts)},
		{"recentRecords", mapRecords(latest.Items)},
	})
}

func (l learning) course(studentID, courseID string) (any, error) {
	if err := requiredLearningID(studentID, "STUDENT_ID_REQUIRED", "学员编号不能为空"); err != nil {
		return nil, err
	}
	if err := requiredLearningID(courseID, "LEARNING_COURSE_ID_REQUIRED", "课程编号不能为空"); err != nil {
		return nil, err
	}
	batches, roster, latest, err := l.sources(studentID)
	if err != nil {
		return nil, err
	}
	contexts, err := loadLessonContexts(l.app, roster)
	if err != nil {
		return nil, err
	}
	var course object
	for _, item := range buildCourseSummaries(batches, l.now) {
		if item.get("courseId") == courseID {
			course = item
			break
		}
	}
	if course == nil {
		return nil, Fail("LEARNING_COURSE_NOT_FOUND", "未找到这门课程", nil)
	}
	sources := []any{}
	for _, batch := range batches {
		if courseIdentity(batch) == courseID {
			sources = append(sources, mapCourseSource(batch))
		}
	}
	lessons := []any{}
	for _, record := range roster {
		lesson := mapLesson(record, contexts[sessionIDOf(record)])
		if len(lessons) < 5 && lesson.get("course").(object).get("courseId") == courseID {
			lessons = append(lessons, lesson)
		}
	}
	recent := []any{}
	for _, item := range mapRecords(latest.Items) {
		if item.(object).get("course").(object).get("courseId") == courseID {
			recent = append(recent, item)
		}
	}
	result := append(object{}, course...)
	result = append(result, field{"sources", sources}, field{"recentLessons", lessons}, field{"recentRecords", recent})
	return checked(result)
}

func (l learning) lessons(studentID string, query map[string]string) (any, error) {
	if err := requiredLearningID(studentID, "STUDENT_ID_REQUIRED", "学员编号不能为空"); err != nil {
		return nil, err
	}
	pageNumber, perPage, err := pagination(query)
	if err != nil {
		return nil, err
	}
	scope := query["scope"]
	if scope == "" {
		scope = "all"
	}
	if !slices.Contains(lessonScopes, scope) {
		return nil, Fail("LEARNING_LESSON_SCOPE_INVALID", "课程日程筛选无效", nil)
	}
	result, err := pageOf(l.app, "session_students", lessonFilter(studentID, query["courseId"], scope, l.now),
		"sessionId.startAt", pageNumber, perPage, lessonExpand...)
	if err != nil {
		return nil, err
	}
	contexts, err := loadLessonContexts(l.app, result.Items)
	if err != nil {
		return nil, err
	}
	items := make([]any, len(result.Items))
	for i, record := range result.Items {
		items[i] = mapLesson(record, contexts[sessionIDOf(record)])
	}
	return checked(learningPage(result, items))
}

func (l learning) lesson(studentID, lessonID string) (any, error) {
	if err := requiredLearningID(studentID, "STUDENT_ID_REQUIRED", "学员编号不能为空"); err != nil {
		return nil, err
	}
	if err := requiredLearningID(lessonID, "LEARNING_LESSON_ID_REQUIRED", "课堂编号不能为空"); err != nil {
		return nil, err
	}
	record, err := findFirst(l.app, "session_students",
		`studentId="`+records.EscapeFilter(studentID)+`" && sessionId="`+records.EscapeFilter(lessonID)+`"`, lessonExpand...)
	if err != nil {
		return nil, err
	}
	if record == nil {
		return nil, Fail("LEARNING_LESSON_NOT_FOUND", "未找到这节课", nil)
	}
	contexts, err := loadLessonContexts(l.app, []map[string]any{record})
	if err != nil {
		return nil, err
	}
	return checked(mapLesson(record, contexts[sessionIDOf(record)]))
}

func (l learning) records(studentID string, query map[string]string) (any, error) {
	if err := requiredLearningID(studentID, "STUDENT_ID_REQUIRED", "学员编号不能为空"); err != nil {
		return nil, err
	}
	pageNumber, perPage, err := pagination(query)
	if err != nil {
		return nil, err
	}
	result, err := pageOf(l.app, "credit_events", recordFilter(studentID, query["courseId"]),
		"-businessTime,-created", pageNumber, perPage, recordExpand...)
	if err != nil {
		return nil, err
	}
	return checked(learningPage(result, mapRecords(result.Items)))
}

// learningPage is Hono's mapPage over already mapped items.
func learningPage(result page, items []any) object {
	return object{
		{"page", result.Page}, {"perPage", result.PerPage},
		{"totalItems", result.TotalItems}, {"totalPages", result.TotalPages}, {"items", items},
	}
}

func anySlice(items []object) []any {
	result := make([]any, len(items))
	for i, item := range items {
		result[i] = item
	}
	return result
}

func mapRecords(events []map[string]any) []any {
	result := make([]any, len(events))
	for i, event := range events {
		result[i] = mapLessonRecord(event)
	}
	return result
}

// courseCollator stands in for String.prototype.localeCompare (ICU root order).
var courseCollator = collate.New(language.Und)

func buildCourseSummaries(batches []map[string]any, now time.Time) []object {
	nowMs := now.UnixMilli()
	warningAt := nowMs + expiryWarningDays*int64(dayMillis)
	order := []string{}
	courses := map[string]object{}
	for _, batch := range batches {
		courseID := courseIdentity(batch)
		if courseID == "" {
			continue
		}
		course, ok := courses[courseID]
		if !ok {
			course = emptyCourse(batch, courseID)
			order = append(order, courseID)
		}
		add := func(key string, value any) {
			course = course.set(key, course.get(key).(float64)+quantity(value))
		}
		add("remainingLessons", batch["availableQuantity"])
		add("scheduledLessons", batch["frozenQuantity"])
		add("completedLessons", batch["consumedQuantity"])
		add("expiredLessons", batch["expiredQuantity"])
		if batch["status"] == "pending" || batch["status"] == "unactivated" {
			course = course.set("awaitingActivation", true)
		}
		if expiry, ok := millis(or(batch["effectiveExpiresAt"], "")); ok && expiry > nowMs {
			current, hasCurrent := millis(or(course.get("validUntil"), ""))
			if !hasCurrent || expiry < current {
				course = course.set("validUntil", fromMillis(expiry))
			}
			if expiry <= warningAt {
				course = course.set("expiringSoon", true)
			}
		}
		courses[courseID] = course
	}
	result := make([]object, len(order))
	for i, courseID := range order {
		result[i] = courses[courseID]
	}
	slices.SortStableFunc(result, func(left, right object) int {
		return courseCollator.CompareString(left.get("courseName").(string), right.get("courseName").(string))
	})
	return result
}

func emptyCourse(batch map[string]any, courseID string) object {
	creditType := expanded(batch, "creditTypeId")
	spec := expanded(creditType, "courseSpecId")
	return object{
		{"courseId", courseID},
		{"courseName", sanitizeStudentText(or(or(spec["name"], creditType["name"]), "课程"))},
		{"deliveryMode", or(spec["deliveryMode"], "")},
		{"durationMinutes", quantity(spec["durationMinutes"])},
		{"remainingLessons", 0.0},
		{"scheduledLessons", 0.0},
		{"completedLessons", 0.0},
		{"expiredLessons", 0.0},
		{"awaitingActivation", false},
		{"validUntil", nil},
		{"expiringSoon", false},
	}
}

func mapCourseSource(batch map[string]any) object {
	return object{
		{"grantedAt", or(batch["created"], nil)},
		{"initialLessons", quantity(batch["originalQuantity"])},
		{"remainingLessons", quantity(batch["availableQuantity"])},
		{"scheduledLessons", quantity(batch["frozenQuantity"])},
		{"completedLessons", quantity(batch["consumedQuantity"])},
		{"validFrom", or(batch["validFrom"], nil)},
		{"validUntil", or(batch["effectiveExpiresAt"], nil)},
		{"status", lookup(sourceStatuses, batch["status"], "pending")},
	}
}

// lessonContext holds a session's teacher and class rows.
type lessonContext struct {
	teachers, classes []map[string]any
}

func mapLesson(record map[string]any, context *lessonContext) object {
	if context == nil {
		context = &lessonContext{}
	}
	session := expanded(record, "sessionId")
	creditType := expanded(session, "requiredCreditTypeId")
	spec := expanded(creditType, "courseSpecId")
	return object{
		{"lessonId", or(session["id"], relationID(record["sessionId"]))},
		{"title", sanitizeStudentText(or(or(session["title"], spec["name"]), or(creditType["name"], "课程")))},
		{"course", object{
			{"courseId", or(or(spec["id"], relationID(creditType["courseSpecId"])),
				or(creditType["id"], relationID(session["requiredCreditTypeId"])))},
			{"name", sanitizeStudentText(or(or(spec["name"], creditType["name"]), "课程"))},
		}},
		{"status", lessonStatus(session["status"])},
		{"startAt", or(session["startAt"], nil)},
		{"endAt", or(session["endAt"], nil)},
		{"location", sanitizeStudentText(or(session["location"], ""))},
		{"teacherSummary", relationSummary(context.teachers, "teacherId", "教师")},
		{"classSummary", relationSummary(context.classes, "classId", "班级")},
		{"attendanceResult", lookup(attendanceResults, record["attendanceStatus"], "pending")},
		{"lessonHourResult", lookup(lessonHourResults, record["creditStatus"], "pending")},
		{"notice", learningNotice(record["creditStatus"])},
	}
}

func mapLessonRecord(event map[string]any) any {
	creditType := expanded(event, "creditTypeId")
	spec := expanded(creditType, "courseSpecId")
	title, impact, hours := eventPresentation(event["eventType"], numberOrZero(event["quantityDelta"]))
	return object{
		{"recordId", or(event["id"], "")},
		{"course", object{
			{"courseId", or(or(spec["id"], relationID(creditType["courseSpecId"])),
				or(creditType["id"], relationID(event["creditTypeId"])))},
			{"name", sanitizeStudentText(or(or(spec["name"], creditType["name"]), "课程"))},
		}},
		{"title", title},
		{"lessonHours", hours},
		{"impact", impact},
		{"occurredAt", or(or(event["businessTime"], event["created"]), nil)},
	}
}

func buildLearningWarnings(roster []map[string]any, contexts map[string]*lessonContext) []any {
	warnings := []any{}
	for _, record := range roster {
		if !needsHelp(record["creditStatus"]) {
			continue
		}
		lesson := mapLesson(record, contexts[sessionIDOf(record)])
		warnings = append(warnings, object{
			{"lessonId", lesson.get("lessonId")},
			{"title", lesson.get("title")},
			{"startAt", lesson.get("startAt")},
			{"message", learningNoticeText},
		})
	}
	return warnings
}

func needsHelp(status any) bool {
	return status == "credit_insufficient" || status == "conversion_required"
}

func courseIdentity(batch map[string]any) string {
	creditType := expanded(batch, "creditTypeId")
	spec := expanded(creditType, "courseSpecId")
	return jsx.String(or(or(spec["id"], relationID(creditType["courseSpecId"])), ""))
}

var eventPresentations = map[string][2]string{
	"GRANT": {"新增课时", "added"}, "CONVERT_IN": {"新增课时", "added"}, "CONVERT_OUT": {"课程调整", "used"},
	"FREEZE": {"已安排课程", "scheduled"}, "ACTIVATE": {"课程已生效", "neutral"}, "CONSUME": {"已完成课程", "used"},
	"RELEASE": {"课时已退回", "returned"}, "EXPIRE": {"课时已到期", "used"}, "EXTEND": {"有效期已延长", "neutral"},
	"REVERSE": {"记录已更正", "neutral"},
}

func eventPresentation(eventType any, delta float64) (string, string, float64) {
	name, _ := eventType.(string)
	if name == "ADJUST" {
		if delta >= 0 {
			return "课时已调整", "added", math.Abs(delta)
		}
		return "课时已调整", "used", math.Abs(delta)
	}
	if presentation, ok := eventPresentations[name]; ok {
		return presentation[0], presentation[1], math.Abs(delta)
	}
	return "课时记录", "neutral", math.Abs(delta)
}

var (
	lessonStatuses    = []string{"draft", "scheduled", "enrollment_closed", "in_progress", "completed", "cancelled"}
	attendanceResults = map[string]string{
		"scheduled": "pending", "checked_in": "present", "present": "present", "late": "late",
		"leave": "leave", "absent": "absent", "cancelled": "cancelled",
	}
	lessonHourResults = map[string]string{
		"pending": "pending", "credit_insufficient": "needs_help", "conversion_required": "needs_help",
		"reserved": "scheduled", "consumed": "completed", "released": "returned", "reversed": "corrected",
	}
	sourceStatuses = map[string]string{
		"pending": "pending", "unactivated": "awaiting_activation", "active": "active", "depleted": "completed",
		"expired": "expired", "cancelled": "cancelled",
	}
)

func lessonStatus(status any) string {
	name, _ := status.(string)
	if name == "settled" {
		return "completed"
	}
	if slices.Contains(lessonStatuses, name) {
		return name
	}
	return "scheduled"
}

func lookup(values map[string]string, key any, fallback string) string {
	name, _ := key.(string)
	if value, ok := values[name]; ok {
		return value
	}
	return fallback
}

func learningNotice(status any) string {
	if needsHelp(status) {
		return learningNoticeText
	}
	return ""
}

func isUpcomingLesson(lesson object, now time.Time) bool {
	startAt, hasStart := millis(or(lesson.get("startAt"), ""))
	endAt, hasEnd := millis(or(lesson.get("endAt"), ""))
	relevantAt := startAt
	if hasEnd {
		relevantAt = endAt
	}
	return hasStart && relevantAt >= now.UnixMilli() && lesson.get("status") != "cancelled"
}

func compareLessonStart(left, right object) int {
	leftAt, _ := millis(left.get("startAt"))
	rightAt, _ := millis(right.get("startAt"))
	if leftAt != rightAt {
		return sign(leftAt - rightAt)
	}
	return strings.Compare(jsx.String(left.get("lessonId")), jsx.String(right.get("lessonId")))
}

func sessionIDOf(record map[string]any) string {
	return jsx.String(or(expanded(record, "sessionId")["id"], relationID(record["sessionId"])))
}

func loadLessonContexts(app core.App, rows []map[string]any) (map[string]*lessonContext, error) {
	sessionIDs := []string{}
	for _, row := range rows {
		if id := sessionIDOf(row); id != "" && !slices.Contains(sessionIDs, id) {
			sessionIDs = append(sessionIDs, id)
		}
	}
	contexts := map[string]*lessonContext{}
	if len(sessionIDs) == 0 {
		return contexts, nil
	}
	teachers, err := loadLessonRelations(app, "session_teachers", sessionIDs, "teacherId")
	if err != nil {
		return nil, err
	}
	classes, err := loadLessonRelations(app, "session_classes", sessionIDs, "classId")
	if err != nil {
		return nil, err
	}
	for _, id := range sessionIDs {
		contexts[id] = &lessonContext{teachers: []map[string]any{}, classes: []map[string]any{}}
	}
	for _, row := range teachers {
		// A replaced teacher keeps a cancelled row for the record; students see who teaches.
		if row["actualStatus"] == "cancelled" {
			continue
		}
		if context, ok := contexts[relationID(row["sessionId"])]; ok {
			context.teachers = append(context.teachers, row)
		}
	}
	for _, row := range classes {
		if context, ok := contexts[relationID(row["sessionId"])]; ok {
			context.classes = append(context.classes, row)
		}
	}
	return contexts, nil
}

func loadLessonRelations(app core.App, collection string, sessionIDs []string, expand string) ([]map[string]any, error) {
	rows := []map[string]any{}
	for start := 0; start < len(sessionIDs); start += relationChunkSize {
		chunk := sessionIDs[start:min(start+relationChunkSize, len(sessionIDs))]
		items, err := list(app, collection, anyFilter("sessionId", chunk), "sessionId", expand)
		if err != nil {
			return nil, err
		}
		rows = append(rows, items...)
	}
	return rows, nil
}

func relationSummary(rows []map[string]any, fieldName, fallback string) object {
	items := []object{}
	for _, row := range rows {
		related := expanded(row, fieldName)
		id := or(related["id"], relationID(row[fieldName]))
		if !jsx.Truthy(id) {
			continue
		}
		var name any = fallback
		for _, key := range []string{"realName", "realname", "nickName", "nickname", "name", "code"} {
			if jsx.Truthy(related[key]) {
				name = related[key]
				break
			}
		}
		items = append(items, object{{"id", id}, {"name", sanitizeStudentText(name)}})
	}
	shown := items[:min(len(items), 3)]
	names := make([]string, len(shown))
	for i, item := range shown {
		names[i] = item.get("name").(string)
	}
	return object{
		{"count", len(items)},
		{"items", anySlice(shown)},
		{"label", strings.Join(names, "、")},
		{"overflow", max(0, len(items)-3)},
	}
}
