package coursecredit

import (
	"net/http"
	"reflect"
	"slices"
	"strings"
	"testing"

	"kanyue.server/internal/testkit"
)

// Student learning route cases ported from Hono's courseCreditStudentLearningRoutes
// tests, plus Hono's teaching integration case over real PocketBase commands.

// Hono: courseCreditStudentLearningRoutes › student learning routes use authenticated identity and forward only supported query fields
func TestLearningRoutesUseAuthenticatedStudent(t *testing.T) {
	f := learningSetup(t)
	f.learningBatch(t, f.courseType, nil)
	f.learningEvent(t, f.courseType, nil)
	// Routes read the real clock, so the lesson must still be ahead.
	patch(t, f.app, "sessions", f.lesson, map[string]any{"startAt": "2099-07-24 08:00:00.000Z", "endAt": "2099-07-24 09:00:00.000Z"})
	other := put(t, f.app, "students", map[string]any{"realName": "他人"}).Id
	get := func(path string) map[string]any {
		return ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/student/learning"+path, nil, f.student), path)
	}

	if next := get("/overview?studentId=" + other)["nextLesson"].(map[string]any); next["lessonId"] != f.lesson {
		t.Fatalf("overview = %v", next)
	}
	if course := get("/courses/" + f.course); course["courseId"] != f.course {
		t.Fatalf("course = %v", course)
	}
	lessons := get("/lessons?page=2&perPage=5&scope=upcoming&courseId=" + f.course + "&ignored=x&studentId=" + other)
	if lessons["page"] != 2.0 || lessons["perPage"] != 5.0 || lessons["totalItems"] != 1.0 || len(lessons["items"].([]any)) != 0 {
		t.Fatalf("lessons = %v", lessons)
	}
	if lesson := get("/lessons/" + f.lesson); lesson["lessonId"] != f.lesson {
		t.Fatalf("lesson = %v", lesson)
	}
	records := get("/records?page=3&courseId=" + f.course)
	if records["page"] != 3.0 || records["perPage"] != 20.0 || records["totalItems"] != 1.0 || len(records["items"].([]any)) != 0 {
		t.Fatalf("records = %v", records)
	}
	// A spoofed studentId query is ignored: the other student's view would be empty.
	if overview := get("/overview?studentId=" + other); len(overview["recentRecords"].([]any)) != 1 {
		t.Fatalf("overview = %v", overview)
	}
}

// Hono: courseCreditStudentLearningRoutes › student learning routes reject non-students before loading services
func TestLearningRoutesRejectNonStudents(t *testing.T) {
	f := learningSetup(t)
	for _, path := range []string{"/overview", "/courses/" + f.course, "/lessons", "/lessons/" + f.lesson, "/records"} {
		result := testkit.Call(t, f.handler, http.MethodGet, "/v1/student/learning"+path, nil, f.teacher)
		failed(t, result, 403, "STUDENT_LEARNING_STUDENT_REQUIRED", path)
		if !strings.Contains(result.Body["message"].(string), "仅学员") {
			t.Fatalf("%s = %v", path, result.Body)
		}
	}
}

// Hono: courseCreditStudentLearningRoutes › student learning handler validation covers missing users
func TestLearningRoutesRequireUser(t *testing.T) {
	f := learningSetup(t)
	failed(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/student/learning/overview", nil, nil), 403, "AUTH_SESSION_INVALID", "anonymous")
	ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/student/learning/overview", nil, f.student), "student")
}

// Hono: courseCreditTeachingIntegration › real PocketBase persists teaching commands through Hono SDK batches without business hooks
func TestTeachingCommandsPersistWithoutCreditMovements(t *testing.T) {
	f := publicationSetup(t, nil)
	_, err := f.app.DB().NewQuery("DELETE FROM class_students").Execute()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.app.DB().NewQuery("DELETE FROM class_teachers").Execute(); err != nil {
		t.Fatal(err)
	}
	actor := f.admin(t)
	command := func(key string, values map[string]any) map[string]any {
		actor.IdempotencyKey = key
		return bookingInput(Body{Values: values}, actor, nil)
	}
	student := f.students["student-1"]
	operations := []string{}
	for i, classID := range []string{f.classA, f.classB} {
		member, err := setStudentMembership(f.app, command("member-"+classID, map[string]any{"classId": classID, "studentId": student,
			"status": "active", "effectiveFrom": "2026-01-01T00:00:00.000Z"}))
		if err != nil {
			t.Fatal(err)
		}
		teacher, err := setTeacherAssignment(f.app, command("teacher-"+classID, map[string]any{"classId": classID,
			"teacherId": f.teachers["lead"], "role": "lead", "status": "active", "effectiveFrom": "2026-01-01T00:00:00.000Z"}))
		if err != nil {
			t.Fatalf("assignment %d: %v", i, err)
		}
		operations = append(operations, member["operationId"].(string), teacher["operationId"].(string))
	}
	patch(t, f.app, "sessions", f.draftID, map[string]any{"version": 1})

	override := map[string]any{"teacherOverrides": []any{map[string]any{"teacherId": f.teachers["substitute"], "role": "lead",
		"assignmentSource": "substitute", "actualStatus": "confirmed"}}, "classIds": []any{f.classB, f.classA}}
	published, err := f.publish(t, "publish", override)
	if err != nil {
		t.Fatal(err)
	}
	operations = append(operations, published["operationId"].(string))
	if replay, err := f.publish(t, "publish", override); err != nil || replay["replayed"] != true {
		t.Fatalf("replay = %v, %v", replay, err)
	}

	filter := `sessionId="` + f.draftID + `"`
	session := f.first(t, "sessions", `id="`+f.draftID+`"`)
	if session["status"] != "scheduled" || session["version"] != 2.0 || f.count(t, "session_classes", filter) != 2 {
		t.Fatalf("session = %v", session)
	}
	roster := f.first(t, "session_students", filter)
	if f.count(t, "session_students", filter) != 1 || roster["studentId"] != student {
		t.Fatalf("roster = %v", roster)
	}
	sources := slices.Clone(roster["sourceClassIds"].([]any))
	want := []any{f.classA, f.classB}
	if f.classB < f.classA {
		want = []any{f.classB, f.classA}
	}
	if !reflect.DeepEqual(sources, want) {
		t.Fatalf("sources = %v", sources)
	}
	teacher := f.first(t, "session_teachers", filter)
	if f.count(t, "session_teachers", filter) != 1 || teacher["teacherId"] != f.teachers["substitute"] ||
		teacher["assignmentSource"] != "substitute" || teacher["actualStatus"] != "confirmed" {
		t.Fatalf("teachers = %v", teacher)
	}

	paused, err := setStudentMembership(f.app, command("pause", map[string]any{"classId": f.classA, "studentId": student,
		"status": "paused", "effectiveFrom": "2026-11-01T00:00:00.000Z"}))
	if err != nil {
		t.Fatal(err)
	}
	operations = append(operations, paused["operationId"].(string))
	if historical := f.first(t, "session_students", `id="`+roster["id"].(string)+`"`); !reflect.DeepEqual(historical["sourceClassIds"], want) {
		t.Fatalf("historical roster = %v", historical)
	}

	for _, operation := range operations {
		if f.count(t, "credit_events", `operationId="`+operation+`"`) != 0 || f.count(t, "credit_batches", `sourceOperationId="`+operation+`"`) != 0 {
			t.Fatalf("operation %s moved credit", operation)
		}
	}
	if f.count(t, "session_credit_allocations", `sessionStudentId="`+roster["id"].(string)+`"`) != 0 {
		t.Fatal("publication reserved credit")
	}
}
