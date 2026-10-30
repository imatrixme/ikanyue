package coursecredit

import (
	"slices"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	"golang.org/x/text/collate"
	"golang.org/x/text/language"

	"kanyue.server/internal/jsx"
)

// Hono's ScheduleQueryService (ops course calendar, teacher calendar and
// schedule, home-page upcoming lessons) and the assigned student, class and
// lesson lists of CourseCreditOpsQueryService.

const (
	calendarTimezone = "Asia/Shanghai"
	calendarMaxDays  = 42
	calendarMaxRange = calendarMaxDays * dayMillis
	calendarMaxItems = 500
	calendarIDChunk  = 40
	calendarExpand   = "requiredCreditTypeId,requiredCreditTypeId.courseSpecId,appointmentId"
)

var (
	calendarOrigins  = []string{"class", "appointment", "admin"}
	upcomingStatuses = []string{"scheduled", "enrollment_closed", "in_progress", "correction_pending"}
)

type calendarRange struct{ from, to string }

func (r calendarRange) asMap() map[string]any {
	return map[string]any{"from": r.from, "to": r.to, "timezone": calendarTimezone}
}

func parseCalendarRange(query map[string]string) (calendarRange, error) {
	from, ok := millis(jsx.Get(stringMap(query), "from"))
	if !ok {
		return calendarRange{}, Fail("CALENDAR_FROM_INVALID", "日历开始时间无效", nil)
	}
	to, ok := millis(jsx.Get(stringMap(query), "to"))
	if !ok {
		return calendarRange{}, Fail("CALENDAR_TO_INVALID", "日历结束时间无效", nil)
	}
	if to <= from {
		return calendarRange{}, Fail("CALENDAR_RANGE_INVALID", "日历结束时间必须晚于开始时间", nil)
	}
	if to-from > calendarMaxRange {
		return calendarRange{}, Fail("CALENDAR_RANGE_TOO_LARGE", "日历查询范围不能超过 42 天", map[string]any{"maxDays": calendarMaxDays})
	}
	return calendarRange{fromMillis(from), fromMillis(to)}, nil
}

func stringMap(query map[string]string) map[string]any {
	result := make(map[string]any, len(query))
	for key, value := range query {
		result[key] = value
	}
	return result
}

type calendarFilters struct {
	teacherID, studentID, classID, courseSpecID string
	statuses, origins                           []string
}

func (f calendarFilters) asMap() map[string]any {
	return map[string]any{"teacherId": f.teacherID, "studentId": f.studentID, "classId": f.classID,
		"courseSpecId": f.courseSpecID, "status": f.statuses, "originType": f.origins}
}

func normalizeCalendarFilters(query map[string]string) (calendarFilters, error) {
	statuses, err := enumList(query["status"], sessionStatuses, "CALENDAR_STATUS_INVALID")
	if err != nil {
		return calendarFilters{}, err
	}
	origins, err := enumList(query["originType"], calendarOrigins, "CALENDAR_ORIGIN_INVALID")
	if err != nil {
		return calendarFilters{}, err
	}
	return calendarFilters{strings.TrimSpace(query["teacherId"]), strings.TrimSpace(query["studentId"]),
		strings.TrimSpace(query["classId"]), strings.TrimSpace(query["courseSpecId"]), statuses, origins}, nil
}

func enumList(value string, allowed []string, code string) ([]string, error) {
	if value == "" {
		return []string{}, nil
	}
	values := []string{}
	for _, item := range strings.Split(value, ",") {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if !slices.Contains(allowed, item) {
			return nil, Fail(code, "日历筛选值无效", nil)
		}
		if !slices.Contains(values, item) {
			values = append(values, item)
		}
	}
	if len(values) == 0 {
		return nil, Fail(code, "日历筛选值无效", nil)
	}
	return values, nil
}

func (f calendarFilters) matches(entry map[string]any) bool {
	relations := entry["relationIds"].(map[string]any)
	course := entry["course"].(map[string]any)
	return (f.teacherID == "" || slices.Contains(relations["teacherIds"].([]string), f.teacherID)) &&
		(f.studentID == "" || slices.Contains(relations["studentIds"].([]string), f.studentID)) &&
		(f.classID == "" || slices.Contains(relations["classIds"].([]string), f.classID)) &&
		(f.courseSpecID == "" || course["courseId"] == f.courseSpecID) &&
		(len(f.statuses) == 0 || slices.Contains(f.statuses, entry["rawStatus"].(string))) &&
		(len(f.origins) == 0 || slices.Contains(f.origins, jsx.String(entry["originType"])))
}

func calendarBoolean(value string) (bool, error) {
	if value == "" {
		return false, nil
	}
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on":
		return true, nil
	case "0", "false", "no", "off":
		return false, nil
	}
	return false, Fail("CALENDAR_BOOLEAN_INVALID", "日历布尔参数无效", nil)
}

func upcomingLimit(value string) (int, error) {
	if value == "" {
		return 3, nil
	}
	number := jsx.Number(value)
	if !jsx.IsInteger(value) || number < 1 || number > 3 {
		return 0, Fail("CALENDAR_UPCOMING_LIMIT_INVALID", "首页课程数量必须在 1 到 3 之间", nil)
	}
	return int(number), nil
}

// institutionCalendar is every session in the range for academic operators.
func institutionCalendar(app core.App, query map[string]string) (any, error) {
	r, err := parseCalendarRange(query)
	if err != nil {
		return nil, err
	}
	filters, err := normalizeCalendarFilters(query)
	if err != nil {
		return nil, err
	}
	result, err := pageOf(app, "sessions", `endAt>"`+escape(filterTime(r.from))+`" && startAt<"`+escape(filterTime(r.to))+`"`,
		"startAt", 1, calendarMaxItems, strings.Split(calendarExpand, ",")...)
	if err != nil {
		return nil, err
	}
	if result.TotalItems > calendarMaxItems {
		return nil, Fail("CALENDAR_RANGE_TOO_DENSE", "当前时间范围课程过多，请缩小查询范围", map[string]any{"maxEntries": calendarMaxItems})
	}
	entries, err := projectSessions(app, result.Items, "admin")
	if err != nil {
		return nil, err
	}
	facets := buildFacets(entries)
	teachers, err := list(app, "teachers", "blocked=false && verified=true", "realName,nickName,username")
	if err != nil {
		return nil, err
	}
	eligible := []map[string]any{}
	for _, teacher := range teachers {
		if jsx.Truthy(teacher["id"]) {
			eligible = append(eligible, map[string]any{"id": teacher["id"], "name": publicName(teacher)})
		}
	}
	facets["teachers"] = facet(append(facets["teachers"].([]map[string]any), eligible...))
	return calendarResponse(r, filters, facets, entries), nil
}

// teacherOpsCalendar is the ops calendar of a teacher without the academic capability.
func teacherOpsCalendar(app core.App, teacherID string, query map[string]string) (any, error) {
	if teacherID == "" {
		return nil, Fail("CALENDAR_TEACHER_REQUIRED", "教师身份不能为空", nil)
	}
	r, err := parseCalendarRange(query)
	if err != nil {
		return nil, err
	}
	filters, err := normalizeCalendarFilters(query)
	if err != nil {
		return nil, err
	}
	entries, err := teacherEntries(app, teacherID, r, "admin")
	if err != nil {
		return nil, err
	}
	return calendarResponse(r, filters, buildFacets(entries), entries), nil
}

func calendarResponse(r calendarRange, filters calendarFilters, facets map[string]any, entries []map[string]any) map[string]any {
	items := []map[string]any{}
	for _, entry := range entries {
		if filters.matches(entry) {
			items = append(items, entry)
		}
	}
	return map[string]any{"range": r.asMap(), "filters": filters.asMap(), "facets": facets, "items": items}
}

func teacherEntries(app core.App, teacherID string, r calendarRange, audience string) ([]map[string]any, error) {
	rows, err := list(app, "session_teachers", `teacherId="`+escape(teacherID)+`" && actualStatus!="cancelled"`+
		` && sessionId.endAt>"`+escape(filterTime(r.from))+`" && sessionId.startAt<"`+escape(filterTime(r.to))+`"`, "sessionId.startAt")
	if err != nil {
		return nil, err
	}
	sessions, err := sessionsByIDs(app, uniqueRelations(rows, "sessionId"))
	if err != nil {
		return nil, err
	}
	return projectSessions(app, sessions, audience)
}

// teacherCalendar is the mini-program teacher calendar and schedule.
func teacherCalendar(app core.App, teacherID string, query map[string]string) (any, error) {
	if teacherID == "" {
		return nil, Fail("CALENDAR_TEACHER_REQUIRED", "教师身份不能为空", nil)
	}
	r, err := parseCalendarRange(query)
	if err != nil {
		return nil, err
	}
	entries, err := teacherEntries(app, teacherID, r, "teacher")
	if err != nil {
		return nil, err
	}
	include, err := calendarBoolean(query["includeAvailability"])
	if err != nil {
		return nil, err
	}
	availability := []any{}
	if include {
		if availability, err = teacherAvailabilityWindows(app, teacherID, r); err != nil {
			return nil, err
		}
	}
	return map[string]any{"range": r.asMap(), "items": entries, "availability": availability}, nil
}

// upcomingSchedule is the home page's next lessons for a student or teacher.
func upcomingSchedule(app core.App, role, userID string, query map[string]string) (any, error) {
	limit, err := upcomingLimit(query["limit"])
	if err != nil {
		return nil, err
	}
	if role != "teacher" && role != "student" {
		return nil, Fail("CALENDAR_ROLE_UNSUPPORTED", "当前身份不支持课程日程", nil)
	}
	if userID == "" {
		return nil, Fail("CALENDAR_PRINCIPAL_REQUIRED", "登录身份不能为空", nil)
	}
	collection, field, extra := "session_students", "studentId", `attendanceStatus!="cancelled"`
	if role == "teacher" {
		collection, field, extra = "session_teachers", "teacherId", `actualStatus!="cancelled"`
	}
	statuses := make([]string, len(upcomingStatuses))
	for i, status := range upcomingStatuses {
		statuses[i] = `sessionId.status="` + status + `"`
	}
	rows, err := pageOf(app, collection, field+`="`+escape(userID)+`" && `+extra+` && sessionId.endAt>"`+
		escape(filterTime(iso(clock())))+`" && (`+strings.Join(statuses, " || ")+`)`, "sessionId.startAt", 1, 20)
	if err != nil {
		return nil, err
	}
	sessions, err := sessionsByIDs(app, uniqueRelations(rows.Items, "sessionId"))
	if err != nil {
		return nil, err
	}
	entries, err := projectSessions(app, sessions, role)
	if err != nil {
		return nil, err
	}
	sortByStart(entries)
	return map[string]any{"timezone": calendarTimezone, "items": entries[:min(limit, len(entries))]}, nil
}

func uniqueRelations(rows []map[string]any, field string) []string {
	result := []string{}
	for _, row := range rows {
		if id := relationID(row[field]); id != "" && !slices.Contains(result, id) {
			result = append(result, id)
		}
	}
	return result
}

func idChunks(ids []string) [][]string {
	chunks := [][]string{}
	for start := 0; start < len(ids); start += calendarIDChunk {
		chunks = append(chunks, ids[start:min(start+calendarIDChunk, len(ids))])
	}
	return chunks
}

func anyIDFilter(field string, ids []string) string {
	clauses := make([]string, len(ids))
	for i, id := range ids {
		clauses[i] = field + `="` + escape(id) + `"`
	}
	return "(" + strings.Join(clauses, " || ") + ")"
}

func sessionsByIDs(app core.App, ids []string) ([]map[string]any, error) {
	sessions := []map[string]any{}
	for _, chunk := range idChunks(ids) {
		rows, err := list(app, "sessions", anyIDFilter("id", chunk), "startAt", strings.Split(calendarExpand, ",")...)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, rows...)
	}
	sortByStart(sessions)
	return sessions, nil
}

// sortByStart is byStart over sessions (id) or entries (lessonId).
func sortByStart(items []map[string]any) {
	slices.SortStableFunc(items, func(left, right map[string]any) int {
		a, ok1 := millis(or(left["startAt"], ""))
		b, ok2 := millis(or(right["startAt"], ""))
		if ok1 && ok2 && a != b {
			if a < b {
				return -1
			}
			return 1
		}
		return strings.Compare(jsx.String(or(left["lessonId"], left["id"])), jsx.String(or(right["lessonId"], right["id"])))
	})
}

func sessionRelations(app core.App, collection string, ids []string, expand string) (map[string][]map[string]any, error) {
	groups := map[string][]map[string]any{}
	for _, chunk := range idChunks(ids) {
		rows, err := list(app, collection, anyIDFilter("sessionId", chunk), "sessionId", expand)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			if id := relationID(row["sessionId"]); id != "" {
				groups[id] = append(groups[id], row)
			}
		}
	}
	return groups, nil
}

func projectSessions(app core.App, sessions []map[string]any, audience string) ([]map[string]any, error) {
	if len(sessions) == 0 {
		return []map[string]any{}, nil
	}
	ids := make([]string, len(sessions))
	for i, session := range sessions {
		ids[i] = jsx.String(session["id"])
	}
	teachers, err := sessionRelations(app, "session_teachers", ids, "teacherId")
	if err != nil {
		return nil, err
	}
	for id, rows := range teachers {
		teachers[id] = slices.DeleteFunc(rows, func(row map[string]any) bool { return row["actualStatus"] == "cancelled" })
	}
	students, err := sessionRelations(app, "session_students", ids, "studentId")
	if err != nil {
		return nil, err
	}
	classes, err := sessionRelations(app, "session_classes", ids, "classId")
	if err != nil {
		return nil, err
	}
	entries := make([]map[string]any, len(sessions))
	for i, session := range sessions {
		id := jsx.String(session["id"])
		entries[i] = scheduleEntry(session, teachers[id], students[id], classes[id], audience)
	}
	sortByStart(entries)
	return entries, nil
}

func clean(values ...any) string {
	return sanitizeStudentText(jsx.String(orChain(append(values, "")...)))
}

func publicName(person map[string]any) string {
	return clean(person["realName"], person["realname"], person["nickName"], person["nickname"],
		person["username"], person["sn"], "未命名")
}

func scheduleEntry(session map[string]any, teacherRows, studentRows, classRows []map[string]any, audience string) map[string]any {
	creditType := expanded(session, "requiredCreditTypeId")
	course := expanded(creditType, "courseSpecId")
	people := func(rows []map[string]any, field string, withRole bool) ([]map[string]any, []string) {
		items, ids := []map[string]any{}, []string{}
		for _, row := range rows {
			person := expanded(row, field)
			item := map[string]any{"id": orChain(person["id"], relationID(row[field])), "name": publicName(person)}
			if withRole && jsx.Truthy(row["role"]) {
				item["role"] = row["role"]
			}
			items = append(items, item)
			ids = append(ids, jsx.String(item["id"]))
		}
		return items, ids
	}
	teachers, teacherIDs := people(teacherRows, "teacherId", true)
	students, studentIDs := people(studentRows, "studentId", false)
	classes, classIDs := []map[string]any{}, []string{}
	for _, row := range classRows {
		class := expanded(row, "classId")
		item := map[string]any{"id": orChain(class["id"], relationID(row["classId"])), "name": clean(class["name"], class["code"], "班级课程")}
		classes = append(classes, item)
		classIDs = append(classIDs, jsx.String(item["id"]))
	}
	appointment := expanded(session, "appointmentId")
	attention := ""
	if session["status"] == "correction_pending" {
		attention = "教务处理中"
	}
	entry := map[string]any{
		"lessonId": session["id"],
		"title":    clean(session["title"], course["name"], creditType["name"], "课程"),
		"course": map[string]any{
			"courseId":     orChain(course["id"], relationID(creditType["courseSpecId"]), creditType["id"], relationID(session["requiredCreditTypeId"])),
			"name":         clean(course["name"], creditType["name"], "课程"),
			"deliveryMode": or(course["deliveryMode"], ""),
		},
		"startAt":            or(session["startAt"], nil),
		"endAt":              or(session["endAt"], nil),
		"location":           clean(session["location"]),
		"status":             lessonStatus(session["status"]),
		"rawStatus":          or(session["status"], ""),
		"originType":         or(session["originType"], "admin"),
		"adjusted":           appointment["status"] == "rescheduled",
		"attention":          attention,
		"teacherSummary":     scheduleSummary(teachers, false),
		"classSummary":       scheduleSummary(classes, false),
		"participantSummary": scheduleSummary(students, audience == "student"),
	}
	if audience != "admin" {
		delete(entry, "rawStatus")
		return entry
	}
	entry["appointmentId"] = or(relationID(session["appointmentId"]), nil)
	entry["version"] = 1
	if jsx.IsInteger(session["version"]) && jsx.Number(session["version"]) > 0 {
		entry["version"] = jsx.Number(session["version"])
	}
	entry["relationIds"] = map[string]any{"teacherIds": teacherIDs, "studentIds": studentIDs, "classIds": classIDs}
	return entry
}

func scheduleSummary(items []map[string]any, redact bool) map[string]any {
	if redact {
		return map[string]any{"count": 0, "items": []map[string]any{}, "label": "", "overflow": 0}
	}
	visible := items[:min(3, len(items))]
	names := make([]string, len(visible))
	for i, item := range visible {
		names[i] = item["name"].(string)
	}
	return map[string]any{"count": len(items), "items": visible, "label": strings.Join(names, "、"), "overflow": len(items) - len(visible)}
}

func buildFacets(entries []map[string]any) map[string]any {
	collect := func(key string) []map[string]any {
		items := []map[string]any{}
		for _, entry := range entries {
			items = append(items, entry[key].(map[string]any)["items"].([]map[string]any)...)
		}
		return facet(items)
	}
	courses := []map[string]any{}
	for _, entry := range entries {
		course := entry["course"].(map[string]any)
		courses = append(courses, map[string]any{"id": course["courseId"], "name": course["name"]})
	}
	return map[string]any{"teachers": collect("teacherSummary"), "students": collect("participantSummary"),
		"classes": collect("classSummary"), "courses": facet(courses)}
}

// facet keeps the first {id, name} per id, ordered by name as zh-CN localeCompare.
func facet(items []map[string]any) []map[string]any {
	result := []map[string]any{}
	seen := map[string]bool{}
	for _, item := range items {
		id := jsx.String(item["id"])
		if !jsx.Truthy(item["id"]) || seen[id] {
			continue
		}
		seen[id] = true
		result = append(result, map[string]any{"id": item["id"], "name": item["name"]})
	}
	collator := collate.New(language.SimplifiedChinese)
	slices.SortStableFunc(result, func(left, right map[string]any) int {
		return collator.CompareString(jsx.String(left["name"]), jsx.String(right["name"]))
	})
	return result
}

// teacherAvailabilityWindows is loadTeacherAvailabilityWindows: each active offering's
// bookable windows inside the range, minus unavailable overrides.
func teacherAvailabilityWindows(app core.App, teacherID string, r calendarRange) ([]any, error) {
	escaped := escape(teacherID)
	offerings, err := list(app, "teacher_course_offerings", `teacherId="`+escaped+`" && status="active"`, "courseSpecId", "courseSpecId", "policyId")
	if err != nil {
		return nil, err
	}
	rules, err := list(app, "teacher_availability_rules", `teacherId="`+escaped+`" && status="active"`, "weekday,startMinute")
	if err != nil {
		return nil, err
	}
	overrides, err := list(app, "teacher_availability_overrides", `teacherId="`+escaped+`" && status="active" && endAt>"`+
		escape(filterTime(r.from))+`" && startAt<"`+escape(filterTime(r.to))+`"`, "startAt")
	if err != nil {
		return nil, err
	}
	of := func(rows []map[string]any, offeringID any) []map[string]any {
		result := []map[string]any{}
		for _, row := range rows {
			if relationID(row["offeringId"]) == offeringID {
				result = append(result, row)
			}
		}
		return result
	}
	windows := []any{}
	for _, offering := range offerings {
		items, err := offeringWindows(offering, r, of(rules, offering["id"]), of(overrides, offering["id"]))
		if err != nil {
			return nil, err
		}
		windows = append(windows, items...)
	}
	return windows, nil
}

func offeringWindows(offering map[string]any, r calendarRange, rules, overrides []map[string]any) ([]any, error) {
	policy, err := normalizeBookingPolicy(expanded(offering, "policyId"))
	if err != nil {
		return nil, err
	}
	course := expanded(offering, "courseSpecId")
	from, _ := millis(r.from)
	to, _ := millis(r.to)
	startDate, endDate := localPartsAt(from).date, localPartsAt(to-1).date
	query := slotQuery{availabilityMode: offering["availabilityMode"], rules: rules, overrides: overrides}
	result := []any{}
	for date := startDate; date <= endDate; date = addLocalDays(date, 1) {
		weekday := localPartsAt(localDateMinute(date, 0)).weekday
		unavailable := []window{}
		for _, override := range overrides {
			if override["type"] == "unavailable" {
				unavailable = append(unavailable, overrideWindowsForDate(override, date)...)
			}
		}
		for _, w := range subtractWindows(effectiveWindows(date, weekday, policy, query), unavailable) {
			start, end := localDateMinute(date, w.start), localDateMinute(date, w.end)
			if end <= from || start >= to {
				continue
			}
			result = append(result, map[string]any{
				"offeringId": offering["id"],
				"course":     map[string]any{"courseId": orChain(course["id"], relationID(offering["courseSpecId"])), "name": or(course["name"], "课程")},
				"startAt":    fromMillis(start),
				"endAt":      fromMillis(end),
			})
		}
	}
	return result, nil
}

func subtractWindows(base, blocked []window) []window {
	result := mergeWindows(slices.Clone(base))
	for _, item := range mergeWindows(slices.Clone(blocked)) {
		next := []window{}
		for _, w := range result {
			if item.end <= w.start || item.start >= w.end {
				next = append(next, w)
				continue
			}
			if item.start > w.start {
				next = append(next, window{w.start, item.start})
			}
			if item.end < w.end {
				next = append(next, window{item.end, w.end})
			}
		}
		result = next
	}
	return result
}

// teachingScope is the assigned lists' and lesson commands' scope: admins and academic
// operators see everything, teachers only what they teach.
type teachingScope struct {
	classStudents, classTeachers, sessionStudents, sessionTeachers []map[string]any
}

func globalTeachingScope(user map[string]any) bool {
	return user["isAdmin"] == true || HasCapability(user, Academic)
}

func loadTeacherScope(app core.App, user map[string]any) (*teachingScope, error) {
	if !HasCapability(user, Teacher) {
		return nil, Fail("COURSE_CREDIT_CAPABILITY_REQUIRED", "缺少课程运营权限", nil)
	}
	teacherID := escape(jsx.String(user["id"]))
	classTeachers, err := list(app, "class_teachers", `teacherId="`+teacherID+`" && status="active"`, "classId")
	if err != nil {
		return nil, err
	}
	sessionTeachers, err := list(app, "session_teachers", `teacherId="`+teacherID+`" && actualStatus!="cancelled"`, "sessionId")
	if err != nil {
		return nil, err
	}
	classStudents, err := relatedRows(app, "class_students", "classId", uniqueRelations(classTeachers, "classId"))
	if err != nil {
		return nil, err
	}
	sessionStudents, err := relatedRows(app, "session_students", "sessionId", uniqueRelations(sessionTeachers, "sessionId"))
	if err != nil {
		return nil, err
	}
	return &teachingScope{classStudents, classTeachers, sessionStudents, sessionTeachers}, nil
}

func relatedRows(app core.App, collection, field string, ids []string) ([]map[string]any, error) {
	if len(ids) == 0 {
		return []map[string]any{}, nil
	}
	return list(app, collection, anyIDFilter(field, ids), field+",created")
}

func projectRows(rows []map[string]any, field, id, resourceName string) []map[string]any {
	result := []map[string]any{}
	for _, row := range rows {
		if relationID(row[field]) == id {
			result = append(result, project(row, resources[resourceName].fields, nil))
		}
	}
	return result
}

func emptyPage(pageNumber, perPage int) page {
	return page{Page: pageNumber, PerPage: perPage, Items: []map[string]any{}}
}

// assignedStudentFields are Hono's STUDENT_FIELDS with the real field names: Hono sorts and
// searches by realname/nickname, which students do not have, so its list always failed.
var assignedStudentFields = []string{"id", "realName", "nickName", "cellphone", "avatar", "blocked", "lastLoginAt", "created", "updated"}

func listAssignedStudents(app core.App, user map[string]any, query map[string]string) (page, error) {
	pageNumber, perPage, err := pagination(query)
	if err != nil {
		return page{}, err
	}
	var scope *teachingScope
	if !globalTeachingScope(user) {
		if scope, err = loadTeacherScope(app, user); err != nil {
			return page{}, err
		}
	}
	filters := []string{}
	if query["studentId"] != "" {
		filters = append(filters, `id="`+escape(query["studentId"])+`"`)
	}
	keyword := strings.TrimSpace(query["q"])
	if query["q"] == "" {
		keyword = strings.TrimSpace(query["keyword"])
	}
	if keyword != "" {
		value := escape(keyword)
		filters = append(filters, `(realName ~ "`+value+`" || nickName ~ "`+value+`" || cellphone ~ "`+value+`")`)
	}
	if query["status"] == "active" || query["status"] == "inactive" {
		filters = append(filters, "blocked = "+map[bool]string{true: "true", false: "false"}[query["status"] == "inactive"])
	}
	if scope != nil {
		ids := uniqueRelations(scope.classStudents, "studentId")
		for _, id := range uniqueRelations(scope.sessionStudents, "studentId") {
			if !slices.Contains(ids, id) {
				ids = append(ids, id)
			}
		}
		if len(ids) == 0 {
			return emptyPage(pageNumber, perPage), nil
		}
		filters = append(filters, anyIDFilter("id", ids))
	}
	result, err := pageOf(app, "students", strings.Join(filters, " && "), "realName,nickName,cellphone", pageNumber, perPage)
	if err != nil {
		return page{}, err
	}
	if scope == nil {
		ids := uniqueRelations(result.Items, "id")
		classStudents, err := relatedRows(app, "class_students", "studentId", ids)
		if err != nil {
			return page{}, err
		}
		sessionStudents, err := relatedRows(app, "session_students", "studentId", ids)
		if err != nil {
			return page{}, err
		}
		scope = &teachingScope{classStudents: classStudents, sessionStudents: sessionStudents}
	}
	for i, student := range result.Items {
		item := project(student, assignedStudentFields, nil)
		id := jsx.String(student["id"])
		item["realName"] = or(student["realName"], "")
		item["nickName"] = or(student["nickName"], "")
		item["classAssignments"] = projectRows(scope.classStudents, "studentId", id, "classStudents")
		item["lessonAssignments"] = projectRows(scope.sessionStudents, "studentId", id, "sessionStudents")
		result.Items[i] = item
	}
	return result, nil
}

func listAssignedClasses(app core.App, user map[string]any, query map[string]string) (page, error) {
	pageNumber, perPage, err := pagination(query)
	if err != nil {
		return page{}, err
	}
	var scope *teachingScope
	filters := []string{}
	if !globalTeachingScope(user) {
		if scope, err = loadTeacherScope(app, user); err != nil {
			return page{}, err
		}
		ids := uniqueRelations(scope.classTeachers, "classId")
		if len(ids) == 0 {
			return emptyPage(pageNumber, perPage), nil
		}
		filters = append(filters, anyIDFilter("id", ids))
	}
	if query["classId"] != "" {
		filters = append(filters, `id="`+escape(query["classId"])+`"`)
	}
	if status := query["status"]; status != "" {
		if !slices.Contains(resources["classes"].statuses, status) {
			return page{}, Fail("OPS_FILTER_STATUS_INVALID", "Resource status filter is invalid", nil)
		}
		filters = append(filters, `status="`+escape(status)+`"`)
	}
	result, err := pageOf(app, "classes", strings.Join(filters, " && "), resources["classes"].sort, pageNumber, perPage)
	if err != nil {
		return page{}, err
	}
	if scope == nil {
		ids := uniqueRelations(result.Items, "id")
		scope = &teachingScope{}
		if scope.classStudents, err = relatedRows(app, "class_students", "classId", ids); err != nil {
			return page{}, err
		}
		if scope.classTeachers, err = relatedRows(app, "class_teachers", "classId", ids); err != nil {
			return page{}, err
		}
	}
	for i, class := range result.Items {
		id := jsx.String(class["id"])
		item := project(class, resources["classes"].fields, nil)
		item["students"] = projectRows(scope.classStudents, "classId", id, "classStudents")
		item["teachers"] = projectRows(scope.classTeachers, "classId", id, "classTeachers")
		result.Items[i] = item
	}
	return result, nil
}

func listAssignedLessons(app core.App, user map[string]any, query map[string]string) (page, error) {
	pageNumber, perPage, err := pagination(query)
	if err != nil {
		return page{}, err
	}
	var scope *teachingScope
	filters := []string{}
	if !globalTeachingScope(user) {
		if scope, err = loadTeacherScope(app, user); err != nil {
			return page{}, err
		}
		ids := uniqueRelations(scope.sessionTeachers, "sessionId")
		if len(ids) == 0 {
			return emptyPage(pageNumber, perPage), nil
		}
		filters = append(filters, anyIDFilter("id", ids))
	}
	if query["sessionId"] != "" {
		filters = append(filters, `id="`+escape(query["sessionId"])+`"`)
	}
	ranges, err := startRangeFilters(query)
	if err != nil {
		return page{}, err
	}
	filters = append(filters, ranges...)
	if status := query["status"]; status != "" {
		if !slices.Contains(sessionStatuses, status) {
			return page{}, Fail("OPS_FILTER_STATUS_INVALID", "Resource status filter is invalid", nil)
		}
		filters = append(filters, `status="`+escape(status)+`"`)
	}
	result, err := pageOf(app, "sessions", strings.Join(filters, " && "), resources["sessions"].sort, pageNumber, perPage)
	if err != nil {
		return page{}, err
	}
	if scope == nil {
		ids := uniqueRelations(result.Items, "id")
		scope = &teachingScope{}
		if scope.sessionStudents, err = relatedRows(app, "session_students", "sessionId", ids); err != nil {
			return page{}, err
		}
		if scope.sessionTeachers, err = relatedRows(app, "session_teachers", "sessionId", ids); err != nil {
			return page{}, err
		}
	}
	for i, lesson := range result.Items {
		id := jsx.String(lesson["id"])
		item := project(lesson, resources["sessions"].fields, nil)
		item["students"] = projectRows(scope.sessionStudents, "sessionId", id, "sessionStudents")
		item["teachers"] = projectRows(scope.sessionTeachers, "sessionId", id, "sessionTeachers")
		result.Items[i] = item
	}
	return result, nil
}
