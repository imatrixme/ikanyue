package coursecredit

import (
	"regexp"
	"slices"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/testkit"
)

// Roster sync cases ported from Hono's courseCreditEnrollmentRosterSync tests.

var previewHashPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

type rosterFixture struct {
	ledgerFixture
	orderID, secondLessonID string
}

// rosterSetup enrolls the student into the class that has two future lessons.
func rosterSetup(t *testing.T) rosterFixture {
	t.Helper()
	f := enrollmentSetup(t)
	second := f.classLesson(t, "s2", "scheduled", "2026-07-31 08:00:00.000Z", 2)
	result, err := f.enroll(t, f.enrollment(nil), f.admin(t))
	if err != nil {
		t.Fatal(err)
	}
	return rosterFixture{ledgerFixture: f, orderID: result["orderId"].(string), secondLessonID: second.Id}
}

// classLesson adds an hour-long lesson of the fixture class.
func (f ledgerFixture) classLesson(t *testing.T, code, status, start string, rosterVersion int) *core.Record {
	t.Helper()
	startAt, err := time.Parse("2006-01-02 15:04:05.000Z", start)
	if err != nil {
		t.Fatal(err)
	}
	lesson := testkit.Create(t, f.app, "sessions", map[string]any{"code": code, "title": code, "status": status,
		"startAt": startAt, "endAt": startAt.Add(time.Hour), "requiredCreditTypeId": f.creditTypeID, "requiredQuantity": 1,
		"rosterVersion": rosterVersion, "version": 1, "originType": "class", "attendanceRuleSnapshot": map[string]any{"mode": "manual"},
		"settlementRuleSnapshot": map[string]any{"mode": "consume"}, "teacherRuleSnapshot": map[string]any{"mode": "none"}})
	testkit.Create(t, f.app, "session_classes", map[string]any{"sessionId": lesson.Id, "classId": f.classID})
	return lesson
}

func lessonIDs(preview map[string]any) []string {
	result := []string{}
	for _, lesson := range preview["lessons"].([]any) {
		result = append(result, lesson.(map[string]any)["lessonId"].(string))
	}
	return result
}

func (f rosterFixture) preview(t *testing.T) map[string]any {
	t.Helper()
	preview, err := previewRosterSync(f.app, f.orderID, enrollmentNow)
	if err != nil {
		t.Fatal(err)
	}
	return preview
}

func (f rosterFixture) confirm(t *testing.T, values map[string]any, key string) (map[string]any, error) {
	t.Helper()
	actor := f.admin(t)
	actor.IdempotencyKey = key
	return confirmRosterSync(f.app, f.orderID, bodyOf(values), actor, enrollmentNow)
}

// Hono: courseCreditEnrollmentRosterSync › roster sync preview lists only future published lessons missing the enrolled student
func TestRosterSyncPreviewListsMissingLessons(t *testing.T) {
	f := rosterSetup(t)
	put(t, f.app, "session_students", map[string]any{"sessionId": f.secondLessonID, "studentId": f.studentID,
		"attendanceStatus": "scheduled", "creditStatus": "pending", "version": 1})
	// Past and draft lessons are never offered.
	f.classLesson(t, "past", "scheduled", "2026-07-01 08:00:00.000Z", 1)
	f.classLesson(t, "draft", "draft", "2026-08-01 08:00:00.000Z", 1)
	preview := f.preview(t)
	if preview["classId"] != f.classID || !slices.Equal(lessonIDs(preview), []string{f.sessionID}) ||
		!previewHashPattern.MatchString(preview["previewHash"].(string)) {
		t.Fatalf("preview = %v", preview)
	}
}

// Hono: courseCreditEnrollmentRosterSync › roster sync confirmation atomically appends selected roster rows and increments snapshots
func TestRosterSyncConfirmAppendsSelectedLessons(t *testing.T) {
	f := rosterSetup(t)
	preview := f.preview(t)
	result, err := f.confirm(t, map[string]any{"previewHash": preview["previewHash"], "lessonIds": []any{f.secondLessonID}}, "sync")
	if err != nil {
		t.Fatal(err)
	}
	if result["status"] != "completed" || result["replayed"] != false ||
		!slices.Equal(result["synchronizedLessonIds"].([]any), []any{f.secondLessonID}) {
		t.Fatalf("result = %v", result)
	}
	roster := f.first(t, "session_students", `sessionId="`+f.secondLessonID+`"`)
	if roster["studentId"] != f.studentID || roster["creditStatus"] != "pending" {
		t.Fatalf("roster = %v", roster)
	}
	if lesson := f.first(t, "sessions", `id="`+f.secondLessonID+`"`); lesson["rosterVersion"] != 3.0 {
		t.Fatalf("lesson = %v", lesson)
	}
	if f.count(t, "credit_version_claims", `entityId="`+f.secondLessonID+`"`) != 1 {
		t.Fatal("missing session version claim")
	}
	if f.count(t, "outbox_events", `topic="course-enrollment.roster-corrected"`) != 1 {
		t.Fatal("missing roster outbox event")
	}
	if f.count(t, "session_students", `sessionId="`+f.sessionID+`"`) != 0 {
		t.Fatal("unselected lesson was synchronized")
	}
}

// Hono: courseCreditEnrollmentRosterSync › roster sync handles no-class orders, all-lesson confirmation, replays, and stale previews
func TestRosterSyncNoClassAllLessonsReplayAndStale(t *testing.T) {
	f := rosterSetup(t)
	noClass, err := enroll(f.app, bodyOf(f.enrollment(map[string]any{"classId": "", "paymentReference": "cash-2"})), Actor{ID: f.operatorID(t), IdempotencyKey: "no-class"}, enrollmentNow)
	if err != nil {
		t.Fatal(err)
	}
	empty, err := previewRosterSync(f.app, noClass["orderId"].(string), enrollmentNow)
	if err != nil || empty["classId"] != nil || len(empty["lessons"].([]any)) != 0 {
		t.Fatalf("no class = %v, %v", empty, err)
	}

	preview := f.preview(t)
	_, err = f.confirm(t, map[string]any{"previewHash": "stale"}, "stale")
	failsWith(t, err, "SYNC_PREVIEW_STALE")
	_, err = f.confirm(t, map[string]any{"previewHash": preview["previewHash"], "lessonIds": []any{"missing"}}, "missing")
	failsWith(t, err, "SYNC_LESSON_SELECTION_INVALID")

	all, err := f.confirm(t, map[string]any{"previewHash": preview["previewHash"]}, "all")
	if err != nil || len(all["synchronizedLessonIds"].([]any)) != 2 {
		t.Fatalf("all = %v, %v", all, err)
	}
	// Like Hono, the preview is compared before replay, so a retry after success sees a stale preview.
	_, err = f.confirm(t, map[string]any{"previewHash": preview["previewHash"]}, "all")
	failsWith(t, err, "SYNC_PREVIEW_STALE")
}

// Hono: courseCreditEnrollmentRosterSync › roster sync handles no-class orders, all-lesson confirmation, replays, and stale previews
func TestRosterSyncReplaysStoredOperation(t *testing.T) {
	f := rosterSetup(t)
	preview := f.preview(t)
	ids := lessonIDs(preview)
	slices.Sort(ids)
	lessonIDs := make([]any, len(ids))
	for i, id := range ids {
		lessonIDs[i] = id
	}
	hash := fingerprint(map[string]any{"orderId": f.orderID, "lessonIds": lessonIDs, "previewHash": preview["previewHash"]})
	put(t, f.app, "credit_operations", map[string]any{"type": "adjust", "status": "committed", "operationNo": "stored-sync",
		"idempotencyKey": "confirmEnrollmentRosterSync:replay", "requestSnapshot": map[string]any{"requestHash": hash},
		"resultSnapshot": map[string]any{"operationId": "stored-sync", "status": "completed"}})
	replayed, err := f.confirm(t, map[string]any{"previewHash": preview["previewHash"]}, "replay")
	if err != nil || replayed["replayed"] != true || replayed["operationId"] != "stored-sync" {
		t.Fatalf("replay = %v, %v", replayed, err)
	}
	if f.count(t, "session_students", "") != 0 {
		t.Fatal("replay wrote roster rows")
	}
}

// Hono: courseCreditEnrollmentRosterSync › roster sync validates required ids and helper fallbacks
func TestRosterSyncValidationAndFallbacks(t *testing.T) {
	f := rosterSetup(t)
	_, err := previewRosterSync(f.app, "", enrollmentNow)
	failsWith(t, err, "ORDER_ID_REQUIRED")
	_, err = f.confirm(t, map[string]any{}, "no-hash")
	failsWith(t, err, "SYNC_PREVIEW_HASH_REQUIRED")
	if got := expanded(map[string]any{"expand": map[string]any{"x": []any{map[string]any{"id": "one"}}}}, "x"); got["id"] != "one" {
		t.Fatalf("expanded list = %v", got)
	}
	for _, record := range []map[string]any{{"expand": map[string]any{"x": []any{}}}, {}} {
		if got := expanded(record, "x"); len(got) != 0 {
			t.Fatalf("expanded empty = %v", got)
		}
	}
}

// Hono: courseCreditEnrollmentRosterSync › roster sync defaults and actor fallback are stable
func TestRosterSyncActorFallback(t *testing.T) {
	f := rosterSetup(t)
	preview := f.preview(t)
	actor := f.admin(t)
	actor.Role, actor.IdempotencyKey = "", "fallback"
	if _, err := confirmRosterSync(f.app, f.orderID, bodyOf(map[string]any{"previewHash": preview["previewHash"]}), actor, enrollmentNow); err != nil {
		t.Fatal(err)
	}
	if log := f.first(t, "ops_audit_logs", `action="course_operations.enrollment.sync_roster"`); log["actorRole"] != "admin" {
		t.Fatalf("audit = %v", log)
	}
}
