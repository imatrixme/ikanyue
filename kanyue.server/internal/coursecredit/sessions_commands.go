package coursecredit

import (
	"errors"
	"slices"
	"sort"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
)

// Hono's class membership, session publication, reschedule, cancellation and
// manual attendance services. Inputs are the objects Hono's handlers build:
// command metadata plus the named body fields and route parameters.

var (
	membershipStatuses       = []string{"invited", "active", "paused", "completed", "cancelled"}
	assignmentStatuses       = []string{"active", "inactive"}
	overrideSources          = []string{"session_override", "substitute"}
	manualAttendanceStatuses = []string{"present", "late", "leave", "absent", "cancelled"}
	actualTeacherStatuses    = []string{"confirmed", "absent", "cancelled"}
)

func requiredID(input map[string]any, key, code, message string) error {
	if text(input, key) == "" {
		return Fail(code, message, nil)
	}
	return nil
}

// membershipDate is classMembershipService's validDate: any Date.parse input, stored as ISO.
func membershipDate(value any, field string) (string, error) {
	ms, ok := millis(value)
	if !ok {
		return "", Fail("INVALID_DATE", field+" must be a valid date", nil)
	}
	return fromMillis(ms), nil
}

func optionalMembershipEnd(value any, effectiveFrom string) (string, error) {
	if !jsx.Truthy(value) {
		return "", nil
	}
	effectiveTo, err := membershipDate(value, "effectiveTo")
	if err != nil {
		return "", err
	}
	if effectiveTo <= effectiveFrom {
		return "", Fail("INVALID_EFFECTIVE_RANGE", "effectiveTo must be later than effectiveFrom", nil)
	}
	return effectiveTo, nil
}

func validateOpenClass(record map[string]any) error {
	if record["status"] != "draft" && record["status"] != "active" {
		return Fail("CLASS_NOT_OPEN", "Class is not open for membership changes", nil)
	}
	return nil
}

func validateTransitionTime(current map[string]any, effectiveFrom string) error {
	if current == nil {
		return nil
	}
	next, _ := millis(effectiveFrom)
	previous, ok := millis(current["effectiveFrom"])
	if !ok || next <= previous {
		return Fail("MEMBERSHIP_EFFECTIVE_ORDER_INVALID", "New effective time must be later than the open assignment", nil)
	}
	return nil
}

func openMembership(app core.App, classID, studentID string) (map[string]any, error) {
	return findFirst(app, "class_students",
		`classId="`+escape(classID)+`" && studentId="`+escape(studentID)+`" && effectiveTo=""`)
}

// setStudentMembership opens a class membership, closing the open one it replaces.
func setStudentMembership(app core.App, input map[string]any) (map[string]any, error) {
	if err := first(
		requiredID(input, "classId", "CLASS_ID_REQUIRED", "classId is required"),
		requiredID(input, "studentId", "STUDENT_ID_REQUIRED", "studentId is required"),
	); err != nil {
		return nil, err
	}
	if !slices.Contains(membershipStatuses, text(input, "status")) {
		return nil, Fail("INVALID_MEMBERSHIP_STATUS", "Student membership status is invalid", nil)
	}
	effectiveFrom, err := membershipDate(input["effectiveFrom"], "effectiveFrom")
	if err != nil {
		return nil, err
	}
	effectiveTo, err := optionalMembershipEnd(input["effectiveTo"], effectiveFrom)
	if err != nil {
		return nil, err
	}
	classID, studentID := text(input, "classId"), text(input, "studentId")
	sourceOrderID := or(input["sourceOrderId"], "")
	t, err := prepareTeaching(app, "setStudentMembership", input, map[string]any{
		"classId": classID, "studentId": studentID, "status": input["status"],
		"effectiveFrom": effectiveFrom, "effectiveTo": effectiveTo, "sourceOrderId": sourceOrderID,
	})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	class, err := get(app, "classes", classID)
	if err != nil {
		return nil, err
	}
	if err := validateOpenClass(class); err != nil {
		return nil, err
	}
	if _, err := get(app, "students", studentID); err != nil {
		return nil, err
	}
	current, err := openMembership(app, classID, studentID)
	if err != nil {
		return nil, err
	}
	if err := validateTransitionTime(current, effectiveFrom); err != nil {
		return nil, err
	}
	membershipID := ids.Record()
	result := map[string]any{"classId": classID, "membershipId": membershipID, "operationId": t.operationID,
		"status": input["status"], "studentId": studentID}
	plan := []step{t.operation(input, "class_membership", "class_student", membershipID, studentID,
		map[string]any{"classId": classID, "studentId": studentID}, result)}
	if current != nil {
		plan = append(plan, update("class_students", jsx.String(current["id"]), map[string]any{"effectiveTo": effectiveFrom}))
	}
	plan = append(plan,
		create("class_students", map[string]any{"id": membershipID, "classId": classID, "studentId": studentID,
			"status": input["status"], "effectiveFrom": effectiveFrom, "effectiveTo": effectiveTo, "sourceOrderId": sourceOrderID}),
		outbox("course-credit.class-student-changed", "class_student", membershipID, result))
	return t.commit(app, plan, result)
}

// transferStudent closes the active source membership and opens one in the target class.
func transferStudent(app core.App, input map[string]any) (map[string]any, error) {
	if err := first(
		requiredID(input, "fromClassId", "SOURCE_CLASS_ID_REQUIRED", "fromClassId is required"),
		requiredID(input, "toClassId", "TARGET_CLASS_ID_REQUIRED", "toClassId is required"),
		requiredID(input, "studentId", "STUDENT_ID_REQUIRED", "studentId is required"),
	); err != nil {
		return nil, err
	}
	fromClassID, toClassID, studentID := text(input, "fromClassId"), text(input, "toClassId"), text(input, "studentId")
	if fromClassID == toClassID {
		return nil, Fail("TRANSFER_CLASS_MUST_DIFFER", "Transfer source and target classes must differ", nil)
	}
	effectiveAt, err := membershipDate(input["effectiveAt"], "effectiveAt")
	if err != nil {
		return nil, err
	}
	t, err := prepareTeaching(app, "transferStudentMembership", input, map[string]any{
		"fromClassId": fromClassID, "toClassId": toClassID, "studentId": studentID,
		"effectiveAt": effectiveAt, "sourceOrderId": or(input["sourceOrderId"], ""),
	})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	fromClass, err := get(app, "classes", fromClassID)
	if err != nil {
		return nil, err
	}
	toClass, err := get(app, "classes", toClassID)
	if err != nil {
		return nil, err
	}
	if _, err := get(app, "students", studentID); err != nil {
		return nil, err
	}
	if err := first(validateOpenClass(fromClass), validateOpenClass(toClass)); err != nil {
		return nil, err
	}
	if fromClass["defaultCreditTypeId"] != toClass["defaultCreditTypeId"] {
		return nil, Fail("TRANSFER_CREDIT_TYPE_MISMATCH", "Transfer classes must use the same default credit type", nil)
	}
	source, err := openMembership(app, fromClassID, studentID)
	if err != nil {
		return nil, err
	}
	target, err := openMembership(app, toClassID, studentID)
	if err != nil {
		return nil, err
	}
	if source == nil || source["status"] != "active" {
		return nil, Fail("SOURCE_MEMBERSHIP_NOT_ACTIVE", "Student has no active source membership", nil)
	}
	if target != nil {
		return nil, Fail("TARGET_MEMBERSHIP_ALREADY_OPEN", "Student already has an open target membership", nil)
	}
	if err := validateTransitionTime(source, effectiveAt); err != nil {
		return nil, err
	}
	membershipID := ids.Record()
	result := map[string]any{"fromClassId": fromClassID, "membershipId": membershipID, "operationId": t.operationID,
		"studentId": studentID, "toClassId": toClassID}
	plan := []step{
		t.operation(input, "class_membership", "class_transfer", membershipID, studentID,
			map[string]any{"fromClassId": fromClassID, "toClassId": toClassID}, result),
		update("class_students", jsx.String(source["id"]), map[string]any{"effectiveTo": effectiveAt}),
		create("class_students", map[string]any{"id": membershipID, "classId": toClassID, "studentId": studentID,
			"status": "active", "effectiveFrom": effectiveAt, "effectiveTo": "",
			"sourceOrderId": orChain(input["sourceOrderId"], source["sourceOrderId"], "")}),
		outbox("course-credit.class-student-transferred", "class_student", membershipID, result),
	}
	return t.commit(app, plan, result)
}

// setTeacherAssignment opens a class teacher assignment for one role.
func setTeacherAssignment(app core.App, input map[string]any) (map[string]any, error) {
	if err := first(
		requiredID(input, "classId", "CLASS_ID_REQUIRED", "classId is required"),
		requiredID(input, "teacherId", "TEACHER_ID_REQUIRED", "teacherId is required"),
	); err != nil {
		return nil, err
	}
	if !slices.Contains(teacherRoles, text(input, "role")) {
		return nil, Fail("INVALID_TEACHER_ROLE", "Teacher role is invalid", nil)
	}
	if !slices.Contains(assignmentStatuses, text(input, "status")) {
		return nil, Fail("INVALID_TEACHER_STATUS", "Teacher assignment status is invalid", nil)
	}
	effectiveFrom, err := membershipDate(input["effectiveFrom"], "effectiveFrom")
	if err != nil {
		return nil, err
	}
	effectiveTo, err := optionalMembershipEnd(input["effectiveTo"], effectiveFrom)
	if err != nil {
		return nil, err
	}
	classID, teacherID, role := text(input, "classId"), text(input, "teacherId"), text(input, "role")
	t, err := prepareTeaching(app, "setTeacherAssignment", input, map[string]any{
		"classId": classID, "teacherId": teacherID, "role": role, "status": input["status"],
		"effectiveFrom": effectiveFrom, "effectiveTo": effectiveTo,
	})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	class, err := get(app, "classes", classID)
	if err != nil {
		return nil, err
	}
	if err := validateOpenClass(class); err != nil {
		return nil, err
	}
	if _, err := get(app, "teachers", teacherID); err != nil {
		return nil, err
	}
	current, err := findFirst(app, "class_teachers", `classId="`+escape(classID)+`" && teacherId="`+escape(teacherID)+
		`" && role="`+escape(role)+`" && effectiveTo=""`)
	if err != nil {
		return nil, err
	}
	if err := validateTransitionTime(current, effectiveFrom); err != nil {
		return nil, err
	}
	assignmentID := ids.Record()
	result := map[string]any{"assignmentId": assignmentID, "classId": classID, "operationId": t.operationID,
		"role": role, "status": input["status"], "teacherId": teacherID}
	plan := []step{t.operation(input, "class_teacher_assignment", "class_teacher", assignmentID, nil,
		map[string]any{"classId": classID, "teacherId": teacherID, "role": role}, result)}
	if current != nil {
		plan = append(plan, update("class_teachers", jsx.String(current["id"]), map[string]any{"effectiveTo": effectiveFrom}))
	}
	plan = append(plan,
		create("class_teachers", map[string]any{"id": assignmentID, "classId": classID, "teacherId": teacherID,
			"role": role, "status": input["status"], "effectiveFrom": effectiveFrom, "effectiveTo": effectiveTo}),
		outbox("course-credit.class-teacher-changed", "class_teacher", assignmentID, result))
	return t.commit(app, plan, result)
}

// activeAtFilter selects rows of one class active at a moment.
func activeAtFilter(field, id string, at any) string {
	safeAt := escape(filterTime(at))
	return field + `="` + escape(id) + `" && status="active" && effectiveFrom<="` + safeAt +
		`" && (effectiveTo="" || effectiveTo>"` + safeAt + `")`
}

// sessionTeacher is one materialized session_teachers row before it gets an id.
type sessionTeacher struct {
	teacherID, role, assignmentSource, actualStatus string
}

func (s sessionTeacher) key() string { return s.role + ":" + s.teacherID }

func normalizeTeacherOverride(value any) (sessionTeacher, error) {
	override, _ := value.(map[string]any)
	teacherID := text(override, "teacherId")
	if teacherID == "" {
		return sessionTeacher{}, Fail("TEACHER_ID_REQUIRED", "Session teacher override requires teacherId", nil)
	}
	role := text(override, "role")
	if !slices.Contains(teacherRoles, role) {
		return sessionTeacher{}, Fail("INVALID_TEACHER_ROLE", "Session teacher role is invalid", nil)
	}
	source := or(override["assignmentSource"], "session_override")
	if text, ok := source.(string); !ok || !slices.Contains(overrideSources, text) {
		return sessionTeacher{}, Fail("INVALID_ASSIGNMENT_SOURCE", "Session override source is invalid", nil)
	}
	actual := or(override["actualStatus"], "planned")
	if text, ok := actual.(string); !ok || !slices.Contains(teacherActualStatuses, text) {
		return sessionTeacher{}, Fail("INVALID_ACTUAL_TEACHER_STATUS", "Actual teacher status is invalid", nil)
	}
	return sessionTeacher{teacherID, role, source.(string), actual.(string)}, nil
}

// materializeSessionTeachers merges class defaults with session overrides, which replace whole roles.
func materializeSessionTeachers(assignments, overrides []any, sessionID string) ([]map[string]any, error) {
	normalized := []sessionTeacher{}
	overridden := map[string]bool{}
	for _, value := range overrides {
		override, err := normalizeTeacherOverride(value)
		if err != nil {
			return nil, err
		}
		normalized = append(normalized, override)
		overridden[override.role] = true
	}
	byKey := map[string]sessionTeacher{}
	for _, value := range assignments {
		assignment := value.(map[string]any)
		role := text(assignment, "role")
		if assignment["status"] != "active" || overridden[role] {
			continue
		}
		teacherID := text(assignment, "teacherId")
		if teacherID == "" {
			return nil, Fail("TEACHER_ID_REQUIRED", "Class teacher requires teacherId", nil)
		}
		if !slices.Contains(teacherRoles, role) {
			return nil, Fail("INVALID_TEACHER_ROLE", "Class teacher role is invalid", nil)
		}
		teacher := sessionTeacher{teacherID, role, "class_default", "planned"}
		byKey[teacher.key()] = teacher
	}
	for _, override := range normalized {
		byKey[override.key()] = override
	}
	keys := make([]string, 0, len(byKey))
	for key := range byKey {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	rows := make([]map[string]any, 0, len(keys))
	lead := false
	for _, key := range keys {
		teacher := byKey[key]
		lead = lead || (teacher.role == "lead" && teacher.actualStatus != "cancelled")
		rows = append(rows, map[string]any{"id": ids.Record(), "sessionId": sessionID, "teacherId": teacher.teacherID,
			"role": teacher.role, "assignmentSource": teacher.assignmentSource, "actualStatus": teacher.actualStatus,
			"creditStatus": "not_eligible"})
	}
	if !lead {
		return nil, Fail("SESSION_LEAD_TEACHER_REQUIRED", "Published session requires a lead teacher", nil)
	}
	return rows, nil
}

// sessionClaimPlan claims every teacher's and then every student's cells for a class session.
func sessionClaimPlan(appointmentID string, startAt, endAt any, sessionID string, teacherIDs, studentIDs []string) ([]step, error) {
	plan := []step{}
	for _, group := range []struct {
		ownerType string
		ids       []string
	}{{"teacher", teacherIDs}, {"student", studentIDs}} {
		for _, ownerID := range group.ids {
			claims, err := scheduleClaim{ownerType: group.ownerType, ownerID: ownerID, sourceID: sessionID,
				appointmentID: appointmentID, startAt: startAt, endAt: endAt, granularity: float64(claimGranularity)}.build()
			if err != nil {
				return nil, err
			}
			for _, claim := range claims {
				plan = append(plan, create("schedule_claims", claim))
			}
		}
	}
	return plan, nil
}

func scheduleConflict(err error, code string) error {
	tagged := slotTaken(err)
	var store *storeError
	if tagged != err && errors.As(tagged, &store) {
		store.code = code
	}
	return tagged
}

func validateDraftSession(session map[string]any) error {
	if session["status"] != "draft" {
		return Fail("SESSION_NOT_DRAFT", "Only a draft session can be published", nil)
	}
	start, ok1 := millis(session["startAt"])
	end, ok2 := millis(session["endAt"])
	if !ok1 || !ok2 || end <= start {
		return Fail("SESSION_TIME_INVALID", "Session endAt must be later than startAt", nil)
	}
	if !isInt(session["requiredQuantity"]) || session["requiredQuantity"].(float64) <= 0 {
		return Fail("SESSION_CREDIT_QUANTITY_INVALID", "Session requiredQuantity must be a positive integer", nil)
	}
	if _, _, err := settlementRules(session); err != nil {
		return err
	}
	_, err := validateTeacherRuleSnapshot(session["teacherRuleSnapshot"])
	return err
}

func requireConsumableCourse(app core.App, session map[string]any, message string) (map[string]any, error) {
	creditType, err := get(app, "credit_types", relationID(session["requiredCreditTypeId"]))
	if err != nil {
		return nil, err
	}
	if creditType["kind"] != "course" || creditType["consumable"] != true {
		return nil, Fail("SESSION_CREDIT_TYPE_INVALID", message, nil)
	}
	return creditType, nil
}

// publishSession materializes a draft session's roster, teachers and calendar claims.
func publishSession(app core.App, input map[string]any) (map[string]any, error) {
	if err := requiredID(input, "sessionId", "SESSION_ID_REQUIRED", "sessionId is required"); err != nil {
		return nil, err
	}
	rawClassIDs, ok := input["classIds"].([]any)
	if !ok || len(rawClassIDs) == 0 {
		return nil, Fail("SESSION_CLASSES_REQUIRED", "At least one class is required", nil)
	}
	classIDs := []string{}
	for _, value := range rawClassIDs {
		id, ok := value.(string)
		if !ok || id == "" {
			return nil, Fail("CLASS_ID_REQUIRED", "Every classId must be non-empty", nil)
		}
		if !slices.Contains(classIDs, id) {
			classIDs = append(classIDs, id)
		}
	}
	sort.Strings(classIDs)
	overrides, ok := input["teacherOverrides"].([]any)
	if _, undefined := input["teacherOverrides"].(jsx.Undefined); !ok && !undefined {
		return nil, Fail("INVALID_TEACHER_OVERRIDES", "teacherOverrides must be an array", nil)
	}
	if overrides == nil {
		overrides = []any{}
	}
	classList := make([]any, len(classIDs))
	for i, id := range classIDs {
		classList[i] = id
	}
	t, err := prepareTeaching(app, "publishSession", input, map[string]any{
		"sessionId": input["sessionId"], "classIds": classList, "teacherOverrides": overrides,
	})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	session, err := get(app, "sessions", text(input, "sessionId"))
	if err != nil {
		return nil, err
	}
	if err := validateDraftSession(session); err != nil {
		return nil, err
	}
	requiredType := relationID(session["requiredCreditTypeId"])
	classes := make([]map[string]any, len(classIDs))
	for i, id := range classIDs {
		if classes[i], err = get(app, "classes", id); err != nil {
			return nil, err
		}
	}
	for _, class := range classes {
		if class["status"] != "active" {
			return nil, Fail("CLASS_NOT_ACTIVE", "Only active classes can be published into a session", nil)
		}
		if class["defaultCreditTypeId"] != requiredType {
			return nil, Fail("CLASS_CREDIT_TYPE_MISMATCH", "Every linked class must match the session credit type", nil)
		}
	}
	if _, err := requireConsumableCourse(app, session, "Session requires an exact consumable course credit"); err != nil {
		return nil, err
	}
	sessionID := jsx.String(session["id"])
	sources := map[string][]string{}
	studentIDs := []string{}
	assignments := []any{}
	for _, classID := range classIDs {
		memberships, err := list(app, "class_students", activeAtFilter("classId", classID, session["startAt"]), "studentId,effectiveFrom")
		if err != nil {
			return nil, err
		}
		for _, membership := range memberships {
			studentID := text(membership, "studentId")
			if membership["status"] != "active" {
				continue
			}
			if sources[studentID] == nil {
				studentIDs = append(studentIDs, studentID)
			}
			if !slices.Contains(sources[studentID], classID) {
				sources[studentID] = append(sources[studentID], classID)
			}
		}
	}
	for _, classID := range classIDs {
		rows, err := list(app, "class_teachers", activeAtFilter("classId", classID, session["startAt"]), "role,teacherId,effectiveFrom")
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			assignments = append(assignments, row)
		}
	}
	sort.Strings(studentIDs)
	roster := make([]map[string]any, len(studentIDs))
	for i, studentID := range studentIDs {
		classes := slices.Clone(sources[studentID])
		sort.Strings(classes)
		sourceClassIDs := make([]any, len(classes))
		for j, id := range classes {
			sourceClassIDs[j] = id
		}
		roster[i] = map[string]any{"id": ids.Record(), "sessionId": sessionID, "studentId": studentID,
			"sourceClassIds": sourceClassIDs, "attendanceStatus": "scheduled", "creditStatus": "pending",
			"eligibilityReason": "", "checkedInAt": "", "settledAt": "", "version": 1}
	}
	teachers, err := materializeSessionTeachers(assignments, overrides, sessionID)
	if err != nil {
		return nil, err
	}
	teacherIDs := make([]string, len(teachers))
	teacherAssignments := make([]any, len(teachers))
	for i, row := range teachers {
		teacherIDs[i] = row["teacherId"].(string)
		teacherAssignments[i] = map[string]any{"assignmentSource": row["assignmentSource"], "role": row["role"], "teacherId": row["teacherId"]}
	}
	claims, err := sessionClaimPlan(jsx.String(or(session["appointmentId"], "")), session["startAt"], session["endAt"],
		sessionID, teacherIDs, studentIDs)
	if err != nil {
		return nil, err
	}
	version := positiveVersion(session["version"])
	rosterVersion := positiveVersion(session["rosterVersion"]) + 1
	studentList := make([]any, len(studentIDs))
	for i, id := range studentIDs {
		studentList[i] = id
	}
	result := map[string]any{"classIds": classList, "claimCount": len(claims), "operationId": t.operationID,
		"rosterCount": len(roster), "rosterVersion": rosterVersion, "sessionId": sessionID, "studentIds": studentList,
		"teacherAssignments": teacherAssignments}
	plan := []step{
		t.operation(input, "publish_session", "session", sessionID, nil,
			map[string]any{"sessionId": sessionID, "classIds": classList}, result),
		versionClaim("session", sessionID, version, t.operationID),
	}
	for _, classID := range classIDs {
		plan = append(plan, create("session_classes", map[string]any{"id": ids.Record(), "sessionId": sessionID, "classId": classID}))
	}
	for _, row := range roster {
		plan = append(plan, create("session_students", row))
	}
	for _, row := range teachers {
		plan = append(plan, create("session_teachers", row))
	}
	plan = append(plan, claims...)
	plan = append(plan,
		update("sessions", sessionID, map[string]any{"status": "scheduled", "rosterVersion": rosterVersion, "version": version + 1}),
		outbox("course-credit.session-published", "session", sessionID, result))
	committed, err := t.commit(app, plan, result)
	if err != nil {
		return nil, scheduleConflict(err, "SESSION_SCHEDULE_CONFLICT")
	}
	return committed, nil
}

// rescheduleSession moves a scheduled session, re-checks reserved credit at the new
// start and swaps every participant's calendar claims.
func rescheduleSession(app core.App, input map[string]any) (map[string]any, error) {
	if err := requiredID(input, "sessionId", "SESSION_ID_REQUIRED", "sessionId is required"); err != nil {
		return nil, err
	}
	newStart, ok1 := millis(input["newStartAt"])
	newEnd, ok2 := millis(input["newEndAt"])
	if !ok1 || !ok2 {
		return nil, Fail("SESSION_TIME_INVALID", "New session start and end times are required", nil)
	}
	if newEnd <= newStart {
		return nil, Fail("SESSION_TIME_INVALID", "New session end must be later than start", nil)
	}
	t, err := prepareTeaching(app, "rescheduleSession", input, map[string]any{
		"newEndAt": input["newEndAt"], "newStartAt": input["newStartAt"], "sessionId": input["sessionId"],
	})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	session, err := get(app, "sessions", text(input, "sessionId"))
	if err != nil {
		return nil, err
	}
	if session["status"] != "scheduled" && session["status"] != "enrollment_closed" {
		return nil, Fail("SESSION_NOT_RESCHEDULABLE", "Only scheduled sessions can be rescheduled", nil)
	}
	oldStart, ok1 := millis(session["startAt"])
	oldEnd, ok2 := millis(session["endAt"])
	if !ok1 || !ok2 {
		return nil, Fail("SESSION_TIME_INVALID", "Existing session time is invalid", nil)
	}
	if oldStart == newStart && oldEnd == newEnd {
		return nil, Fail("SESSION_TIME_UNCHANGED", "New session time must differ from the current time", nil)
	}
	creditType, err := requireConsumableCourse(app, session, "Session must require an exact consumable course credit")
	if err != nil {
		return nil, err
	}
	sessionID := jsx.String(session["id"])
	filter := `sessionId="` + escape(sessionID) + `"`
	roster, err := list(app, "session_students", filter, "id")
	if err != nil {
		return nil, err
	}
	teachers, err := list(app, "session_teachers", filter, "role,teacherId,id")
	if err != nil {
		return nil, err
	}
	claims, err := activeSessionClaims(app, sessionID)
	if err != nil {
		return nil, err
	}
	startAt, endAt := fromMillis(newStart), fromMillis(newEnd)
	outcomes := []any{}
	credit := []step{}
	for _, student := range roster {
		if student["creditStatus"] != "reserved" {
			continue
		}
		allocations, allocated, err := sessionAllocations(app, jsx.String(student["id"]))
		if err != nil {
			return nil, err
		}
		filter, err := fefoFilter(jsx.String(student["studentId"]), relationID(session["requiredCreditTypeId"]), input["newStartAt"])
		if err != nil {
			return nil, err
		}
		candidates, err := list(app, "credit_batches", filter, fefoSort)
		if err != nil {
			return nil, err
		}
		steps, outcome, err := rescheduleCreditPlan(rescheduleInput{session: session, sessionStudent: student, creditType: creditType,
			allocations: allocations, candidates: candidates, allocated: allocated, newStartAt: startAt, at: t.at,
			operationID: t.operationID, actorID: jsx.String(or(input["actorId"], ""))})
		if err != nil {
			return nil, err
		}
		status := "reserved"
		if !outcome.reserved {
			status = "credit_insufficient"
		}
		credit = append(credit, steps...)
		outcomes = append(outcomes, map[string]any{"creditStatus": status, "missingQuantity": outcome.missing,
			"newAllocationIds": outcome.added, "releasedAllocationIds": outcome.released,
			"retainedAllocationIds": outcome.retained, "sessionStudentId": student["id"]})
	}
	newClaims, err := sessionClaimPlan(jsx.String(or(session["appointmentId"], "")), startAt, endAt, sessionID,
		ownerIDs(teachers, "teacherId"), ownerIDs(roster, "studentId"))
	if err != nil {
		return nil, err
	}
	result := map[string]any{"operationId": t.operationID, "sessionId": sessionID, "newStartAt": startAt, "newEndAt": endAt,
		"studentOutcomes": outcomes, "claimCount": len(newClaims)}
	version := positiveVersion(session["version"])
	plan := []step{
		t.operation(input, "reschedule_session", "session", sessionID, nil, map[string]any{
			"newEndAt": endAt, "newStartAt": startAt, "oldEndAt": session["endAt"], "oldStartAt": session["startAt"],
		}, result),
		versionClaim("session", sessionID, version, t.operationID),
	}
	plan = append(plan, releaseClaimPlan(claims, t.at, t.operationID)...)
	plan = append(plan, newClaims...)
	plan = append(plan, update("sessions", sessionID, map[string]any{"endAt": endAt, "startAt": startAt, "version": version + 1}))
	plan = append(plan, credit...)
	plan = append(plan, outbox("course-credit.session-rescheduled", "session", sessionID, result))
	committed, err := t.commit(app, plan, result)
	if err != nil {
		return nil, scheduleConflict(err, "SESSION_SCHEDULE_CONFLICT")
	}
	return committed, nil
}

func ownerIDs(rows []map[string]any, field string) []string {
	result := make([]string, len(rows))
	for i, row := range rows {
		result[i] = relationID(row[field])
	}
	return result
}

// cancelSession cancels a class session before it starts and returns reserved credit.
func cancelSession(app core.App, input map[string]any) (map[string]any, error) {
	if err := requiredID(input, "sessionId", "SESSION_ID_REQUIRED", "课堂编号不能为空"); err != nil {
		return nil, err
	}
	if reason, ok := input["reason"].(string); !ok || jsx.Length(strings.TrimSpace(reason)) < 2 {
		return nil, Fail("SESSION_CANCEL_REASON_REQUIRED", "请填写课堂取消原因", nil)
	}
	if jsx.Truthy(input["cancellationType"]) && !slices.Contains([]any{"teacher", "institution", "admin"}, input["cancellationType"]) {
		return nil, Fail("SESSION_CANCELLATION_TYPE_INVALID", "课堂取消类型无效", nil)
	}
	kind := or(input["cancellationType"], "admin")
	t, err := prepareTeaching(app, "cancelSession", input, map[string]any{
		"cancellationType": kind, "reason": input["reason"], "sessionId": input["sessionId"],
	})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	session, err := get(app, "sessions", text(input, "sessionId"))
	if err != nil {
		return nil, err
	}
	if session["status"] != "scheduled" && session["status"] != "enrollment_closed" {
		return nil, Fail("SESSION_NOT_CANCELLABLE", "只有未开始的已排课课堂可以取消", nil)
	}
	if relationID(session["appointmentId"]) != "" {
		return nil, Fail("APPOINTMENT_CANCELLATION_COMMAND_REQUIRED", "预约课堂必须通过预约取消流程处理", nil)
	}
	sessionID := jsx.String(session["id"])
	roster, err := list(app, "session_students", `sessionId="`+escape(sessionID)+`"`, "id")
	if err != nil {
		return nil, err
	}
	claims, err := activeSessionClaims(app, sessionID)
	if err != nil {
		return nil, err
	}
	cancelled := copyMap(session)
	cancelled["status"] = "cancelled"
	released := []any{}
	settlement := []step{}
	for _, student := range roster {
		if student["creditStatus"] != "reserved" {
			continue
		}
		allocations, batches, err := sessionAllocations(app, jsx.String(student["id"]))
		if err != nil {
			return nil, err
		}
		steps, _, err := studentSettlementPlan(cancelled, student, allocations, batches, t.operationID, t.at,
			jsx.String(or(input["actorId"], "")))
		if err != nil {
			return nil, err
		}
		settlement = append(settlement, steps...)
		released = append(released, student["studentId"])
	}
	result := map[string]any{"operationId": t.operationID, "releasedStudentIds": released, "sessionId": sessionID, "status": "cancelled"}
	version := positiveVersion(session["version"])
	plan := []step{t.operation(input, "cancel_session", "session", sessionID, nil,
		map[string]any{"cancellationType": kind, "reason": input["reason"], "sessionId": sessionID}, result)}
	plan = append(plan, releaseClaimPlan(claims, t.at, t.operationID)...)
	plan = append(plan, settlement...)
	plan = append(plan,
		versionClaim("session", sessionID, version, t.operationID),
		update("sessions", sessionID, map[string]any{"cancellationType": kind, "cancelledAt": t.at, "status": "cancelled", "version": version + 1}),
		outbox("course-credit.session-cancelled", "session", sessionID, result))
	return t.commit(app, plan, result)
}

func validateEditableSession(session map[string]any) error {
	if session["status"] == "settled" || session["status"] == "cancelled" {
		return Fail("SESSION_ATTENDANCE_LOCKED", "当前课堂不能修改出勤", nil)
	}
	return nil
}

func isAssignedTeachingActor(input map[string]any) bool {
	scope := input["actorTeachingScope"]
	return scope == "assigned" || (!jsx.Truthy(scope) && input["actorRole"] == "teacher")
}

// authorizeSessionActor limits an assigned teacher to sessions they teach.
func authorizeSessionActor(app core.App, input map[string]any, sessionID string) error {
	if !isAssignedTeachingActor(input) {
		return nil
	}
	assignment, err := findFirst(app, "session_teachers", `sessionId="`+escape(sessionID)+`" && teacherId="`+
		escape(text(input, "actorId"))+`" && actualStatus!="cancelled"`)
	if err != nil {
		return err
	}
	if assignment == nil {
		return Fail("SESSION_TEACHER_FORBIDDEN", "教师只能操作本人负责的课堂", nil)
	}
	return nil
}

// editableSession loads a session whose attendance the actor may still change.
func editableSession(app core.App, input map[string]any) (map[string]any, error) {
	session, err := get(app, "sessions", text(input, "sessionId"))
	if err != nil {
		return nil, err
	}
	if err := validateEditableSession(session); err != nil {
		return nil, err
	}
	return session, authorizeSessionActor(app, input, jsx.String(session["id"]))
}

func lessonAudit(input map[string]any, sessionID, action string, metadata map[string]any) step {
	return create("ops_audit_logs", map[string]any{
		"id": ids.Record(), "actorId": input["actorId"], "actorRole": or(input["actorRole"], "admin"),
		"action": "course_operations.lesson." + action, "resourceType": "session", "resourceId": sessionID,
		"outcome": "success", "metadata": metadata,
	})
}

func attendancePlan(t teaching, input, result map[string]any, roster []map[string]any, status string) []step {
	sessionID := jsx.String(result["sessionId"])
	plan := []step{t.operation(input, "adjust", "session_attendance", sessionID, nil,
		map[string]any{"attendanceStatus": status, "rosterCount": len(roster)}, result)}
	for _, record := range roster {
		version := positiveVersion(record["version"])
		id := jsx.String(record["id"])
		checkedInAt := or(record["checkedInAt"], "")
		if status == "present" || status == "late" {
			checkedInAt = t.at
		}
		plan = append(plan,
			versionClaim("session_student", id, version, t.operationID),
			update("session_students", id, map[string]any{"attendanceStatus": status, "checkedInAt": checkedInAt, "version": version + 1}))
	}
	return append(plan,
		lessonAudit(input, sessionID, "attendance", map[string]any{"attendanceStatus": status, "rosterCount": len(roster)}),
		outbox("course-session.attendance-updated", "session", sessionID, result))
}

// setAttendance records one session student's manual attendance.
func setAttendance(app core.App, input map[string]any) (map[string]any, error) {
	if err := first(
		requiredID(input, "sessionId", "SESSION_ID_REQUIRED", "编号不能为空"),
		requiredID(input, "sessionStudentId", "SESSION_STUDENT_ID_REQUIRED", "编号不能为空"),
	); err != nil {
		return nil, err
	}
	status := text(input, "attendanceStatus")
	if !slices.Contains(manualAttendanceStatuses, status) {
		return nil, Fail("ATTENDANCE_STATUS_INVALID", "出勤结果无效", nil)
	}
	t, err := prepareTeaching(app, "setManualAttendance", input, map[string]any{
		"sessionId": input["sessionId"], "sessionStudentId": input["sessionStudentId"], "attendanceStatus": status,
	})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	session, err := get(app, "sessions", text(input, "sessionId"))
	if err != nil {
		return nil, err
	}
	record, err := get(app, "session_students", text(input, "sessionStudentId"))
	if err != nil {
		return nil, err
	}
	if err := validateEditableSession(session); err != nil {
		return nil, err
	}
	sessionID := jsx.String(session["id"])
	if err := authorizeSessionActor(app, input, sessionID); err != nil {
		return nil, err
	}
	if record["sessionId"] != sessionID {
		return nil, Fail("ATTENDANCE_ROSTER_MISMATCH", "学员不属于这节课", nil)
	}
	result := map[string]any{"operationId": t.operationID, "sessionId": sessionID, "sessionStudentId": record["id"], "attendanceStatus": status}
	return t.commit(app, attendancePlan(t, input, result, []map[string]any{record}, status), result)
}

// markAllPresent marks every non-cancelled roster row present.
func markAllPresent(app core.App, input map[string]any) (map[string]any, error) {
	if err := requiredID(input, "sessionId", "SESSION_ID_REQUIRED", "编号不能为空"); err != nil {
		return nil, err
	}
	t, err := prepareTeaching(app, "markAllPresent", input, map[string]any{"sessionId": input["sessionId"]})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	if _, err := editableSession(app, input); err != nil {
		return nil, err
	}
	sessionID := text(input, "sessionId")
	roster, err := list(app, "session_students", `sessionId="`+escape(sessionID)+`" && attendanceStatus!="cancelled"`, "studentId")
	if err != nil {
		return nil, err
	}
	if len(roster) == 0 {
		return nil, Fail("SESSION_ROSTER_REQUIRED", "课堂没有学员名单", nil)
	}
	result := map[string]any{"operationId": t.operationID, "sessionId": sessionID, "updatedCount": len(roster), "attendanceStatus": "present"}
	return t.commit(app, attendancePlan(t, input, result, roster, "present"), result)
}

// setActualTeacher records whether a session teacher actually taught.
func setActualTeacher(app core.App, input map[string]any) (map[string]any, error) {
	if err := first(
		requiredID(input, "sessionId", "SESSION_ID_REQUIRED", "编号不能为空"),
		requiredID(input, "sessionTeacherId", "SESSION_TEACHER_ID_REQUIRED", "编号不能为空"),
	); err != nil {
		return nil, err
	}
	status := text(input, "actualStatus")
	if !slices.Contains(actualTeacherStatuses, status) {
		return nil, Fail("ACTUAL_TEACHER_STATUS_INVALID", "实际授课状态无效", nil)
	}
	t, err := prepareTeaching(app, "setActualTeacher", input, map[string]any{
		"sessionId": input["sessionId"], "sessionTeacherId": input["sessionTeacherId"], "actualStatus": status,
	})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	session, err := get(app, "sessions", text(input, "sessionId"))
	if err != nil {
		return nil, err
	}
	teacher, err := get(app, "session_teachers", text(input, "sessionTeacherId"))
	if err != nil {
		return nil, err
	}
	if err := validateEditableSession(session); err != nil {
		return nil, err
	}
	sessionID := jsx.String(session["id"])
	if err := authorizeSessionActor(app, input, sessionID); err != nil {
		return nil, err
	}
	if teacher["sessionId"] != sessionID {
		return nil, Fail("ACTUAL_TEACHER_SESSION_MISMATCH", "教师不属于这节课", nil)
	}
	if isAssignedTeachingActor(input) && teacher["teacherId"] != input["actorId"] {
		return nil, Fail("SESSION_TEACHER_TARGET_FORBIDDEN", "教师只能确认本人的授课状态", nil)
	}
	teacherRowID := jsx.String(teacher["id"])
	result := map[string]any{"operationId": t.operationID, "sessionId": sessionID, "sessionTeacherId": teacherRowID, "actualStatus": status}
	return t.commit(app, []step{
		t.operation(input, "adjust", "session_teacher", teacherRowID, nil, map[string]any{"sessionId": sessionID, "actualStatus": status}, result),
		update("session_teachers", teacherRowID, map[string]any{"actualStatus": status}),
		lessonAudit(input, sessionID, "actual_teacher", map[string]any{"actualStatus": status}),
		outbox("course-session.actual-teacher-updated", "session", sessionID, result),
	}, result)
}

// previewSettlement shows what settling a finished session would do, without writing.
func previewSettlement(app core.App, sessionID string) (any, error) {
	if sessionID == "" {
		return nil, Fail("SESSION_ID_REQUIRED", "编号不能为空", nil)
	}
	session, err := get(app, "sessions", sessionID)
	if err != nil {
		return nil, err
	}
	effective := effectiveSettlementSession(session)
	if effective["status"] != "completed" && effective["status"] != "cancelled" {
		return nil, Fail("SESSION_NOT_SETTLEABLE", "课堂尚未进入可核销状态", nil)
	}
	filter := `sessionId="` + escape(sessionID) + `"`
	roster, err := list(app, "session_students", filter, "studentId")
	if err != nil {
		return nil, err
	}
	teachers, err := list(app, "session_teachers", filter, "role,teacherId")
	if err != nil {
		return nil, err
	}
	creditType, err := get(app, "credit_types", relationID(session["requiredCreditTypeId"]))
	if err != nil {
		return nil, err
	}
	allocations := []map[string]any{}
	if len(roster) > 0 {
		clauses := make([]string, len(roster))
		for i, record := range roster {
			clauses[i] = `sessionStudentId="` + escape(jsx.String(record["id"])) + `"`
		}
		if allocations, err = list(app, "session_credit_allocations", "("+strings.Join(clauses, " || ")+")",
			"sessionStudentId,created", "batchId"); err != nil {
			return nil, err
		}
	}
	students := make([]any, len(roster))
	canSettle := true
	for i, record := range roster {
		student := previewStudent(effective, record, allocations)
		canSettle = canSettle && student["exception"] == nil
		students[i] = student
	}
	earnings, err := planTeacherEarnings(effective, teachers, roster, relationID(creditType["courseSpecId"]))
	if err != nil {
		return nil, err
	}
	teacherItems := make([]any, len(earnings))
	for i, earning := range earnings {
		action := "earn"
		if earning.eventType == "compensate" {
			action = "compensate"
		}
		var role any
		for _, teacher := range teachers {
			if teacher["id"] == earning.sessionTeacherID {
				role = teacher["role"]
				break
			}
		}
		teacherItems[i] = map[string]any{"sessionTeacherId": earning.sessionTeacherID, "teacherId": earning.teacherID,
			"role": role, "action": action, "quantity": earning.quantity}
	}
	return map[string]any{"sessionId": sessionID, "sessionStatus": effective["status"], "canSettle": canSettle,
		"students": students, "teachers": teacherItems}, nil
}

func previewStudent(session, record map[string]any, allocations []map[string]any) map[string]any {
	affected := []any{}
	for _, allocation := range allocations {
		if relationID(allocation["sessionStudentId"]) != record["id"] {
			continue
		}
		batch := expanded(allocation, "batchId")
		affected = append(affected, map[string]any{"allocationId": allocation["id"], "batchId": relationID(allocation["batchId"]),
			"quantity": jsx.Number(or(allocation["quantity"], 0.0)), "status": or(allocation["status"], ""),
			"effectiveExpiresAt": or(batch["effectiveExpiresAt"], nil)})
	}
	student := map[string]any{"sessionStudentId": record["id"], "studentId": record["studentId"],
		"attendanceStatus": record["attendanceStatus"], "quantity": jsx.Number(session["requiredQuantity"]),
		"allocations": affected, "exception": nil}
	if record["creditStatus"] != "reserved" {
		student["action"] = "exception"
		student["exception"] = "课时状态尚未准备完成"
		if record["creditStatus"] == "credit_insufficient" {
			student["exception"] = "课时不足，需要教务处理"
		}
		return student
	}
	decision, err := settlementDecision(session, record)
	if err != nil {
		var business *Error
		student["action"] = "exception"
		student["exception"] = "课堂规则需要教务检查"
		if errors.As(err, &business) && business.Code == "ATTENDANCE_NOT_FINAL" {
			student["exception"] = "需要先完成出勤登记"
		}
		return student
	}
	student["action"] = decision.action
	return student
}
