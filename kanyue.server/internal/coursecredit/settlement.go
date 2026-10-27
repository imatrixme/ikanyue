package coursecredit

import (
	"math"
	"slices"
	"sort"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
)

// Hono's domain/settlement, domain/teacherEarning, settlementPlanning,
// reverseSettlementPlanning and the session settlement and reversal services:
// how a finished session turns frozen credit into consumed or released
// quantity, earns teacher credit, and how a settlement is reversed.

var (
	ruledAttendanceStatuses = []string{"present", "late", "leave", "absent"}
	teacherRoles            = []string{"lead", "assistant", "observer", "evaluator"}
	teacherActualStatuses   = []string{"planned", "confirmed", "absent", "cancelled"}
)

// decision is settlementDecision's result for one session student.
type decision struct {
	action, creditStatus, eventType, ruleSource, targetBucket string
	ruleVersion                                               any
}

func newDecision(action, ruleSource string, ruleVersion any) decision {
	if action == "consume" {
		return decision{action, "consumed", "CONSUME", ruleSource, "consumedQuantity", ruleVersion}
	}
	return decision{action, "released", "RELEASE", ruleSource, "availableQuantity", ruleVersion}
}

func ruleSnapshot(value any, code string) (map[string]any, error) {
	snapshot, ok := value.(map[string]any)
	if !ok || len(snapshot) == 0 {
		return nil, Fail(code, "Session requires an immutable rule snapshot", nil)
	}
	if !isInt(snapshot["version"]) || snapshot["version"].(float64) <= 0 {
		return nil, Fail("RULE_SNAPSHOT_VERSION_INVALID", "Rule snapshot version must be a positive integer", nil)
	}
	return snapshot, nil
}

func settlementAction(action any, status, source string) error {
	if action == "consume" || action == "release" {
		return nil
	}
	details := map[string]any{"source": source, "status": status}
	if action != nil {
		details["action"] = action
	}
	return Fail("SETTLEMENT_ACTION_INVALID", "Settlement action for "+status+" must be consume or release", details)
}

// settlementRules is validateSettlementRuleSnapshots.
func settlementRules(session map[string]any) (map[string]any, map[string]any, error) {
	attendance, err := ruleSnapshot(session["attendanceRuleSnapshot"], "ATTENDANCE_RULE_SNAPSHOT_REQUIRED")
	if err != nil {
		return nil, nil, err
	}
	settlement, err := ruleSnapshot(session["settlementRuleSnapshot"], "SETTLEMENT_RULE_SNAPSHOT_REQUIRED")
	if err != nil {
		return nil, nil, err
	}
	for _, status := range ruledAttendanceStatuses {
		if err := settlementAction(attendance[status], status, "attendance"); err != nil {
			return nil, nil, err
		}
	}
	if err := settlementAction(settlement["cancelled"], "cancelled", "settlement"); err != nil {
		return nil, nil, err
	}
	return attendance, settlement, nil
}

// settlementDecision maps a session student's final attendance to consume or release.
func settlementDecision(session, sessionStudent map[string]any) (decision, error) {
	if session["status"] != "completed" && session["status"] != "cancelled" {
		return decision{}, Fail("SESSION_NOT_SETTLEABLE", "Only completed or cancelled sessions can settle student credits", nil)
	}
	status, ok := sessionStudent["attendanceStatus"].(string)
	if !ok {
		return decision{}, Fail("ATTENDANCE_STATUS_REQUIRED", "Session student attendance status is required", nil)
	}
	attendance, settlement, err := settlementRules(session)
	if err != nil {
		return decision{}, err
	}
	if session["status"] == "cancelled" {
		return newDecision(jsx.String(settlement["cancelled"]), "institution_cancelled", settlement["version"]), nil
	}
	if !slices.Contains(ruledAttendanceStatuses, status) && status != "cancelled" {
		code := "INVALID_ATTENDANCE_STATUS"
		if status == "scheduled" || status == "checked_in" {
			code = "ATTENDANCE_NOT_FINAL"
		}
		return decision{}, Fail(code, "A final attendance status is required before credit settlement",
			map[string]any{"attendanceStatus": status})
	}
	snapshot := attendance
	if status == "cancelled" {
		snapshot = settlement
	}
	return newDecision(jsx.String(snapshot[status]), status, snapshot["version"]), nil
}

// studentSettlementPlan is buildStudentSettlementRequests: every reserved allocation of a
// session student is consumed or released according to the session's rule snapshots.
func studentSettlementPlan(session, sessionStudent map[string]any, allocations []map[string]any, batches map[string]map[string]any, operationID, at, actorID string) ([]step, decision, error) {
	if sessionStudent["creditStatus"] != "reserved" {
		return nil, decision{}, Fail("SESSION_STUDENT_NOT_RESERVED", "Session student must have reserved credit before settlement", nil)
	}
	if len(allocations) == 0 {
		return nil, decision{}, Fail("SESSION_ALLOCATION_REQUIRED", "Reserved session credit allocations are required", nil)
	}
	choice, err := settlementDecision(session, sessionStudent)
	if err != nil {
		return nil, decision{}, err
	}
	context := reservationSession{sessionID: jsx.String(session["id"]), sessionStudent: sessionStudent, operationID: operationID, at: at, actorID: actorID}
	plan := []step{}
	seen := map[string]bool{}
	for _, allocation := range allocations {
		if err := validateReservedAllocation(allocation, seen, "SETTLEMENT_BATCH_ID_REQUIRED",
			"DUPLICATE_SETTLEMENT_BATCH", "A batch can appear only once per student settlement"); err != nil {
			return nil, decision{}, err
		}
		record := batches[jsx.String(allocation["batchId"])]
		if record == nil {
			return nil, decision{}, Fail("SETTLEMENT_BATCH_NOT_FOUND", "Reserved allocation batch was not found", map[string]any{"batchId": allocation["batchId"]})
		}
		if record["studentId"] != sessionStudent["studentId"] {
			return nil, decision{}, Fail("SETTLEMENT_BATCH_STUDENT_MISMATCH", "Allocation batch belongs to another student", nil)
		}
		batch := normalizeBookingBatch(record, map[string]any{"kind": "course", "consumable": true})
		quantity := allocation["quantity"].(float64)
		var next map[string]any
		target := choice.targetBucket
		if choice.action == "consume" {
			valid, err := canConsumeProtectedReservation(batch, allocation["reservedForStartAt"])
			if err != nil {
				return nil, decision{}, err
			}
			if !valid {
				return nil, decision{}, Fail("RESERVATION_SERVICE_TIME_INVALID", "Frozen credit was not valid for its reserved service time", nil)
			}
			if next, err = moveQuantity(batch, "frozenQuantity", target, quantity); err != nil {
				return nil, decision{}, err
			}
			if next["status"], err = deriveBatchStatus(next); err != nil {
				return nil, decision{}, err
			}
		} else if next, target, err = releaseFrozen(batch, quantity, at); err != nil {
			return nil, decision{}, err
		}
		version := positiveVersion(batch["version"])
		next["version"] = version + 1
		status := choice.creditStatus
		if target == "expiredQuantity" {
			status = "expired"
		}
		delta := quantity
		if choice.action == "consume" {
			delta = -quantity
		}
		id := jsx.String(next["id"])
		plan = append(plan,
			versionClaim("credit_batch", id, version, operationID),
			update("credit_batches", id, map[string]any{
				"availableQuantity": next["availableQuantity"], "consumedQuantity": next["consumedQuantity"],
				"expiredQuantity": next["expiredQuantity"], "frozenQuantity": next["frozenQuantity"],
				"status": next["status"], "version": next["version"],
			}),
			update("session_credit_allocations", jsx.String(allocation["id"]), map[string]any{"status": status}),
			create("credit_events", context.creditEvent(next, choice.eventType, delta, "frozenQuantity", target, "session_settlement", map[string]any{
				"allocationId": allocation["id"], "attendanceStatus": sessionStudent["attendanceStatus"],
				"immediateExpiry": target == "expiredQuantity", "ruleSource": choice.ruleSource, "ruleVersion": choice.ruleVersion,
			})))
	}
	version := positiveVersion(sessionStudent["version"])
	studentID := jsx.String(sessionStudent["id"])
	return append(plan,
		versionClaim("session_student", studentID, version, operationID),
		update("session_students", studentID, map[string]any{"creditStatus": choice.creditStatus, "settledAt": at, "version": version + 1}),
	), choice, nil
}

// validateTeacherRuleSnapshot checks every role rule a session froze at publication.
func validateTeacherRuleSnapshot(value any) (map[string]any, error) {
	snapshot, ok := value.(map[string]any)
	if !ok {
		return nil, Fail("TEACHER_RULE_SNAPSHOT_REQUIRED", "Session requires a teacher rule snapshot", nil)
	}
	if !isInt(snapshot["version"]) || snapshot["version"].(float64) <= 0 {
		return nil, Fail("TEACHER_RULE_VERSION_INVALID", "Teacher rule snapshot version must be a positive integer", nil)
	}
	rules, ok := snapshot["rules"].(map[string]any)
	if !ok || len(rules) == 0 {
		return nil, Fail("TEACHER_RULES_REQUIRED", "Teacher rule snapshot requires at least one role rule", nil)
	}
	for _, role := range ruleRoles(rules) {
		if err := validateTeacherRule(role, rules[role]); err != nil {
			return nil, err
		}
	}
	return snapshot, nil
}

// ruleRoles orders snapshot roles for validation: known roles first, then the rest by name.
// Hono walks the stored object in key order; only which of several invalid rules is reported can differ.
func ruleRoles(rules map[string]any) []string {
	roles := []string{}
	for _, role := range teacherRoles {
		if _, ok := rules[role]; ok {
			roles = append(roles, role)
		}
	}
	rest := []string{}
	for role := range rules {
		if !slices.Contains(teacherRoles, role) {
			rest = append(rest, role)
		}
	}
	sort.Strings(rest)
	return append(roles, rest...)
}

func validateTeacherRule(role string, value any) error {
	details := map[string]any{"role": role}
	if !slices.Contains(teacherRoles, role) {
		return Fail("INVALID_TEACHER_ROLE", "Teacher rule role is not supported", details)
	}
	rule, ok := value.(map[string]any)
	if !ok {
		return Fail("TEACHER_RULE_INVALID", "Teacher rule must be an object", details)
	}
	if id, _ := rule["ruleId"].(string); id == "" {
		return Fail("TEACHER_RULE_ID_REQUIRED", "Teacher rule id is required", details)
	}
	if course, _ := rule["courseSpecId"].(string); course == "" {
		return Fail("TEACHER_RULE_COURSE_REQUIRED", "Teacher rule course specification is required", details)
	}
	for _, field := range []string{"baseQuantity", "durationFactor", "participantFactor"} {
		number, ok := rule[field].(float64)
		if !ok || math.IsInf(number, 0) || number < 0 {
			return Fail("TEACHER_RULE_FACTOR_INVALID", field+" must be a non-negative number", map[string]any{"field": field, "role": role})
		}
	}
	if compensation := rule["cancellationCompensation"]; compensation != nil {
		return validateCancellationCompensation(compensation, role)
	}
	return nil
}

// teacherEarning is one planned teacher_credit_events row.
type teacherEarning struct {
	eventID, eventType, sessionTeacherID, teacherID string
	ruleID, ruleVersion                             any
	quantity                                        float64
}

// planTeacherEarnings: confirmed teachers earn by rule; a cancelled session pays only
// the compensation its snapshot grants for each teacher's actual status.
func planTeacherEarnings(session map[string]any, teachers, students []map[string]any, courseSpecID string) ([]teacherEarning, error) {
	if session["status"] == "cancelled" && !jsx.Truthy(session["teacherRuleSnapshot"]) {
		return []teacherEarning{}, nil
	}
	snapshot, err := validateTeacherRuleSnapshot(session["teacherRuleSnapshot"])
	if err != nil {
		return nil, err
	}
	rules := snapshot["rules"].(map[string]any)
	earnings := []teacherEarning{}
	if session["status"] == "cancelled" {
		for _, teacher := range teachers {
			rule, _ := rules[jsx.String(teacher["role"])].(map[string]any)
			policy, _ := rule["cancellationCompensation"].(map[string]any)
			if policy == nil || !slices.Contains(policy["eligibleActualStatuses"].([]any), teacher["actualStatus"]) {
				continue
			}
			if rule["courseSpecId"] != courseSpecID {
				return nil, Fail("TEACHER_RULE_COURSE_MISMATCH", "Teacher rule does not match the session course specification", nil)
			}
			earnings = append(earnings, teacherEarning{eventID: ids.Record(), eventType: "compensate",
				sessionTeacherID: jsx.String(teacher["id"]), teacherID: relationID(teacher["teacherId"]),
				ruleID: rule["ruleId"], ruleVersion: snapshot["version"], quantity: roundQuantity(policy["quantity"].(float64))})
		}
		return earnings, nil
	}
	confirmed := []map[string]any{}
	lead := false
	for _, teacher := range teachers {
		if teacher["actualStatus"] == "confirmed" {
			confirmed = append(confirmed, teacher)
			lead = lead || teacher["role"] == "lead"
		}
	}
	if !lead {
		return nil, Fail("SESSION_CONFIRMED_LEAD_REQUIRED", "Completed session requires a confirmed lead teacher", nil)
	}
	participants := 0.0
	for _, student := range students {
		if student["attendanceStatus"] == "present" || student["attendanceStatus"] == "late" {
			participants++
		}
	}
	hours, err := sessionDurationHours(session)
	if err != nil {
		return nil, err
	}
	for _, teacher := range confirmed {
		role := jsx.String(teacher["role"])
		rule, ok := rules[role].(map[string]any)
		if !ok {
			return nil, Fail("TEACHER_RULE_NOT_FOUND", "No snapshotted teacher rule exists for actual role", map[string]any{"role": role})
		}
		if rule["courseSpecId"] != courseSpecID {
			return nil, Fail("TEACHER_RULE_COURSE_MISMATCH", "Teacher rule does not match the session course specification", nil)
		}
		if err := validateTeacherRule(role, rule); err != nil {
			return nil, err
		}
		quantity := roundQuantity(rule["baseQuantity"].(float64) + rule["durationFactor"].(float64)*hours +
			rule["participantFactor"].(float64)*participants)
		if quantity <= 0 {
			return nil, Fail("TEACHER_EARNING_NOT_POSITIVE", "Teacher earning must be greater than zero", nil)
		}
		earnings = append(earnings, teacherEarning{eventID: ids.Record(), eventType: "earn",
			sessionTeacherID: jsx.String(teacher["id"]), teacherID: relationID(teacher["teacherId"]),
			ruleID: rule["ruleId"], ruleVersion: snapshot["version"], quantity: quantity})
	}
	return earnings, nil
}

func sessionDurationHours(session map[string]any) (float64, error) {
	start, err := dateOf(session["startAt"], "session.startAt")
	if err != nil {
		return 0, err
	}
	end, err := dateOf(session["endAt"], "session.endAt")
	if err != nil {
		return 0, err
	}
	hours := float64(end-start) / 3_600_000
	if hours <= 0 {
		return 0, Fail("SESSION_DURATION_INVALID", "Session end must be later than start", nil)
	}
	return hours, nil
}

// effectiveSettlementSession settles a correction-pending session as its original terminal status.
func effectiveSettlementSession(session map[string]any) map[string]any {
	if session["status"] != "correction_pending" {
		return session
	}
	effective := copyMap(session)
	effective["status"] = session["correctionBaseStatus"]
	return effective
}

func requireSessionID(input map[string]any) error {
	if text(input, "sessionId") == "" {
		return Fail("SESSION_ID_REQUIRED", "sessionId is required", nil)
	}
	return nil
}

func validateSettleableSession(session map[string]any) error {
	status := session["status"]
	if status != "completed" && status != "cancelled" && status != "correction_pending" {
		return Fail("SESSION_NOT_SETTLEABLE", "Only completed, cancelled, or correction-pending sessions can be settled", nil)
	}
	if session["originType"] == "migration" {
		return Fail("MIGRATION_SESSION_SETTLEMENT_FORBIDDEN", "Historical migration sessions must never settle credits", nil)
	}
	if quantity := session["requiredQuantity"]; !isInt(quantity) || quantity.(float64) <= 0 {
		return Fail("SESSION_CREDIT_QUANTITY_INVALID", "Session required quantity must be a positive integer", nil)
	}
	if status == "correction_pending" {
		if base := session["correctionBaseStatus"]; base != "completed" && base != "cancelled" {
			return Fail("CORRECTION_BASE_STATUS_REQUIRED", "Correction-pending session requires its original terminal status", nil)
		}
		if !jsx.Truthy(session["settlementOperationId"]) {
			return Fail("PRIOR_SETTLEMENT_OPERATION_REQUIRED", "Correction-pending session requires its prior settlement operation", nil)
		}
	} else if jsx.Truthy(session["settlementOperationId"]) {
		return Fail("SESSION_ALREADY_SETTLED", "Session already references a settlement operation", nil)
	}
	return nil
}

// sessionAllocations loads a session student's reserved allocations and their batches.
func sessionAllocations(app core.App, sessionStudentID string) ([]map[string]any, map[string]map[string]any, error) {
	allocations, err := list(app, "session_credit_allocations",
		`sessionStudentId="`+escape(sessionStudentID)+`" && status="reserved"`, "batchId,id")
	if err != nil {
		return nil, nil, err
	}
	batches := map[string]map[string]any{}
	for _, allocation := range allocations {
		id := relationID(allocation["batchId"])
		if batches[id] == nil {
			if batches[id], err = get(app, "credit_batches", id); err != nil {
				return nil, nil, err
			}
		}
	}
	return allocations, batches, nil
}

// settleSession is CourseCreditSessionSettlementService.settleSession.
func settleSession(app core.App, input map[string]any) (map[string]any, error) {
	if err := requireSessionID(input); err != nil {
		return nil, err
	}
	t, err := prepareTeaching(app, "settleSession", input, map[string]any{"sessionId": input["sessionId"]})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	session, err := get(app, "sessions", text(input, "sessionId"))
	if err != nil {
		return nil, err
	}
	if err := validateSettleableSession(session); err != nil {
		return nil, err
	}
	effective := effectiveSettlementSession(session)
	creditType, err := get(app, "credit_types", relationID(session["requiredCreditTypeId"]))
	if err != nil {
		return nil, err
	}
	if creditType["kind"] != "course" || creditType["consumable"] != true || !jsx.Truthy(creditType["courseSpecId"]) {
		return nil, Fail("SESSION_CREDIT_TYPE_INVALID", "Session must require an exact course credit with course specification", nil)
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
	if len(roster) == 0 {
		return nil, Fail("SESSION_ROSTER_REQUIRED", "Session settlement requires a roster snapshot", nil)
	}
	if session["status"] == "completed" {
		for _, student := range roster {
			if student["creditStatus"] != "reserved" {
				return nil, Fail("SESSION_STUDENT_CREDIT_UNRESOLVED", "Completed session has a student without a reserved credit",
					map[string]any{"creditStatus": student["creditStatus"], "sessionStudentId": student["id"]})
			}
		}
	}
	required := session["requiredQuantity"].(float64)
	actorID := jsx.String(or(input["actorId"], ""))
	outcomes := []any{}
	students := []step{}
	for _, student := range roster {
		if student["creditStatus"] != "reserved" {
			continue
		}
		studentID := jsx.String(student["id"])
		allocations, batches, err := sessionAllocations(app, studentID)
		if err != nil {
			return nil, err
		}
		allocated := 0.0
		allocationIDs := []any{}
		for _, allocation := range allocations {
			allocated += jsx.Number(or(allocation["quantity"], 0.0))
			allocationIDs = append(allocationIDs, allocation["id"])
		}
		if allocated != required {
			return nil, Fail("SESSION_ALLOCATION_QUANTITY_MISMATCH", "Reserved quantity must equal the session requirement",
				map[string]any{"allocatedQuantity": allocated, "requiredQuantity": required, "sessionStudentId": studentID})
		}
		plan, choice, err := studentSettlementPlan(effective, student, allocations, batches, t.operationID, t.at, actorID)
		if err != nil {
			return nil, err
		}
		students = append(students, plan...)
		outcomes = append(outcomes, map[string]any{"allocationIds": allocationIDs, "attendanceStatus": student["attendanceStatus"],
			"creditStatus": choice.creditStatus, "sessionStudentId": studentID})
	}
	earnings, err := planTeacherEarnings(effective, teachers, roster, relationID(creditType["courseSpecId"]))
	if err != nil {
		return nil, err
	}
	teacherResults := []any{}
	for _, earning := range earnings {
		teacherResults = append(teacherResults, map[string]any{"eventId": earning.eventID, "eventType": earning.eventType,
			"quantity": earning.quantity, "roleRuleId": earning.ruleID, "sessionTeacherId": earning.sessionTeacherID, "teacherId": earning.teacherID})
	}
	result := map[string]any{"operationId": t.operationID, "sessionId": sessionID, "studentOutcomes": outcomes, "teacherEarnings": teacherResults}
	version := positiveVersion(session["version"])
	plan := []step{
		t.operation(input, "settle_session", "session", sessionID, "", map[string]any{
			"correctionBaseStatus": or(session["correctionBaseStatus"], ""), "priorSettlementOperationId": or(session["settlementOperationId"], ""),
			"rosterVersion": session["rosterVersion"], "sessionId": sessionID, "sessionStatus": effective["status"],
		}, result),
		versionClaim("session", sessionID, version, t.operationID),
	}
	plan = append(plan, students...)
	for _, earning := range earnings {
		reason := "session_settlement"
		if earning.eventType == "compensate" {
			reason = "session_cancellation_compensation"
		}
		plan = append(plan,
			create("teacher_credit_events", map[string]any{"id": earning.eventID, "sessionTeacherId": earning.sessionTeacherID,
				"teacherId": earning.teacherID, "ruleId": earning.ruleID, "eventType": earning.eventType, "quantityDelta": earning.quantity,
				"status": "pending", "operationId": t.operationID, "reason": reason}),
			update("session_teachers", earning.sessionTeacherID, map[string]any{"creditStatus": "pending"}))
	}
	plan = append(plan,
		update("sessions", sessionID, map[string]any{"correctionBaseStatus": "", "settlementOperationId": t.operationID,
			"status": "settled", "version": version + 1}),
		outbox("course-credit.session-settled", "session", sessionID, result))
	return t.commit(app, plan, result)
}

// reverseSessionSettlement returns a settled session's credit to frozen, reverses teacher
// earnings and leaves the session correction-pending for a fresh settlement.
func reverseSessionSettlement(app core.App, input map[string]any) (map[string]any, error) {
	if err := requireSessionID(input); err != nil {
		return nil, err
	}
	if reason, ok := input["reason"].(string); !ok || jsx.Length(strings.TrimSpace(reason)) < 4 {
		return nil, Fail("REVERSAL_REASON_REQUIRED", "Settlement reversal requires a meaningful reason", nil)
	}
	t, err := prepareTeaching(app, "reverseSessionSettlement", input, map[string]any{"reason": input["reason"], "sessionId": input["sessionId"]})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	session, err := get(app, "sessions", text(input, "sessionId"))
	if err != nil {
		return nil, err
	}
	if session["status"] != "settled" {
		return nil, Fail("SESSION_NOT_REVERSIBLE", "Only a settled session can be reversed", nil)
	}
	operationID, _ := session["settlementOperationId"].(string)
	if operationID == "" {
		return nil, Fail("SETTLEMENT_OPERATION_REQUIRED", "Settled session requires its settlement operation", nil)
	}
	original, err := get(app, "credit_operations", operationID)
	if err != nil {
		return nil, err
	}
	sessionID := jsx.String(session["id"])
	if original["type"] != "settle_session" || original["status"] != "committed" {
		return nil, Fail("SETTLEMENT_OPERATION_INVALID", "Original settlement operation is invalid", nil)
	}
	if original["sourceType"] != "session" || original["sourceId"] != sessionID {
		return nil, Fail("SETTLEMENT_OPERATION_SESSION_MISMATCH", "Settlement operation belongs to another session", nil)
	}
	snapshot, _ := original["requestSnapshot"].(map[string]any)
	baseStatus := snapshot["sessionStatus"]
	if baseStatus != "completed" && baseStatus != "cancelled" {
		return nil, Fail("SETTLEMENT_BASE_STATUS_INVALID", "Original settlement does not preserve its terminal status", nil)
	}
	operationFilter := `operationId="` + escape(operationID) + `"`
	creditEvents, err := list(app, "credit_events", operationFilter, "batchId,id")
	if err != nil {
		return nil, err
	}
	teacherEvents, err := list(app, "teacher_credit_events", operationFilter, "sessionTeacherId,id")
	if err != nil {
		return nil, err
	}
	roster, err := list(app, "session_students", `sessionId="`+escape(sessionID)+`"`, "id")
	if err != nil {
		return nil, err
	}
	sessionStudents := map[string]map[string]any{}
	for _, student := range roster {
		sessionStudents[jsx.String(student["id"])] = student
	}
	allocations := map[string]map[string]any{}
	batches := map[string]map[string]any{}
	for _, event := range creditEvents {
		metadata, _ := event["metadata"].(map[string]any)
		allocationID, _ := metadata["allocationId"].(string)
		if allocationID == "" || allocations[allocationID] != nil {
			continue
		}
		allocation, err := get(app, "session_credit_allocations", allocationID)
		if err != nil {
			return nil, err
		}
		allocations[allocationID] = allocation
		batchID := relationID(allocation["batchId"])
		if batches[batchID] == nil {
			if batches[batchID], err = get(app, "credit_batches", batchID); err != nil {
				return nil, err
			}
		}
	}
	reason := input["reason"]
	credit, reversedCredit, err := creditReversalPlan(creditEvents, allocations, batches, sessionStudents, sessionID, operationID, t, input)
	if err != nil {
		return nil, err
	}
	teacher, reversedTeacher, err := teacherReversalPlan(teacherEvents, t.operationID, reason)
	if err != nil {
		return nil, err
	}
	result := map[string]any{"operationId": t.operationID, "originalSettlementOperationId": operationID,
		"reversedCreditEventIds": reversedCredit, "reversedTeacherEventIds": reversedTeacher, "sessionId": sessionID}
	operation := t.operation(input, "reverse_session_settlement", "settlement_operation", operationID, "", map[string]any{
		"baseStatus": baseStatus, "originalSettlementOperationId": operationID, "reason": reason,
	}, result)
	operation.data["reversalOfOperationId"] = operationID
	version := positiveVersion(session["version"])
	plan := []step{operation, versionClaim("session", sessionID, version, t.operationID)}
	plan = append(plan, credit...)
	plan = append(plan, teacher...)
	plan = append(plan,
		update("sessions", sessionID, map[string]any{"correctionBaseStatus": baseStatus, "status": "correction_pending", "version": version + 1}),
		outbox("course-credit.session-settlement-reversed", "session", sessionID, result))
	return t.commit(app, plan, result)
}

// creditReversalPlan is buildCreditReversalRequests: each settled allocation's quantity
// returns to frozen under a replacement reservation, and its students become reserved again.
func creditReversalPlan(events []map[string]any, allocations, batches, sessionStudents map[string]map[string]any, sessionID, originalID string, t teaching, input map[string]any) ([]step, []any, error) {
	plan := []step{}
	reversed := []any{}
	students := []map[string]any{}
	seenBatches := map[string]bool{}
	for _, event := range events {
		metadata, _ := event["metadata"].(map[string]any)
		if event["eventType"] != "CONSUME" && event["eventType"] != "RELEASE" {
			return nil, nil, Fail("CREDIT_EVENT_NOT_REVERSIBLE", "Only settlement consume or release events can be reversed", nil)
		}
		if jsx.Truthy(event["reversalOfEventId"]) {
			return nil, nil, Fail("CREDIT_EVENT_ALREADY_REVERSED", "Credit event is already a reversal", nil)
		}
		bucket := jsx.String(event["bucketTo"])
		if !slices.Contains([]string{"consumedQuantity", "availableQuantity", "expiredQuantity"}, bucket) {
			return nil, nil, Fail("REVERSAL_BUCKET_INVALID", "Settlement event target bucket cannot be reversed", nil)
		}
		allocationID, _ := metadata["allocationId"].(string)
		if allocationID == "" {
			return nil, nil, Fail("REVERSAL_ALLOCATION_ID_REQUIRED", "Settlement event must identify its allocation", nil)
		}
		batchID := relationID(event["batchId"])
		if seenBatches[batchID] {
			return nil, nil, Fail("DUPLICATE_REVERSAL_BATCH", "A batch can be reversed only once per settlement", nil)
		}
		seenBatches[batchID] = true
		allocation := allocations[allocationID]
		if allocation == nil {
			return nil, nil, Fail("REVERSAL_ALLOCATION_NOT_FOUND", "Original settlement allocation was not found", nil)
		}
		settled := "released"
		if event["eventType"] == "CONSUME" {
			settled = "consumed"
		} else if bucket == "expiredQuantity" {
			settled = "expired"
		}
		if allocation["status"] != settled {
			return nil, nil, Fail("REVERSAL_ALLOCATION_STATUS_INVALID", "Original allocation is not in its settled state", nil)
		}
		record := batches[batchID]
		if record == nil {
			return nil, nil, Fail("REVERSAL_BATCH_NOT_FOUND", "Original settlement batch was not found", nil)
		}
		student := sessionStudents[jsx.String(metadata["sessionStudentId"])]
		if student == nil {
			return nil, nil, Fail("REVERSAL_SESSION_STUDENT_NOT_FOUND", "Original session student was not found", nil)
		}
		if record["studentId"] != student["studentId"] {
			return nil, nil, Fail("REVERSAL_BATCH_STUDENT_MISMATCH", "Settlement batch belongs to another student", nil)
		}
		delta := jsx.Number(event["quantityDelta"])
		quantity := math.Abs(delta)
		if _, err := nonNegativeQuantity(quantity, "reversal.quantity"); err != nil {
			return nil, nil, err
		}
		if quantity <= 0 || quantity != jsx.Number(allocation["quantity"]) {
			return nil, nil, Fail("REVERSAL_QUANTITY_MISMATCH", "Original event and allocation quantities must match", nil)
		}
		batch := normalizeBookingBatch(record, map[string]any{"kind": "course", "consumable": true})
		next, err := moveQuantity(batch, bucket, "frozenQuantity", quantity)
		if err != nil {
			return nil, nil, err
		}
		if next["status"], err = deriveBatchStatus(next); err != nil {
			return nil, nil, err
		}
		version := positiveVersion(batch["version"])
		next["version"] = version + 1
		replacementID := ids.Record()
		plan = append(plan,
			versionClaim("credit_batch", batchID, version, t.operationID),
			update("credit_batches", batchID, map[string]any{
				"availableQuantity": next["availableQuantity"], "consumedQuantity": next["consumedQuantity"],
				"expiredQuantity": next["expiredQuantity"], "frozenQuantity": next["frozenQuantity"],
				"reversedQuantity": next["reversedQuantity"], "status": next["status"], "version": next["version"],
			}),
			update("session_credit_allocations", allocationID, map[string]any{"status": "reversed"}),
			create("session_credit_allocations", map[string]any{
				"id": replacementID, "sessionStudentId": orChain(relationID(allocation["sessionStudentId"]), metadata["sessionStudentId"]),
				"batchId": batchID, "quantity": quantity, "status": "reserved",
				"reservedForStartAt": allocation["reservedForStartAt"], "operationId": t.operationID,
			}),
			create("credit_events", map[string]any{
				"id": ids.Record(), "operationId": t.operationID, "batchId": batchID, "studentId": student["studentId"],
				"creditTypeId": next["creditTypeId"], "eventType": "REVERSE", "quantityDelta": -delta,
				"bucketFrom": bucket, "bucketTo": "frozenQuantity", "balanceSnapshot": balanceSnapshot(next),
				"businessTime": t.at, "actorId": input["actorId"], "reason": input["reason"], "reversalOfEventId": event["id"],
				"metadata": map[string]any{
					"originalAllocationId": allocationID, "originalOperationId": originalID, "replacementAllocationId": replacementID,
					"sessionId": sessionID, "sessionStudentId": student["id"],
				},
			}))
		reversed = append(reversed, event["id"])
		if !slices.ContainsFunc(students, func(item map[string]any) bool { return item["id"] == student["id"] }) {
			students = append(students, student)
		}
	}
	for _, student := range students {
		version := positiveVersion(student["version"])
		id := jsx.String(student["id"])
		plan = append(plan,
			versionClaim("session_student", id, version, t.operationID),
			update("session_students", id, map[string]any{"creditStatus": "reserved", "settledAt": "", "version": version + 1}))
	}
	return plan, reversed, nil
}

// teacherReversalPlan is buildTeacherReversalRequests: each earning gets a negative reversal event.
func teacherReversalPlan(events []map[string]any, operationID string, reason any) ([]step, []any, error) {
	plan := []step{}
	reversed := []any{}
	seen := map[string]bool{}
	for _, event := range events {
		if (event["eventType"] != "earn" && event["eventType"] != "compensate") ||
			(event["status"] != "pending" && event["status"] != "confirmed") {
			return nil, nil, Fail("TEACHER_EVENT_NOT_REVERSIBLE", "Only earned teacher credits can be reversed", nil)
		}
		if jsx.Truthy(event["reversalOfEventId"]) {
			return nil, nil, Fail("TEACHER_EVENT_ALREADY_REVERSED", "Teacher earning is already a reversal", nil)
		}
		assignment := relationID(event["sessionTeacherId"])
		if seen[assignment] {
			return nil, nil, Fail("DUPLICATE_TEACHER_REVERSAL", "Teacher assignment can be reversed only once per settlement", nil)
		}
		seen[assignment] = true
		quantity, ok := event["quantityDelta"].(float64)
		if !ok || math.IsInf(quantity, 0) || quantity <= 0 {
			return nil, nil, Fail("TEACHER_REVERSAL_QUANTITY_INVALID", "Teacher earning quantity must be positive", nil)
		}
		plan = append(plan,
			create("teacher_credit_events", map[string]any{
				"id": ids.Record(), "sessionTeacherId": assignment, "teacherId": event["teacherId"], "ruleId": or(event["ruleId"], ""),
				"eventType": "reverse", "quantityDelta": -quantity, "status": "reversed", "operationId": operationID,
				"reversalOfEventId": event["id"], "reason": reason,
			}),
			update("session_teachers", assignment, map[string]any{"creditStatus": "reversed"}))
		reversed = append(reversed, event["id"])
	}
	return plan, reversed, nil
}
