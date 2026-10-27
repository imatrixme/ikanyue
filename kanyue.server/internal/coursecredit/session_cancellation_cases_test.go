package coursecredit

import (
	"reflect"
	"testing"
)

// Session cancellation cases ported from Hono's courseCreditSessionCancellationService
// tests, over a stored scheduled session with reserved credit and calendar claims.

func cancellationSetup(t *testing.T, session map[string]any, attendances ...string) settlementFixture {
	t.Helper()
	f := settlementSetup(t, func(settlementFixture) map[string]any {
		return with2(map[string]any{"status": "scheduled", "startAt": "2026-10-10 10:00:00.000Z", "endAt": "2026-10-10 11:00:00.000Z"}, session)
	}, attendances...)
	for _, batch := range f.batches {
		patch(t, f.app, "credit_batches", batch, map[string]any{"effectiveExpiresAt": "2026-12-31 00:00:00.000Z"})
	}
	put(t, f.app, "schedule_claims", map[string]any{"ownerType": "teacher", "ownerId": f.operatorID(t), "sourceType": "session",
		"sourceId": f.sessionID, "cellStartAt": "2026-10-10 10:00:00.000Z", "cellEndAt": "2026-10-10 10:30:00.000Z", "status": "active", "version": 1})
	return f
}

func (f settlementFixture) cancel(t *testing.T, changes map[string]any) (map[string]any, error) {
	t.Helper()
	return cancelSession(f.app, with2(f.command(t, "cancel-session"), with2(map[string]any{
		"reason": "机构临时调整", "cancellationType": "institution"}, changes)))
}

// Hono: courseCreditSessionCancellationService › admin session cancellation releases every reserved student and active calendar claim
func TestSessionCancellationReleasesReservedStudentsAndClaims(t *testing.T) {
	f := cancellationSetup(t, nil, "scheduled")
	learner := f.first(t, "session_students", `id="`+f.students["scheduled"]+`"`)["studentId"]
	result, err := f.cancel(t, nil)
	if err != nil || result["status"] != "cancelled" || !reflect.DeepEqual(result["releasedStudentIds"], []any{learner}) {
		t.Fatalf("result = %v, %#v", result, err)
	}
	if session := f.first(t, "sessions", `id="`+f.sessionID+`"`); session["cancellationType"] != "institution" || session["status"] != "cancelled" {
		t.Fatalf("session = %v", session)
	}
	if batch := f.first(t, "credit_batches", `id="`+f.batches["scheduled"]+`"`); batch["frozenQuantity"] != 0.0 || batch["availableQuantity"] != 1.0 {
		t.Fatalf("batch = %v", batch)
	}
	if f.count(t, "schedule_claims", `sourceId="`+f.sessionID+`" && status="released"`) != 1 {
		t.Fatal("claim not released")
	}
	if f.count(t, "credit_operations", `type="cancel_session" && status="committed"`) != 1 {
		t.Fatal("operation")
	}
}

// Hono: courseCreditSessionCancellationService › generic cancellation rejects appointment sessions and invalid states
func TestSessionCancellationRejectsAppointmentsAndInvalidStates(t *testing.T) {
	appointment := cancellationSetup(t, nil, "scheduled")
	request := put(t, appointment.app, "appointment_requests", map[string]any{"studentId": appointment.studentID, "status": "confirmed"})
	patch(t, appointment.app, "sessions", appointment.sessionID, map[string]any{"appointmentId": request.Id})
	_, err := appointment.cancel(t, nil)
	failsWith(t, err, "APPOINTMENT_CANCELLATION_COMMAND_REQUIRED")

	completed := cancellationSetup(t, map[string]any{"status": "completed"}, "scheduled")
	_, err = completed.cancel(t, nil)
	failsWith(t, err, "SESSION_NOT_CANCELLABLE")
	_, err = completed.cancel(t, map[string]any{"reason": ""})
	failsWith(t, err, "SESSION_CANCEL_REASON_REQUIRED")
	if completed.count(t, "credit_operations", `type="cancel_session"`) != 0 {
		t.Fatal("a rejected cancellation stored an operation")
	}
}

// Hono: courseCreditSessionCancellationService › generic cancellation supports defaults, skips unreserved roster rows, and validates cancellation type
func TestSessionCancellationDefaultsAndValidation(t *testing.T) {
	f := cancellationSetup(t, map[string]any{"status": "enrollment_closed"}, "scheduled", "pending")
	patch(t, f.app, "session_students", f.students["pending"], map[string]any{"creditStatus": "pending"})
	learner := f.first(t, "session_students", `id="`+f.students["scheduled"]+`"`)["studentId"]
	result, err := f.cancel(t, map[string]any{"cancellationType": nil})
	if err != nil || !reflect.DeepEqual(result["releasedStudentIds"], []any{learner}) {
		t.Fatalf("result = %v, %#v", result, err)
	}
	if session := f.first(t, "sessions", `id="`+f.sessionID+`"`); session["cancellationType"] != "admin" {
		t.Fatalf("session = %v", session)
	}
	if batch := f.first(t, "credit_batches", `id="`+f.batches["pending"]+`"`); batch["frozenQuantity"] != 1.0 {
		t.Fatalf("unreserved roster row moved credit: %v", batch)
	}

	_, err = f.cancel(t, map[string]any{"sessionId": ""})
	failsWith(t, err, "SESSION_ID_REQUIRED")
	_, err = f.cancel(t, map[string]any{"cancellationType": "student"})
	failsWith(t, err, "SESSION_CANCELLATION_TYPE_INVALID")
}
