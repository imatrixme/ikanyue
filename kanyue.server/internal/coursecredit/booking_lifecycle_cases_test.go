package coursecredit

import (
	"net/http"
	"testing"
	"time"

	"kanyue.server/internal/jsx"
)

// Appointment lifecycle cases ported from Hono's courseBookingLifecycle tests.
// Hono asserts on a mocked write plan; Go asserts on the committed records.

// pending requests one appointment on the slot at index and returns its id.
func (f bookingFixture) pending(t *testing.T, index int, key string) string {
	t.Helper()
	return f.request(t, f.slots(t)[index], key)["appointmentId"].(string)
}

// confirmed requests and confirms one appointment and returns it with its session.
func (f bookingFixture) confirmed(t *testing.T, index int, key string) (string, string) {
	t.Helper()
	id := f.pending(t, index, key)
	result := ok(t, f.call(t, f.teacher, http.MethodPost, "/v1/teacher/appointments/"+id+"/confirm", nil, key+"-c"), "confirm")
	return id, result["lessonId"].(string)
}

func (f bookingFixture) as(role, key string, fields map[string]any) map[string]any {
	input := map[string]any{"idempotencyKey": key, "traceId": "trace-" + key, "actorRole": role}
	switch role {
	case "teacher":
		input["actorId"], input["teacherId"] = f.teacherID, f.teacherID
	case "student":
		input["actorId"], input["studentId"] = f.studentID, f.studentID
	default:
		input["actorId"] = "operator"
	}
	for name, value := range fields {
		input[name] = value
	}
	return input
}

func recordField(t *testing.T, f bookingFixture, collection, id, field string) any {
	t.Helper()
	record, err := get(f.app, collection, id)
	if err != nil {
		t.Fatal(err)
	}
	return record[field]
}

// Hono: courseBookingLifecycle › teacher decline and student withdrawal append a guarded pending transition
func TestDeclineAndWithdrawPendingAppointments(t *testing.T) {
	f := bookingSetup(t, true)
	first := f.pending(t, 10, "r1")
	_, err := declineAppointment(f.app, f.as("teacher", "d0", map[string]any{"appointmentId": first, "teacherId": "other", "reason": "无空档"}))
	failsWith(t, err, "APPOINTMENT_TEACHER_FORBIDDEN")
	declined, err := declineAppointment(f.app, f.as("teacher", "d1", map[string]any{"appointmentId": first, "reason": "时间不合适"}))
	if err != nil || declined["status"] != "declined" || recordField(t, f, "appointment_requests", first, "status") != "declined" {
		t.Fatalf("declined = %v, %v", declined, err)
	}
	second := f.pending(t, 20, "r2")
	withdrawn, err := withdrawAppointment(f.app, f.as("student", "w1", map[string]any{"appointmentId": second, "reason": "计划有变"}))
	if err != nil || withdrawn["status"] != "withdrawn" || recordField(t, f, "appointment_requests", second, "cancelledAt") == "" {
		t.Fatalf("withdrawn = %v, %v", withdrawn, err)
	}
}

// Hono: courseBookingLifecycle › Admin can decline a pending appointment without teacher impersonation
func TestAdminDeclinesWithoutTeacher(t *testing.T) {
	f := bookingSetup(t, true)
	id := f.pending(t, 10, "r1")
	declined, err := declineAppointment(f.app, f.as("admin", "d1", map[string]any{"appointmentId": id, "reason": "教务代教师拒绝"}))
	if err != nil || declined["status"] != "declined" {
		t.Fatalf("declined = %v, %v", declined, err)
	}
	event, err := f.app.FindFirstRecordByFilter("appointment_events", `appointmentId="`+id+`" && toStatus="declined"`)
	if err != nil || event.GetString("actorRole") != "admin" {
		t.Fatalf("event = %v, %v", event, err)
	}
}

// Hono: courseBookingLifecycle › pending appointment transitions reject missing owners, missing reasons, and stale state
func TestPendingTransitionValidation(t *testing.T) {
	f := bookingSetup(t, true)
	confirmed, _ := f.confirmed(t, 30, "r2")
	id := f.pending(t, 10, "r1")
	_, err := declineAppointment(f.app, f.as("teacher", "v1", map[string]any{"appointmentId": "", "reason": "原因"}))
	failsWith(t, err, "APPOINTMENT_ID_REQUIRED")
	_, err = declineAppointment(f.app, f.as("teacher", "v2", map[string]any{"appointmentId": id, "teacherId": "", "reason": "原因"}))
	failsWith(t, err, "APPOINTMENT_OWNER_REQUIRED")
	_, err = declineAppointment(f.app, f.as("teacher", "v3", map[string]any{"appointmentId": id, "reason": ""}))
	failsWith(t, err, "APPOINTMENT_DECLINE_REASON_REQUIRED")
	_, err = withdrawAppointment(f.app, f.as("student", "v4", map[string]any{"appointmentId": id, "studentId": "other"}))
	failsWith(t, err, "APPOINTMENT_STUDENT_FORBIDDEN")
	_, err = withdrawAppointment(f.app, f.as("student", "v5", map[string]any{"appointmentId": confirmed}))
	failsWith(t, err, "APPOINTMENT_NOT_PENDING")
}

// Hono: courseBookingLifecycle › confirmed appointment cancellation releases lesson hours and all active schedule claims atomically
func TestCancellationReleasesCreditAndClaims(t *testing.T) {
	f := bookingSetup(t, true)
	id, sessionID := f.confirmed(t, 40, "r1")
	result, err := cancelAppointment(f.app, f.as("student", "x1", map[string]any{"appointmentId": id, "reason": "临时有事"}))
	if err != nil || result["status"] != "cancelled" {
		t.Fatalf("cancel = %v, %v", result, err)
	}
	if recordField(t, f, "sessions", sessionID, "status") != "cancelled" {
		t.Fatal("session not cancelled")
	}
	if batch := batchOf(t, f.app, f.studentID); batch.GetInt("frozenQuantity") != 0 || batch.GetInt("availableQuantity") != 10 {
		t.Fatalf("batch = %v", batch.FieldsData())
	}
	student, err := f.app.FindFirstRecordByFilter("session_students", `sessionId="`+sessionID+`"`)
	if err != nil || student.GetString("creditStatus") != "released" {
		t.Fatalf("session student = %v, %v", student, err)
	}
	if claims := activeClaims(t, f.app, id); claims != 0 {
		t.Fatalf("active claims = %d", claims)
	}
	releases, _ := f.app.FindRecordsByFilter("credit_events", `eventType="RELEASE"`, "", 0, 0)
	if len(releases) != 1 {
		t.Fatalf("release events = %d", len(releases))
	}
}

// Hono: courseBookingLifecycle › student cancellation respects the snapshotted cutoff and ownership
func TestStudentCancellationCutoffAndOwnership(t *testing.T) {
	f := bookingSetup(t, true)
	id, _ := f.confirmed(t, 40, "r1")
	_, err := cancelAppointment(f.app, f.as("student", "x0", map[string]any{"appointmentId": id, "studentId": "other", "reason": "临时有事"}))
	failsWith(t, err, "APPOINTMENT_STUDENT_FORBIDDEN")
	patch(t, f.app, "appointment_requests", id, map[string]any{"policySnapshot": map[string]any{"cancellationCutoffMinutes": 60 * 24 * 30}})
	_, err = cancelAppointment(f.app, f.as("student", "x1", map[string]any{"appointmentId": id, "reason": "临时有事"}))
	failsWith(t, err, "APPOINTMENT_CANCELLATION_CUTOFF_PASSED")
	if recordField(t, f, "appointment_requests", id, "status") != "confirmed" {
		t.Fatal("a rejected cancellation must not change the appointment")
	}
}

// Hono: courseBookingLifecycle › teacher reschedule swaps claims, preserves reservation, and updates lesson and appointment time
func TestTeacherRescheduleMovesEverything(t *testing.T) {
	f := bookingSetup(t, true)
	id, sessionID := f.confirmed(t, 40, "r1")
	target := f.slots(t)[80]
	result, err := rescheduleAppointment(f.app, f.as("teacher", "m1", map[string]any{"appointmentId": id, "reason": "调整教学安排",
		"newStartAt": target["startAt"], "newEndAt": target["endAt"]}))
	if err != nil || result["status"] != "rescheduled" {
		t.Fatalf("reschedule = %v, %v", result, err)
	}
	start := target["startAt"].(string)
	if iso(asTime(t, recordField(t, f, "sessions", sessionID, "startAt"))) != start ||
		iso(asTime(t, recordField(t, f, "appointment_requests", id, "requestedStartAt"))) != start {
		t.Fatal("session and appointment must move together")
	}
	claims, _ := f.app.FindRecordsByFilter("schedule_claims", `appointmentId="`+id+`" && status="active"`, "cellStartAt", 0, 0)
	if len(claims) != 8 || iso(claims[0].GetDateTime("cellStartAt").Time()) != start {
		t.Fatalf("claims = %d", len(claims))
	}
	allocation, err := f.app.FindFirstRecordByFilter("session_credit_allocations", `status="reserved"`)
	if err != nil || iso(allocation.GetDateTime("reservedForStartAt").Time()) != start {
		t.Fatalf("allocation = %v, %v", allocation, err)
	}
	if batch := batchOf(t, f.app, f.studentID); batch.GetInt("frozenQuantity") != 1 {
		t.Fatalf("reservation lost: %v", batch.FieldsData())
	}
}

// Hono: courseBookingLifecycle › reschedule preserves the old state when target availability or eligibility fails
func TestRescheduleFailureKeepsOldState(t *testing.T) {
	f := bookingSetup(t, true)
	id, sessionID := f.confirmed(t, 40, "r1")
	slots := f.slots(t)
	before := recordField(t, f, "sessions", sessionID, "startAt")
	taken := slots[80]
	ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/appointments", map[string]any{"studentId": f.studentID, "offeringId": f.offeringID,
		"startAt": taken["startAt"], "endAt": taken["endAt"], "confirm": true}, "o1"), "book target")
	_, err := rescheduleAppointment(f.app, f.as("teacher", "m1", map[string]any{"appointmentId": id, "reason": "调整安排",
		"newStartAt": taken["startAt"], "newEndAt": taken["endAt"]}))
	failsWith(t, err, "BOOKING_SLOT_TAKEN")

	later := slots[len(slots)-1]
	batch := batchOf(t, f.app, f.studentID)
	expiry, _ := millis(later["startAt"])
	batch.Set("effectiveExpiresAt", fromMillis(expiry-60*minuteMillis))
	if err := f.app.Save(batch); err != nil {
		t.Fatal(err)
	}
	// Go's slot check uses the same batches as the credit plan, so an expired batch hides the slot first.
	_, err = rescheduleAppointment(f.app, f.as("teacher", "m2", map[string]any{"appointmentId": id, "reason": "调整安排",
		"newStartAt": later["startAt"], "newEndAt": later["endAt"]}))
	failsWith(t, err, "BOOKING_SLOT_TAKEN")
	if after := recordField(t, f, "sessions", sessionID, "startAt"); after != before || activeClaims(t, f.app, id) != 8 {
		t.Fatalf("session moved to %v", after)
	}
	// The credit plan itself reports no reservation, which rescheduleAppointment maps to APPOINTMENT_ELIGIBILITY_LOST.
	session, _ := get(f.app, "sessions", sessionID)
	student, _ := findFirst(f.app, "session_students", `sessionId="`+sessionID+`"`)
	allocations, _ := list(f.app, "session_credit_allocations", `status="reserved" && sessionStudentId="`+jsx.String(student["id"])+`"`, "id")
	creditType, _ := get(f.app, "credit_types", f.creditID)
	stored, _ := get(f.app, "credit_batches", batch.Id)
	_, outcome, err := rescheduleCreditPlan(rescheduleInput{session: session, sessionStudent: student, creditType: creditType,
		allocations: allocations, allocated: map[string]map[string]any{batch.Id: stored}, newStartAt: later["startAt"].(string),
		at: iso(time.Now().UTC()), operationID: "operation"})
	if err != nil || outcome.reserved {
		t.Fatalf("outcome = %+v, %v", outcome, err)
	}
}

// Hono: courseBookingLifecycle › workers expire pending requests and fulfill appointments linked to completed lessons
func TestWorkersExpireAndFulfill(t *testing.T) {
	f := bookingSetup(t, true)
	pendingID := f.pending(t, 10, "r1")
	deadline := recordField(t, f, "appointment_requests", pendingID, "responseDeadline").(string)
	expired, err := expireAppointments(f.app, f.as("admin", "e1", map[string]any{"cutoffAt": deadline}))
	if err != nil || expired["processedCount"] != 1 || recordField(t, f, "appointment_requests", pendingID, "status") != "expired" {
		t.Fatalf("expired = %v, %v", expired, err)
	}
	if filter := expireFilter("2026-08-01T00:00:00.000Z"); filter != `status="pending" && responseDeadline<="2026-08-01 00:00:00.000Z"` {
		t.Fatalf("filter = %s", filter)
	}
	id, sessionID := f.confirmed(t, 40, "r2")
	patch(t, f.app, "sessions", sessionID, map[string]any{"status": "completed"})
	fulfilled, err := fulfillAppointments(f.app, f.as("admin", "f1", nil))
	if err != nil || fulfilled["status"] != "fulfilled" || recordField(t, f, "appointment_requests", id, "status") != "fulfilled" {
		t.Fatalf("fulfilled = %v, %v", fulfilled, err)
	}
}

// Hono: courseBookingLifecycle › cancellation authorization and worker empty paths preserve role and audit boundaries
func TestCancellationAuthorizationAndEmptyWorkers(t *testing.T) {
	for want, input := range map[string]map[string]any{
		"student":     {"actorRole": "student"},
		"teacher":     {"actorRole": "teacher"},
		"institution": {"actorRole": "admin", "cancellationType": "institution"},
		"admin":       {"actorRole": "admin"},
	} {
		if got := cancellationType(input); got != want {
			t.Fatalf("cancellationType(%v) = %s", input, got)
		}
	}
	now := "2026-08-01T00:00:00.000Z"
	appointment := func(status string, teacher any) map[string]any {
		return map[string]any{"status": status, "studentId": "student", "teacherId": teacher,
			"requestedStartAt": "2026-08-03T01:00:00.000Z", "policySnapshot": map[string]any{"cancellationCutoffMinutes": 720.0}}
	}
	for _, allowed := range []struct {
		appointment, input map[string]any
	}{
		{appointment("confirmed", "teacher"), map[string]any{"actorRole": "teacher", "teacherId": "teacher"}},
		{appointment("confirmed", map[string]any{"id": "teacher"}), map[string]any{"actorRole": "teacher", "teacherId": "teacher"}},
		{appointment("rescheduled", "teacher"), map[string]any{"actorRole": "admin"}},
		{copyWith(appointment("confirmed", "teacher"), "policySnapshot", nil), map[string]any{"actorRole": "student", "studentId": "student"}},
	} {
		if err := authorizeCancellation(allowed.appointment, allowed.input, now, false); err != nil {
			t.Fatalf("authorize(%v) = %v", allowed.input, err)
		}
	}
	failsWith(t, authorizeCancellation(appointment("confirmed", "teacher"), map[string]any{"actorRole": "teacher", "teacherId": "other"}, now, false),
		"APPOINTMENT_TEACHER_FORBIDDEN")
	failsWith(t, authorizeCancellation(appointment("confirmed", "teacher"), map[string]any{"actorRole": "guardian"}, now, false),
		"APPOINTMENT_CANCEL_FORBIDDEN")

	f := bookingSetup(t, true)
	_, err := cancelAppointment(f.app, f.as("admin", "x1", map[string]any{"appointmentId": "", "reason": "原因"}))
	failsWith(t, err, "APPOINTMENT_ID_REQUIRED")
	_, err = cancelAppointment(f.app, f.as("admin", "x2", map[string]any{"appointmentId": "appointment", "reason": "x"}))
	failsWith(t, err, "APPOINTMENT_CANCEL_REASON_REQUIRED")
	result, err := expireAppointments(f.app, f.as("admin", "e1", nil))
	if err != nil || result["processedCount"] != 0 {
		t.Fatalf("empty expiry = %v, %v", result, err)
	}
	if events, _ := f.app.FindRecordsByFilter("appointment_events", "1=1", "", 0, 0); len(events) != 0 {
		t.Fatalf("empty worker wrote %d appointment events", len(events))
	}
}

func asTime(t *testing.T, value any) time.Time {
	t.Helper()
	ms, ok := millis(value)
	if !ok {
		t.Fatalf("not a time: %v", value)
	}
	return time.UnixMilli(ms).UTC()
}
