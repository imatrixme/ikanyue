package coursecredit

import (
	"encoding/json"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"
)

// Student learning cases ported from Hono's courseCreditStudentLearningService tests:
// the views over stored records, and the pure projection helpers over maps.

var learningNow = time.Date(2026, 7, 23, 8, 0, 0, 0, time.UTC)

type learningFixture struct {
	ledgerFixture
	view               learning
	course, courseType string
	chorus, chorusType string
	lesson             string
}

func learningSetup(t *testing.T) learningFixture {
	t.Helper()
	f := learningFixture{ledgerFixture: ledgerSetup(t, true)}
	f.view = learning{app: f.app, now: learningNow}
	f.course = put(t, f.app, "course_specs", map[string]any{"code": "vocal-1v1", "name": "声乐一对一", "deliveryMode": "one_to_one",
		"durationMinutes": 45, "status": "active"}).Id
	f.courseType = put(t, f.app, "credit_types", map[string]any{"code": "vocal-1v1", "name": "声乐课程点", "kind": "course",
		"courseSpecId": f.course, "consumable": true, "status": "active"}).Id
	f.chorus = put(t, f.app, "course_specs", map[string]any{"code": "chorus", "name": "合唱", "status": "active"}).Id
	f.chorusType = put(t, f.app, "credit_types", map[string]any{"code": "chorus", "name": "合唱课程点", "kind": "course",
		"courseSpecId": f.chorus, "consumable": true, "status": "active"}).Id
	f.lesson = f.learningLesson(t, f.courseType, map[string]any{"title": "声乐课", "startAt": "2026-07-24 08:00:00.000Z"}, nil)
	return f
}

func (f learningFixture) learningBatch(t *testing.T, creditType string, changes map[string]any) {
	t.Helper()
	put(t, f.app, "credit_batches", with2(map[string]any{"studentId": f.studentID, "creditTypeId": creditType, "originalQuantity": 4,
		"availableQuantity": 3, "frozenQuantity": 1, "consumedQuantity": 1, "status": "active", "validFrom": "2026-07-01 00:00:00.000Z",
		"effectiveExpiresAt": "2026-08-01 00:00:00.000Z"}, changes))
}

// learningLesson stores a session and the student's roster row for it.
func (f learningFixture) learningLesson(t *testing.T, creditType string, session, roster map[string]any) string {
	t.Helper()
	start, _ := session["startAt"].(string)
	end := strings.Replace(start, "08:00", "09:00", 1)
	id := put(t, f.app, "sessions", with2(map[string]any{"code": "lesson-" + start, "title": "声乐课", "status": "scheduled",
		"endAt": end, "location": "A教室", "requiredCreditTypeId": creditType, "requiredQuantity": 1}, session)).Id
	put(t, f.app, "session_students", with2(map[string]any{"sessionId": id, "studentId": f.studentID, "attendanceStatus": "scheduled",
		"creditStatus": "reserved", "version": 1}, roster))
	return id
}

func (f learningFixture) learningEvent(t *testing.T, creditType string, changes map[string]any) {
	t.Helper()
	put(t, f.app, "credit_events", with2(map[string]any{"studentId": f.studentID, "creditTypeId": creditType, "eventType": "CONSUME",
		"quantityDelta": -1, "businessTime": "2026-07-22 08:00:00.000Z"}, changes))
}

// projected is a learning view as the route would serialize it.
func projected(t *testing.T, value any) map[string]any {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	return decoded
}

func learned(t *testing.T, value any, err error) map[string]any {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
	return projected(t, value)
}

// Hono: courseCreditStudentLearningService › learning overview returns course language, next lesson, warnings, and recent records
func TestLearningOverview(t *testing.T) {
	f := learningSetup(t)
	f.learningBatch(t, f.courseType, nil)
	f.learningBatch(t, f.courseType, map[string]any{"availableQuantity": 2, "frozenQuantity": 1, "consumedQuantity": 2,
		"effectiveExpiresAt": "2026-09-01 00:00:00.000Z"})
	help := f.learningLesson(t, f.courseType, map[string]any{"title": "补充课程点", "startAt": "2026-07-25 08:00:00.000Z"},
		map[string]any{"creditStatus": "credit_insufficient"})
	f.learningEvent(t, f.courseType, nil)
	teacher := put(t, f.app, "teachers", map[string]any{"email": "zhou@example.com", "password": "secret-password", "realName": "周老师"})
	put(t, f.app, "session_teachers", map[string]any{"sessionId": f.lesson, "teacherId": teacher.Id, "role": "lead", "actualStatus": "planned"})
	class := put(t, f.app, "classes", map[string]any{"code": "kids-a", "name": "少儿声乐 A 班", "status": "active"})
	put(t, f.app, "session_classes", map[string]any{"sessionId": f.lesson, "classId": class.Id})

	value, err := f.view.overview(f.studentID)
	result := learned(t, value, err)
	next := result["nextLesson"].(map[string]any)
	if next["lessonId"] != f.lesson || len(result["upcomingLessons"].([]any)) != 2 ||
		next["teacherSummary"].(map[string]any)["label"] != "周老师" || next["classSummary"].(map[string]any)["label"] != "少儿声乐 A 班" {
		t.Fatalf("next = %v", next)
	}
	course := result["courses"].([]any)[0].(map[string]any)
	if course["courseName"] != "声乐一对一" || course["remainingLessons"] != 5.0 || course["scheduledLessons"] != 2.0 ||
		course["completedLessons"] != 3.0 || course["expiringSoon"] != true {
		t.Fatalf("course = %v", course)
	}
	warning := result["warnings"].([]any)[0].(map[string]any)
	if warning["lessonId"] != help || warning["title"] != "补充课时" {
		t.Fatalf("warning = %v", warning)
	}
	if result["recentRecords"].([]any)[0].(map[string]any)["title"] != "已完成课程" {
		t.Fatalf("records = %v", result["recentRecords"])
	}
	raw, _ := json.Marshal(value)
	if regexp.MustCompile(`课程点|batchId|creditTypeId|frozenQuantity|operationNo`).Match(raw) {
		t.Fatalf("internal terms leaked: %s", raw)
	}
	other := put(t, f.app, "students", map[string]any{"realName": "空"}).Id
	if batches, err := f.view.courseBatches(other); err != nil || len(batches) != 0 {
		t.Fatalf("batches are not scoped to the student: %v, %v", batches, err)
	}
	value, err = f.view.overview(other)
	empty := learned(t, value, err)
	if empty["nextLesson"] != nil || len(empty["recentRecords"].([]any)) != 0 {
		t.Fatalf("empty = %v", empty)
	}
}

// Hono: courseCreditStudentLearningService › course detail aggregates sources and filters related lessons and records
func TestLearningCourseDetail(t *testing.T) {
	f := learningSetup(t)
	f.learningBatch(t, f.courseType, nil)
	f.learningBatch(t, f.chorusType, nil)
	f.learningLesson(t, f.chorusType, map[string]any{"title": "合唱课", "startAt": "2026-07-26 08:00:00.000Z"}, nil)
	f.learningEvent(t, f.courseType, nil)
	f.learningEvent(t, f.chorusType, nil)

	value, err := f.view.course(f.studentID, f.course)
	result := learned(t, value, err)
	sources := result["sources"].([]any)
	if result["courseId"] != f.course || len(sources) != 1 || sources[0].(map[string]any)["initialLessons"] != 4.0 ||
		len(result["recentLessons"].([]any)) != 1 || len(result["recentRecords"].([]any)) != 1 {
		t.Fatalf("course = %v", result)
	}
	_, err = f.view.course(f.studentID, "missing")
	failsWith(t, err, "LEARNING_COURSE_NOT_FOUND")
	_, err = f.view.course(f.studentID, "")
	failsWith(t, err, "LEARNING_COURSE_ID_REQUIRED")
}

// Hono: courseCreditStudentLearningService › lesson and record lists preserve pagination and authenticated ownership filters
func TestLearningListsPaginationAndOwnership(t *testing.T) {
	f := learningSetup(t)
	f.learningEvent(t, f.courseType, nil)
	value, err := f.view.lessons(f.studentID, map[string]string{"page": "2", "perPage": "5", "scope": "upcoming", "courseId": f.course})
	upcoming := learned(t, value, err)
	if upcoming["page"] != 2.0 || upcoming["perPage"] != 5.0 || upcoming["totalItems"] != 1.0 {
		t.Fatalf("upcoming = %v", upcoming)
	}
	filter := lessonFilter(f.studentID, f.course, "upcoming", learningNow)
	for _, part := range []string{`studentId="` + f.studentID + `"`, `courseSpecId="` + f.course + `"`, "startAt>="} {
		if !strings.Contains(filter, part) {
			t.Fatalf("filter %s lacks %s", filter, part)
		}
	}
	if !strings.Contains(lessonFilter("s", "", "completed", learningNow), `status="completed"`) {
		t.Fatal("completed filter")
	}
	if all := lessonFilter("s", "", "all", learningNow); strings.Contains(all, "startAt") || strings.Contains(all, "completed") {
		t.Fatalf("all filter = %s", all)
	}
	_, err = f.view.lessons(f.studentID, map[string]string{"scope": "future"})
	failsWith(t, err, "LEARNING_LESSON_SCOPE_INVALID")

	value, err = f.view.records(f.studentID, map[string]string{"page": "1", "perPage": "4", "courseId": f.course})
	if records := learned(t, value, err); records["items"].([]any)[0].(map[string]any)["impact"] != "used" {
		t.Fatalf("records = %v", records)
	}
	value, err = f.view.records(f.studentID, map[string]string{"page": "3", "perPage": "4", "courseId": f.course})
	if records := learned(t, value, err); records["page"] != 3.0 || records["perPage"] != 4.0 {
		t.Fatalf("records page = %v", records)
	}
	if !strings.Contains(recordFilter(f.studentID, f.course), `courseSpecId="`+f.course+`"`) {
		t.Fatal("record filter")
	}
}

// Hono: courseCreditStudentLearningService › lesson detail enforces ownership and produces experience-safe states
func TestLearningLessonDetail(t *testing.T) {
	f := learningSetup(t)
	value, err := f.view.lesson(f.studentID, f.lesson)
	result := learned(t, value, err)
	if result["lessonId"] != f.lesson || result["attendanceResult"] != "pending" || result["lessonHourResult"] != "scheduled" || result["notice"] != "" {
		t.Fatalf("lesson = %v", result)
	}
	other := put(t, f.app, "students", map[string]any{"realName": "他人"}).Id
	_, err = f.view.lesson(other, f.lesson)
	failsWith(t, err, "LEARNING_LESSON_NOT_FOUND")
	_, err = f.view.lesson(f.studentID, "missing")
	failsWith(t, err, "LEARNING_LESSON_NOT_FOUND")
	_, err = f.view.lesson(f.studentID, "")
	failsWith(t, err, "LEARNING_LESSON_ID_REQUIRED")
	_, err = f.view.overview("")
	failsWith(t, err, "STUDENT_ID_REQUIRED")
}

// Hono: courseCreditStudentLearningService › projection contract sanitizes configured text and rejects internal keys and terms
func TestLearningProjectionContract(t *testing.T) {
	if got := sanitizeStudentText("课程点批次被冻结，需要冲正操作号"); got != "课时来源被已安排，需要更正记录编号" {
		t.Fatalf("sanitize = %q", got)
	}
	if sanitizeStudentText(nil) != "" {
		t.Fatal("nil text")
	}
	safe := object{{"items", []any{object{{"title", "声乐课"}}}}}
	if got, err := checked(safe); err != nil || !reflect.DeepEqual(got, safe) {
		t.Fatalf("safe = %v, %v", got, err)
	}
	for _, value := range []any{object{{"batchId", "secret"}}, object{{"title", "查看 conversion rule"}}} {
		_, err := checked(value)
		failsWith(t, err, "STUDENT_LEARNING_CONTRACT_VIOLATION")
	}
	for _, value := range []any{nil, 2.0} {
		if got, err := checked(value); err != nil || got != value {
			t.Fatalf("passthrough %v = %v, %v", value, got, err)
		}
	}
}

func learningCreditType(name string, spec map[string]any) map[string]any {
	return map[string]any{"id": "type-" + name, "name": name, "kind": "course", "courseSpecId": spec["id"],
		"expand": map[string]any{"courseSpecId": spec}}
}

func learningBatchMap(creditType map[string]any, changes map[string]any) map[string]any {
	return with2(map[string]any{"id": "batch-1", "creditTypeId": creditType["id"], "originalQuantity": 4.0, "availableQuantity": 3.0,
		"frozenQuantity": 1.0, "consumedQuantity": 1.0, "expiredQuantity": 0.0, "status": "active",
		"validFrom": "2026-07-01T00:00:00.000Z", "effectiveExpiresAt": "2026-08-01T00:00:00.000Z",
		"created": "2026-07-01T00:00:00.000Z", "expand": map[string]any{"creditTypeId": creditType}}, changes)
}

// Hono: courseCreditStudentLearningService › projection helpers cover statuses, fallback data, ordering, and event presentation
func TestLearningProjectionHelpers(t *testing.T) {
	courses := buildCourseSummaries([]map[string]any{
		learningBatchMap(learningCreditType("B", map[string]any{"id": "b", "name": "B课程"}), map[string]any{"status": "unactivated",
			"availableQuantity": 1.0, "frozenQuantity": -1.0, "consumedQuantity": 0.0, "expiredQuantity": 2.0, "effectiveExpiresAt": ""}),
		learningBatchMap(learningCreditType("A", map[string]any{"id": "a", "name": "A课程"}), map[string]any{
			"availableQuantity": 1.0, "effectiveExpiresAt": "2026-07-20T00:00:00Z"}),
		{"creditTypeId": "missing"},
	}, learningNow)
	if len(courses) != 2 || courses[0].get("courseId") != "a" || courses[1].get("courseId") != "b" ||
		courses[1].get("awaitingActivation") != true || courses[1].get("validUntil") != nil {
		t.Fatalf("courses = %v", courses)
	}

	if got := projected(t, mapCourseSource(map[string]any{})); !reflect.DeepEqual(got, map[string]any{"grantedAt": nil, "initialLessons": 0.0,
		"remainingLessons": 0.0, "scheduledLessons": 0.0, "completedLessons": 0.0, "validFrom": nil, "validUntil": nil, "status": "pending"}) {
		t.Fatalf("source = %v", got)
	}
	if mapLesson(map[string]any{}, nil).get("title") != "课程" || mapLessonRecord(map[string]any{}).(object).get("title") != "课时记录" {
		t.Fatal("sparse lesson or record")
	}
	teacher := func(id, key, name string) map[string]any {
		return map[string]any{"teacherId": id, "expand": map[string]any{"teacherId": map[string]any{key: name}}}
	}
	lesson := mapLesson(map[string]any{"sessionId": "lesson-1"}, &lessonContext{
		teachers: []map[string]any{teacher("t1", "realname", "甲老师"), teacher("t2", "nickName", "乙老师"),
			teacher("t3", "nickname", "丙老师"), teacher("t4", "name", "丁老师"), {"teacherId": ""}},
		classes: []map[string]any{{"classId": "c1", "expand": map[string]any{"classId": map[string]any{"code": "C1"}}}},
	})
	teachers := lesson.get("teacherSummary").(object)
	if teachers.get("count") != 4 || teachers.get("overflow") != 1 || lesson.get("classSummary").(object).get("label") != "C1" {
		t.Fatalf("summaries = %v", lesson)
	}

	impacts := []string{}
	for _, eventType := range []string{"GRANT", "CONVERT_IN", "CONVERT_OUT", "FREEZE", "ACTIVATE", "CONSUME",
		"RELEASE", "EXPIRE", "EXTEND", "REVERSE", "ADJUST", "UNKNOWN"} {
		delta := 1.0
		if eventType == "ADJUST" {
			delta = -2
		}
		_, impact, _ := eventPresentation(eventType, delta)
		impacts = append(impacts, impact)
	}
	if impacts[0] != "added" || impacts[10] != "used" || impacts[11] != "neutral" {
		t.Fatalf("impacts = %v", impacts)
	}
	if _, impact, _ := eventPresentation("ADJUST", 2); impact != "added" {
		t.Fatal("positive adjustment")
	}

	mapped := func(values []string, fn func(any) string) []string {
		result := []string{}
		for _, value := range values {
			result = append(result, fn(value))
		}
		return result
	}
	if got := mapped([]string{"settled", "completed", "weird"}, lessonStatus); !reflect.DeepEqual(got, []string{"completed", "completed", "scheduled"}) {
		t.Fatalf("lesson statuses = %v", got)
	}
	if got := mapped([]string{"scheduled", "checked_in", "present", "late", "leave", "absent", "cancelled", "x"},
		func(v any) string { return lookup(attendanceResults, v, "pending") }); !reflect.DeepEqual(got,
		[]string{"pending", "present", "present", "late", "leave", "absent", "cancelled", "pending"}) {
		t.Fatalf("attendance = %v", got)
	}
	if got := mapped([]string{"pending", "credit_insufficient", "conversion_required", "reserved", "consumed", "released", "reversed", "x"},
		func(v any) string { return lookup(lessonHourResults, v, "pending") }); !reflect.DeepEqual(got,
		[]string{"pending", "needs_help", "needs_help", "scheduled", "completed", "returned", "corrected", "pending"}) {
		t.Fatalf("lesson hours = %v", got)
	}
	if !strings.Contains(learningNotice("credit_insufficient"), "教务") || learningNotice("reserved") != "" {
		t.Fatal("notice")
	}
	if got := mapped([]string{"pending", "unactivated", "active", "depleted", "expired", "cancelled", "x"},
		func(v any) string { return lookup(sourceStatuses, v, "pending") }); !reflect.DeepEqual(got,
		[]string{"pending", "awaiting_activation", "active", "completed", "expired", "cancelled", "pending"}) {
		t.Fatalf("source statuses = %v", got)
	}
	for _, item := range []struct {
		startAt any
		status  string
		want    bool
	}{{"2026-07-24T00:00:00Z", "scheduled", true}, {"invalid", "scheduled", false}, {nil, "scheduled", false},
		{"2026-07-24T00:00:00Z", "cancelled", false}} {
		if isUpcomingLesson(object{{"startAt", item.startAt}, {"status", item.status}}, learningNow) != item.want {
			t.Fatalf("upcoming %v", item)
		}
	}
	if strings.Contains(lessonFilter("s", "", "all", learningNow), "courseSpecId") || !strings.Contains(recordFilter("s", ""), "studentId") {
		t.Fatal("query filters")
	}

	fallback := buildCourseSummaries([]map[string]any{learningBatchMap(learningCreditType("合唱课程点",
		map[string]any{"id": "fallback-course"}), nil)}, learningNow)
	if fallback[0].get("courseName") != "合唱课时" || fallback[0].get("deliveryMode") != "" {
		t.Fatalf("fallback = %v", fallback)
	}
}

// Hono: courseCreditStudentLearningService › learning overview tolerates sparse lessons and deterministically orders equal start times
func TestLearningOverviewSparseAndOrdering(t *testing.T) {
	f := learningSetup(t)
	patch(t, f.app, "session_students", f.first(t, "session_students", `sessionId="`+f.lesson+`"`)["id"].(string),
		map[string]any{"studentId": put(t, f.app, "students", map[string]any{"realName": "他人"}).Id})
	sameStart := map[string]any{"startAt": "2026-07-24 08:00:00.000Z"}
	b := f.learningLesson(t, f.courseType, with2(sameStart, map[string]any{"code": "lesson-b"}), nil)
	a := f.learningLesson(t, f.courseType, with2(sameStart, map[string]any{"code": "lesson-a"}), nil)
	put(t, f.app, "session_students", map[string]any{"sessionId": "missingsession0", "studentId": f.studentID, "creditStatus": "pending"})

	value, err := f.view.overview(f.studentID)
	result := learned(t, value, err)
	want := []any{a, b}
	if b < a {
		want = []any{b, a}
	}
	got := []any{}
	for _, item := range result["upcomingLessons"].([]any) {
		got = append(got, item.(map[string]any)["lessonId"])
	}
	if !reflect.DeepEqual(got, want) || len(result["courses"].([]any)) != 0 {
		t.Fatalf("upcoming = %v, want %v; courses = %v", got, want, result["courses"])
	}
}
