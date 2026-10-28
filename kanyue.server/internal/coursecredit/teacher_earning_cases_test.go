package coursecredit

import (
	"reflect"
	"testing"
)

// Teacher earning cases ported from Hono's courseCreditTeacherEarning tests.

func earningRule(ruleID string, changes map[string]any) map[string]any {
	return with2(map[string]any{"ruleId": ruleID, "courseSpecId": "course-spec", "baseQuantity": 1.0,
		"durationFactor": 0.5, "participantFactor": 0.1}, changes)
}

func earningSnapshot() map[string]any {
	return map[string]any{"version": 4.0, "rules": map[string]any{
		"lead":      earningRule("lead-rule", nil),
		"assistant": earningRule("assistant-rule", map[string]any{"baseQuantity": 0.5, "durationFactor": 0.25, "participantFactor": 0.0}),
	}}
}

func earningSession(changes map[string]any) map[string]any {
	return with2(map[string]any{"id": "session", "status": "completed", "startAt": "2026-08-10T10:00:00.000Z",
		"endAt": "2026-08-10T11:30:00.000Z", "teacherRuleSnapshot": earningSnapshot()}, changes)
}

func earningTeacher(id, role, actualStatus string) map[string]any {
	return map[string]any{"id": id, "teacherId": "teacher-" + id, "role": role, "actualStatus": actualStatus}
}

func earningStudents(statuses ...string) []map[string]any {
	students := []map[string]any{}
	for _, status := range statuses {
		students = append(students, map[string]any{"attendanceStatus": status})
	}
	return students
}

// earningFacts drops the random event id so plans compare by value.
func earningFacts(earnings []teacherEarning) []map[string]any {
	facts := []map[string]any{}
	for _, earning := range earnings {
		facts = append(facts, map[string]any{"eventType": earning.eventType, "quantity": earning.quantity,
			"ruleId": earning.ruleID, "ruleVersion": earning.ruleVersion, "sessionTeacherId": earning.sessionTeacherID,
			"teacherId": earning.teacherID})
	}
	return facts
}

// Hono: courseCreditTeacherEarning › teacher earnings use actual roles, duration hours, and participating students
func TestTeacherEarningsUseRolesDurationAndParticipants(t *testing.T) {
	earnings, err := planTeacherEarnings(earningSession(nil), []map[string]any{
		earningTeacher("lead-teacher", "lead", "confirmed"),
		earningTeacher("assistant-teacher", "assistant", "confirmed"),
		earningTeacher("absent-teacher", "lead", "absent"),
	}, earningStudents("present", "late", "leave", "absent"), "course-spec")
	want := []map[string]any{
		{"eventType": "earn", "quantity": 1.95, "ruleId": "lead-rule", "ruleVersion": 4.0,
			"sessionTeacherId": "lead-teacher", "teacherId": "teacher-lead-teacher"},
		{"eventType": "earn", "quantity": 0.875, "ruleId": "assistant-rule", "ruleVersion": 4.0,
			"sessionTeacherId": "assistant-teacher", "teacherId": "teacher-assistant-teacher"},
	}
	if err != nil || !reflect.DeepEqual(earningFacts(earnings), want) {
		t.Fatalf("earnings = %v, %v", earningFacts(earnings), err)
	}
}

// Hono: courseCreditTeacherEarning › confirmed substitute earns while the absent default teacher does not
func TestConfirmedSubstituteEarnsInsteadOfAbsentDefault(t *testing.T) {
	substitute := with2(earningTeacher("substitute", "lead", "confirmed"), map[string]any{"assignmentSource": "substitute"})
	defaultTeacher := with2(earningTeacher("default", "lead", "absent"), map[string]any{"assignmentSource": "class_default"})
	earnings, err := planTeacherEarnings(earningSession(nil), []map[string]any{defaultTeacher, substitute},
		earningStudents("present"), "course-spec")
	if err != nil || len(earnings) != 1 || earnings[0].teacherID != "teacher-substitute" {
		t.Fatalf("earnings = %v, %v", earningFacts(earnings), err)
	}
}

// Hono: courseCreditTeacherEarning › cancelled sessions never create normal teacher earnings
func TestCancelledSessionCreatesNoNormalEarnings(t *testing.T) {
	earnings, err := planTeacherEarnings(earningSession(map[string]any{"status": "cancelled", "teacherRuleSnapshot": nil}),
		[]map[string]any{earningTeacher("lead", "lead", "confirmed")}, earningStudents("present"), "course-spec")
	if err != nil || len(earnings) != 0 {
		t.Fatalf("earnings = %v, %v", earningFacts(earnings), err)
	}
}

// Hono: courseCreditTeacherEarning › cancelled sessions create only explicitly versioned compensation earnings
func TestCancelledSessionCreatesOnlyVersionedCompensation(t *testing.T) {
	session := earningSession(map[string]any{"status": "cancelled", "teacherRuleSnapshot": map[string]any{
		"version": 5.0, "rules": map[string]any{
			"lead": earningRule("lead-cancellation", map[string]any{"cancellationCompensation": map[string]any{
				"quantity": 0.75, "eligibleActualStatuses": []any{"planned", "confirmed"}}}),
			"assistant": earningRule("assistant-no-compensation", nil),
		}}})
	earnings, err := planTeacherEarnings(session, []map[string]any{
		earningTeacher("planned-lead", "lead", "planned"),
		earningTeacher("absent-lead", "lead", "absent"),
		earningTeacher("assistant", "assistant", "confirmed"),
	}, nil, "course-spec")
	want := []map[string]any{{"eventType": "compensate", "quantity": 0.75, "ruleId": "lead-cancellation", "ruleVersion": 5.0,
		"sessionTeacherId": "planned-lead", "teacherId": "teacher-planned-lead"}}
	if err != nil || !reflect.DeepEqual(earningFacts(earnings), want) {
		t.Fatalf("earnings = %v, %v", earningFacts(earnings), err)
	}
}

// Hono: courseCreditTeacherEarning › teacher earning helpers define precision and duration contracts
// Go computes the earning inside planTeacherEarnings (no separate calculateTeacherEarning), so the
// 1.95 calculation is asserted through the plan in TestTeacherEarningsUseRolesDurationAndParticipants.
func TestTeacherEarningHelperContracts(t *testing.T) {
	if hours, err := sessionDurationHours(earningSession(nil)); err != nil || hours != 1.5 {
		t.Fatalf("hours = %v, %v", hours, err)
	}
	if got := roundQuantity(1.23456789); got != 1.234568 {
		t.Fatalf("roundQuantity = %v", got)
	}
	if err := validateTeacherRule("lead", earningRule("lead-rule", nil)); err != nil {
		t.Fatal(err)
	}
	if snapshot, err := validateTeacherRuleSnapshot(earningSnapshot()); err != nil || snapshot["version"] != 4.0 {
		t.Fatalf("snapshot = %v, %v", snapshot, err)
	}
	if err := validateCancellationCompensation(map[string]any{"quantity": 0.5, "eligibleActualStatuses": []any{"confirmed"}}, "lead"); err != nil {
		t.Fatal(err)
	}
}

// Hono: courseCreditTeacherEarning › teacher rule validation rejects incomplete or unsafe snapshots
// calculateTeacherEarning's negative participant count has no Go counterpart: participants are counted
// from the roster and cannot be negative; zero duration is rejected by sessionDurationHours below.
func TestTeacherRuleValidationRejectsUnsafeSnapshots(t *testing.T) {
	compensation := func(policy any) map[string]any {
		return earningRule("x", map[string]any{"cancellationCompensation": policy})
	}
	snapshots := []struct {
		value any
		code  string
	}{
		{nil, "TEACHER_RULE_SNAPSHOT_REQUIRED"},
		{[]any{}, "TEACHER_RULE_SNAPSHOT_REQUIRED"},
		{map[string]any{"version": 0.0, "rules": map[string]any{"lead": earningRule("x", nil)}}, "TEACHER_RULE_VERSION_INVALID"},
		{map[string]any{"version": 1.0, "rules": map[string]any{}}, "TEACHER_RULES_REQUIRED"},
		{map[string]any{"version": 1.0, "rules": []any{}}, "TEACHER_RULES_REQUIRED"},
	}
	for _, item := range snapshots {
		_, err := validateTeacherRuleSnapshot(item.value)
		failsWith(t, err, item.code)
	}
	rules := []struct {
		role  string
		value any
		code  string
	}{
		{"unknown", earningRule("x", nil), "INVALID_TEACHER_ROLE"},
		{"lead", nil, "TEACHER_RULE_INVALID"},
		{"lead", earningRule("", nil), "TEACHER_RULE_ID_REQUIRED"},
		{"lead", earningRule("x", map[string]any{"courseSpecId": ""}), "TEACHER_RULE_COURSE_REQUIRED"},
		{"lead", earningRule("x", map[string]any{"durationFactor": -1.0}), "TEACHER_RULE_FACTOR_INVALID"},
		{"lead", compensation([]any{}), "TEACHER_CANCELLATION_POLICY_INVALID"},
		{"lead", compensation(map[string]any{"quantity": 0.0, "eligibleActualStatuses": []any{"confirmed"}}), "TEACHER_CANCELLATION_QUANTITY_INVALID"},
		{"lead", compensation(map[string]any{"quantity": 0.0000001, "eligibleActualStatuses": []any{"confirmed"}}), "TEACHER_CANCELLATION_QUANTITY_INVALID"},
		{"lead", compensation(map[string]any{"quantity": 1.0, "eligibleActualStatuses": []any{}}), "TEACHER_CANCELLATION_STATUSES_REQUIRED"},
		{"lead", compensation(map[string]any{"quantity": 1.0, "eligibleActualStatuses": []any{"confirmed", "confirmed"}}), "TEACHER_CANCELLATION_STATUS_INVALID"},
		{"lead", compensation(map[string]any{"quantity": 1.0, "eligibleActualStatuses": []any{"unknown"}}), "TEACHER_CANCELLATION_STATUS_INVALID"},
	}
	for _, item := range rules {
		failsWith(t, validateTeacherRule(item.role, item.value), item.code)
	}
	zero := earningSession(map[string]any{"teacherRuleSnapshot": map[string]any{"version": 1.0, "rules": map[string]any{
		"lead": earningRule("x", map[string]any{"baseQuantity": 0.0, "durationFactor": 0.0, "participantFactor": 0.0})}}})
	_, err := planTeacherEarnings(zero, []map[string]any{earningTeacher("lead", "lead", "confirmed")}, nil, "course-spec")
	failsWith(t, err, "TEACHER_EARNING_NOT_POSITIVE")
	_, err = sessionDurationHours(earningSession(map[string]any{"endAt": "2026-08-10T10:00:00.000Z"}))
	failsWith(t, err, "SESSION_DURATION_INVALID")
}

// Hono: courseCreditTeacherEarning › teacher planning rejects missing lead, role rule, and course mismatch
func TestTeacherPlanningRejectsMissingLeadRuleAndCourse(t *testing.T) {
	confirmedLead := []map[string]any{earningTeacher("lead", "lead", "confirmed")}
	_, err := planTeacherEarnings(earningSession(nil), []map[string]any{earningTeacher("assistant", "assistant", "confirmed")}, nil, "course-spec")
	failsWith(t, err, "SESSION_CONFIRMED_LEAD_REQUIRED")
	_, err = planTeacherEarnings(earningSession(map[string]any{"teacherRuleSnapshot": map[string]any{
		"version": 1.0, "rules": map[string]any{"lead": earningRule("lead", nil)}}}),
		append(confirmedLead, earningTeacher("assistant", "assistant", "confirmed")), nil, "course-spec")
	failsWith(t, err, "TEACHER_RULE_NOT_FOUND")
	_, err = planTeacherEarnings(earningSession(map[string]any{"teacherRuleSnapshot": map[string]any{
		"version": 1.0, "rules": map[string]any{"lead": earningRule("lead", map[string]any{"courseSpecId": "other"})}}}),
		confirmedLead, nil, "course-spec")
	failsWith(t, err, "TEACHER_RULE_COURSE_MISMATCH")
	_, err = planTeacherEarnings(earningSession(map[string]any{"status": "cancelled", "teacherRuleSnapshot": map[string]any{
		"version": 1.0, "rules": map[string]any{"lead": earningRule("lead", map[string]any{"courseSpecId": "other",
			"cancellationCompensation": map[string]any{"quantity": 1.0, "eligibleActualStatuses": []any{"confirmed"}}})}}}),
		confirmedLead, nil, "course-spec")
	failsWith(t, err, "TEACHER_RULE_COURSE_MISMATCH")
}
