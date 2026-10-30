package coursecredit

import (
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
)

// Substitution moves a lesson to another teacher without touching its students:
// the replaced lead row is kept as cancelled and the new teacher joins as a
// planned substitute, so the original assignment stays on record. A handover
// substitutes every unsettled lesson of a leaving teacher and closes their account.

// teachingRow selects session_teachers rows of someone who teaches (not replaced, not absent).
const teachingRow = `(actualStatus="planned" || actualStatus="confirmed")`

// handoverLessonLimit keeps a handover inside one transaction.
const handoverLessonLimit = 500

// substitutableStatuses are unsettled lessons a teacher can still be confirmed on.
var substitutableStatuses = []string{"scheduled", "enrollment_closed", "in_progress", "completed", "correction_pending"}

func substitutableFilter() string {
	parts := make([]string, len(substitutableStatuses))
	for i, status := range substitutableStatuses {
		parts[i] = `sessionId.status="` + status + `"`
	}
	return "(" + strings.Join(parts, " || ") + `) && sessionId.originType!="migration"`
}

// substituteTeacher replaces a lesson's lead teacher with another active teacher.
func substituteTeacher(app core.App, input map[string]any) (map[string]any, error) {
	if err := first(
		requiredID(input, "sessionId", "SESSION_ID_REQUIRED", "编号不能为空"),
		requiredID(input, "teacherId", "TEACHER_ID_REQUIRED", "请选择代课老师"),
	); err != nil {
		return nil, err
	}
	sessionID, toTeacherID := text(input, "sessionId"), text(input, "teacherId")
	t, err := prepareTeaching(app, "substituteTeacher", input, map[string]any{
		"sessionId": sessionID, "teacherId": toTeacherID, "reason": or(input["reason"], ""),
	})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	session, err := get(app, "sessions", sessionID)
	if err != nil {
		return nil, err
	}
	switch {
	case session["status"] == "settled":
		return nil, Fail("SESSION_ALREADY_SETTLED", "这节课已经确认过了，请先撤销确认再换老师", nil)
	case !slices.Contains(substitutableStatuses, jsx.String(session["status"])) || session["originType"] == "migration":
		return nil, Fail("SESSION_NOT_EDITABLE", "这节课当前不能换老师", nil)
	}
	if err := activeTeacher(app, toTeacherID); err != nil {
		return nil, err
	}
	rows, err := list(app, "session_teachers", `sessionId="`+escape(sessionID)+`"`, "role,id")
	if err != nil {
		return nil, err
	}
	// Leads who teach (planned or confirmed) are replaced; an absent lead stays on record as absent.
	var replaced []map[string]any
	var reused map[string]any
	for _, row := range rows {
		teaches := row["actualStatus"] == "planned" || row["actualStatus"] == "confirmed"
		if row["role"] == "lead" && teaches {
			replaced = append(replaced, row)
		}
		if relationID(row["teacherId"]) != toTeacherID {
			continue
		}
		switch {
		case row["role"] == "lead" && teaches:
			return nil, Fail("SUBSTITUTE_SAME_TEACHER", "这节课已经由这位老师上", nil)
		case row["role"] == "lead":
			reused = row
		case row["actualStatus"] != "cancelled":
			return nil, Fail("SUBSTITUTE_TEACHER_ASSIGNED", "这位老师已在这节课上", nil)
		}
	}
	if busy, err := teacherBusy(app, toTeacherID, session); err != nil || busy != nil {
		if err == nil {
			err = Fail("SUBSTITUTE_TEACHER_BUSY", "这位老师在这个时间已有课", busy)
		}
		return nil, err
	}
	fromTeacherID, creditStatus := "", any("pending")
	for _, row := range replaced {
		if fromTeacherID == "" {
			fromTeacherID, creditStatus = relationID(row["teacherId"]), row["creditStatus"]
		}
	}
	// Calendar cells of every lead no longer teaching (replaced or absent) go to the substitute.
	owners := []string{}
	for _, row := range rows {
		if id := relationID(row["teacherId"]); row["role"] == "lead" && row["actualStatus"] != "cancelled" && id != toTeacherID {
			owners = append(owners, id)
		}
	}
	claims := []map[string]any{}
	if len(owners) > 0 {
		if claims, err = list(app, "schedule_claims", `sourceType="session" && sourceId="`+escape(sessionID)+
			`" && ownerType="teacher" && `+anyFilter("ownerId", owners)+` && status="active"`, "ownerId,cellStartAt"); err != nil {
			return nil, err
		}
	}
	result := map[string]any{"operationId": t.operationID, "sessionId": sessionID,
		"fromTeacherId": fromTeacherID, "toTeacherId": toTeacherID}
	version := positiveVersion(session["version"])
	plan := []step{
		t.operation(input, "adjust", "session_teacher", sessionID, nil,
			map[string]any{"sessionId": sessionID, "fromTeacherId": fromTeacherID, "toTeacherId": toTeacherID}, result),
		versionClaim("session", sessionID, version, t.operationID),
		update("sessions", sessionID, map[string]any{"version": version + 1}),
	}
	for _, row := range replaced {
		plan = append(plan, update("session_teachers", jsx.String(row["id"]), map[string]any{"actualStatus": "cancelled"}))
	}
	if reused != nil {
		plan = append(plan, update("session_teachers", jsx.String(reused["id"]),
			map[string]any{"actualStatus": "planned", "assignmentSource": "substitute"}))
	} else {
		// Earnings are settled later either way, so a fresh row starts unsettled.
		if creditStatus == "confirmed" || creditStatus == "reversed" {
			creditStatus = "pending"
		}
		plan = append(plan, create("session_teachers", map[string]any{"id": ids.Record(), "sessionId": sessionID, "teacherId": toTeacherID,
			"role": "lead", "assignmentSource": "substitute", "actualStatus": "planned", "creditStatus": creditStatus}))
	}
	// The replaced teacher's calendar cells move to the substitute, so they cannot be booked twice.
	plan = append(plan, releaseClaimPlan(claims, t.at, t.operationID)...)
	moved := map[string]bool{}
	for _, claim := range claims {
		cell := jsx.String(claim["cellStartAt"])
		if moved[cell] {
			continue
		}
		moved[cell] = true
		copied := map[string]any{}
		for _, field := range []string{"ownerType", "cellStartAt", "cellEndAt", "sourceType", "sourceId", "appointmentId"} {
			copied[field] = claim[field]
		}
		copied["id"], copied["ownerId"], copied["status"], copied["releasedAt"], copied["version"] = ids.Record(), toTeacherID, "active", "", 1
		plan = append(plan, create("schedule_claims", copied))
	}
	plan = append(plan,
		lessonAudit(input, sessionID, "substitute_teacher", map[string]any{
			"fromTeacherId": fromTeacherID, "toTeacherId": toTeacherID, "reason": normalizeText(input["reason"], 200)}),
		outbox("course-session.teacher-substituted", "session", sessionID, result))
	committed, err := t.commit(app, plan, result)
	if err != nil {
		return nil, scheduleConflict(err, "SUBSTITUTE_TEACHER_BUSY")
	}
	return committed, nil
}

func activeTeacher(app core.App, teacherID string) error {
	teacher, err := get(app, "teachers", teacherID)
	if err != nil {
		return err
	}
	if !truthyFlag(teacher["verified"]) || truthyFlag(teacher["blocked"]) {
		return Fail("TEACHER_INACTIVE", "这位老师的账号未启用", nil)
	}
	return nil
}

// teacherBusy returns the first lesson or calendar block of teacherID overlapping session, if any.
func teacherBusy(app core.App, teacherID string, session map[string]any) (map[string]any, error) {
	sessionID := jsx.String(session["id"])
	rows, err := list(app, "session_teachers", `teacherId="`+escape(teacherID)+`" && `+teachingRow+` && sessionId!="`+
		escape(sessionID)+`" && sessionId.status!="cancelled" && sessionId.startAt<"`+escape(filterTime(session["endAt"]))+
		`" && sessionId.endAt>"`+escape(filterTime(session["startAt"]))+`"`, "sessionId.startAt", "sessionId")
	if err != nil {
		return nil, err
	}
	if len(rows) > 0 {
		other := expanded(rows[0], "sessionId")
		return map[string]any{"startAt": other["startAt"], "endAt": other["endAt"]}, nil
	}
	claims, err := scheduleClaims(app, "teacher", teacherID, jsx.String(session["startAt"]), jsx.String(session["endAt"]), sessionID)
	if err != nil || len(claims) == 0 {
		return nil, err
	}
	return map[string]any{"startAt": claims[0]["cellStartAt"], "endAt": claims[len(claims)-1]["cellEndAt"]}, nil
}

// ledLessons are the unsettled lessons teacherID leads, oldest first.
func ledLessons(app core.App, teacherID string) ([]map[string]any, error) {
	rows, err := list(app, "session_teachers", `teacherId="`+escape(teacherID)+`" && role="lead" && `+teachingRow+` && `+
		substitutableFilter(), "sessionId.startAt", "sessionId")
	if err != nil {
		return nil, err
	}
	sessions := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		sessions = append(sessions, expanded(row, "sessionId"))
	}
	return sessions, nil
}

// teacherLessons is the owner's view of one teacher's unsettled lessons.
func teacherLessons(app core.App, teacherID string, now time.Time) (map[string]any, error) {
	teacher, err := get(app, "teachers", teacherID)
	if err != nil {
		return nil, err
	}
	sessions, err := ledLessons(app, teacherID)
	if err != nil {
		return nil, err
	}
	items, err := lessonItems(app, limited(sessions), now)
	if err != nil {
		return nil, err
	}
	return map[string]any{"teacher": teacherCard(teacher), "items": items}, nil
}

func teacherCard(teacher map[string]any) map[string]any {
	return map[string]any{"teacherId": teacher["id"], "name": personName(teacher, "教师"), "isAdmin": truthyFlag(teacher["idAdmin"])}
}

// workbenchTeachers lists the studio's active teachers for the owner.
func workbenchTeachers(app core.App) (map[string]any, error) {
	teachers, err := list(app, "teachers", "blocked=false && verified=true", "created")
	if err != nil {
		return nil, err
	}
	items := make([]any, 0, len(teachers))
	for _, teacher := range teachers {
		id := jsx.String(teacher["id"])
		lessons, err := ledLessons(app, id)
		if err != nil {
			return nil, err
		}
		pending, err := listTeacherAppointments(app, id, pageQuery("pending", 1))
		if err != nil {
			return nil, err
		}
		card := teacherCard(teacher)
		card["lessonCount"], card["pendingRequestCount"] = len(lessons), pending["totalItems"]
		items = append(items, card)
	}
	return map[string]any{"items": items}, nil
}

// handover is what handing teacherID over to toTeacherID would do, computed fresh each time.
type handover struct {
	lessons, conflicts, otherRoles, requests, offerings []map[string]any
	students                                            []string
}

func planHandover(app core.App, input map[string]any) (*handover, error) {
	if err := first(
		requiredID(input, "teacherId", "TEACHER_ID_REQUIRED", "请选择离职老师"),
		requiredID(input, "toTeacherId", "HANDOVER_RECEIVER_REQUIRED", "请选择接手老师"),
	); err != nil {
		return nil, err
	}
	teacherID, toTeacherID := text(input, "teacherId"), text(input, "toTeacherId")
	if teacherID == toTeacherID {
		return nil, Fail("HANDOVER_RECEIVER_INVALID", "接手老师不能是离职老师本人", nil)
	}
	if teacherID == text(input, "actorId") {
		return nil, Fail("HANDOVER_SELF_FORBIDDEN", "不能交接自己的账号", nil)
	}
	leaving, err := get(app, "teachers", teacherID)
	if err != nil {
		return nil, err
	}
	if truthyFlag(leaving["idAdmin"]) {
		return nil, Fail("HANDOVER_ADMIN_FORBIDDEN", "管理员账号不能交接", nil)
	}
	if err := activeTeacher(app, toTeacherID); err != nil {
		return nil, err
	}
	plan := &handover{}
	if plan.lessons, err = ledLessons(app, teacherID); err != nil {
		return nil, err
	}
	if len(plan.lessons) > handoverLessonLimit {
		return nil, Fail("HANDOVER_TOO_LARGE", "要交接的课太多，请在网页后台分批处理", map[string]any{"lessonCount": len(plan.lessons)})
	}
	for _, session := range plan.lessons {
		busy, err := teacherBusy(app, toTeacherID, session)
		if err != nil {
			return nil, err
		}
		if busy != nil {
			plan.conflicts = append(plan.conflicts, session)
		}
	}
	if plan.otherRoles, err = list(app, "session_teachers", `teacherId="`+escape(teacherID)+`" && role!="lead" && `+teachingRow+` && `+
		substitutableFilter(), "id"); err != nil {
		return nil, err
	}
	if plan.requests, err = list(app, "appointment_requests", `teacherId="`+escape(teacherID)+`" && status="pending"`,
		"requestedStartAt", "studentId"); err != nil {
		return nil, err
	}
	if plan.offerings, err = list(app, "teacher_course_offerings", `teacherId="`+escape(teacherID)+`" && status="active"`,
		"created", "courseSpecId"); err != nil {
		return nil, err
	}
	studentIDs := []string{}
	for _, request := range plan.requests {
		studentIDs = append(studentIDs, relationID(request["studentId"]))
	}
	for _, session := range plan.lessons {
		roster, err := list(app, "session_students", `sessionId="`+escape(jsx.String(session["id"]))+`" && attendanceStatus!="cancelled"`, "")
		if err != nil {
			return nil, err
		}
		for _, row := range roster {
			studentIDs = append(studentIDs, relationID(row["studentId"]))
		}
	}
	plan.students = uniqueIDs(studentIDs)
	return plan, nil
}

// handoverPreview shows the owner what a handover would change, without writing.
func handoverPreview(app core.App, input map[string]any, now time.Time) (map[string]any, error) {
	plan, err := planHandover(app, input)
	if err != nil {
		return nil, err
	}
	lessons, err := lessonItems(app, plan.lessons, now)
	if err != nil {
		return nil, err
	}
	conflicts, err := lessonItems(app, plan.conflicts, now)
	if err != nil {
		return nil, err
	}
	requests := make([]any, len(plan.requests))
	for i, request := range plan.requests {
		requests[i] = map[string]any{"appointmentId": request["id"], "student": personName(expanded(request, "studentId"), "学员"),
			"startAt": request["requestedStartAt"], "endAt": request["requestedEndAt"]}
	}
	received, err := list(app, "teacher_course_offerings", `teacherId="`+escape(text(input, "toTeacherId"))+`" && status="active"`, "")
	if err != nil {
		return nil, err
	}
	offerings := make([]any, len(plan.offerings))
	for i, offering := range plan.offerings {
		course := relationID(offering["courseSpecId"])
		offered := slices.ContainsFunc(received, func(item map[string]any) bool { return relationID(item["courseSpecId"]) == course })
		offerings[i] = map[string]any{"courseName": or(expanded(offering, "courseSpecId")["name"], "课程"), "receiverOffers": offered}
	}
	names := []any{}
	for _, id := range plan.students {
		if student, err := get(app, "students", id); err == nil {
			names = append(names, personName(student, "学员"))
		}
	}
	return map[string]any{"lessons": lessons, "conflicts": conflicts, "otherRoleCount": len(plan.otherRoles),
		"pendingRequests": requests, "offerings": offerings, "students": names}, nil
}

// handoverTeacher substitutes the leaving teacher's lessons, declines their pending
// requests, closes their booking and blocks the account, all or nothing.
func handoverTeacher(app core.App, input map[string]any) (map[string]any, error) {
	if reason, ok := input["reason"].(string); !ok || jsx.Length(strings.TrimSpace(reason)) < 4 {
		return nil, Fail("HANDOVER_REASON_REQUIRED", "请填写交接原因（至少 4 个字）", nil)
	}
	teacherID, toTeacherID := text(input, "teacherId"), text(input, "toTeacherId")
	t, err := prepareTeaching(app, "handoverTeacher", input, map[string]any{
		"teacherId": teacherID, "toTeacherId": toTeacherID, "reason": input["reason"],
	})
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	key := strings.TrimSpace(text(input, "idempotencyKey"))
	stepInput := func(name string, values map[string]any) map[string]any {
		next := map[string]any{"idempotencyKey": key + ":" + name, "actorId": input["actorId"], "actorRole": input["actorRole"],
			"traceId": input["traceId"], "reason": input["reason"]}
		for field, value := range values {
			next[field] = value
		}
		return next
	}
	var result map[string]any
	err = app.RunInTransaction(func(tx core.App) error {
		plan, err := planHandover(tx, input)
		if err != nil {
			return err
		}
		if len(plan.conflicts) > 0 {
			conflicts := make([]any, len(plan.conflicts))
			for i, session := range plan.conflicts {
				conflicts[i] = map[string]any{"sessionId": session["id"], "startAt": session["startAt"], "endAt": session["endAt"]}
			}
			return Fail("HANDOVER_CONFLICTS", "接手老师有课时间冲突，请先单独调整这些课", map[string]any{"conflicts": conflicts})
		}
		for _, session := range plan.lessons {
			id := jsx.String(session["id"])
			if _, err := substituteTeacher(tx, stepInput("lesson:"+id, map[string]any{"sessionId": id, "teacherId": toTeacherID})); err != nil {
				return err
			}
		}
		for _, request := range plan.requests {
			id := jsx.String(request["id"])
			if _, err := declineAppointment(tx, stepInput("decline:"+id, map[string]any{
				"appointmentId": id, "actorRole": "admin", "reason": "老师已调整，请重新预约"})); err != nil {
				return err
			}
		}
		result = map[string]any{"operationId": t.operationID, "teacherId": teacherID, "toTeacherId": toTeacherID,
			"lessonCount": len(plan.lessons), "otherRoleCount": len(plan.otherRoles), "declinedCount": len(plan.requests),
			"offeringCount": len(plan.offerings), "studentCount": len(plan.students)}
		steps := []step{t.operation(input, "adjust", "teacher_handover", teacherID, nil,
			map[string]any{"teacherId": teacherID, "toTeacherId": toTeacherID}, result)}
		for _, row := range plan.otherRoles {
			steps = append(steps, update("session_teachers", jsx.String(row["id"]), map[string]any{"actualStatus": "cancelled"}))
		}
		for _, offering := range plan.offerings {
			version := positiveVersion(offering["version"])
			steps = append(steps, update("teacher_course_offerings", jsx.String(offering["id"]),
				map[string]any{"status": "inactive", "version": version + 1}))
		}
		rules, err := list(tx, "teacher_availability_rules", `teacherId="`+escape(teacherID)+`" && status="active"`, "id")
		if err != nil {
			return err
		}
		for _, rule := range rules {
			version := positiveVersion(rule["version"])
			id := jsx.String(rule["id"])
			steps = append(steps, versionClaim("availability_rule", id, version, t.operationID),
				update("teacher_availability_rules", id, map[string]any{"effectiveTo": t.at, "status": "inactive", "version": version + 1}))
		}
		steps = append(steps,
			update("teachers", teacherID, map[string]any{"blocked": true}),
			create("ops_audit_logs", map[string]any{"id": ids.Record(), "actorId": input["actorId"], "actorRole": or(input["actorRole"], "admin"),
				"action": "course_operations.teacher.handover", "resourceType": "teacher", "resourceId": teacherID,
				"outcome": "success", "metadata": map[string]any{"toTeacherId": toTeacherID, "reason": normalizeText(input["reason"], 200),
					"lessonCount": len(plan.lessons), "declinedCount": len(plan.requests)}}),
			outbox("teacher.handed-over", "teacher", teacherID, result))
		committed, err := t.commit(tx, steps, result)
		result = committed
		return err
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
