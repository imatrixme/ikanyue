package coursecredit

import (
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
)

// Hono's booking command services (request, decision, pending lifecycle,
// cancellation, reschedule, availability, admin, workers). Every command takes
// Hono's merged input object: body fields, then command metadata
// (actorId, actorRole, idempotencyKey, traceId), then route parameters.

// bookingInput is `{...body, ...commandMetadata(c, user), ...route}`.
func bookingInput(body Body, actor Actor, route map[string]any) map[string]any {
	input := copyMap(body.Values)
	input["actorId"] = actor.ID
	input["actorRole"] = actor.Role
	input["idempotencyKey"] = actor.IdempotencyKey
	input["traceId"] = actor.TraceID
	for key, value := range route {
		input[key] = value
	}
	return input
}

// text is `typeof input[key] === 'string' ? input[key] : ""`.
func text(input map[string]any, key string) string {
	value, _ := input[key].(string)
	return value
}

func normalizeText(value any, limit int) string {
	if text, ok := value.(string); ok {
		return jsx.Slice(strings.TrimSpace(text), limit)
	}
	return ""
}

// teaching is prepareTeachingCommand's result; replayed is set when the command already ran.
type teaching struct {
	at, operationID, scopedKey, requestHash string
	replayed                                map[string]any
}

func prepareTeaching(app core.App, scope string, input, request map[string]any) (teaching, error) {
	key, ok := textValue(input["idempotencyKey"])
	if !ok {
		return teaching{}, Fail("IDEMPOTENCY_KEY_REQUIRED", "idempotencyKey is required", nil)
	}
	if text(input, "actorId") == "" {
		return teaching{}, Fail("ACTOR_ID_REQUIRED", "actorId is required", nil)
	}
	command := teaching{scopedKey: scope + ":" + strings.TrimSpace(key), requestHash: fingerprint(request)}
	replayed, err := replay(app, command.scopedKey, command.requestHash, replayConflict)
	if err != nil {
		return teaching{}, err
	}
	command.replayed = replayed
	command.at = iso(clock())
	command.operationID = ids.Record()
	return command, nil
}

func (t teaching) time() time.Time {
	ms, _ := millis(t.at)
	return time.UnixMilli(ms)
}

// operation is teachingOperation: the committed credit_operations row.
func (t teaching) operation(input map[string]any, kind, sourceType string, sourceID, studentID any, request, result map[string]any) step {
	snapshot := copyMap(request)
	snapshot["requestHash"] = t.requestHash
	data := map[string]any{
		"id":                    t.operationID,
		"operationNo":           operationNo(kind, t.time(), t.operationID),
		"studentId":             or(studentID, ""),
		"type":                  kind,
		"status":                "committed",
		"idempotencyKey":        t.scopedKey,
		"sourceType":            sourceType,
		"sourceId":              sourceID,
		"reversalOfOperationId": "",
		"requestSnapshot":       snapshot,
		"resultSnapshot":        result,
		"actorId":               input["actorId"],
		"actorRole":             or(input["actorRole"], "admin"),
		"traceId":               or(input["traceId"], ""),
	}
	for key, value := range operationAudit(or(input["reason"], kind), request, result) {
		data[key] = value
	}
	return create("credit_operations", data)
}

// commit is commitTeachingPlan: a failed plan explained by a concurrent identical command replays it.
func (t teaching) commit(app core.App, plan []step, result map[string]any) (map[string]any, error) {
	return commitOrReplay(app, plan, t.scopedKey, t.requestHash, replayConflict, "COURSE_CREDIT_BATCH_FAILED", result)
}

var scheduleConflictText = regexp.MustCompile(`(?i)schedule_claim|idx_schedule_claims_active_cell|unique`)

// slotTaken is `if (isScheduleConflict(error)) error.code = 'BOOKING_SLOT_TAKEN'`.
func slotTaken(err error) error {
	var store *storeError
	if !errors.As(err, &store) || (store.status != 400 && store.status != 409) {
		return err
	}
	if !scheduleConflictText.MatchString(store.code + " " + store.message + " " + fmt.Sprint(store.cause)) {
		return err
	}
	tagged := *store
	tagged.code = "BOOKING_SLOT_TAKEN"
	return &tagged
}

func appointmentEvent(appointment map[string]any, eventType string, from any, to string, input map[string]any, at string, metadata map[string]any) step {
	details := copyMap(metadata)
	details["occurredAt"] = at
	return create("appointment_events", map[string]any{
		"id": ids.Record(), "appointmentId": appointment["id"], "eventType": eventType, "fromStatus": from, "toStatus": to,
		"actorId": orChain(input["actorId"], input["studentId"], ""), "actorRole": or(input["actorRole"], "student"),
		"reason": normalizeText(or(input["reason"], eventType), 500), "traceId": or(input["traceId"], ""),
		"metadata": details,
	})
}

// appointmentUpdate is appointmentUpdatePlan: a version-claimed status transition with its event.
func appointmentUpdate(appointment, input map[string]any, t teaching, next string, changes, metadata map[string]any) ([]step, error) {
	if err := transitionAppointment(appointment["status"], next); err != nil {
		return nil, err
	}
	version := positiveVersion(appointment["version"])
	data := copyMap(changes)
	data["responseReason"] = or(input["reason"], "")
	data["status"] = next
	data["version"] = version + 1
	id := jsx.String(appointment["id"])
	return []step{
		versionClaim("appointment", id, version, t.operationID),
		update("appointment_requests", id, data),
		appointmentEvent(appointment, next, appointment["status"], next, input, t.at, metadata),
	}, nil
}

func requestResult(record map[string]any, replayed bool) map[string]any {
	return map[string]any{
		"appointmentId": record["id"], "status": record["status"], "startAt": record["requestedStartAt"],
		"endAt": record["requestedEndAt"], "responseDeadline": record["responseDeadline"], "replayed": replayed,
	}
}

// requestAppointment is AppointmentRequestService.createRequest: a pending request for an open slot.
func requestAppointment(app core.App, input map[string]any) (map[string]any, error) {
	for _, field := range [][2]string{{"studentId", "BOOKING_STUDENT_REQUIRED"}, {"offeringId", "BOOKING_OFFERING_REQUIRED"},
		{"startAt", "BOOKING_START_REQUIRED"}, {"endAt", "BOOKING_END_REQUIRED"}} {
		if text(input, field[0]) == "" {
			return nil, Fail(field[1], "预约信息不完整", nil)
		}
	}
	studentID, offeringID, startAt, endAt := text(input, "studentId"), text(input, "offeringId"), text(input, "startAt"), text(input, "endAt")
	start, ok1 := millis(startAt)
	end, ok2 := millis(endAt)
	if !ok1 || !ok2 || end <= start {
		return nil, Fail("BOOKING_REQUEST_TIME_INVALID", "预约结束时间必须晚于开始时间", nil)
	}
	key, err := scopedIdempotencyKey("requestAppointment", input["idempotencyKey"])
	if err != nil {
		return nil, err
	}
	note := normalizeText(input["note"], 500)
	requestFingerprint := fingerprint(map[string]any{"endAt": endAt, "note": note, "offeringId": offeringID, "startAt": startAt, "studentId": studentID})
	existing, err := findFirst(app, "appointment_requests", `idempotencyKey="`+escape(key)+`"`)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		if existing["requestFingerprint"] != requestFingerprint {
			return nil, Fail("IDEMPOTENCY_CONFLICT", "幂等键已用于另一条预约申请", nil)
		}
		return requestResult(existing, true), nil
	}
	offering, err := get(app, "teacher_course_offerings", offeringID, "teacherId", "courseSpecId", "creditTypeId", "policyId")
	if err != nil {
		return nil, err
	}
	if offering["status"] != "active" {
		return nil, Fail("BOOKING_OFFERING_INACTIVE", "该教师暂未开放预约", nil)
	}
	courseID := relationID(offering["courseSpecId"])
	duplicate, err := findFirst(app, "appointment_requests",
		`studentId="`+escape(studentID)+`" && courseSpecId="`+escape(courseID)+`" && status="pending"`)
	if err != nil {
		return nil, err
	}
	if duplicate != nil {
		return nil, Fail("APPOINTMENT_PENDING_DUPLICATE", "这门课程已有待确认预约", nil)
	}
	if err := requireSlot(app, studentID, map[string]string{"offeringId": offeringID, "from": startAt, "to": endAt},
		startAt, endAt, "BOOKING_SLOT_UNAVAILABLE", "所选时间当前不可预约"); err != nil {
		return nil, err
	}
	policy, err := get(app, "booking_policies", relationID(offering["policyId"]))
	if err != nil {
		return nil, err
	}
	now := clock()
	at := iso(now)
	deadline, err := responseDeadline(at, startAt, policy)
	if err != nil {
		return nil, err
	}
	snapshot, err := normalizeBookingPolicy(policy)
	if err != nil {
		return nil, err
	}
	appointmentID := ids.Record()
	data := map[string]any{
		"id": appointmentID, "code": operationNo("APT", now, appointmentID), "studentId": studentID,
		"teacherId": relationID(offering["teacherId"]), "offeringId": offering["id"], "courseSpecId": courseID,
		"creditTypeId": relationID(offering["creditTypeId"]), "policyId": relationID(offering["policyId"]), "sessionId": "",
		"status": "pending", "requestedStartAt": startAt, "requestedEndAt": endAt, "responseDeadline": deadline,
		"note": note, "responseReason": "", "policySnapshot": snapshot, "idempotencyKey": key,
		"requestFingerprint": requestFingerprint, "version": 1, "requestedAt": at,
		"respondedAt": "", "confirmedAt": "", "cancelledAt": "",
	}
	plan := []step{
		create("appointment_requests", data),
		appointmentEvent(data, "requested", "", "pending", input, at, nil),
		create("outbox_events", map[string]any{
			"id": ids.Record(), "topic": "course-booking.requested", "aggregateType": "appointment", "aggregateId": appointmentID,
			"payload": map[string]any{"appointmentId": appointmentID, "teacherId": data["teacherId"], "startAt": startAt},
			"status":  "pending", "attempts": 0,
		}),
	}
	if err := send(app, plan); err != nil {
		return nil, err
	}
	return requestResult(data, false), nil
}

// requireSlot fails unless availableSlots still offers exactly [startAt, endAt).
func requireSlot(app core.App, studentID string, query map[string]string, startAt, endAt any, code, message string) error {
	availability, err := availableSlots(app, studentID, query)
	if err != nil {
		return err
	}
	for _, slot := range availability["slots"].([]any) {
		entry := slot.(map[string]any)
		if sameRange(entry["startAt"], entry["endAt"], startAt, endAt) {
			return nil
		}
	}
	return Fail(code, message, nil)
}

// authorizeDecision: operators may decide any pending request, teachers only their own.
func authorizeDecision(appointment, input map[string]any) error {
	if input["actorRole"] != "admin" {
		if relationID(appointment["teacherId"]) != text(input, "teacherId") {
			return Fail("APPOINTMENT_TEACHER_FORBIDDEN", "不能处理其他教师的预约", nil)
		}
	}
	if appointment["status"] != "pending" {
		return Fail("APPOINTMENT_NOT_PENDING", "预约已被处理", nil)
	}
	return nil
}

// confirmAppointment is AppointmentDecisionService.confirm: materialize the session, freeze one
// credit, claim both calendars and close overlapping pending requests as slot_taken.
func confirmAppointment(app core.App, input map[string]any) (map[string]any, error) {
	if text(input, "appointmentId") == "" {
		return nil, Fail("APPOINTMENT_ID_REQUIRED", "预约编号不能为空", nil)
	}
	if input["actorRole"] != "admin" && text(input, "teacherId") == "" {
		return nil, Fail("BOOKING_TEACHER_REQUIRED", "教师编号不能为空", nil)
	}
	t, err := prepareTeaching(app, "confirmAppointment", input, map[string]any{"appointmentId": input["appointmentId"]})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	appointment, err := get(app, "appointment_requests", text(input, "appointmentId"))
	if err != nil {
		return nil, err
	}
	if err := authorizeDecision(appointment, input); err != nil {
		return nil, err
	}
	deadline, ok1 := millis(appointment["responseDeadline"])
	at, ok2 := millis(t.at)
	if ok1 && ok2 && deadline <= at {
		return closePending(app, t, appointment, input, "expired", "教师响应期限已过")
	}
	offering, err := get(app, "teacher_course_offerings", relationID(appointment["offeringId"]))
	if err != nil {
		return nil, err
	}
	if offering["status"] != "active" {
		return nil, Fail("BOOKING_OFFERING_INACTIVE", "该课程已停止接受预约", nil)
	}
	course, err := get(app, "course_specs", relationID(appointment["courseSpecId"]))
	if err != nil {
		return nil, err
	}
	creditType, err := get(app, "credit_types", relationID(appointment["creditTypeId"]))
	if err != nil {
		return nil, err
	}
	teacherRule, err := findTeacherRule(app, relationID(appointment["courseSpecId"]), appointment["requestedStartAt"])
	if err != nil {
		return nil, err
	}
	studentID := relationID(appointment["studentId"])
	filter, err := fefoFilter(studentID, relationID(appointment["creditTypeId"]), appointment["requestedStartAt"])
	if err != nil {
		return nil, err
	}
	batches, err := list(app, "credit_batches", filter, fefoSort)
	if err != nil {
		return nil, err
	}
	if creditType["kind"] != "course" || creditType["consumable"] != true {
		return nil, Fail("BOOKING_CREDIT_TYPE_INVALID", "预约课程配置无效", nil)
	}
	planning, err := planReservation(batches, 1, reservationContext{creditType: creditType, now: t.at,
		creditTypeID: relationID(appointment["creditTypeId"]), sessionStart: appointment["requestedStartAt"]})
	if err != nil {
		return nil, err
	}
	if planning.missing > 0 {
		return closePending(app, t, appointment, input, "eligibility_lost", "可用课时已不足")
	}
	if err := requireSlot(app, studentID, map[string]string{"offeringId": relationID(appointment["offeringId"]),
		"from": jsx.String(appointment["requestedStartAt"]), "to": jsx.String(appointment["requestedEndAt"])},
		appointment["requestedStartAt"], appointment["requestedEndAt"], "BOOKING_SLOT_TAKEN", "该时段已不可预约"); err != nil {
		return nil, err
	}
	return commitConfirmation(app, t, appointment, course, offering, teacherRule, planning, input)
}

func commitConfirmation(app core.App, t teaching, appointment, course, offering, teacherRule map[string]any, planning reservationPlan, input map[string]any) (map[string]any, error) {
	built, err := materializeAppointment(appointment, course, offering, teacherRule, t.at)
	if err != nil {
		return nil, err
	}
	movements, err := buildReservationMovements(planning)
	if err != nil {
		return nil, err
	}
	sessionID := jsx.String(built.session["id"])
	appointmentID := jsx.String(appointment["id"])
	studentID := relationID(appointment["studentId"])
	claims, err := appointmentClaimPlan(appointmentID, appointment["requestedStartAt"], appointment["requestedEndAt"],
		claimGranularityOf(appointment), sessionID, relationID(appointment["teacherId"]), studentID)
	if err != nil {
		return nil, err
	}
	competing, err := list(app, "appointment_requests",
		`teacherId="`+escape(relationID(appointment["teacherId"]))+`" && status="pending"`+
			` && requestedStartAt<"`+escape(filterTime(appointment["requestedEndAt"]))+`"`+
			` && requestedEndAt>"`+escape(filterTime(appointment["requestedStartAt"]))+`"`, "requestedAt,id")
	if err != nil {
		return nil, err
	}
	competing = slices.DeleteFunc(competing, func(record map[string]any) bool { return record["id"] == appointment["id"] })
	closedIDs := make([]any, len(competing))
	for i, record := range competing {
		closedIDs[i] = record["id"]
	}
	allocationIDs := make([]any, len(movements))
	for i, movement := range movements {
		allocationIDs[i] = movement.allocationID
	}
	result := map[string]any{
		"appointmentId": appointmentID, "closedAppointmentIds": closedIDs, "endAt": appointment["requestedEndAt"],
		"lessonId": sessionID, "operationId": t.operationID, "reservationAllocationIds": allocationIDs,
		"startAt": appointment["requestedStartAt"], "status": "confirmed",
	}
	reservation := reservationSession{sessionID: sessionID, sessionStudent: built.sessionStudent, operationID: t.operationID,
		at: t.at, actorID: jsx.String(or(input["actorId"], ""))}
	plan := []step{
		t.operation(input, "confirm_appointment", "appointment", appointmentID, studentID,
			map[string]any{"appointmentId": appointmentID, "version": positiveVersion(appointment["version"])}, result),
		create("sessions", built.session),
		create("session_students", built.sessionStudent),
		create("session_teachers", built.sessionTeacher),
	}
	plan = append(plan, reservation.movementPlan(movements, built.session["startAt"], "session_reservation",
		func(string) map[string]any { return nil })...)
	plan = append(plan, claims...)
	confirmed, err := appointmentUpdate(appointment, input, t, "confirmed",
		map[string]any{"confirmedAt": t.at, "respondedAt": t.at, "sessionId": sessionID}, nil)
	if err != nil {
		return nil, err
	}
	plan = append(plan, confirmed...)
	for _, record := range competing {
		closed, err := appointmentUpdate(record, input, t, "slot_taken", map[string]any{"respondedAt": t.at},
			map[string]any{"winningAppointmentId": appointmentID})
		if err != nil {
			return nil, err
		}
		plan = append(plan, closed...)
	}
	plan = append(plan, outbox("course-booking.confirmed", "appointment", appointmentID, result))
	committed, err := t.commit(app, plan, result)
	if err != nil {
		return nil, slotTaken(err)
	}
	return committed, nil
}

// closePending ends a pending request the decision found expired or no longer payable.
func closePending(app core.App, t teaching, appointment, input map[string]any, status, reason string) (map[string]any, error) {
	appointmentID := jsx.String(appointment["id"])
	result := map[string]any{"appointmentId": appointmentID, "operationId": t.operationID, "status": status}
	withReason := copyMap(input)
	withReason["reason"] = reason
	updates, err := appointmentUpdate(appointment, withReason, t, status, map[string]any{"respondedAt": t.at}, nil)
	if err != nil {
		return nil, err
	}
	plan := append([]step{t.operation(input, "confirm_appointment", "appointment", appointmentID,
		relationID(appointment["studentId"]), map[string]any{"appointmentId": appointmentID}, result)}, updates...)
	plan = append(plan, outbox("course-booking."+strings.ReplaceAll(status, "_", "-"), "appointment", appointmentID, result))
	return t.commit(app, plan, result)
}

// declineAppointment and withdrawAppointment are PendingAppointmentService's transitions.
func declineAppointment(app core.App, input map[string]any) (map[string]any, error) {
	if err := pendingInput(input, "teacherId", true); err != nil {
		return nil, err
	}
	if _, ok := textValue(input["reason"]); !ok {
		return nil, Fail("APPOINTMENT_DECLINE_REASON_REQUIRED", "请填写拒绝原因", nil)
	}
	return pendingTransition(app, input, "declineAppointment", "decline_appointment", "declined", func(appointment map[string]any) error {
		if input["actorRole"] != "admin" && relationID(appointment["teacherId"]) != text(input, "teacherId") {
			return Fail("APPOINTMENT_TEACHER_FORBIDDEN", "不能处理其他教师的预约", nil)
		}
		return nil
	})
}

func withdrawAppointment(app core.App, input map[string]any) (map[string]any, error) {
	if err := pendingInput(input, "studentId", false); err != nil {
		return nil, err
	}
	return pendingTransition(app, input, "withdrawAppointment", "withdraw_appointment", "withdrawn", func(appointment map[string]any) error {
		if relationID(appointment["studentId"]) != text(input, "studentId") {
			return Fail("APPOINTMENT_STUDENT_FORBIDDEN", "不能撤回其他学员的预约", nil)
		}
		return nil
	})
}

func pendingInput(input map[string]any, owner string, allowAdmin bool) error {
	if text(input, "appointmentId") == "" {
		return Fail("APPOINTMENT_ID_REQUIRED", "预约编号不能为空", nil)
	}
	if allowAdmin && input["actorRole"] == "admin" {
		return nil
	}
	if text(input, owner) == "" {
		return Fail("APPOINTMENT_OWNER_REQUIRED", "预约操作人不能为空", nil)
	}
	return nil
}

func pendingTransition(app core.App, input map[string]any, scope, kind, status string, authorize func(map[string]any) error) (map[string]any, error) {
	request := map[string]any{"appointmentId": input["appointmentId"], "reason": or(input["reason"], "")}
	t, err := prepareTeaching(app, scope, input, request)
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	appointment, err := get(app, "appointment_requests", text(input, "appointmentId"))
	if err != nil {
		return nil, err
	}
	if err := authorize(appointment); err != nil {
		return nil, err
	}
	if appointment["status"] != "pending" {
		return nil, Fail("APPOINTMENT_NOT_PENDING", "预约已被处理", nil)
	}
	appointmentID := jsx.String(appointment["id"])
	result := map[string]any{"appointmentId": appointmentID, "operationId": t.operationID, "status": status}
	cancelledAt := ""
	if status == "withdrawn" {
		cancelledAt = t.at
	}
	updates, err := appointmentUpdate(appointment, input, t, status, map[string]any{"cancelledAt": cancelledAt, "respondedAt": t.at}, nil)
	if err != nil {
		return nil, err
	}
	plan := append([]step{t.operation(input, kind, "appointment", appointmentID, relationID(appointment["studentId"]),
		map[string]any{"appointmentId": appointmentID, "reason": or(input["reason"], "")}, result)}, updates...)
	plan = append(plan, outbox("course-booking."+status, "appointment", appointmentID, result))
	return t.commit(app, plan, result)
}

// authorizeCancellation: students before their cutoff (unless deferred), teachers their own, operators any.
func authorizeCancellation(appointment, input map[string]any, at string, deferCutoff bool) error {
	if appointment["status"] != "confirmed" && appointment["status"] != "rescheduled" {
		return Fail("APPOINTMENT_NOT_CANCELLABLE", "预约当前不能取消", nil)
	}
	switch input["actorRole"] {
	case "student":
		if relationID(appointment["studentId"]) != text(input, "studentId") {
			return Fail("APPOINTMENT_STUDENT_FORBIDDEN", "不能取消其他学员的预约", nil)
		}
		snapshot, _ := appointment["policySnapshot"].(map[string]any)
		cutoff := jsx.Number(or(snapshot["cancellationCutoffMinutes"], 0.0)) * minuteMillis
		start, _ := millis(appointment["requestedStartAt"])
		now, _ := millis(at)
		if !deferCutoff && !(float64(start-now) >= cutoff) {
			return Fail("APPOINTMENT_CANCELLATION_CUTOFF_PASSED", "已超过学员自助取消截止时间", nil)
		}
	case "teacher":
		if relationID(appointment["teacherId"]) != text(input, "teacherId") {
			return Fail("APPOINTMENT_TEACHER_FORBIDDEN", "不能取消其他教师的预约", nil)
		}
	case "admin":
	default:
		return Fail("APPOINTMENT_CANCEL_FORBIDDEN", "无权取消预约", nil)
	}
	return nil
}

// reservedRoster loads an appointment session's single reserved student, its reservations and batches.
func reservedRoster(app core.App, sessionID string, sorted bool, code, message string) (map[string]any, []map[string]any, map[string]map[string]any, error) {
	rosterSort, allocationSort := "", ""
	if sorted {
		rosterSort, allocationSort = "id", "batchId,id"
	}
	roster, err := list(app, "session_students", `sessionId="`+escape(sessionID)+`"`, rosterSort)
	if err != nil {
		return nil, nil, nil, err
	}
	if len(roster) != 1 || roster[0]["creditStatus"] != "reserved" {
		return nil, nil, nil, Fail(code, message, nil)
	}
	allocations, err := list(app, "session_credit_allocations",
		`sessionStudentId="`+escape(jsx.String(roster[0]["id"]))+`" && status="reserved"`, allocationSort)
	if err != nil {
		return nil, nil, nil, err
	}
	batches := map[string]map[string]any{}
	for _, allocation := range allocations {
		id := relationID(allocation["batchId"])
		if batches[id] == nil {
			if batches[id], err = get(app, "credit_batches", id); err != nil {
				return nil, nil, nil, err
			}
		}
	}
	return roster[0], allocations, batches, nil
}

func activeSessionClaims(app core.App, sessionID string) ([]map[string]any, error) {
	return list(app, "schedule_claims", `sourceType="session" && sourceId="`+escape(sessionID)+`" && status="active"`,
		"ownerType,ownerId,cellStartAt")
}

// previewCancellation is previewReservation: what cancelling would refund, for the student.
func previewCancellation(app core.App, studentID, appointmentID string) (any, error) {
	appointment, err := get(app, "appointment_requests", appointmentID)
	if err != nil {
		return nil, err
	}
	if appointment["studentId"] != studentID {
		return nil, Fail("APPOINTMENT_STUDENT_FORBIDDEN", "不能查看其他学员的预约", nil)
	}
	if appointment["status"] != "confirmed" && appointment["status"] != "rescheduled" {
		return nil, Fail("APPOINTMENT_NOT_CANCELLABLE", "预约当前不能取消", nil)
	}
	_, allocations, batches, err := reservedRoster(app, jsx.String(appointment["sessionId"]), false,
		"APPOINTMENT_ROSTER_INVALID", "预约课时当前不能取消")
	if err != nil {
		return nil, err
	}
	quote, err := reservationQuote(app, appointment, allocations, batches, iso(clock()), false)
	if err != nil {
		return nil, err
	}
	if quote == nil {
		return map[string]any{"mode": "credit", "amount": 0, "fee": 0, "quantity": 1}, nil
	}
	return map[string]any{"mode": "cash", "amount": quote.refundable, "fee": quote.fee, "paid": quote.paid, "currency": "CNY",
		"receivedAt": quote.receivedAt, "policyVersion": quote.policyVersion, "quantity": 1}, nil
}

// cancelAppointment is AppointmentCancellationService.cancel: release claims, return or refund
// the frozen credit and cancel the session.
// appointmentLead is the current lead teacher of the appointment's lesson; once a
// lesson was substituted only that teacher (or an administrator) may change it.
func appointmentLead(app core.App, appointment, input map[string]any) (string, error) {
	lead := relationID(appointment["teacherId"])
	if sessionID := relationID(appointment["sessionId"]); sessionID != "" {
		row, err := findFirst(app, "session_teachers", `sessionId="`+escape(sessionID)+`" && role="lead" && `+teachingRow)
		if err != nil {
			return "", err
		}
		if row != nil {
			lead = relationID(row["teacherId"])
		}
	}
	if input["actorRole"] == "teacher" && lead != text(input, "teacherId") {
		return "", Fail("APPOINTMENT_TEACHER_FORBIDDEN", "这节课已由其他老师负责", nil)
	}
	return lead, nil
}

func cancelAppointment(app core.App, input map[string]any) (map[string]any, error) {
	if text(input, "appointmentId") == "" {
		return nil, Fail("APPOINTMENT_ID_REQUIRED", "预约编号不能为空", nil)
	}
	if reason, ok := input["reason"].(string); !ok || jsx.Length(strings.TrimSpace(reason)) < 2 {
		return nil, Fail("APPOINTMENT_CANCEL_REASON_REQUIRED", "请填写取消原因", nil)
	}
	t, err := prepareTeaching(app, "cancelAppointment", input, map[string]any{
		"appointmentId": input["appointmentId"], "reason": input["reason"], "expectedRefundAmount": jsx.Get(input, "expectedRefundAmount"),
		"expectedFee": jsx.Get(input, "expectedFee"), "cancellationType": jsx.Get(input, "cancellationType"),
	})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	appointment, err := get(app, "appointment_requests", text(input, "appointmentId"))
	if err != nil {
		return nil, err
	}
	if err := authorizeCancellation(appointment, input, t.at, true); err != nil {
		return nil, err
	}
	if _, err := appointmentLead(app, appointment, input); err != nil {
		return nil, err
	}
	session, err := get(app, "sessions", relationID(appointment["sessionId"]))
	if err != nil {
		return nil, err
	}
	if session["status"] != "scheduled" && session["status"] != "enrollment_closed" {
		return nil, Fail("APPOINTMENT_SESSION_NOT_CANCELLABLE", "关联课堂当前不能取消", nil)
	}
	sessionID := jsx.String(session["id"])
	claims, err := activeSessionClaims(app, sessionID)
	if err != nil {
		return nil, err
	}
	student, allocations, batches, err := reservedRoster(app, sessionID, true, "APPOINTMENT_ROSTER_INVALID", "预约课堂学员记录无效")
	if err != nil {
		return nil, err
	}
	role := input["actorRole"]
	quote, err := reservationQuote(app, appointment, allocations, batches, t.at,
		role == "teacher" || (role == "admin" && input["cancellationType"] == "institution"))
	if err != nil {
		return nil, err
	}
	if quote == nil {
		if err := authorizeCancellation(appointment, input, t.at, false); err != nil {
			return nil, err
		}
	}
	appointmentID := jsx.String(appointment["id"])
	result := map[string]any{"appointmentId": appointmentID, "lessonId": sessionID, "operationId": t.operationID, "status": "cancelled"}
	var settlement []step
	if quote != nil {
		var refund map[string]any
		if settlement, refund, err = cashCancellationPlan(quote, appointment, student, input, t.operationID, t.at); err != nil {
			return nil, err
		}
		result["refund"] = refund
	} else {
		cancelled := copyMap(session)
		cancelled["status"] = "cancelled"
		if settlement, _, err = studentSettlementPlan(cancelled, student, allocations, batches, t.operationID, t.at,
			jsx.String(or(input["actorId"], ""))); err != nil {
			return nil, err
		}
	}
	sessionVersion := positiveVersion(session["version"])
	plan := []step{t.operation(input, "cancel_appointment", "appointment", appointmentID, relationID(appointment["studentId"]),
		map[string]any{"appointmentId": appointmentID, "reason": input["reason"]}, result)}
	plan = append(plan, releaseClaimPlan(claims, t.at, t.operationID)...)
	plan = append(plan, settlement...)
	plan = append(plan,
		versionClaim("session", sessionID, sessionVersion, t.operationID),
		update("sessions", sessionID, map[string]any{"cancellationType": cancellationType(input), "cancelledAt": t.at,
			"status": "cancelled", "version": sessionVersion + 1}))
	updates, err := appointmentUpdate(appointment, input, t, "cancelled", map[string]any{"cancelledAt": t.at, "respondedAt": t.at}, nil)
	if err != nil {
		return nil, err
	}
	plan = append(plan, updates...)
	plan = append(plan, outbox("course-booking.cancelled", "appointment", appointmentID, result))
	return t.commit(app, plan, result)
}

func cancellationType(input map[string]any) string {
	switch input["actorRole"] {
	case "student":
		return "student"
	case "teacher":
		return "teacher"
	}
	if input["cancellationType"] == "institution" {
		return "institution"
	}
	return "admin"
}

// rescheduleAppointment is AppointmentRescheduleService.reschedule: move the session, re-check
// credit at the new start and swap calendar claims.
func rescheduleAppointment(app core.App, input map[string]any) (map[string]any, error) {
	if text(input, "appointmentId") == "" {
		return nil, Fail("APPOINTMENT_ID_REQUIRED", "预约编号不能为空", nil)
	}
	newStart, ok1 := millis(input["newStartAt"])
	newEnd, ok2 := millis(input["newEndAt"])
	if !ok1 || !ok2 || newEnd <= newStart {
		return nil, Fail("APPOINTMENT_TIME_INVALID", "改期时间无效", nil)
	}
	if reason, ok := input["reason"].(string); !ok || jsx.Length(strings.TrimSpace(reason)) < 2 {
		return nil, Fail("APPOINTMENT_RESCHEDULE_REASON_REQUIRED", "请填写改期原因", nil)
	}
	t, err := prepareTeaching(app, "rescheduleAppointment", input, map[string]any{
		"appointmentId": input["appointmentId"], "newEndAt": input["newEndAt"], "newStartAt": input["newStartAt"], "reason": input["reason"],
	})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	appointment, err := get(app, "appointment_requests", text(input, "appointmentId"))
	if err != nil {
		return nil, err
	}
	if appointment["status"] != "confirmed" && appointment["status"] != "rescheduled" {
		return nil, Fail("APPOINTMENT_NOT_RESCHEDULABLE", "预约当前不能改期", nil)
	}
	if input["actorRole"] == "teacher" {
		if relationID(appointment["teacherId"]) != text(input, "teacherId") {
			return nil, Fail("APPOINTMENT_TEACHER_FORBIDDEN", "不能修改其他教师的预约", nil)
		}
	} else if input["actorRole"] != "admin" {
		return nil, Fail("APPOINTMENT_RESCHEDULE_FORBIDDEN", "无权修改预约时间", nil)
	}
	// Slots and calendar cells belong to the booked teacher's offering, so a substituted
	// lesson is cancelled and rebooked (or switched back) rather than moved.
	if lead, err := appointmentLead(app, appointment, input); err != nil {
		return nil, err
	} else if lead != relationID(appointment["teacherId"]) {
		return nil, Fail("APPOINTMENT_TEACHER_SUBSTITUTED", "这节课已换老师，不能直接改期，请换回原老师或取消后重新预约", nil)
	}
	session, err := get(app, "sessions", relationID(appointment["sessionId"]))
	if err != nil {
		return nil, err
	}
	if session["status"] != "scheduled" && session["status"] != "enrollment_closed" {
		return nil, Fail("APPOINTMENT_SESSION_NOT_RESCHEDULABLE", "关联课堂当前不能改期", nil)
	}
	if sameRange(session["startAt"], session["endAt"], input["newStartAt"], input["newEndAt"]) {
		return nil, Fail("APPOINTMENT_TIME_UNCHANGED", "新时间与原时间相同", nil)
	}
	sessionID := jsx.String(session["id"])
	startAt, endAt := fromMillis(newStart), fromMillis(newEnd)
	if err := requireSlot(app, relationID(appointment["studentId"]), map[string]string{
		"excludeSourceId": sessionID, "offeringId": relationID(appointment["offeringId"]),
		"from": jsx.String(input["newStartAt"]), "to": jsx.String(input["newEndAt"]),
	}, input["newStartAt"], input["newEndAt"], "BOOKING_SLOT_TAKEN", "新时段已不可预约"); err != nil {
		return nil, err
	}
	roster, err := list(app, "session_students", `sessionId="`+escape(sessionID)+`"`, "id")
	if err != nil {
		return nil, err
	}
	if len(roster) != 1 || roster[0]["creditStatus"] != "reserved" {
		return nil, Fail("APPOINTMENT_ROSTER_INVALID", "预约课堂学员记录无效", nil)
	}
	student := roster[0]
	requiredType := jsx.String(session["requiredCreditTypeId"])
	creditType, err := get(app, "credit_types", requiredType)
	if err != nil {
		return nil, err
	}
	allocations, err := list(app, "session_credit_allocations",
		`sessionStudentId="`+escape(jsx.String(student["id"]))+`" && status="reserved"`, "batchId,id")
	if err != nil {
		return nil, err
	}
	filter, err := fefoFilter(jsx.String(student["studentId"]), requiredType, input["newStartAt"])
	if err != nil {
		return nil, err
	}
	candidates, err := list(app, "credit_batches", filter, fefoSort)
	if err != nil {
		return nil, err
	}
	claims, err := activeSessionClaims(app, sessionID)
	if err != nil {
		return nil, err
	}
	allocated := map[string]map[string]any{}
	for _, allocation := range allocations {
		id := relationID(allocation["batchId"])
		if allocated[id] == nil {
			if allocated[id], err = get(app, "credit_batches", id); err != nil {
				return nil, err
			}
		}
	}
	credit, outcome, err := rescheduleCreditPlan(rescheduleInput{session: session, sessionStudent: student, creditType: creditType,
		allocations: allocations, candidates: candidates, allocated: allocated, newStartAt: startAt, at: t.at,
		operationID: t.operationID, actorID: jsx.String(or(input["actorId"], ""))})
	if err != nil {
		return nil, err
	}
	if !outcome.reserved {
		return nil, Fail("APPOINTMENT_ELIGIBILITY_LOST", "新时间没有可用的对应课时", nil)
	}
	appointmentID := jsx.String(appointment["id"])
	newClaims, err := appointmentClaimPlan(appointmentID, startAt, endAt, claimGranularityOf(appointment), sessionID,
		relationID(appointment["teacherId"]), relationID(appointment["studentId"]))
	if err != nil {
		return nil, err
	}
	result := map[string]any{"appointmentId": appointmentID, "lessonId": sessionID, "newEndAt": endAt, "newStartAt": startAt,
		"operationId": t.operationID, "status": "rescheduled"}
	sessionVersion := positiveVersion(session["version"])
	plan := []step{t.operation(input, "reschedule_appointment", "appointment", appointmentID, relationID(appointment["studentId"]),
		map[string]any{"appointmentId": appointmentID, "newEndAt": endAt, "newStartAt": startAt, "reason": input["reason"]}, result)}
	plan = append(plan, releaseClaimPlan(claims, t.at, t.operationID)...)
	plan = append(plan, newClaims...)
	plan = append(plan, credit...)
	plan = append(plan,
		versionClaim("session", sessionID, sessionVersion, t.operationID),
		update("sessions", sessionID, map[string]any{"endAt": endAt, "startAt": startAt, "version": sessionVersion + 1}))
	updates, err := appointmentUpdate(appointment, input, t, "rescheduled",
		map[string]any{"requestedEndAt": endAt, "requestedStartAt": startAt, "respondedAt": t.at},
		map[string]any{"oldEndAt": appointment["requestedEndAt"], "oldStartAt": appointment["requestedStartAt"]})
	if err != nil {
		return nil, err
	}
	plan = append(plan, updates...)
	plan = append(plan, outbox("course-booking.rescheduled", "appointment", appointmentID, result))
	committed, err := t.commit(app, plan, result)
	if err != nil {
		return nil, slotTaken(err)
	}
	return committed, nil
}

// availabilityContext loads a teacher's active offering and its normalized policy.
func availabilityContext(app core.App, input map[string]any) (map[string]any, map[string]any, error) {
	offering, err := get(app, "teacher_course_offerings", text(input, "offeringId"))
	if err != nil {
		return nil, nil, err
	}
	if relationID(offering["teacherId"]) != text(input, "teacherId") {
		return nil, nil, Fail("BOOKING_OFFERING_FORBIDDEN", "不能配置其他教师的课程", nil)
	}
	if offering["status"] != "active" {
		return nil, nil, Fail("BOOKING_OFFERING_INACTIVE", "课程预约尚未启用", nil)
	}
	record, err := get(app, "booking_policies", relationID(offering["policyId"]))
	if err != nil {
		return nil, nil, err
	}
	policy, err := normalizeBookingPolicy(record)
	return offering, policy, err
}

func availabilityBase(input map[string]any) error {
	if text(input, "teacherId") == "" {
		return Fail("BOOKING_TEACHER_REQUIRED", "教师编号不能为空", nil)
	}
	if text(input, "offeringId") == "" {
		return Fail("BOOKING_OFFERING_REQUIRED", "课程预约配置不能为空", nil)
	}
	return nil
}

// saveWeeklyAvailability replaces an offering's weekly rules; none means the policy defaults.
func saveWeeklyAvailability(app core.App, input map[string]any) (map[string]any, error) {
	if err := availabilityBase(input); err != nil {
		return nil, err
	}
	rawRules, ok := input["rules"].([]any)
	if !ok {
		return nil, Fail("BOOKING_WEEKLY_RULES_REQUIRED", "每周可预约时间必须是数组", nil)
	}
	t, err := prepareTeaching(app, "saveTeacherAvailability", input, map[string]any{
		"effectiveFrom": or(input["effectiveFrom"], ""), "offeringId": input["offeringId"], "rules": input["rules"],
	})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	offering, policy, err := availabilityContext(app, input)
	if err != nil {
		return nil, err
	}
	rules, err := normalizeWeeklyRules(rawRules, policyWindows(policy))
	if err != nil {
		return nil, err
	}
	offeringID := jsx.String(offering["id"])
	teacherID := text(input, "teacherId")
	existing, err := list(app, "teacher_availability_rules",
		`teacherId="`+escape(teacherID)+`" && offeringId="`+escape(offeringID)+`" && status="active"`, "weekday,startMinute,id")
	if err != nil {
		return nil, err
	}
	mode := "default"
	if len(rules) > 0 {
		mode = "custom"
	}
	result := map[string]any{"availabilityMode": mode, "offeringId": offeringID, "operationId": t.operationID, "ruleCount": len(rules)}
	plan := []step{t.operation(input, "configure_availability", "teacher_offering", offeringID, nil,
		map[string]any{"offeringId": offeringID, "rules": rules}, result)}
	for _, rule := range existing {
		version := positiveVersion(rule["version"])
		id := jsx.String(rule["id"])
		plan = append(plan, versionClaim("availability_rule", id, version, t.operationID),
			update("teacher_availability_rules", id, map[string]any{"effectiveTo": t.at, "status": "inactive", "version": version + 1}))
	}
	for _, item := range rules {
		rule := copyMap(item.(map[string]any))
		rule["id"], rule["teacherId"], rule["offeringId"] = ids.Record(), teacherID, offeringID
		rule["effectiveFrom"], rule["effectiveTo"] = or(input["effectiveFrom"], t.at), ""
		rule["version"], rule["status"] = 1, "active"
		plan = append(plan, create("teacher_availability_rules", rule))
	}
	version := positiveVersion(offering["version"])
	plan = append(plan,
		versionClaim("teacher_offering", offeringID, version, t.operationID),
		update("teacher_course_offerings", offeringID, map[string]any{"availabilityMode": mode, "version": version + 1}),
		outbox("course-booking.availability-updated", "teacher_offering", offeringID, result))
	return t.commit(app, plan, result)
}

// normalizeWeeklyRules validates weekly windows against the policy's opening hours.
func normalizeWeeklyRules(rules []any, windows []window) ([]any, error) {
	type rule struct{ weekday, start, end int }
	normalized := make([]rule, len(rules))
	for i, item := range rules {
		entry, _ := item.(map[string]any)
		fields := []struct {
			key, code string
			low, high float64
		}{
			{"weekday", "BOOKING_WEEKDAY_INVALID", 1, 7},
			{"startMinute", "BOOKING_WINDOW_START_INVALID", 0, 1439},
			{"endMinute", "BOOKING_WINDOW_END_INVALID", 1, 1440},
		}
		values := [3]int{}
		for j, field := range fields {
			value := jsx.Get(entry, field.key)
			number := jsx.Number(value)
			if !jsx.IsInteger(value) || number < field.low || number > field.high {
				return nil, Fail(field.code, "时间配置无效", nil)
			}
			values[j] = int(number)
		}
		normalized[i] = rule{values[0], values[1], values[2]}
	}
	slices.SortStableFunc(normalized, func(a, b rule) int {
		if a.weekday != b.weekday {
			return a.weekday - b.weekday
		}
		return a.start - b.start
	})
	result := make([]any, len(normalized))
	for i, r := range normalized {
		if r.end <= r.start {
			return nil, Fail("BOOKING_WINDOW_RANGE_INVALID", "结束时间必须晚于开始时间", nil)
		}
		if !slices.ContainsFunc(windows, func(w window) bool { return r.start >= w.start && r.end <= w.end }) {
			return nil, Fail("BOOKING_WINDOW_OUTSIDE_POLICY", "教师可预约时间不能超出机构开放时间", nil)
		}
		if i > 0 && normalized[i-1].weekday == r.weekday && normalized[i-1].end > r.start {
			return nil, Fail("BOOKING_WINDOWS_OVERLAP", "同一天的可预约时间不能重叠", nil)
		}
		result[i] = map[string]any{"weekday": r.weekday, "startMinute": r.start, "endMinute": r.end}
	}
	return result, nil
}

// createAvailabilityOverride opens or blocks a one-off window inside a single local day.
func createAvailabilityOverride(app core.App, input map[string]any) (map[string]any, error) {
	if err := availabilityBase(input); err != nil {
		return nil, err
	}
	kind := text(input, "type")
	if kind != "available" && kind != "unavailable" {
		return nil, Fail("BOOKING_OVERRIDE_TYPE_INVALID", "临时时间类型无效", nil)
	}
	request := map[string]any{"endAt": jsx.Get(input, "endAt"), "offeringId": input["offeringId"],
		"startAt": jsx.Get(input, "startAt"), "type": kind}
	t, err := prepareTeaching(app, "createAvailabilityOverride", input, request)
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	offering, policy, err := availabilityContext(app, input)
	if err != nil {
		return nil, err
	}
	start, ok1 := millis(input["startAt"])
	end, ok2 := millis(input["endAt"])
	now, _ := millis(t.at)
	if !ok1 || !ok2 || end <= start || start <= now {
		return nil, Fail("BOOKING_OVERRIDE_TIME_INVALID", "临时时间必须是未来的有效时段", nil)
	}
	startLocal, endLocal := localPartsAt(start), localPartsAt(end)
	if startLocal.date != endLocal.date {
		return nil, Fail("BOOKING_OVERRIDE_DAY_INVALID", "临时时间必须在同一自然日内", nil)
	}
	if kind == "available" && !slices.ContainsFunc(policyWindows(policy), func(w window) bool {
		return startLocal.minute >= w.start && endLocal.minute <= w.end
	}) {
		return nil, Fail("BOOKING_OVERRIDE_OUTSIDE_POLICY", "临时开放不能超出机构开放时间", nil)
	}
	offeringID := jsx.String(offering["id"])
	overrideID := ids.Record()
	result := map[string]any{"offeringId": offeringID, "operationId": t.operationID, "overrideId": overrideID, "status": "active"}
	request["offeringId"] = offeringID
	return t.commit(app, []step{
		t.operation(input, "configure_availability", "availability_override", overrideID, nil, request, result),
		create("teacher_availability_overrides", map[string]any{
			"id": overrideID, "teacherId": input["teacherId"], "offeringId": offeringID, "type": kind,
			"startAt": fromMillis(start), "endAt": fromMillis(end), "reason": normalizeText(input["reason"], 500),
			"version": 1, "status": "active",
		}),
		outbox("course-booking.availability-override-created", "availability_override", overrideID, result),
	}, result)
}

func cancelAvailabilityOverride(app core.App, input map[string]any) (map[string]any, error) {
	if text(input, "overrideId") == "" {
		return nil, Fail("BOOKING_OVERRIDE_ID_REQUIRED", "临时时间编号不能为空", nil)
	}
	if text(input, "teacherId") == "" {
		return nil, Fail("BOOKING_TEACHER_REQUIRED", "教师编号不能为空", nil)
	}
	t, err := prepareTeaching(app, "cancelAvailabilityOverride", input, map[string]any{"overrideId": input["overrideId"]})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	record, err := get(app, "teacher_availability_overrides", text(input, "overrideId"))
	if err != nil {
		return nil, err
	}
	if relationID(record["teacherId"]) != text(input, "teacherId") {
		return nil, Fail("BOOKING_OVERRIDE_FORBIDDEN", "不能修改其他教师的临时时间", nil)
	}
	if record["status"] != "active" {
		return nil, Fail("BOOKING_OVERRIDE_NOT_ACTIVE", "临时时间已失效", nil)
	}
	id := jsx.String(record["id"])
	version := positiveVersion(record["version"])
	result := map[string]any{"operationId": t.operationID, "overrideId": id, "status": "cancelled"}
	return t.commit(app, []step{
		t.operation(input, "configure_availability", "availability_override", id, nil, map[string]any{"overrideId": id}, result),
		versionClaim("availability_override", id, version, t.operationID),
		update("teacher_availability_overrides", id, map[string]any{"status": "cancelled", "version": version + 1}),
		outbox("course-booking.availability-override-cancelled", "availability_override", id, result),
	}, result)
}

// forOfferingTeacher runs an availability command for an operator as the offering's teacher.
func forOfferingTeacher(app core.App, input map[string]any, run func(core.App, map[string]any) (map[string]any, error)) (map[string]any, error) {
	if text(input, "offeringId") == "" {
		return nil, Fail("BOOKING_OFFERING_REQUIRED", "课程预约配置不能为空", nil)
	}
	offering, err := get(app, "teacher_course_offerings", text(input, "offeringId"))
	if err != nil {
		return nil, err
	}
	withTeacher := copyMap(input)
	withTeacher["teacherId"] = relationID(offering["teacherId"])
	return run(app, withTeacher)
}

func cancelOverrideForOperator(app core.App, input map[string]any) (map[string]any, error) {
	if text(input, "overrideId") == "" {
		return nil, Fail("BOOKING_OVERRIDE_ID_REQUIRED", "临时时间编号不能为空", nil)
	}
	record, err := get(app, "teacher_availability_overrides", text(input, "overrideId"))
	if err != nil {
		return nil, err
	}
	withTeacher := copyMap(input)
	withTeacher["teacherId"] = relationID(record["teacherId"])
	return cancelAvailabilityOverride(app, withTeacher)
}

var bookingStatuses = []string{"draft", "active", "inactive"}

// policyPayload is the stored part of a normalized policy.
func policyPayload(input map[string]any) (map[string]any, error) {
	policy, err := normalizeBookingPolicy(input)
	if err != nil {
		return nil, err
	}
	payload := map[string]any{}
	for _, key := range []string{"timezone", "defaultWindows", "slotStepMinutes", "claimGranularityMinutes", "minLeadMinutes",
		"maxAdvanceDays", "responseTtlMinutes", "responseCutoffMinutes", "cancellationCutoffMinutes"} {
		payload[key] = policy[key]
	}
	return payload, nil
}

// createPolicyRevision adds a policy version; an active one retires the current active version.
func createPolicyRevision(app core.App, input map[string]any) (map[string]any, error) {
	if _, ok := textValue(input["code"]); !ok {
		return nil, Fail("BOOKING_POLICY_CODE_REQUIRED", "策略编码不能为空", nil)
	}
	if _, ok := textValue(input["name"]); !ok {
		return nil, Fail("BOOKING_POLICY_NAME_REQUIRED", "策略名称不能为空", nil)
	}
	status := text(input, "status")
	if !slices.Contains(bookingStatuses, status) {
		return nil, Fail("BOOKING_POLICY_STATUS_INVALID", "策略状态无效", nil)
	}
	from, ok := millis(input["effectiveFrom"])
	if !ok {
		return nil, Fail("BOOKING_POLICY_EFFECTIVE_FROM_INVALID", "策略生效时间无效", nil)
	}
	effectiveTo := ""
	if jsx.Truthy(input["effectiveTo"]) {
		to, ok := millis(input["effectiveTo"])
		if !ok || to <= from {
			return nil, Fail("BOOKING_POLICY_EFFECTIVE_TO_INVALID", "策略失效时间必须晚于生效时间", nil)
		}
		effectiveTo = fromMillis(to)
	}
	payload, err := policyPayload(input)
	if err != nil {
		return nil, err
	}
	t, err := prepareTeaching(app, "configureBookingPolicy", input, map[string]any{"code": input["code"], "policy": payload, "status": status})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	code := strings.TrimSpace(input["code"].(string))
	existing, err := list(app, "booking_policies", `code="`+escape(code)+`"`, "-version")
	if err != nil {
		return nil, err
	}
	version := 0
	var currentActive map[string]any
	for _, record := range existing {
		version = max(version, int(jsx.Number(or(record["version"], 0.0))))
		if currentActive == nil && record["status"] == "active" {
			currentActive = record
		}
	}
	version++
	policyID := ids.Record()
	data := copyMap(payload)
	data["id"], data["code"], data["name"] = policyID, code, strings.TrimSpace(input["name"].(string))
	data["version"], data["effectiveFrom"], data["effectiveTo"], data["status"] = version, fromMillis(from), effectiveTo, status
	result := map[string]any{"operationId": t.operationID, "policyId": policyID, "status": status, "version": version}
	plan := []step{t.operation(input, "configure_booking", "booking_policy", policyID, nil,
		map[string]any{"code": code, "status": status, "version": version}, result)}
	if status == "active" && currentActive != nil {
		plan = append(plan, update("booking_policies", jsx.String(currentActive["id"]),
			map[string]any{"effectiveTo": data["effectiveFrom"], "status": "inactive"}))
	}
	plan = append(plan, create("booking_policies", data), outbox("course-booking.policy-revised", "booking_policy", policyID, result))
	return t.commit(app, plan, result)
}

// saveOffering creates or revises a teacher's bookable one-to-one course.
func saveOffering(app core.App, input map[string]any) (map[string]any, error) {
	for _, field := range []string{"teacherId", "courseSpecId", "creditTypeId", "policyId"} {
		if text(input, field) == "" {
			return nil, Fail("BOOKING_OFFERING_FIELD_REQUIRED", "缺少 "+field, nil)
		}
	}
	status := text(input, "status")
	if !slices.Contains(bookingStatuses, status) {
		return nil, Fail("BOOKING_OFFERING_STATUS_INVALID", "课程预约状态无效", nil)
	}
	teacherID, courseID := text(input, "teacherId"), text(input, "courseSpecId")
	t, err := prepareTeaching(app, "configureBookingOffering", input, map[string]any{
		"courseSpecId": courseID, "offeringId": or(input["offeringId"], ""), "status": status, "teacherId": teacherID,
	})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	teacher, err := get(app, "teachers", teacherID)
	if err != nil {
		return nil, err
	}
	course, err := get(app, "course_specs", courseID)
	if err != nil {
		return nil, err
	}
	creditType, err := get(app, "credit_types", text(input, "creditTypeId"))
	if err != nil {
		return nil, err
	}
	policy, err := get(app, "booking_policies", text(input, "policyId"))
	if err != nil {
		return nil, err
	}
	conflicts, err := list(app, "booking_conflicts", `teacherId="`+escape(teacherID)+`" && status="open"`, "startAt")
	if err != nil {
		return nil, err
	}
	switch {
	case !truthyFlag(teacher["verified"]) || truthyFlag(teacher["blocked"]):
		return nil, Fail("BOOKING_TEACHER_UNAVAILABLE", "教师账号未通过审核或已停用", nil)
	case course["status"] != "active" || course["deliveryMode"] != "one_to_one":
		return nil, Fail("BOOKING_COURSE_NOT_ONE_TO_ONE", "只有启用中的一对一课程可以开放预约", nil)
	case creditType["kind"] != "course" || creditType["consumable"] != true || relationID(creditType["courseSpecId"]) != course["id"]:
		return nil, Fail("BOOKING_CREDIT_TYPE_INVALID", "预约必须绑定该课程的精确课时", nil)
	case policy["status"] != "active" && status == "active":
		return nil, Fail("BOOKING_POLICY_NOT_ACTIVE", "启用预约前必须选择生效策略", nil)
	case status == "active" && len(conflicts) > 0:
		return nil, Fail("BOOKING_CONFLICTS_UNRESOLVED", "该教师仍有未处理的排课冲突", nil)
	}
	var current map[string]any
	if jsx.Truthy(input["offeringId"]) {
		if current, err = get(app, "teacher_course_offerings", jsx.String(input["offeringId"])); err != nil {
			return nil, err
		}
		if relationID(current["teacherId"]) != teacherID || relationID(current["courseSpecId"]) != courseID {
			return nil, Fail("BOOKING_OFFERING_IDENTITY_IMMUTABLE", "教师与课程不能在原配置上替换", nil)
		}
	}
	offeringID, version, mode := ids.Record(), 1, any("default")
	if current != nil {
		offeringID, version, mode = jsx.String(current["id"]), positiveVersion(current["version"])+1, or(current["availabilityMode"], "default")
	}
	data := map[string]any{"teacherId": teacherID, "courseSpecId": courseID, "creditTypeId": input["creditTypeId"],
		"policyId": input["policyId"], "location": normalizeText(input["location"], 160), "availabilityMode": mode,
		"version": version, "status": status}
	result := map[string]any{"offeringId": offeringID, "operationId": t.operationID, "status": status, "version": version}
	plan := []step{t.operation(input, "configure_booking", "teacher_offering", offeringID, nil,
		map[string]any{"courseSpecId": courseID, "status": status, "teacherId": teacherID}, result)}
	if current != nil {
		plan = append(plan, versionClaim("teacher_offering", offeringID, version-1, t.operationID),
			update("teacher_course_offerings", offeringID, data))
	} else {
		data["id"] = offeringID
		plan = append(plan, create("teacher_course_offerings", data))
	}
	plan = append(plan, outbox("course-booking.offering-configured", "teacher_offering", offeringID, result))
	return t.commit(app, plan, result)
}

// truthyFlag is adminService's truthy(): true, 1, '1' or 'true'.
func truthyFlag(value any) bool {
	return value == true || value == 1.0 || value == "1" || value == "true"
}

func resolveConflict(app core.App, input map[string]any) (map[string]any, error) {
	if text(input, "conflictId") == "" {
		return nil, Fail("BOOKING_CONFLICT_ID_REQUIRED", "冲突编号不能为空", nil)
	}
	resolution, ok := input["resolution"].(string)
	if !ok || jsx.Length(strings.TrimSpace(resolution)) < 4 {
		return nil, Fail("BOOKING_CONFLICT_RESOLUTION_REQUIRED", "请填写明确的处理结果", nil)
	}
	t, err := prepareTeaching(app, "resolveBookingConflict", input, map[string]any{"conflictId": input["conflictId"], "resolution": resolution})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	conflict, err := get(app, "booking_conflicts", text(input, "conflictId"))
	if err != nil {
		return nil, err
	}
	if conflict["status"] != "open" {
		return nil, Fail("BOOKING_CONFLICT_NOT_OPEN", "冲突已被处理", nil)
	}
	id := jsx.String(conflict["id"])
	version := positiveVersion(conflict["version"])
	result := map[string]any{"conflictId": id, "operationId": t.operationID, "status": "resolved"}
	trimmed := strings.TrimSpace(resolution)
	return t.commit(app, []step{
		t.operation(input, "resolve_booking_conflict", "booking_conflict", id, nil, map[string]any{"conflictId": id, "resolution": trimmed}, result),
		versionClaim("booking_conflict", id, version, t.operationID),
		update("booking_conflicts", id, map[string]any{"resolution": jsx.Slice(trimmed, 500), "resolvedAt": t.at, "status": "resolved", "version": version + 1}),
		outbox("course-booking.conflict-resolved", "booking_conflict", id, result),
	}, result)
}

// expireFilter and fulfillFilter select what the appointment workers transition.
func expireFilter(cutoffAt string) string {
	return `status="pending" && responseDeadline<="` + escape(filterTime(cutoffAt)) + `"`
}

const fulfillFilter = `(status="confirmed" || status="rescheduled") && (sessionId.status="completed" || sessionId.status="settled")`

// expireAppointments closes pending requests whose teacher response deadline passed.
func expireAppointments(app core.App, input map[string]any) (map[string]any, error) {
	t, err := prepareTeaching(app, "expireAppointments", input, map[string]any{"cutoffAt": or(input["cutoffAt"], "")})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	cutoffAt := t.at
	if jsx.Truthy(input["cutoffAt"]) {
		if cutoffAt, err = isoOf(input["cutoffAt"]); err != nil {
			return nil, err
		}
	}
	appointments, err := list(app, "appointment_requests", expireFilter(cutoffAt), "responseDeadline,id")
	if err != nil {
		return nil, err
	}
	return appointmentWorker(app, t, input, appointments, "expired", "expire_appointment", cutoffAt)
}

// fulfillAppointments marks appointments whose session completed or settled as fulfilled.
func fulfillAppointments(app core.App, input map[string]any) (map[string]any, error) {
	t, err := prepareTeaching(app, "fulfillAppointments", input, map[string]any{"cutoffAt": or(input["cutoffAt"], "")})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	appointments, err := list(app, "appointment_requests", fulfillFilter, "requestedStartAt,id")
	if err != nil {
		return nil, err
	}
	return appointmentWorker(app, t, input, appointments, "fulfilled", "fulfill_appointment", or(input["cutoffAt"], t.at))
}

// isoOf is `new Date(value).toISOString()`; an invalid date throws like JavaScript's RangeError.
func isoOf(value any) (string, error) {
	if number, ok := value.(float64); ok {
		return fromMillis(int64(number)), nil
	}
	if ms, ok := millis(value); ok {
		return fromMillis(ms), nil
	}
	return "", &storeError{status: 500, message: "Invalid time value"}
}

func appointmentWorker(app core.App, t teaching, input map[string]any, appointments []map[string]any, status, kind string, cutoffAt any) (map[string]any, error) {
	appointmentIDs := make([]any, len(appointments))
	for i, appointment := range appointments {
		appointmentIDs[i] = appointment["id"]
	}
	result := map[string]any{"appointmentIds": appointmentIDs, "cutoffAt": cutoffAt, "operationId": t.operationID,
		"processedCount": len(appointments), "status": status}
	reason, changes := "关联课堂已完成", map[string]any{}
	if status == "expired" {
		reason, changes = "教师未在响应期限内处理", map[string]any{"respondedAt": t.at}
	}
	withReason := copyMap(input)
	withReason["reason"] = reason
	plan := []step{t.operation(input, kind, "appointment_worker", cutoffAt, nil, map[string]any{"cutoffAt": cutoffAt}, result)}
	for _, appointment := range appointments {
		updates, err := appointmentUpdate(appointment, withReason, t, status, changes, map[string]any{"cutoffAt": cutoffAt})
		if err != nil {
			return nil, err
		}
		plan = append(plan, updates...)
		plan = append(plan, outbox("course-booking."+status, "appointment", jsx.String(appointment["id"]),
			map[string]any{"appointmentId": appointment["id"], "status": status}))
	}
	plan = append(plan, outbox("course-booking.worker-"+status, "appointment_worker", jsx.String(cutoffAt), result))
	return t.commit(app, plan, result)
}
