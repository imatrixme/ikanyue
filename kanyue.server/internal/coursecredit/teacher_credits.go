package coursecredit

import (
	"slices"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/records"
)

// Teacher workload: Hono's teacher-event queries and CourseCreditTeacherCreditService.
// Settlement writes the pending earnings; finance confirms them here.

// listTeacherEvents pages in memory because the pending queue hides earnings that
// a later confirmation or reversal already resolved.
func listTeacherEvents(app core.App, query map[string]string) (any, error) {
	pageNumber, perPage, err := pagination(query)
	if err != nil {
		return nil, err
	}
	config := resources["teacherEvents"]
	status := query["status"]
	if status != "" && !slices.Contains(config.statuses, status) {
		return nil, Fail("OPS_FILTER_STATUS_INVALID", "Resource status filter is invalid", nil)
	}
	filters := []string{}
	for _, field := range config.filterFields {
		if value := query[field]; value != "" {
			filters = append(filters, field+`="`+records.EscapeFilter(value)+`"`)
		}
	}
	events, err := list(app, config.collection, strings.Join(filters, " && "), config.sort)
	if err != nil {
		return nil, err
	}
	resolved := map[string]bool{}
	for _, event := range events {
		for _, key := range []string{"confirmationOfEventId", "reversalOfEventId"} {
			if id := relationID(event[key]); id != "" {
				resolved[id] = true
			}
		}
	}
	visible := []any{}
	for _, event := range events {
		if status == "pending" {
			if event["status"] != "pending" || !slices.Contains([]any{"earn", "compensate"}, event["eventType"]) || resolved[jsx.String(event["id"])] {
				continue
			}
		} else if status != "" && event["status"] != status {
			continue
		}
		visible = append(visible, project(event, config.fields, config.rawFields))
	}
	return arrayPage(visible, pageNumber, perPage), nil
}

// assignedTeacherEvent lets a teacher read only their own events; admins read any.
func assignedTeacherEvent(app core.App, user auth.Claims, id string) (any, error) {
	event, err := getResource(app, "teacherEvents", id)
	if err != nil {
		return nil, err
	}
	if user["isAdmin"] != true && relationID(event["teacherId"]) != auth.ClaimString(user, "id") {
		return nil, Fail("TEACHER_EVENT_FORBIDDEN", "教师只能查看本人的工作量记录", nil)
	}
	return event, nil
}

// confirmTeacherCredit appends a confirmation event for a pending earning and
// marks its assignment confirmed, in one teaching command.
func confirmTeacherCredit(app core.App, input map[string]any) (map[string]any, error) {
	if err := validateTeacherCreditCommand(input); err != nil {
		return nil, err
	}
	eventID := text(input, "teacherCreditEventId")
	request := map[string]any{"reason": strings.TrimSpace(text(input, "reason")), "teacherCreditEventId": eventID}
	t, err := prepareTeaching(app, "confirmTeacherCredit", input, request)
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	earning, err := get(app, "teacher_credit_events", eventID)
	if err != nil {
		return nil, err
	}
	if err := validatePendingEarning(earning); err != nil {
		return nil, err
	}
	escaped := records.EscapeFilter(jsx.String(earning["id"]))
	if confirmation, err := findFirst(app, "teacher_credit_events", `confirmationOfEventId="`+escaped+`"`); err != nil {
		return nil, err
	} else if confirmation != nil {
		return nil, Fail("TEACHER_CREDIT_ALREADY_CONFIRMED", "Teacher earning already has a confirmation event", nil)
	}
	if reversal, err := findFirst(app, "teacher_credit_events", `reversalOfEventId="`+escaped+`"`); err != nil {
		return nil, err
	} else if reversal != nil {
		return nil, Fail("TEACHER_CREDIT_REVERSED", "Reversed teacher earning cannot be confirmed", nil)
	}
	assignment, err := get(app, "session_teachers", jsx.String(earning["sessionTeacherId"]))
	if err != nil {
		return nil, err
	}
	if err := validateTeacherAssignment(assignment, earning); err != nil {
		return nil, err
	}

	confirmationID := ids.Record()
	quantity := jsx.Number(earning["quantityDelta"])
	result := map[string]any{
		"confirmationEventId": confirmationID,
		"earningEventId":      earning["id"],
		"operationId":         t.operationID,
		"quantity":            quantity,
		"sessionTeacherId":    assignment["id"],
		"teacherId":           earning["teacherId"],
	}
	return t.commit(app, []step{
		t.operation(input, "confirm_teacher_credit", "teacher_credit_event", earning["id"], "", request, result),
		create("teacher_credit_events", map[string]any{
			"id": confirmationID, "sessionTeacherId": earning["sessionTeacherId"], "teacherId": earning["teacherId"],
			"ruleId": or(earning["ruleId"], ""), "eventType": "confirm", "quantityDelta": quantity, "status": "confirmed",
			"operationId": t.operationID, "confirmationOfEventId": earning["id"], "reason": request["reason"],
		}),
		update("session_teachers", jsx.String(assignment["id"]), map[string]any{"creditStatus": "confirmed"}),
		outbox("course-credit.teacher-credit-confirmed", "teacher_credit_event", jsx.String(earning["id"]), result),
	}, result)
}

func validateTeacherCreditCommand(input map[string]any) error {
	if text(input, "teacherCreditEventId") == "" {
		return Fail("TEACHER_CREDIT_EVENT_ID_REQUIRED", "teacherCreditEventId is required", nil)
	}
	if input["actorRole"] != "admin" {
		return Fail("TEACHER_CREDIT_CONFIRM_FORBIDDEN", "Only an authorized administrator can confirm teacher credit", nil)
	}
	if reason, ok := input["reason"].(string); !ok || jsx.Length(strings.TrimSpace(reason)) < 4 {
		return Fail("TEACHER_CREDIT_CONFIRM_REASON_REQUIRED", "Teacher credit confirmation requires a meaningful reason", nil)
	}
	return nil
}

func validatePendingEarning(event map[string]any) error {
	if !slices.Contains([]any{"earn", "compensate"}, event["eventType"]) || event["status"] != "pending" {
		return Fail("TEACHER_CREDIT_NOT_PENDING", "Only a pending teacher earning can be confirmed", nil)
	}
	if quantity := jsx.Number(event["quantityDelta"]); !jsx.IsFinite(quantity) || quantity <= 0 {
		return Fail("TEACHER_CREDIT_QUANTITY_INVALID", "Pending teacher earning quantity must be positive", nil)
	}
	if text(event, "sessionTeacherId") == "" || text(event, "teacherId") == "" {
		return Fail("TEACHER_CREDIT_RELATION_INVALID", "Pending teacher earning must identify its teacher assignment", nil)
	}
	return nil
}

func validateTeacherAssignment(assignment, earning map[string]any) error {
	if assignment["id"] != earning["sessionTeacherId"] || assignment["teacherId"] != earning["teacherId"] {
		return Fail("TEACHER_CREDIT_ASSIGNMENT_MISMATCH", "Teacher earning does not match its session assignment", nil)
	}
	if assignment["creditStatus"] != "pending" {
		return Fail("TEACHER_CREDIT_ASSIGNMENT_NOT_PENDING", "Teacher assignment is not pending confirmation", nil)
	}
	return nil
}
