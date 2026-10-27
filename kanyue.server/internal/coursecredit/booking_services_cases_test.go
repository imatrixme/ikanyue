package coursecredit

import (
	"net/http"
	"testing"
	"time"

	"kanyue.server/internal/testkit"
)

// Request, decision and materialization cases ported from Hono's courseBookingServices tests.

func (f bookingFixture) requestInput(key string, slot map[string]any, fields map[string]any) map[string]any {
	input := f.as("student", key, map[string]any{"offeringId": f.offeringID, "startAt": slot["startAt"], "endAt": slot["endAt"]})
	for name, value := range fields {
		input[name] = value
	}
	return input
}

// Hono: courseBookingServices › teacher confirmation materializes one lesson, reserves hours, and claims both calendars
func TestConfirmationMaterializesLessonAndClosesCompetitors(t *testing.T) {
	f := bookingSetup(t, true)
	slot := f.slots(t)[40]
	id := f.pending(t, 40, "r1")
	other := testkit.Create(t, f.app, "students", map[string]any{"cellphone": "{{PHONE_mnlbc30x}}"})
	competing := put(t, f.app, "appointment_requests", map[string]any{"studentId": other.Id, "teacherId": f.teacherID, "offeringId": f.offeringID,
		"courseSpecId": f.specID, "creditTypeId": f.creditID, "policyId": f.policyID, "status": "pending", "version": 1,
		"requestedStartAt": slot["startAt"], "requestedEndAt": slot["endAt"], "requestedAt": iso(time.Now().UTC()),
		"responseDeadline": iso(time.Now().UTC().Add(time.Hour)), "idempotencyKey": "competing", "requestFingerprint": "x",
		"code": "APT-competing", "policySnapshot": defaultBookingPolicy()})
	result, err := confirmAppointment(f.app, f.as("teacher", "c1", map[string]any{"appointmentId": id}))
	if err != nil || result["status"] != "confirmed" || result["replayed"] != false || result["closedAppointmentIds"].([]any)[0] != competing.Id {
		t.Fatalf("confirm = %v, %v", result, err)
	}
	sessionID := result["lessonId"].(string)
	if recordField(t, f, "sessions", sessionID, "originType") != "appointment" || recordField(t, f, "appointment_requests", competing.Id, "status") != "slot_taken" {
		t.Fatal("session origin or competitor status wrong")
	}
	student, _ := findFirst(f.app, "session_students", `sessionId="`+sessionID+`"`)
	teacher, _ := findFirst(f.app, "session_teachers", `sessionId="`+sessionID+`"`)
	if student["creditStatus"] != "reserved" || teacher["assignmentSource"] != "appointment" {
		t.Fatalf("roster = %v / %v", student, teacher)
	}
	allocations, _ := list(f.app, "session_credit_allocations", `sessionStudentId="`+student["id"].(string)+`"`, "")
	if len(allocations) != 1 || activeClaims(t, f.app, id) != 8 || operationBy(t, f, "confirm_appointment")["sourceId"] != id {
		t.Fatalf("allocations = %d, claims = %d", len(allocations), activeClaims(t, f.app, id))
	}
}

// Hono: courseBookingServices › Admin confirmation reuses the atomic decision without teacher impersonation
func TestAdminConfirmationKeepsBookedTeacher(t *testing.T) {
	f := bookingSetup(t, true)
	id := f.pending(t, 40, "r1")
	result, err := confirmAppointment(f.app, f.as("admin", "c1", map[string]any{"appointmentId": id}))
	if err != nil || result["status"] != "confirmed" {
		t.Fatalf("confirm = %v, %v", result, err)
	}
	if operationBy(t, f, "confirm_appointment")["actorRole"] != "admin" {
		t.Fatal("operation must record the admin")
	}
	event, _ := findFirst(f.app, "appointment_events", `toStatus="confirmed"`)
	teacher, _ := findFirst(f.app, "session_teachers", `sessionId="`+result["lessonId"].(string)+`"`)
	if event["actorRole"] != "admin" || teacher["teacherId"] != f.teacherID {
		t.Fatalf("event = %v, teacher = %v", event, teacher)
	}
}

// Hono: courseBookingServices › confirmation closes an expired or no-longer-eligible request without partial lesson records
func TestConfirmationClosesExpiredOrIneligibleRequests(t *testing.T) {
	f := bookingSetup(t, true)
	expiredID := f.pending(t, 40, "r1")
	patch(t, f.app, "appointment_requests", expiredID, map[string]any{"responseDeadline": iso(time.Now().UTC().Add(-time.Minute))})
	expired, err := confirmAppointment(f.app, f.as("teacher", "c1", map[string]any{"appointmentId": expiredID}))
	if err != nil || expired["status"] != "expired" {
		t.Fatalf("expired = %v, %v", expired, err)
	}
	ineligibleID := f.pending(t, 60, "r2")
	batch := batchOf(t, f.app, f.studentID)
	batch.Set("availableQuantity", 0)
	batch.Set("frozenQuantity", 10)
	if err := f.app.Save(batch); err != nil {
		t.Fatal(err)
	}
	ineligible, err := confirmAppointment(f.app, f.as("teacher", "c2", map[string]any{"appointmentId": ineligibleID}))
	if err != nil || ineligible["status"] != "eligibility_lost" {
		t.Fatalf("ineligible = %v, %v", ineligible, err)
	}
	if sessions, _ := f.app.CountRecords("sessions"); sessions != 0 {
		t.Fatalf("closed requests created %d sessions", sessions)
	}
	if after := batchOf(t, f.app, f.studentID); after.GetInt("frozenQuantity") != 10 {
		t.Fatalf("batch touched: %v", after.FieldsData())
	}
}

// Hono: courseBookingServices › confirmation rejects ownership, unavailable slots, and maps claim races to a stable code
func TestConfirmationOwnershipSlotsAndClaimRaces(t *testing.T) {
	f := bookingSetup(t, true)
	// Overrides must stay within one local day, so skip a slot ending at midnight.
	slots, index := f.slots(t), 40
	for ; ; index++ {
		start, _ := millis(slots[index]["startAt"])
		end, _ := millis(slots[index]["endAt"])
		if localPartsAt(start).date == localPartsAt(end).date {
			break
		}
	}
	slot := slots[index]
	id := f.pending(t, index, "r1")
	_, err := confirmAppointment(f.app, f.as("teacher", "c0", map[string]any{"appointmentId": id, "teacherId": "other"}))
	failsWith(t, err, "APPOINTMENT_TEACHER_FORBIDDEN")
	ok(t, f.call(t, f.teacher, http.MethodPost, "/v1/teacher/offerings/"+f.offeringID+"/availability-overrides",
		map[string]any{"type": "unavailable", "startAt": slot["startAt"], "endAt": slot["endAt"]}, "o1"), "block slot")
	_, err = confirmAppointment(f.app, f.as("teacher", "c1", map[string]any{"appointmentId": id}))
	failsWith(t, err, "BOOKING_SLOT_TAKEN")
	race := slotTaken(&storeError{status: 409, message: "unique schedule_claim conflict"})
	failsWith(t, race, "BOOKING_SLOT_TAKEN")
	if other := slotTaken(&storeError{status: 500, message: "unique schedule_claim conflict"}); errorCode(other) == "BOOKING_SLOT_TAKEN" {
		t.Fatal("only conflict statuses map to BOOKING_SLOT_TAKEN")
	}
}

// Hono: courseBookingServices › confirmation replays the stored operation for the same idempotency request
func TestConfirmationReplaysStoredOperation(t *testing.T) {
	f := bookingSetup(t, true)
	id := f.pending(t, 40, "r1")
	first, err := confirmAppointment(f.app, f.as("teacher", "c1", map[string]any{"appointmentId": id}))
	if err != nil {
		t.Fatal(err)
	}
	sessions, _ := f.app.CountRecords("sessions")
	replay, err := confirmAppointment(f.app, f.as("teacher", "c1", map[string]any{"appointmentId": id}))
	if err != nil || replay["replayed"] != true || replay["lessonId"] != first["lessonId"] {
		t.Fatalf("replay = %v, %v", replay, err)
	}
	if after, _ := f.app.CountRecords("sessions"); after != sessions {
		t.Fatal("replay must not write")
	}
}

// Hono: courseBookingServices › student request writes immutable event and rejects duplicate or conflicting idempotency reuse
func TestStudentRequestEventAndIdempotency(t *testing.T) {
	f := bookingSetup(t, true)
	slots := f.slots(t)
	result, err := requestAppointment(f.app, f.requestInput("r1", slots[40], nil))
	if err != nil || result["status"] != "pending" {
		t.Fatalf("request = %v, %v", result, err)
	}
	stored, _ := get(f.app, "appointment_requests", result["appointmentId"].(string))
	event, _ := findFirst(f.app, "appointment_events", `toStatus="pending"`)
	if len(stored["requestFingerprint"].(string)) != 64 || event["metadata"].(map[string]any)["occurredAt"] == nil {
		t.Fatalf("stored = %v, event = %v", stored, event)
	}
	replay, err := requestAppointment(f.app, f.requestInput("r1", slots[40], nil))
	if err != nil || replay["replayed"] != true {
		t.Fatalf("replay = %v, %v", replay, err)
	}
	_, err = requestAppointment(f.app, f.requestInput("r1", slots[41], nil))
	failsWith(t, err, "IDEMPOTENCY_CONFLICT")
	_, err = requestAppointment(f.app, f.requestInput("r2", slots[41], nil))
	failsWith(t, err, "APPOINTMENT_PENDING_DUPLICATE")
}

// Hono: courseBookingServices › student request rejects inactive offerings, stale slots, and malformed commands
func TestStudentRequestRejectsInvalidInput(t *testing.T) {
	f := bookingSetup(t, true)
	slot := f.slots(t)[40]
	past := map[string]any{"startAt": iso(time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Hour)), "endAt": iso(time.Now().UTC().Add(-time.Hour).Truncate(time.Hour))}
	_, err := requestAppointment(f.app, f.requestInput("s1", past, nil))
	failsWith(t, err, "BOOKING_SLOT_UNAVAILABLE")
	for code, changes := range map[string]map[string]any{
		"BOOKING_STUDENT_REQUIRED":     {"studentId": ""},
		"BOOKING_OFFERING_REQUIRED":    {"offeringId": ""},
		"BOOKING_START_REQUIRED":       {"startAt": ""},
		"BOOKING_END_REQUIRED":         {"endAt": ""},
		"BOOKING_REQUEST_TIME_INVALID": {"endAt": slot["startAt"]},
	} {
		_, err := requestAppointment(f.app, f.requestInput("m-"+code, slot, changes))
		failsWith(t, err, code)
	}
	patch(t, f.app, "teacher_course_offerings", f.offeringID, map[string]any{"status": "inactive"})
	_, err = requestAppointment(f.app, f.requestInput("s2", slot, nil))
	failsWith(t, err, "BOOKING_OFFERING_INACTIVE")
}

// Hono: courseBookingServices › request event defaults identity and trims optional text without trusting missing actor fields
func TestRequestEventDefaultsAndTextNormalization(t *testing.T) {
	f := bookingSetup(t, true)
	input := f.requestInput("r1", f.slots(t)[40], map[string]any{"note": nil})
	delete(input, "actorId")
	delete(input, "actorRole")
	result, err := requestAppointment(f.app, input)
	if err != nil {
		t.Fatal(err)
	}
	stored, _ := get(f.app, "appointment_requests", result["appointmentId"].(string))
	event, _ := findFirst(f.app, "appointment_events", `toStatus="pending"`)
	if stored["note"] != "" || event["actorId"] != f.studentID || event["actorRole"] != "student" {
		t.Fatalf("stored = %v, event = %v", stored, event)
	}
	if normalizeText("  abc  ", 2) != "ab" || normalizeText(nil, 20) != "" {
		t.Fatal("normalizeText")
	}
	manual := appointmentEvent(map[string]any{"id": "appointment"}, "manual", "pending", "pending",
		map[string]any{"studentId": "student", "reason": "  手工备注  ", "traceId": "trace"}, "2026-08-01T00:00:00.000Z", map[string]any{"source": "test"})
	if manual.data["metadata"].(map[string]any)["source"] != "test" || manual.data["reason"] != "手工备注" || manual.data["actorId"] != "student" {
		t.Fatalf("manual event = %v", manual.data)
	}
}

// Hono: courseBookingServices › materialization validates teacher rules and snapshots the existing lesson contract
func TestMaterializationSnapshotsLessonContract(t *testing.T) {
	appointment := map[string]any{"id": "appointment", "studentId": "student", "teacherId": "teacher", "courseSpecId": "course",
		"creditTypeId": "credit", "requestedStartAt": domainStart, "requestedEndAt": domainEnd}
	course := map[string]any{"id": "course", "name": "一对一声乐"}
	offering := map[string]any{"id": "offering", "location": "第一教室"}
	rule := func(changes map[string]any) map[string]any {
		value := map[string]any{"id": "teacher-rule", "courseSpecId": "course", "baseQuantity": 1.0, "version": 1.0}
		for key, item := range changes {
			value[key] = item
		}
		return value
	}
	built, err := materializeAppointment(appointment, course, offering, rule(nil), "2026-08-01T00:00:00.000Z")
	if err != nil {
		t.Fatal(err)
	}
	session := built.session
	lead := session["teacherRuleSnapshot"].(map[string]any)["rules"].(map[string]any)["lead"].(map[string]any)
	if session["attendanceRuleSnapshot"].(map[string]any)["absent"] != "consume" || session["settlementRuleSnapshot"].(map[string]any)["cancelled"] != "release" ||
		lead["ruleId"] != "teacher-rule" {
		t.Fatalf("session = %v", session)
	}
	zero, err := teacherRuleSnapshot(rule(map[string]any{"cancellationCompensation": map[string]any{"cancelled": 0.0}}), "course")
	if err != nil || zero["rules"].(map[string]any)["lead"].(map[string]any)["cancellationCompensation"] != nil {
		t.Fatalf("zero compensation = %v, %v", zero, err)
	}
	if fmtJSON(normalizeCancellationCompensation(map[string]any{"cancelled": 0.5})) != `{"eligibleActualStatuses":["confirmed"],"quantity":0.5}` {
		t.Fatal("legacy compensation")
	}
	_, err = teacherRuleSnapshot(rule(map[string]any{"cancellationCompensation": map[string]any{}}), "course")
	failsWith(t, err, "TEACHER_CANCELLATION_QUANTITY_INVALID")
	relations := copyMap(appointment)
	for _, field := range []string{"courseSpecId", "creditTypeId", "studentId", "teacherId"} {
		relations[field] = map[string]any{"id": appointment[field]}
	}
	fallback, err := materializeAppointment(relations, course, map[string]any{"id": "offering", "location": ""},
		rule(map[string]any{"courseSpecId": map[string]any{"id": "course"}, "version": 0.0}), "2026-08-01T00:00:00.000Z")
	if err != nil || fallback.session["location"] != "" || fallback.session["teacherRuleSnapshot"].(map[string]any)["version"] != 1.0 ||
		fallback.sessionStudent["studentId"] != "student" || fallback.sessionTeacher["teacherId"] != "teacher" {
		t.Fatalf("fallback = %+v, %v", fallback, err)
	}
	_, err = teacherRuleSnapshot(map[string]any{}, "course")
	failsWith(t, err, "BOOKING_TEACHER_RULE_REQUIRED")
	_, err = teacherRuleSnapshot(rule(map[string]any{"courseSpecId": "other"}), "course")
	failsWith(t, err, "BOOKING_TEACHER_RULE_COURSE_MISMATCH")
}
