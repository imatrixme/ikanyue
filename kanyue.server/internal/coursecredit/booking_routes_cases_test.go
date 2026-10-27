package coursecredit

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/testkit"
)

// Booking HTTP routes ported from Hono's courseBookingRoutes tests. Hono stubs the
// services; Go drives each route against real records and checks the outcome.

type routeCase struct {
	method, path string
	body         any
}

func (f bookingFixture) sweep(t *testing.T, headers map[string]string, routes []routeCase) {
	t.Helper()
	for i, route := range routes {
		ok(t, f.call(t, headers, route.method, route.path, route.body, "sweep-"+string(rune('a'+i))), route.method+" "+route.path)
	}
}

func operationBy(t *testing.T, f bookingFixture, kind string) map[string]any {
	t.Helper()
	operation, err := findFirst(f.app, "credit_operations", `type="`+kind+`"`)
	if err != nil || operation == nil {
		t.Fatalf("operation %s = %v, %v", kind, operation, err)
	}
	return operation
}

func weekRange() string {
	now := time.Now().UTC()
	return url.Values{"from": {iso(now)}, "to": {iso(now.Add(7 * 24 * time.Hour))}}.Encode()
}

// Hono: courseBookingRoutes › student booking routes expose only the signed-in student workflow
func TestStudentBookingRoutes(t *testing.T) {
	f := bookingSetup(t, true)
	slots := f.slots(t)
	withdrawn := f.pending(t, 10, "r1")
	ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/appointments/"+withdrawn+"/withdraw", map[string]any{"reason": "时间有变"}, "w1"), "withdraw")
	confirmed, _ := f.confirmed(t, 40, "r2")
	f.sweep(t, f.student, []routeCase{
		{http.MethodGet, "/v1/student/booking-options?courseId=" + f.specID, nil},
		{http.MethodGet, "/v1/student/booking-slots?offeringId=" + f.offeringID + "&" + weekRange(), nil},
		{http.MethodGet, "/v1/student/appointments?page=1&status=pending", nil},
		{http.MethodGet, "/v1/student/appointments/" + confirmed, nil},
		{http.MethodPost, "/v1/student/appointments", map[string]any{"offeringId": f.offeringID, "startAt": slots[60]["startAt"], "endAt": slots[60]["endAt"], "studentId": "spoofed"}},
		{http.MethodPost, "/v1/student/appointments/" + confirmed + "/cancel", map[string]any{"reason": "临时有事"}},
	})
	created, err := findFirst(f.app, "appointment_requests", `status="pending"`)
	if err != nil || created["studentId"] != f.studentID {
		t.Fatalf("created = %v, %v", created, err)
	}
	if event, _ := findFirst(f.app, "appointment_events", `toStatus="pending"`); event["actorId"] != f.studentID {
		t.Fatalf("request actor = %v", event)
	}
}

// Hono: courseBookingRoutes › teacher booking routes require teacher capability and forward teacher ownership
func TestTeacherBookingRoutes(t *testing.T) {
	f := bookingSetup(t, true)
	slots := f.slots(t)
	toConfirm := f.pending(t, 10, "r1")
	start := time.Now().UTC().Truncate(24 * time.Hour).Add(96 * time.Hour)
	override := map[string]any{"type": "unavailable", "startAt": iso(start), "endAt": iso(start.Add(time.Hour))}
	f.sweep(t, f.teacher, []routeCase{
		{http.MethodGet, "/v1/teacher/booking/dashboard", nil},
		{http.MethodGet, "/v1/teacher/appointments?page=1&status=pending", nil},
		{http.MethodGet, "/v1/teacher/appointments/" + toConfirm, nil},
		{http.MethodGet, "/v1/teacher/offerings/" + f.offeringID + "/availability", nil},
		{http.MethodPost, "/v1/teacher/appointments/" + toConfirm + "/confirm", nil},
		{http.MethodPost, "/v1/teacher/appointments/" + toConfirm + "/reschedule", map[string]any{"newStartAt": slots[80]["startAt"], "newEndAt": slots[80]["endAt"], "reason": "调整安排"}},
		{http.MethodPost, "/v1/teacher/appointments/" + toConfirm + "/cancel", map[string]any{"reason": "临时停课"}},
		{http.MethodPut, "/v1/teacher/offerings/" + f.offeringID + "/availability", map[string]any{"rules": []any{}}},
		{http.MethodPost, "/v1/teacher/offerings/" + f.offeringID + "/availability-overrides", override},
	})
	toDecline := f.pending(t, 20, "r2")
	ok(t, f.call(t, f.teacher, http.MethodPost, "/v1/teacher/appointments/"+toDecline+"/decline", map[string]any{"reason": "时间冲突"}, "d1"), "decline")
	overrideRecord, _ := findFirst(f.app, "teacher_availability_overrides", `status="active"`)
	ok(t, f.call(t, f.teacher, http.MethodPost, "/v1/teacher/availability-overrides/"+overrideRecord["id"].(string)+"/cancel", nil, "o1"), "cancel override")
	if operation := operationBy(t, f, "confirm_appointment"); operation["actorId"] != f.teacherID || operation["actorRole"] != "teacher" {
		t.Fatalf("confirm operation = %v", operation)
	}
	noCapability, err := f.signer.Sign(f.teacherID, "S1", "teacher", false, nil, auth.OpsTokenTTL)
	if err != nil {
		t.Fatal(err)
	}
	failed(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/teacher/booking/dashboard", nil, testkit.Bearer(noCapability)),
		403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "teacher without capability")
}

// Hono: courseBookingRoutes › Admin booking routes expose configuration, conflict, backfill, and lifecycle operations
func TestOpsBookingRoutes(t *testing.T) {
	f := bookingSetup(t, true)
	slots := f.slots(t)
	confirmed := f.pending(t, 10, "r1")
	conflict := f.openConflict(t)
	start := time.Now().UTC().Truncate(24 * time.Hour).Add(96 * time.Hour)
	f.sweep(t, f.ops, []routeCase{
		{http.MethodGet, "/ops/course-bookings/dashboard", nil},
		{http.MethodGet, "/ops/course-bookings/reference-data", nil},
		{http.MethodGet, "/ops/course-bookings/appointments?status=pending", nil},
		{http.MethodGet, "/ops/course-bookings/appointments/" + confirmed, nil},
		{http.MethodGet, "/ops/course-bookings/policies?status=active", nil},
		{http.MethodGet, "/ops/course-bookings/offerings?teacherId=" + f.teacherID, nil},
		{http.MethodGet, "/ops/course-bookings/availability?offeringId=" + f.offeringID, nil},
		{http.MethodGet, "/ops/course-bookings/conflicts?status=open", nil},
		{http.MethodPost, "/ops/course-bookings/conflicts/" + conflict + "/resolve", map[string]any{"resolution": "已与老师确认"}},
		{http.MethodPost, "/ops/course-bookings/policies", map[string]any{"code": "evening", "name": "晚间", "status": "draft", "effectiveFrom": "2026-08-01T00:00:00.000Z"}},
		{http.MethodPatch, "/ops/course-bookings/offerings/" + f.offeringID, map[string]any{"teacherId": f.teacherID, "courseSpecId": f.specID,
			"creditTypeId": f.creditID, "policyId": f.policyID, "status": "active", "location": "二号教室"}},
		{http.MethodPut, "/ops/course-bookings/offerings/" + f.offeringID + "/availability", map[string]any{"rules": []any{}}},
		{http.MethodPost, "/ops/course-bookings/offerings/" + f.offeringID + "/availability-overrides",
			map[string]any{"type": "unavailable", "startAt": iso(start), "endAt": iso(start.Add(time.Hour))}},
		{http.MethodPost, "/ops/course-bookings/appointments/" + confirmed + "/confirm", nil},
		{http.MethodPost, "/ops/course-bookings/appointments/" + confirmed + "/reschedule", map[string]any{"newStartAt": slots[80]["startAt"], "newEndAt": slots[80]["endAt"], "reason": "教务改期"}},
		{http.MethodPost, "/ops/course-bookings/appointments/" + confirmed + "/cancel", map[string]any{"reason": "教务取消"}},
		{http.MethodPost, "/ops/course-bookings/workers/expire", nil},
		{http.MethodPost, "/ops/course-bookings/workers/fulfill", nil},
	})
	declined := f.pending(t, 20, "r2")
	ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/appointments/"+declined+"/decline", map[string]any{"reason": "教师临时无空档"}, "d1"), "decline")
	overrideRecord, _ := findFirst(f.app, "teacher_availability_overrides", `status="active"`)
	ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/availability-overrides/"+overrideRecord["id"].(string)+"/cancel", nil, "o1"), "cancel override")
	for _, kind := range []string{"configure_booking", "confirm_appointment", "decline_appointment"} {
		if operation := operationBy(t, f, kind); operation["actorRole"] != "admin" {
			t.Fatalf("%s actor = %v", kind, operation)
		}
	}
	rejected(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-bookings/dashboard", nil, f.teacher), 403, "teacher token on ops")
}

// Hono: courseBookingRoutes › Admin can book a one-to-one lesson on behalf of an existing student
func TestOpsBooksOnBehalfOfStudent(t *testing.T) {
	f := bookingSetup(t, true)
	ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-bookings/students/"+f.studentID+"/options", nil, f.ops), "options")
	slotsPath := "/ops/course-bookings/students/" + f.studentID + "/slots?offeringId=" + f.offeringID + "&" + weekRange()
	slots := ok(t, testkit.Call(t, f.handler, http.MethodGet, slotsPath, nil, f.ops), "slots")["slots"].([]any)
	rejected(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-bookings/students/missing/options", nil, f.ops), 404, "missing student")
	slot := func(i int) map[string]any { return slots[i].(map[string]any) }
	created := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/appointments", map[string]any{"studentId": f.studentID, "offeringId": f.offeringID,
		"startAt": slot(40)["startAt"], "endAt": slot(40)["endAt"], "actorId": "spoofed", "confirm": true}, "book1"), "book")
	if created["status"] != "confirmed" || created["appointmentId"] == "" {
		t.Fatalf("created = %v", created)
	}
	request, _ := findFirst(f.app, "appointment_events", `toStatus="pending"`)
	if request["actorId"] == "spoofed" || request["actorRole"] != "admin" {
		t.Fatalf("request event = %v", request)
	}
	if confirm := operationBy(t, f, "confirm_appointment"); !strings.HasSuffix(confirm["idempotencyKey"].(string), "book1:confirm") {
		t.Fatalf("confirm key = %v", confirm["idempotencyKey"])
	}
	pending := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/appointments", map[string]any{"studentId": f.studentID, "offeringId": f.offeringID,
		"startAt": slot(80)["startAt"], "endAt": slot(80)["endAt"]}, "book2"), "pending only")
	if pending["status"] != "pending" {
		t.Fatalf("pending = %v", pending)
	}
	failed(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/appointments", map[string]any{"offeringId": f.offeringID}, "book3"),
		400, "BOOKING_STUDENT_REQUIRED", "missing student")
	rejected(t, f.call(t, f.teacher, http.MethodPost, "/ops/course-bookings/appointments", map[string]any{"studentId": f.studentID}, "book4"),
		403, "teacher token")
}

// Hono: courseBookingRoutes › One-step operator booking withdraws the request when confirmation fails or closes it
func TestOneStepBookingWithdrawsOnFailure(t *testing.T) {
	f := bookingSetup(t, true)
	slots := f.slots(t)
	rule, err := f.app.FindFirstRecordByFilter("teacher_credit_rules", `status="active"`)
	if err != nil {
		t.Fatal(err)
	}
	rule.Set("status", "inactive")
	if err := f.app.Save(rule); err != nil {
		t.Fatal(err)
	}
	body := map[string]any{"studentId": f.studentID, "offeringId": f.offeringID, "startAt": slots[40]["startAt"], "endAt": slots[40]["endAt"], "confirm": true}
	if result := f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/appointments", body, "book1"); result.Code() == 10000 {
		t.Fatalf("confirmation without a teacher rule succeeded: %v", result.Body)
	}
	withdraw := operationBy(t, f, "withdraw_appointment")
	if !strings.HasSuffix(withdraw["idempotencyKey"].(string), "book1:withdraw") {
		t.Fatalf("withdraw key = %v", withdraw["idempotencyKey"])
	}
	if appointment, _ := findFirst(f.app, "appointment_requests", `status="withdrawn"`); appointment == nil || appointment["studentId"] != f.studentID {
		t.Fatalf("withdrawn = %v", appointment)
	}
	rule.Set("status", "active")
	if err := f.app.Save(rule); err != nil {
		t.Fatal(err)
	}
	// The earliest slot is inside the response cutoff, so confirmation closes the request as expired.
	body["startAt"], body["endAt"] = slots[0]["startAt"], slots[0]["endAt"]
	failed(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/appointments", body, "book2"), 400, "APPOINTMENT_CONFIRM_CLOSED", "closed")
}

// rejected checks only the response status, for failures whose code belongs to auth or storage.
func rejected(t *testing.T, result testkit.Response, status int, what string) {
	t.Helper()
	if result.Code() != status {
		t.Fatalf("%s = %v", what, result.Body)
	}
}
