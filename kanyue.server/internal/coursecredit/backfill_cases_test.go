package coursecredit

import (
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"kanyue.server/internal/testkit"
)

// Ports of Hono's courseBookingBackfill.test.js.

const (
	backfillStart = "2026-08-03T01:00:00.000Z"
	backfillEnd   = "2026-08-03T02:00:00.000Z"
)

func backfillEntryFor(t *testing.T, sessionID, teacherID string) backfillEntry {
	t.Helper()
	plan, err := sessionClaimPlan("", backfillStart, backfillEnd, sessionID, []string{teacherID}, []string{"student-" + sessionID})
	if err != nil {
		t.Fatal(err)
	}
	return backfillEntry{session: map[string]any{"id": sessionID, "status": "scheduled", "startAt": backfillStart, "endAt": backfillEnd}, plan: plan}
}

func claimsOf(entry backfillEntry, sourceID string, edit func(map[string]any)) []map[string]any {
	claims := []map[string]any{}
	for _, request := range entry.plan {
		claim := copyMap(request.data)
		claim["sourceId"] = sourceID
		if edit != nil {
			edit(claim)
		}
		claims = append(claims, claim)
	}
	return claims
}

// Hono: courseBookingBackfill › backfill preview separates ready, already claimed, and conflicting future lessons
func TestBackfillReportSeparatesReadyClaimedAndConflicting(t *testing.T) {
	ready := backfillEntryFor(t, "ready", "teacher-c")
	claimed := backfillEntryFor(t, "claimed", "teacher-b")
	conflict := backfillEntryFor(t, "conflict", "teacher-a")
	existing := append(claimsOf(claimed, "claimed", nil), claimsOf(conflict, "other-session", nil)[0])

	report := buildBackfillReport([]backfillEntry{claimed, ready, conflict}, existing)
	if !slices.Equal(report.claimed, []string{"claimed"}) || len(report.conflicts) == 0 || report.scanned != 3 {
		t.Fatalf("report = %+v", report)
	}
	if len(report.ready) != 1 || report.ready[0].sessionID != "ready" || len(report.ready[0].requests) != 8 {
		t.Fatalf("ready = %+v", report.ready)
	}
	// An empty roster is reported rather than silently skipped.
	empty := buildBackfillReport([]backfillEntry{{session: map[string]any{"id": "empty", "startAt": backfillStart, "endAt": backfillEnd}}}, nil)
	if len(empty.conflicts) != 1 || empty.conflicts[0]["reason"] != "missing_teacher_or_student" || empty.conflicts[0]["ownerType"] != "room" {
		t.Fatalf("empty roster = %+v", empty.conflicts)
	}
	if record := backfillConflictRecord(empty.conflicts[0]); record["teacherId"] != "" || record["type"] != "backfill_overlap" ||
		record["details"].(map[string]any)["reason"] != "missing_teacher_or_student" {
		t.Fatalf("room conflict record = %v", record)
	}
}

// Hono: courseBookingBackfill › backfill recognizes PocketBase space-formatted dates as existing ISO claims
func TestBackfillReportMatchesStoredDateFormat(t *testing.T) {
	claimed := backfillEntryFor(t, "claimed", "teacher-b")
	existing := claimsOf(claimed, "claimed", func(claim map[string]any) {
		claim["cellStartAt"] = strings.Replace(claim["cellStartAt"].(string), "T", " ", 1)
	})
	report := buildBackfillReport([]backfillEntry{claimed}, existing)
	if !slices.Equal(report.claimed, []string{"claimed"}) || len(report.ready) != 0 || len(report.conflicts) != 0 {
		t.Fatalf("report = %+v", report)
	}
}

// Hono: courseBookingBackfill › claim key normalization keeps malformed storage values deterministic
func TestNormalizedCellStartKeepsMalformedValues(t *testing.T) {
	if got := normalizedCellStart("not-a-date"); got != "not-a-date" {
		t.Fatalf("malformed = %q", got)
	}
	if got := normalizedCellStart(nil); got != "" {
		t.Fatalf("null = %q", got)
	}
	if got := normalizedCellStart("2026-08-03 01:00:00.000Z"); got != backfillStart {
		t.Fatalf("stored = %q", got)
	}
}

// Hono: courseBookingBackfill › backfill apply creates claims and disables offerings for conflicting teachers
// Runs through the ops routes, so the preview shape is the admin's BookingBackfillPreview.
func TestBackfillApplyClaimsAndDisablesConflictingOfferings(t *testing.T) {
	f := bookingSetup(t, false)
	start := time.Now().UTC().Add(72 * time.Hour).Truncate(time.Hour)
	session := func(code, status string, at time.Time) string {
		record := testkit.Create(t, f.app, "sessions", map[string]any{"code": code, "title": code, "status": status,
			"startAt": at, "endAt": at.Add(time.Hour), "requiredCreditTypeId": f.creditID, "requiredQuantity": 1, "rosterVersion": 1, "version": 1,
			"originType": "class", "attendanceRuleSnapshot": map[string]any{"mode": "manual"}, "settlementRuleSnapshot": map[string]any{"mode": "consume"},
			"teacherRuleSnapshot": map[string]any{"mode": "none"}})
		if status == "scheduled" {
			testkit.Create(t, f.app, "session_teachers", map[string]any{"sessionId": record.Id, "teacherId": f.teacherID, "role": "lead",
				"assignmentSource": "class_default", "actualStatus": "planned", "creditStatus": "not_eligible"})
			testkit.Create(t, f.app, "session_students", map[string]any{"sessionId": record.Id, "studentId": f.studentID,
				"attendanceStatus": "scheduled", "creditStatus": "reserved", "version": 1})
		}
		return record.Id
	}
	legacy := session("legacy", "completed", start)
	overlapping := session("overlapping", "scheduled", start)
	free := session("free", "scheduled", start.Add(2*time.Hour))
	testkit.Create(t, f.app, "schedule_claims", map[string]any{"ownerType": "teacher", "ownerId": f.teacherID, "status": "active",
		"sourceType": "session", "sourceId": legacy, "cellStartAt": start, "cellEndAt": start.Add(15 * time.Minute), "version": 1})

	from := iso(time.Now().UTC())
	preview := ok(t, f.call(t, f.ops, http.MethodGet, "/ops/course-bookings/backfill/preview?from="+from, nil, ""), "preview")
	if preview["claimed"] != float64(1) || preview["ready"] != false || preview["scannedCount"] != float64(2) || len(preview["conflicts"].([]any)) != 1 {
		t.Fatalf("preview = %v", preview)
	}
	if conflict := preview["conflicts"].([]any)[0].(map[string]any); conflict["teacherId"] != f.teacherID || conflict["sessionId"] != overlapping {
		t.Fatalf("preview conflict = %v", conflict)
	}
	failed(t, f.call(t, f.opsToken(t, "finance", Finance), http.MethodGet, "/ops/course-bookings/backfill/preview", nil, ""), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "finance preview")
	failed(t, f.call(t, f.ops, http.MethodGet, "/ops/course-bookings/backfill/preview?from=bad", nil, ""), 400, "BOOKING_BACKFILL_RANGE_INVALID", "bad range")

	body := map[string]any{"from": from}
	result := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/backfill", body, "backfill-key"), "apply")
	if result["scannedCount"] != float64(2) || result["conflictCount"] != float64(1) ||
		!slices.Equal(result["disabledOfferingIds"].([]any), []any{f.offeringID}) || !slices.Equal(result["claimedSessionIds"].([]any), []any{free}) {
		t.Fatalf("apply = %v", result)
	}
	if replay := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/backfill", body, "backfill-key"), "replay"); replay["operationId"] != result["operationId"] {
		t.Fatalf("replay = %v", replay)
	}

	conflict := findFirstMap(t, f.app, "booking_conflicts", `type="backfill_overlap"`)
	if conflict["sessionId"] != overlapping || conflict["status"] != "open" || conflict["details"].(map[string]any)["conflictingSourceId"] != legacy {
		t.Fatalf("conflict = %v", conflict)
	}
	if offering := findFirstMap(t, f.app, "teacher_course_offerings", `id="`+f.offeringID+`"`); offering["status"] != "inactive" || offering["version"] != float64(2) {
		t.Fatalf("offering = %v", offering)
	}
	if operation := findFirstMap(t, f.app, "credit_operations", `id="`+result["operationId"].(string)+`"`); operation["type"] != "backfill_schedule_claims" || operation["sourceType"] != "schedule_backfill" {
		t.Fatalf("operation = %v", operation)
	}
	claims, err := f.app.FindRecordsByFilter("schedule_claims", `sourceId="`+free+`" && status="active"`, "", 0, 0)
	if err != nil || len(claims) != 8 {
		t.Fatalf("free session claims = %d %v", len(claims), err)
	}
	findFirstMap(t, f.app, "outbox_events", `topic="course-booking.schedule-backfilled"`)

	// A second pass sees the free session as already claimed.
	again := ok(t, f.call(t, f.ops, http.MethodGet, "/ops/course-bookings/backfill/preview?from="+from, nil, ""), "preview again")
	if again["claimed"] != float64(0) || len(again["conflicts"].([]any)) != 1 {
		t.Fatalf("preview again = %v", again)
	}
}
