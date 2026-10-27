package coursecredit

import (
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/testkit"
)

// Calendar cases ported from Hono's courseCalendar*.test.js.

// Hono: courseCalendarRange › calendar range accepts at most 42 days and normalizes dates
func TestCalendarRangeNormalizesAndLimits(t *testing.T) {
	r, err := parseCalendarRange(map[string]string{"from": "2026-08-01T00:00:00+08:00", "to": "2026-09-12T00:00:00+08:00"})
	if err != nil || r.from != "2026-07-31T16:00:00.000Z" || r.to != "2026-09-11T16:00:00.000Z" {
		t.Fatalf("range = %v, %v", r, err)
	}
	for code, query := range map[string]map[string]string{
		"CALENDAR_FROM_INVALID":    {"from": "invalid", "to": "2026-08-02"},
		"CALENDAR_TO_INVALID":      {"from": "2026-08-02", "to": "invalid"},
		"CALENDAR_RANGE_INVALID":   {"from": "2026-08-02", "to": "2026-08-01"},
		"CALENDAR_RANGE_TOO_LARGE": {"from": "2026-08-01", "to": "2026-09-13"},
	} {
		_, err := parseCalendarRange(query)
		failsWith(t, err, code)
	}
}

// Hono: courseCalendarRange › calendar filters, booleans, and upcoming limits reject unsupported values
func TestCalendarFiltersBooleansAndLimits(t *testing.T) {
	filters, err := normalizeCalendarFilters(map[string]string{"teacherId": " teacher ", "classId": "class", "courseSpecId": "course",
		"status": "scheduled,completed,scheduled", "originType": "class,appointment"})
	if err != nil || filters.teacherID != "teacher" || filters.studentID != "" || filters.classID != "class" || filters.courseSpecID != "course" ||
		!slices.Equal(filters.statuses, []string{"scheduled", "completed"}) || !slices.Equal(filters.origins, []string{"class", "appointment"}) {
		t.Fatalf("filters = %+v, %v", filters, err)
	}
	_, err = normalizeCalendarFilters(map[string]string{"status": "unknown"})
	failsWith(t, err, "CALENDAR_STATUS_INVALID")
	_, err = normalizeCalendarFilters(map[string]string{"originType": "legacy"})
	failsWith(t, err, "CALENDAR_ORIGIN_INVALID")
	for value, want := range map[string]bool{"1": true, "true": true, "yes": true, "on": true, "0": false, "false": false, "no": false, "off": false, "": false} {
		if got, err := calendarBoolean(value); err != nil || got != want {
			t.Fatalf("calendarBoolean(%q) = %v, %v", value, got, err)
		}
	}
	_, err = calendarBoolean("maybe")
	failsWith(t, err, "CALENDAR_BOOLEAN_INVALID")
	if limit, _ := upcomingLimit(""); limit != 3 {
		t.Fatalf("default limit = %d", limit)
	}
	if limit, _ := upcomingLimit("2"); limit != 2 {
		t.Fatalf("limit = %d", limit)
	}
	for _, value := range []string{"0", "4"} {
		_, err := upcomingLimit(value)
		failsWith(t, err, "CALENDAR_UPCOMING_LIMIT_INVALID")
	}
}

func calendarLesson(changes map[string]any) map[string]any {
	course := map[string]any{"id": "course-1", "name": "少儿声乐", "deliveryMode": "offline"}
	creditType := map[string]any{"id": "type-1", "name": "少儿声乐课时", "courseSpecId": "course-1", "expand": map[string]any{"courseSpecId": course}}
	lesson := map[string]any{"id": "session-1", "title": "少儿声乐小课", "requiredCreditTypeId": "type-1",
		"startAt": "2026-08-01T01:00:00.000Z", "endAt": "2026-08-01T02:00:00.000Z", "location": "一号教室",
		"status": "correction_pending", "originType": "appointment", "appointmentId": "appointment-1", "version": 2.0,
		"expand": map[string]any{"requiredCreditTypeId": creditType, "appointmentId": map[string]any{"id": "appointment-1", "status": "rescheduled"}}}
	for key, value := range changes {
		lesson[key] = value
	}
	return lesson
}

func calendarRelations() (teachers, students, classes []map[string]any) {
	teachers = []map[string]any{{"sessionId": "session-1", "teacherId": "teacher-1", "role": "primary",
		"expand": map[string]any{"teacherId": map[string]any{"id": "teacher-1", "realName": "周老师"}}}}
	students = []map[string]any{
		{"sessionId": "session-1", "studentId": "student-1", "expand": map[string]any{"studentId": map[string]any{"id": "student-1", "nickname": "林同学"}}},
		{"sessionId": "session-1", "studentId": "student-2", "expand": map[string]any{"studentId": map[string]any{"id": "student-2", "nickname": "陈同学"}}},
	}
	classes = []map[string]any{{"sessionId": "session-1", "classId": "class-1",
		"expand": map[string]any{"classId": map[string]any{"id": "class-1", "name": "少儿声乐 A 班"}}}}
	return
}

// Hono: courseCalendarProjection › calendar projections preserve admin detail while redacting learner participants
func TestCalendarProjectionByAudience(t *testing.T) {
	teachers, students, classes := calendarRelations()
	admin := scheduleEntry(calendarLesson(nil), teachers, students, classes, "admin")
	teacher := scheduleEntry(calendarLesson(nil), teachers, students, classes, "teacher")
	student := scheduleEntry(calendarLesson(nil), teachers, students, classes, "student")
	relations := admin["relationIds"].(map[string]any)
	if admin["course"].(map[string]any)["name"] != "少儿声乐" || admin["rawStatus"] != "correction_pending" || admin["status"] != "scheduled" ||
		admin["adjusted"] != true || admin["attention"] != "教务处理中" || !slices.Equal(relations["teacherIds"].([]string), []string{"teacher-1"}) ||
		!slices.Equal(relations["studentIds"].([]string), []string{"student-1", "student-2"}) || !slices.Equal(relations["classIds"].([]string), []string{"class-1"}) {
		t.Fatalf("admin = %v", admin)
	}
	if teacher["participantSummary"].(map[string]any)["label"] != "林同学、陈同学" || teacher["rawStatus"] != nil {
		t.Fatalf("teacher = %v", teacher)
	}
	participants := student["participantSummary"].(map[string]any)
	if participants["count"] != 0 || len(participants["items"].([]map[string]any)) != 0 || student["relationIds"] != nil {
		t.Fatalf("student = %v", student)
	}
}

// Hono: courseCalendarProjection › calendar relation grouping and facets are stable and deduplicated
func TestCalendarFacetsAreStableAndDeduplicated(t *testing.T) {
	teachers, students, classes := calendarRelations()
	first := scheduleEntry(calendarLesson(nil), teachers, students, classes, "admin")
	second := scheduleEntry(calendarLesson(map[string]any{"id": "session-2", "title": "合唱"}), teachers, students, classes, "admin")
	facets := buildFacets([]map[string]any{first, second})
	if got := fmtJSON(facets["teachers"]); got != `[{"id":"teacher-1","name":"周老师"}]` {
		t.Fatalf("teachers = %s", got)
	}
	if got := fmtJSON(facets["students"]); got != `[{"id":"student-2","name":"陈同学"},{"id":"student-1","name":"林同学"}]` {
		t.Fatalf("students = %s", got)
	}
	if got := fmtJSON(facets["classes"]); got != `[{"id":"class-1","name":"少儿声乐 A 班"}]` {
		t.Fatalf("classes = %s", got)
	}
	if publicName(map[string]any{"nickName": "小周"}) != "小周" || publicName(map[string]any{}) != "未命名" {
		t.Fatal("publicName fallback")
	}
}

// Hono: courseCalendarProjection › calendar projection fallbacks remain readable with sparse legacy records
func TestCalendarProjectionSparseFallbacks(t *testing.T) {
	sparse := scheduleEntry(map[string]any{"id": "legacy", "requiredCreditTypeId": "type-legacy", "version": 0.0,
		"expand": map[string]any{"requiredCreditTypeId": map[string]any{"id": "type-legacy", "name": "合唱课程点"}}},
		[]map[string]any{
			{"teacherId": "teacher-1", "expand": map[string]any{"teacherId": map[string]any{"username": "teacher-a"}}},
			{"teacherId": "teacher-2", "expand": map[string]any{"teacherId": map[string]any{"sn": "T002"}}},
			{"teacherId": "teacher-3", "expand": map[string]any{"teacherId": map[string]any{"realname": "王老师"}}},
			{"teacherId": "teacher-4"},
		}, nil, []map[string]any{
			{"classId": "class-1", "expand": map[string]any{"classId": map[string]any{"code": "C001"}}},
			{"classId": "class-2"},
		}, "admin")
	course := sparse["course"].(map[string]any)
	if sparse["title"] != "合唱课时" || course["courseId"] != "type-legacy" || course["name"] != "合唱课时" || sparse["startAt"] != nil ||
		sparse["originType"] != "admin" || sparse["adjusted"] != false || sparse["version"] != 1 || sparse["appointmentId"] != nil ||
		sparse["teacherSummary"].(map[string]any)["overflow"] != 1 || sparse["classSummary"].(map[string]any)["label"] != "C001、班级课程" {
		t.Fatalf("sparse = %v", sparse)
	}
	empty := scheduleEntry(map[string]any{"id": "empty"}, nil, nil, nil, "teacher")
	if empty["title"] != "课程" || empty["course"].(map[string]any)["name"] != "课程" || empty["teacherSummary"].(map[string]any)["label"] != "" {
		t.Fatalf("empty = %v", empty)
	}
}

// Hono: courseCalendarAvailability › availability subtraction splits, trims, and preserves non-overlapping windows
func TestAvailabilitySubtraction(t *testing.T) {
	cases := []struct{ base, blocked, want []window }{
		{[]window{{540, 660}}, []window{{600, 630}}, []window{{540, 600}, {630, 660}}},
		{[]window{{540, 600}}, []window{{600, 630}}, []window{{540, 600}}},
		{[]window{{540, 660}, {840, 900}}, []window{{530, 550}, {650, 850}}, []window{{550, 650}, {850, 900}}},
	}
	for _, c := range cases {
		if got := subtractWindows(c.base, c.blocked); !slices.Equal(got, c.want) {
			t.Fatalf("subtract %v - %v = %v", c.base, c.blocked, got)
		}
	}
}

// Hono: courseCalendarAvailability › teacher availability expands active offering rules and removes unavailable overrides
func TestTeacherAvailabilityExpandsRulesMinusOverrides(t *testing.T) {
	f := bookingSetup(t, true)
	patch(t, f.app, "teacher_course_offerings", f.offeringID, map[string]any{"availabilityMode": "custom"})
	put(t, f.app, "teacher_availability_rules", map[string]any{"teacherId": f.teacherID, "offeringId": f.offeringID,
		"weekday": 1, "startMinute": 540, "endMinute": 660, "status": "active", "version": 1, "effectiveFrom": "2020-01-01 00:00:00.000Z"})
	put(t, f.app, "teacher_availability_overrides", map[string]any{"teacherId": f.teacherID, "offeringId": f.offeringID,
		"type": "unavailable", "status": "active", "version": 1,
		"startAt": "2026-08-03 02:00:00.000Z", "endAt": "2026-08-03 02:30:00.000Z"})
	r := calendarRange{"2026-08-02T16:00:00.000Z", "2026-08-03T16:00:00.000Z"}
	windows, err := teacherAvailabilityWindows(f.app, f.teacherID, r)
	if err != nil || len(windows) != 2 {
		t.Fatalf("windows = %v, %v", windows, err)
	}
	first, second := windows[0].(map[string]any), windows[1].(map[string]any)
	if first["startAt"] != "2026-08-03T01:00:00.000Z" || first["endAt"] != "2026-08-03T02:00:00.000Z" ||
		second["startAt"] != "2026-08-03T02:30:00.000Z" || second["endAt"] != "2026-08-03T03:00:00.000Z" ||
		first["course"].(map[string]any)["name"] != "声乐一对一" {
		t.Fatalf("windows = %v", windows)
	}

	rules := []map[string]any{{"offeringId": "offering-1", "weekday": 1.0, "startMinute": 540.0, "endMinute": 660.0, "status": "active"}}
	offering := map[string]any{"id": "offering-1", "courseSpecId": "course-1", "availabilityMode": "custom",
		"expand": map[string]any{"courseSpecId": map[string]any{"id": "course-1", "name": "声乐一对一"}}}
	outside, err := offeringWindows(offering, calendarRange{"2026-08-03T03:30:00.000Z", "2026-08-03T04:00:00.000Z"}, rules, nil)
	if err != nil || len(outside) != 0 {
		t.Fatalf("outside = %v, %v", outside, err)
	}
	fallback, err := offeringWindows(map[string]any{"id": "fallback", "courseSpecId": "course-fallback", "availabilityMode": "default"},
		calendarRange{"2026-08-03T01:00:00.000Z", "2026-08-03T01:30:00.000Z"}, nil, nil)
	if err != nil || len(fallback) == 0 {
		t.Fatalf("fallback = %v, %v", fallback, err)
	}
	if course := fallback[0].(map[string]any)["course"].(map[string]any); course["courseId"] != "course-fallback" || course["name"] != "课程" {
		t.Fatalf("fallback course = %v", course)
	}
}

// calendarFixture is the ledger fixture's class session with a named teacher and student.
type calendarFixture struct {
	ledgerFixture
	teacherID string
	r         calendarRange
	query     map[string]string
}

func calendarSetup(t *testing.T) calendarFixture {
	t.Helper()
	f := ledgerSetup(t, true)
	assignment, err := f.app.FindFirstRecordByFilter("session_teachers", `sessionId="`+f.sessionID+`"`)
	if err != nil {
		t.Fatal(err)
	}
	teacherID := assignment.GetString("teacherId")
	patch(t, f.app, "teachers", teacherID, map[string]any{"realName": "周老师"})
	patch(t, f.app, "students", f.studentID, map[string]any{"realName": "", "nickName": "林同学"})
	put(t, f.app, "session_students", map[string]any{"sessionId": f.sessionID, "studentId": f.studentID, "attendanceStatus": "scheduled"})
	testkit.Create(t, f.app, "teachers", map[string]any{"email": "zheng@example.com", "password": "admin-pass-1", "verified": true,
		"realName": "郑老师", "cellphone": "13800138000"})
	now := time.Now().UTC()
	r := calendarRange{iso(now), iso(now.Add(7 * 24 * time.Hour))}
	return calendarFixture{f, teacherID, r, map[string]string{"from": r.from, "to": r.to}}
}

func (f calendarFixture) with(changes map[string]string) map[string]string {
	query := map[string]string{"from": f.r.from, "to": f.r.to}
	for key, value := range changes {
		query[key] = value
	}
	return query
}

// Hono: courseCalendarQueryService › institution calendar projects formal sessions and applies relation filters
func TestInstitutionCalendarFiltersAndFacets(t *testing.T) {
	f := calendarSetup(t)
	value, err := institutionCalendar(f.app, f.with(map[string]string{"teacherId": f.teacherID, "classId": f.classID,
		"status": "scheduled", "originType": "class"}))
	if err != nil {
		t.Fatal(err)
	}
	result := value.(map[string]any)
	entries := result["items"].([]map[string]any)
	if len(entries) != 1 || entries[0]["lessonId"] != f.sessionID || result["range"].(map[string]any)["timezone"] != "Asia/Shanghai" ||
		!slices.Equal(result["filters"].(map[string]any)["status"].([]string), []string{"scheduled"}) {
		t.Fatalf("institution = %v", result)
	}
	teachers := fmtJSON(result["facets"].(map[string]any)["teachers"])
	if !containsAll(teachers, `"name":"周老师"`, `"name":"郑老师"`) || strings.Contains(teachers, "cellphone") {
		t.Fatalf("teacher facets = %s", teachers)
	}
	none, _ := institutionCalendar(f.app, f.with(map[string]string{"teacherId": "other"}))
	if len(none.(map[string]any)["items"].([]map[string]any)) != 0 {
		t.Fatalf("other teacher = %v", none)
	}
}

func containsAll(text string, parts ...string) bool {
	for _, part := range parts {
		if !strings.Contains(text, part) {
			return false
		}
	}
	return true
}

// Hono: courseCalendarQueryService › teacher and learner calendars use assignment ownership and role-safe projections
func TestTeacherCalendarsUseAssignmentOwnership(t *testing.T) {
	f := calendarSetup(t)
	teacher, err := teacherCalendar(f.app, f.teacherID, f.query)
	if err != nil {
		t.Fatal(err)
	}
	withAvailability, _ := teacherCalendar(f.app, f.teacherID, f.with(map[string]string{"includeAvailability": "true"}))
	opsValue, _ := teacherOpsCalendar(f.app, f.teacherID, f.query)
	entry := teacher.(map[string]any)["items"].([]map[string]any)[0]
	ops := opsValue.(map[string]any)["items"].([]map[string]any)[0]
	if entry["participantSummary"].(map[string]any)["label"] != "林同学" || entry["rawStatus"] != nil ||
		ops["relationIds"].(map[string]any)["teacherIds"].([]string)[0] != f.teacherID || ops["version"] != 1.0 ||
		len(teacher.(map[string]any)["availability"].([]any)) != 0 || len(withAvailability.(map[string]any)["availability"].([]any)) != 0 {
		t.Fatalf("teacher = %v, ops = %v", entry, ops)
	}
	learner, _ := upcomingSchedule(f.app, "student", f.studentID, nil)
	student := learner.(map[string]any)["items"].([]map[string]any)[0]
	if student["participantSummary"].(map[string]any)["count"] != 0 || student["teacherSummary"].(map[string]any)["label"] != "周老师" {
		t.Fatalf("learner = %v", student)
	}
	// Cancelled assignments leave the teacher's and the learner's calendars.
	patch(t, f.app, "session_teachers", assignmentID(t, f, "session_teachers"), map[string]any{"actualStatus": "cancelled"})
	patch(t, f.app, "session_students", assignmentID(t, f, "session_students"), map[string]any{"attendanceStatus": "cancelled"})
	if after, _ := teacherCalendar(f.app, f.teacherID, f.query); len(after.(map[string]any)["items"].([]map[string]any)) != 0 {
		t.Fatalf("cancelled teacher = %v", after)
	}
	if after, _ := upcomingSchedule(f.app, "student", f.studentID, nil); len(after.(map[string]any)["items"].([]map[string]any)) != 0 {
		t.Fatalf("cancelled student = %v", after)
	}
	_, err = teacherCalendar(f.app, "", f.query)
	failsWith(t, err, "CALENDAR_TEACHER_REQUIRED")
	_, err = teacherOpsCalendar(f.app, "", f.query)
	failsWith(t, err, "CALENDAR_TEACHER_REQUIRED")
}

func assignmentID(t *testing.T, f calendarFixture, collection string) string {
	t.Helper()
	record, err := f.app.FindFirstRecordByFilter(collection, `sessionId="`+f.sessionID+`"`)
	if err != nil {
		t.Fatal(err)
	}
	return record.Id
}

// Hono: courseCalendarQueryService › upcoming schedule limits results, filters statuses, and rejects unsupported roles
func TestUpcomingScheduleLimitsAndRoles(t *testing.T) {
	f := calendarSetup(t)
	later := time.Now().UTC().Add(72 * time.Hour)
	for _, status := range []string{"scheduled", "draft"} {
		session := put(t, f.app, "sessions", map[string]any{"code": "upcoming-" + status, "title": "第二课", "status": status, "startAt": later, "endAt": later.Add(time.Hour),
			"requiredCreditTypeId": f.creditTypeID, "originType": "class", "version": 1})
		put(t, f.app, "session_teachers", map[string]any{"sessionId": session.Id, "teacherId": f.teacherID, "actualStatus": "planned"})
	}
	all, _ := upcomingSchedule(f.app, "teacher", f.teacherID, nil)
	limited, _ := upcomingSchedule(f.app, "teacher", f.teacherID, map[string]string{"limit": "1"})
	student, _ := upcomingSchedule(f.app, "student", f.studentID, nil)
	if len(all.(map[string]any)["items"].([]map[string]any)) != 2 || len(limited.(map[string]any)["items"].([]map[string]any)) != 1 ||
		student.(map[string]any)["items"].([]map[string]any)[0]["lessonId"] != f.sessionID {
		t.Fatalf("all = %v, limited = %v, student = %v", all, limited, student)
	}
	_, err := upcomingSchedule(f.app, "admin", "operator", nil)
	failsWith(t, err, "CALENDAR_ROLE_UNSUPPORTED")
	_, err = upcomingSchedule(f.app, "teacher", "", nil)
	failsWith(t, err, "CALENDAR_PRINCIPAL_REQUIRED")
}

// Hono: courseCalendarQueryService › query helpers and density guard cover empty, chunked, and filtered cases
func TestCalendarQueryHelpersAndDensityGuard(t *testing.T) {
	if anyIDFilter("id", []string{"a", "b"}) != `(id="a" || id="b")` {
		t.Fatal("anyIDFilter")
	}
	ids := make([]string, calendarIDChunk+1)
	if chunks := idChunks(ids); len(chunks) != 2 || len(chunks[1]) != 1 {
		t.Fatalf("chunks = %d", len(chunks))
	}
	if got := fmtJSON(facet([]map[string]any{{"id": "b", "name": "乙"}, {"id": "a", "name": "甲"}, {"id": "b", "name": "重复"}})); got != `[{"id":"a","name":"甲"},{"id":"b","name":"乙"}]` {
		t.Fatalf("facet = %s", got)
	}
	empty := calendarFilters{statuses: []string{}, origins: []string{}}
	if got := fmtJSON(empty.asMap()); got != `{"classId":"","courseSpecId":"","originType":[],"status":[],"studentId":"","teacherId":""}` {
		t.Fatalf("filters = %s", got)
	}
	entry := map[string]any{"relationIds": map[string]any{"teacherIds": []string{"t"}, "studentIds": []string{"s"}, "classIds": []string{"c"}},
		"course": map[string]any{"courseId": "course"}, "rawStatus": "completed", "originType": "admin"}
	all := calendarFilters{"t", "s", "c", "course", []string{"completed"}, []string{"admin"}}
	if !all.matches(entry) || (calendarFilters{teacherID: "other"}).matches(entry) {
		t.Fatal("matches")
	}

	f := calendarSetup(t)
	if sessions, _ := sessionsByIDs(f.app, nil); len(sessions) != 0 {
		t.Fatalf("no ids = %v", sessions)
	}
	if entries, _ := projectSessions(f.app, nil, "admin"); len(entries) != 0 {
		t.Fatalf("no sessions = %v", entries)
	}
	ordered := []map[string]any{{"lessonId": "session-b", "startAt": ""}, {"lessonId": "session-a", "startAt": ""}}
	if sortByStart(ordered); ordered[0]["lessonId"] != "session-a" {
		t.Fatalf("ordered = %v", ordered)
	}
	quiet, err := institutionCalendar(f.app, map[string]string{"from": "2020-01-01T00:00:00.000Z", "to": "2020-01-02T00:00:00.000Z"})
	if err != nil {
		t.Fatal(err)
	}
	result := quiet.(map[string]any)
	facets := result["facets"].(map[string]any)
	// Without sessions the teacher facet still lists every verified, unblocked teacher.
	if len(result["items"].([]map[string]any)) != 0 || fmtJSON(facets["teachers"]) != `[{"id":"`+teacherNamed(t, f, "郑老师")+`","name":"郑老师"}]` ||
		len(facets["students"].([]map[string]any)) != 0 {
		t.Fatalf("quiet range = %v", result)
	}
	if none, _ := upcomingSchedule(f.app, "student", "nobody", nil); fmtJSON(none) != `{"items":[],"timezone":"Asia/Shanghai"}` {
		t.Fatalf("no upcoming = %s", fmtJSON(none))
	}

	start := time.Now().UTC().Add(time.Hour)
	for i := 0; i < calendarMaxItems; i++ {
		put(t, f.app, "sessions", map[string]any{"code": "dense-" + strconv.Itoa(i), "title": "密集", "status": "scheduled", "startAt": start, "endAt": start.Add(time.Hour), "version": 1})
	}
	_, err = institutionCalendar(f.app, f.query)
	failsWith(t, err, "CALENDAR_RANGE_TOO_DENSE")
}

func teacherNamed(t *testing.T, f calendarFixture, name string) string {
	t.Helper()
	record, err := f.app.FindFirstRecordByFilter("teachers", `realName="`+name+`"`)
	if err != nil {
		t.Fatal(err)
	}
	return record.Id
}

// Hono: courseCalendarRoutes › calendar routes enforce role ownership and keep the teacher alias compatible
func TestCalendarRoutesRoleOwnership(t *testing.T) {
	f := bookingSetup(t, true)
	week := rangeQuery(time.Now().UTC(), time.Now().UTC().Add(7*24*time.Hour), nil)
	for _, path := range []string{"/v1/teacher/calendar" + week, "/v1/teacher/schedule" + week + "&includeAvailability=true"} {
		ok(t, testkit.Call(t, f.handler, http.MethodGet, path, nil, f.teacher), path)
	}
	ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/schedule/upcoming?limit=2", nil, f.student), "student upcoming")
	failed(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/teacher/schedule"+week, nil, f.student), 403, "BOOKING_TEACHER_REQUIRED", "student schedule")
	failed(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/schedule/upcoming", nil, f.adminToken(t)), 403, "CALENDAR_ROLE_UNSUPPORTED", "admin upcoming")
}

func (f bookingFixture) adminToken(t *testing.T) map[string]string {
	t.Helper()
	value, err := f.signer.Sign("operator", "A1", "admin", true, nil, auth.AppTokenTTL)
	if err != nil {
		t.Fatal(err)
	}
	return testkit.Bearer(value)
}

// Hono: courseCalendarRoutes › Ops calendar preserves academic filters and routes teacher-only users to their scope
func TestOpsCalendarRoutesByCapability(t *testing.T) {
	f := bookingSetup(t, true)
	_, lessonID := f.confirmed(t, 40, "c1")
	now := time.Now().UTC()
	week := rangeQuery(now, now.Add(7*24*time.Hour), url.Values{"teacherId": {f.teacherID}, "studentId": {f.studentID},
		"courseSpecId": {f.specID}, "status": {"scheduled"}, "originType": {"appointment"}})
	academic := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-calendar"+week, nil, f.opsToken(t, "operator", Academic)), "academic")
	if entries := items(academic); len(entries) != 1 || entries[0]["lessonId"] != lessonID || academic["filters"].(map[string]any)["originType"].([]any)[0] != "appointment" {
		t.Fatalf("academic = %v", academic)
	}
	plain := rangeQuery(now, now.Add(7*24*time.Hour), nil)
	if own := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-calendar"+plain, nil, f.opsToken(t, f.teacherID, Teacher)), "teacher"); len(items(own)) != 1 || own["facets"] == nil {
		t.Fatalf("teacher ops = %v", own)
	}
	if others := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-calendar"+plain, nil, f.opsToken(t, "stranger12345ab", Teacher)), "stranger"); len(items(others)) != 0 {
		t.Fatalf("stranger ops = %v", others)
	}
	rejected(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-calendar"+plain, nil, f.opsToken(t, "finance", Finance)), 403, "finance")
}

// Hono: courseCalendarRoutes › schedule handler identity helper rejects missing and unsupported users
func TestScheduleIdentityRejectsUnsupportedUsers(t *testing.T) {
	f := bookingSetup(t, true)
	ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/schedule/upcoming", nil, f.student), "student")
	if anonymous := testkit.Call(t, f.handler, http.MethodGet, "/v1/schedule/upcoming", nil, nil); anonymous.Code() != 403 || anonymous.Body["errorCode"] != "AUTH_SESSION_INVALID" {
		t.Fatalf("anonymous = %v", anonymous.Body)
	}
	failed(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/schedule/upcoming", nil, f.adminToken(t)), 403, "CALENDAR_ROLE_UNSUPPORTED", "admin role")
}
