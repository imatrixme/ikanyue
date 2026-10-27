package coursecredit

import (
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/testkit"
)

type bookingFixture struct {
	app                                    core.App
	handler                                http.Handler
	ops, student, teacher, otherTeacher    map[string]string
	studentID, teacherID, specID, creditID string
	policyID, offeringID                   string
	signer                                 *auth.Signer
}

func bookingSetup(t *testing.T, reservation bool) bookingFixture {
	t.Helper()
	app := testkit.NewApp(t)
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	teacher := testkit.Create(t, app, "teachers", map[string]any{"email": "t1@example.com", "password": "admin-pass-1", "verified": true, "realName": "王老师", "cellphone": "{{PHONE_ix8bcs0l}}"})
	other := testkit.Create(t, app, "teachers", map[string]any{"email": "t2@example.com", "password": "admin-pass-1", "verified": true})
	operator := testkit.Create(t, app, "teachers", map[string]any{"email": "ops@example.com", "password": "admin-pass-1"})
	student := testkit.Create(t, app, "students", map[string]any{"cellphone": "13800000000", "realName": "学员甲"})
	sign := func(id, role string, extra auth.Claims) map[string]string {
		value, err := signer.Sign(id, "S1", role, false, extra, auth.OpsTokenTTL)
		if err != nil {
			t.Fatal(err)
		}
		return testkit.Bearer(value)
	}
	spec := testkit.Create(t, app, "course_specs", map[string]any{"code": "vocal1v1", "name": "声乐一对一", "deliveryMode": "one_to_one", "durationMinutes": 60, "status": "active"})
	credit := testkit.Create(t, app, "credit_types", map[string]any{"code": "vocal1v1", "name": "一对一课时", "kind": "course", "courseSpecId": spec.Id, "consumable": true, "referenceUnitValue": 100, "status": "active"})
	pkg := testkit.Create(t, app, "packages", map[string]any{"code": "p10", "name": "十节", "saleChannel": "all", "activationMode": "GRANT_TIME", "expiryPolicy": "FIXED_DURATION", "validityDurationDays": 90, "status": "active"})
	testkit.Create(t, app, "package_grant_lines", map[string]any{"packageId": pkg.Id, "creditTypeId": credit.Id, "quantity": 10})
	price := testkit.Create(t, app, "price_versions", map[string]any{"packageId": pkg.Id, "currency": "CNY", "listAmount": 1000, "saleAmount": 800, "validFrom": "2020-01-01 00:00:00.000Z", "version": 1, "status": "active"})
	testkit.Create(t, app, "teacher_credit_rules", map[string]any{"courseSpecId": spec.Id, "role": "lead", "baseQuantity": 1, "durationFactor": 0, "participantFactor": 0, "validFrom": "2020-01-01 00:00:00.000Z", "version": 1, "status": "active"})

	handler := testkit.Serve(t, app,
		LedgerModule{Signer: signer, GrantsEnabled: true}.Register,
		BookingModule{Signer: signer, ReservationEnabled: reservation}.Register,
		SessionsModule{Signer: signer, SettlementEnabled: true}.Register)
	f := bookingFixture{
		app: app, handler: handler,
		ops:          sign(operator.Id, "teacher", auth.Claims{"scope": auth.OpsScope, "courseCreditCapabilities": []string{Finance, Academic}}),
		student:      sign(student.Id, "student", nil),
		teacher:      sign(teacher.Id, "teacher", auth.Claims{"courseCreditCapabilities": []string{Teacher}}),
		otherTeacher: sign(other.Id, "teacher", auth.Claims{"courseCreditCapabilities": []string{Teacher}}),
		studentID:    student.Id, teacherID: teacher.Id, specID: spec.Id, creditID: credit.Id,
		signer: signer,
	}
	ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-operations/enrollments",
		map[string]any{"studentId": student.Id, "packageId": pkg.Id, "priceVersionId": price.Id}, "enroll"), "enroll")
	policy := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/policies", map[string]any{
		"code": "default", "name": "全天", "status": "active", "effectiveFrom": "2020-01-01T00:00:00.000Z",
		"defaultWindows": []any{map[string]any{"startMinute": 0, "endMinute": 1440}},
		"minLeadMinutes": 60, "cancellationCutoffMinutes": 60,
	}, "policy"), "policy")
	f.policyID = policy["policyId"].(string)
	offering := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/offerings", map[string]any{
		"teacherId": teacher.Id, "courseSpecId": spec.Id, "creditTypeId": credit.Id, "policyId": f.policyID,
		"status": "active", "location": " 302 琴房 ",
	}, "offering"), "offering")
	f.offeringID = offering["offeringId"].(string)
	return f
}

func (f bookingFixture) call(t *testing.T, headers map[string]string, method, path string, body any, key string) testkit.Response {
	t.Helper()
	if key != "" {
		headers = with(headers, "Idempotency-Key", key)
	}
	return testkit.Call(t, f.handler, method, path, body, headers)
}

// slots lists the student's open slots for the next week.
func (f bookingFixture) slots(t *testing.T) []map[string]any {
	t.Helper()
	now := time.Now().UTC()
	query := url.Values{"offeringId": {f.offeringID}, "from": {iso(now)}, "to": {iso(now.Add(7 * 24 * time.Hour))}}
	data := ok(t, f.call(t, f.student, http.MethodGet, "/v1/student/booking-slots?"+query.Encode(), nil, ""), "slots")
	raw := data["slots"].([]any)
	result := make([]map[string]any, len(raw))
	for i, slot := range raw {
		result[i] = slot.(map[string]any)
	}
	if len(result) < 100 {
		t.Fatalf("slots = %d", len(result))
	}
	return result
}

func (f bookingFixture) request(t *testing.T, slot map[string]any, key string) map[string]any {
	t.Helper()
	body := map[string]any{"offeringId": f.offeringID, "startAt": slot["startAt"], "endAt": slot["endAt"], "note": "想练高音"}
	return ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/appointments", body, key), "request "+key)
}

func batchOf(t *testing.T, app core.App, studentID string) *core.Record {
	t.Helper()
	return firstBatch(t, app, studentID)
}

func activeClaims(t *testing.T, app core.App, appointmentID string) int {
	t.Helper()
	claims, err := app.FindRecordsByFilter("schedule_claims", `appointmentId="`+appointmentID+`" && status="active"`, "", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	return len(claims)
}

func TestBookingRequestConfirmRescheduleCancel(t *testing.T) {
	f := bookingSetup(t, true)
	options := testkit.Call(t, f.handler, http.MethodGet, "/v1/student/booking-options", nil, f.student)
	if options.Code() != 10000 || len(options.Body["data"].([]any)) != 1 {
		t.Fatalf("options = %v", options.Body)
	}
	failed(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/student/booking-options?courseId=missing", nil, f.student),
		400, "BOOKING_COURSE_NOT_ELIGIBLE", "ineligible course")
	failed(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/student/booking-options", nil, f.teacher),
		403, "COURSE_CREDIT_STUDENT_REQUIRED", "teacher as student")

	slots := f.slots(t)
	first, later := slots[40], slots[80]
	requested := f.request(t, first, "r1")
	if requested["status"] != "pending" || requested["replayed"] != false || requested["responseDeadline"] == "" {
		t.Fatalf("requested = %v", requested)
	}
	appointmentID := requested["appointmentId"].(string)
	if replay := f.request(t, first, "r1"); replay["replayed"] != true || replay["appointmentId"] != appointmentID {
		t.Fatalf("replay = %v", replay)
	}
	failed(t, f.call(t, f.student, http.MethodPost, "/v1/student/appointments",
		map[string]any{"offeringId": f.offeringID, "startAt": later["startAt"], "endAt": later["endAt"]}, "r1"),
		400, "IDEMPOTENCY_CONFLICT", "changed request")
	failed(t, f.call(t, f.student, http.MethodPost, "/v1/student/appointments",
		map[string]any{"offeringId": f.offeringID, "startAt": later["startAt"], "endAt": later["endAt"]}, "r2"),
		400, "APPOINTMENT_PENDING_DUPLICATE", "second pending")

	failed(t, f.call(t, f.otherTeacher, http.MethodPost, "/v1/teacher/appointments/"+appointmentID+"/confirm", nil, "c1"),
		403, "APPOINTMENT_TEACHER_FORBIDDEN", "other teacher confirm")
	confirmed := ok(t, f.call(t, f.teacher, http.MethodPost, "/v1/teacher/appointments/"+appointmentID+"/confirm", nil, "c1"), "confirm")
	if confirmed["status"] != "confirmed" || confirmed["lessonId"] == "" || len(confirmed["reservationAllocationIds"].([]any)) != 1 {
		t.Fatalf("confirmed = %v", confirmed)
	}
	if replay := ok(t, f.call(t, f.teacher, http.MethodPost, "/v1/teacher/appointments/"+appointmentID+"/confirm", nil, "c1"), "confirm replay"); replay["replayed"] != true {
		t.Fatalf("confirm replay = %v", replay)
	}
	batch := batchOf(t, f.app, f.studentID)
	if batch.GetInt("availableQuantity") != 9 || batch.GetInt("frozenQuantity") != 1 {
		t.Fatalf("batch after confirm = %v", batch.FieldsData())
	}
	if claims := activeClaims(t, f.app, appointmentID); claims != 8 {
		t.Fatalf("claims after confirm = %d", claims)
	}
	session, err := f.app.FindRecordById("sessions", confirmed["lessonId"].(string))
	if err != nil || session.GetString("originType") != "appointment" || session.GetString("location") != "302 琴房" {
		t.Fatalf("session = %v, %v", session, err)
	}

	for _, slot := range f.slots(t) {
		if slot["startAt"] == first["startAt"] {
			t.Fatalf("confirmed slot still offered: %v", slot)
		}
	}
	dashboard := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/teacher/booking/dashboard", nil, f.teacher), "dashboard")
	if len(dashboard["confirmed"].([]any)) != 1 || dashboard["pendingCount"] != float64(0) || len(dashboard["offerings"].([]any)) != 1 {
		t.Fatalf("dashboard = %v", dashboard)
	}
	mine := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/student/appointments/"+appointmentID, nil, f.student), "student get")
	if mine["status"] != "confirmed" || mine["canCancel"] != true || mine["location"] != "302 琴房" {
		t.Fatalf("student appointment = %v", mine)
	}

	failed(t, f.call(t, f.teacher, http.MethodPost, "/v1/teacher/appointments/"+appointmentID+"/reschedule",
		map[string]any{"newStartAt": first["startAt"], "newEndAt": first["endAt"], "reason": "老师有事"}, "m1"),
		400, "APPOINTMENT_TIME_UNCHANGED", "same time")
	moved := ok(t, f.call(t, f.teacher, http.MethodPost, "/v1/teacher/appointments/"+appointmentID+"/reschedule",
		map[string]any{"newStartAt": later["startAt"], "newEndAt": later["endAt"], "reason": "老师有事"}, "m2"), "reschedule")
	if moved["status"] != "rescheduled" || moved["newStartAt"] != later["startAt"] {
		t.Fatalf("moved = %v", moved)
	}
	if claims := activeClaims(t, f.app, appointmentID); claims != 8 {
		t.Fatalf("claims after reschedule = %d", claims)
	}
	if session, _ = f.app.FindRecordById("sessions", confirmed["lessonId"].(string)); iso(session.GetDateTime("startAt").Time()) != later["startAt"] {
		t.Fatalf("session start = %v", session.GetDateTime("startAt"))
	}

	preview := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/student/appointments/"+appointmentID+"/cancellation-preview", nil, f.student), "preview")
	if preview["mode"] != "credit" || preview["quantity"] != float64(1) {
		t.Fatalf("preview = %v", preview)
	}
	failed(t, f.call(t, f.student, http.MethodPost, "/v1/student/appointments/"+appointmentID+"/cancel", map[string]any{"reason": "x"}, "x1"),
		400, "APPOINTMENT_CANCEL_REASON_REQUIRED", "short reason")
	cancelled := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/appointments/"+appointmentID+"/cancel", map[string]any{"reason": "临时出差"}, "x2"), "cancel")
	if cancelled["status"] != "cancelled" || cancelled["lessonId"] != confirmed["lessonId"] {
		t.Fatalf("cancelled = %v", cancelled)
	}
	batch = batchOf(t, f.app, f.studentID)
	if batch.GetInt("availableQuantity") != 10 || batch.GetInt("frozenQuantity") != 0 {
		t.Fatalf("batch after cancel = %v", batch.FieldsData())
	}
	if claims := activeClaims(t, f.app, appointmentID); claims != 0 {
		t.Fatalf("claims after cancel = %d", claims)
	}
	if session, _ = f.app.FindRecordById("sessions", confirmed["lessonId"].(string)); session.GetString("status") != "cancelled" || session.GetString("cancellationType") != "student" {
		t.Fatalf("session after cancel = %v", session.FieldsData())
	}
	detail := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-bookings/appointments/"+appointmentID, nil, f.ops), "ops detail")
	if events := detail["events"].([]any); len(events) != 4 {
		t.Fatalf("events = %v", events)
	}
}

func TestBookingPendingLifecycleAndWorkers(t *testing.T) {
	f := bookingSetup(t, true)
	slots := f.slots(t)
	first := f.request(t, slots[10], "r1")["appointmentId"].(string)
	failed(t, f.call(t, f.teacher, http.MethodPost, "/v1/teacher/appointments/"+first+"/decline", nil, "d1"),
		400, "APPOINTMENT_DECLINE_REASON_REQUIRED", "decline without reason")
	declined := ok(t, f.call(t, f.teacher, http.MethodPost, "/v1/teacher/appointments/"+first+"/decline", map[string]any{"reason": "时间冲突"}, "d2"), "decline")
	if declined["status"] != "declined" {
		t.Fatalf("declined = %v", declined)
	}
	failed(t, f.call(t, f.student, http.MethodPost, "/v1/student/appointments/"+first+"/withdraw", nil, "w1"),
		400, "APPOINTMENT_NOT_PENDING", "withdraw declined")

	second := f.request(t, slots[20], "r2")["appointmentId"].(string)
	withdrawn := ok(t, f.call(t, f.student, http.MethodPost, "/v1/student/appointments/"+second+"/withdraw", nil, "w2"), "withdraw")
	if withdrawn["status"] != "withdrawn" {
		t.Fatalf("withdrawn = %v", withdrawn)
	}

	third := f.request(t, slots[30], "r3")["appointmentId"].(string)
	record, err := f.app.FindRecordById("appointment_requests", third)
	if err != nil {
		t.Fatal(err)
	}
	record.Set("responseDeadline", time.Now().UTC().Add(-time.Minute))
	if err := f.app.Save(record); err != nil {
		t.Fatal(err)
	}
	expired := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/workers/expire", nil, "e1"), "expire")
	if expired["processedCount"] != float64(1) || expired["appointmentIds"].([]any)[0] != third || expired["status"] != "expired" {
		t.Fatalf("expired = %v", expired)
	}
	fulfilled := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/workers/fulfill", map[string]any{"cutoffAt": "2026-01-01T00:00:00.000Z"}, "f1"), "fulfill")
	if fulfilled["processedCount"] != float64(0) || fulfilled["cutoffAt"] != "2026-01-01T00:00:00.000Z" {
		t.Fatalf("fulfilled = %v", fulfilled)
	}
	failed(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/workers/expire", map[string]any{"cutoffAt": "nope"}, "e2"),
		500, "COURSE_CREDIT_INTERNAL_ERROR", "invalid cutoff")

	list := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-bookings/appointments?status=declined,withdrawn,expired", nil, f.ops), "ops list")
	if list["totalItems"] != float64(3) {
		t.Fatalf("ops list = %v", list)
	}
	failed(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/student/appointments?status=a,b,c,d,e,f,g,h,i,j,k", nil, f.student),
		400, "BOOKING_STATUS_FILTER_INVALID", "status filter")
}

func TestBookingOpsOneStepAndFeatureGate(t *testing.T) {
	f := bookingSetup(t, false)
	slot := f.slots(t)[50]
	failed(t, f.call(t, f.teacher, http.MethodPost, "/v1/teacher/appointments/x/confirm", nil, "c1"),
		400, "COURSE_CREDIT_FEATURE_DISABLED", "teacher confirm gated")
	body := map[string]any{"studentId": f.studentID, "offeringId": f.offeringID, "startAt": slot["startAt"], "endAt": slot["endAt"], "confirm": true}
	failed(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/appointments", body, "o1"),
		400, "COURSE_CREDIT_FEATURE_DISABLED", "ops one-step gated")

	g := bookingSetup(t, true)
	slot = g.slots(t)[50]
	body = map[string]any{"studentId": g.studentID, "offeringId": g.offeringID, "startAt": slot["startAt"], "endAt": slot["endAt"], "confirm": true}
	failed(t, g.call(t, g.ops, http.MethodPost, "/ops/course-bookings/appointments", map[string]any{"offeringId": g.offeringID}, "o0"),
		400, "BOOKING_STUDENT_REQUIRED", "ops without student")
	booked := ok(t, g.call(t, g.ops, http.MethodPost, "/ops/course-bookings/appointments", body, "o1"), "ops book")
	if booked["status"] != "confirmed" || booked["lessonId"] == "" || booked["responseDeadline"] == "" {
		t.Fatalf("booked = %v", booked)
	}
	cancel := map[string]any{"reason": "机构调课", "cancellationType": "institution"}
	cancelled := ok(t, g.call(t, g.ops, http.MethodPost, "/ops/course-bookings/appointments/"+booked["appointmentId"].(string)+"/cancel", cancel, "x1"), "ops cancel")
	if session, _ := g.app.FindRecordById("sessions", cancelled["lessonId"].(string)); session.GetString("cancellationType") != "institution" {
		t.Fatalf("session = %v", session.FieldsData())
	}
}

func TestBookingAvailabilityAdminAndConflicts(t *testing.T) {
	f := bookingSetup(t, true)
	put := func(headers map[string]string, path string, rules any, key string) testkit.Response {
		return f.call(t, headers, http.MethodPut, path, map[string]any{"rules": rules}, key)
	}
	teacherPath := "/v1/teacher/offerings/" + f.offeringID + "/availability"
	failed(t, put(f.teacher, teacherPath, "x", "a0"), 400, "BOOKING_WEEKLY_RULES_REQUIRED", "rules not array")
	failed(t, put(f.otherTeacher, teacherPath, []any{}, "a1"), 403, "BOOKING_OFFERING_FORBIDDEN", "other teacher")
	failed(t, put(f.teacher, teacherPath, []any{map[string]any{"weekday": 1, "startMinute": 600, "endMinute": 660},
		map[string]any{"weekday": 1, "startMinute": 630, "endMinute": 700}}, "a2"), 400, "BOOKING_WINDOWS_OVERLAP", "overlap")
	saved := ok(t, put(f.teacher, teacherPath, []any{map[string]any{"weekday": 2, "startMinute": 600, "endMinute": 720}}, "a3"), "save weekly")
	if saved["availabilityMode"] != "custom" || saved["ruleCount"] != float64(1) {
		t.Fatalf("saved = %v", saved)
	}
	view := ok(t, testkit.Call(t, f.handler, http.MethodGet, teacherPath, nil, f.teacher), "availability")
	if rules := view["rules"].([]any); len(rules) != 1 || rules[0].(map[string]any)["weekday"] != float64(2) {
		t.Fatalf("availability = %v", view)
	}
	reset := ok(t, put(f.ops, "/ops/course-bookings/offerings/"+f.offeringID+"/availability", []any{}, "a4"), "ops reset")
	if reset["availabilityMode"] != "default" {
		t.Fatalf("reset = %v", reset)
	}

	start := time.Now().UTC().Truncate(24 * time.Hour).Add(72*time.Hour + 2*time.Hour)
	override := map[string]any{"type": "unavailable", "startAt": iso(start), "endAt": iso(start.Add(time.Hour)), "reason": "外出"}
	created := ok(t, f.call(t, f.teacher, http.MethodPost, "/v1/teacher/offerings/"+f.offeringID+"/availability-overrides", override, "o1"), "override")
	overrideID := created["overrideId"].(string)
	failed(t, f.call(t, f.otherTeacher, http.MethodPost, "/v1/teacher/availability-overrides/"+overrideID+"/cancel", nil, "o2"),
		403, "BOOKING_OVERRIDE_FORBIDDEN", "other teacher cancel")
	ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/availability-overrides/"+overrideID+"/cancel", nil, "o3"), "ops cancel override")
	failed(t, f.call(t, f.teacher, http.MethodPost, "/v1/teacher/availability-overrides/"+overrideID+"/cancel", nil, "o4"),
		400, "BOOKING_OVERRIDE_NOT_ACTIVE", "cancelled override")
	availability := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-bookings/availability?teacherId="+f.teacherID, nil, f.ops), "ops availability")
	if len(availability["rules"].([]any)) != 1 || len(availability["overrides"].([]any)) != 1 {
		t.Fatalf("ops availability = %v", availability)
	}

	revised := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/policies",
		map[string]any{"code": "default", "name": "全天 v2", "status": "active", "effectiveFrom": "2021-01-01T00:00:00.000Z"}, "p2"), "revise policy")
	if revised["version"] != float64(2) {
		t.Fatalf("revised = %v", revised)
	}
	policies := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-bookings/policies?status=active", nil, f.ops), "policies")
	if policies["totalItems"] != float64(1) || items(policies)[0]["version"] != float64(2) {
		t.Fatalf("policies = %v", policies)
	}
	failed(t, f.call(t, f.ops, http.MethodPatch, "/ops/course-bookings/offerings/"+f.offeringID, map[string]any{
		"teacherId": f.teacherID, "courseSpecId": f.specID, "creditTypeId": f.creditID, "policyId": f.policyID, "status": "active",
	}, "s1"), 400, "BOOKING_POLICY_NOT_ACTIVE", "retired policy")

	conflict := testkit.Create(t, f.app, "booking_conflicts", map[string]any{"type": "teacher_overlap", "status": "open", "teacherId": f.teacherID,
		"startAt": start, "endAt": start.Add(time.Hour), "details": map[string]any{"source": "test"}, "version": 1})
	failed(t, f.call(t, f.ops, http.MethodPatch, "/ops/course-bookings/offerings/"+f.offeringID, map[string]any{
		"teacherId": f.teacherID, "courseSpecId": f.specID, "creditTypeId": f.creditID, "policyId": revised["policyId"], "status": "active",
	}, "s2"), 400, "BOOKING_CONFLICTS_UNRESOLVED", "open conflict")
	failed(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/conflicts/"+conflict.Id+"/resolve", map[string]any{"resolution": "好"}, "k1"),
		400, "BOOKING_CONFLICT_RESOLUTION_REQUIRED", "short resolution")
	resolved := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/conflicts/"+conflict.Id+"/resolve", map[string]any{"resolution": "已与老师确认调课"}, "k2"), "resolve")
	if resolved["status"] != "resolved" {
		t.Fatalf("resolved = %v", resolved)
	}
	updated := ok(t, f.call(t, f.ops, http.MethodPatch, "/ops/course-bookings/offerings/"+f.offeringID, map[string]any{
		"teacherId": f.teacherID, "courseSpecId": f.specID, "creditTypeId": f.creditID, "policyId": revised["policyId"], "status": "active",
	}, "s3"), "update offering")
	if updated["version"] != float64(4) {
		t.Fatalf("updated = %v", updated)
	}
	reference := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-bookings/reference-data", nil, f.ops), "reference")
	if len(reference["teachers"].([]any)) != 2 || len(reference["courses"].([]any)) != 1 || len(reference["policies"].([]any)) != 1 {
		t.Fatalf("reference = %v", reference)
	}
	offerings := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-bookings/offerings", nil, f.ops), "offerings")
	if items(offerings)[0]["location"] != "" || items(offerings)[0]["status"] != "active" {
		t.Fatalf("offerings = %v", offerings)
	}
	if result := testkit.Call(t, f.handler, http.MethodGet, "/ops/course-bookings/dashboard", nil, f.teacher); result.Code() != 403 {
		t.Fatalf("teacher token on ops = %v", result.Body)
	}
}

func TestBookingCronExpiresDueRequests(t *testing.T) {
	f := bookingSetup(t, true)
	jobs := map[string]bool{}
	for _, job := range f.app.Cron().Jobs() {
		jobs[job.Id()] = true
	}
	if !jobs["courseBookingExpiry"] || !jobs["courseBookingFulfillment"] {
		t.Fatalf("jobs = %v", jobs)
	}
	run := func() {
		for _, job := range f.app.Cron().Jobs() {
			if job.Id() == "courseBookingExpiry" || job.Id() == "courseBookingFulfillment" {
				job.Run()
			}
		}
	}
	before, _ := f.app.CountRecords("credit_operations")
	run()
	if after, _ := f.app.CountRecords("credit_operations"); after != before {
		t.Fatalf("idle tick wrote operations: %d -> %d", before, after)
	}

	appointmentID := f.request(t, f.slots(t)[10], "r1")["appointmentId"].(string)
	record, err := f.app.FindRecordById("appointment_requests", appointmentID)
	if err != nil {
		t.Fatal(err)
	}
	record.Set("responseDeadline", time.Now().UTC().Add(-time.Minute))
	if err := f.app.Save(record); err != nil {
		t.Fatal(err)
	}
	run()
	if record, _ = f.app.FindRecordById("appointment_requests", appointmentID); record.GetString("status") != "expired" {
		t.Fatalf("status after tick = %s", record.GetString("status"))
	}
	operation, err := f.app.FindFirstRecordByFilter("credit_operations", `type="expire_appointment"`)
	if err != nil || operation.GetString("actorRole") != "system" || operation.GetString("actorId") != "system" {
		t.Fatalf("cron operation = %v, %v", operation, err)
	}
}
