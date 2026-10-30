package coursecredit

import (
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/jsx"
)

// Hono's CourseBookingQueryService and BookingOpsQueryService.

var (
	appointmentExpand = []string{"studentId", "teacherId", "offeringId", "courseSpecId", "sessionId"}
	opsExpand         = []string{"studentId", "teacherId", "offeringId", "courseSpecId", "creditTypeId", "policyId", "sessionId"}
)

// mappedPage is mapPage: a PocketBase page with projected items.
func mappedPage(result page, project func(map[string]any) map[string]any) map[string]any {
	items := make([]any, len(result.Items))
	for i, item := range result.Items {
		items[i] = project(item)
	}
	return map[string]any{"page": result.Page, "perPage": result.PerPage, "totalItems": result.TotalItems,
		"totalPages": result.TotalPages, "items": items}
}

func identity(record map[string]any) map[string]any { return record }

func requiredBookingID(value, code string) error {
	if value == "" {
		return Fail(code, "编号不能为空", nil)
	}
	return nil
}

// statusFilter is appendStatusFilter: a comma-separated status list of at most ten.
func statusFilter(filters []string, value string) ([]string, error) {
	if value == "" {
		return filters, nil
	}
	statuses := []string{}
	for _, status := range strings.Split(value, ",") {
		if status != "" {
			statuses = append(statuses, `status="`+escape(status)+`"`)
		}
	}
	if len(statuses) > 10 {
		return nil, Fail("BOOKING_STATUS_FILTER_INVALID", "预约状态筛选无效", nil)
	}
	if len(statuses) == 1 {
		return append(filters, statuses[0]), nil
	}
	return append(filters, "("+strings.Join(statuses, " || ")+")"), nil
}

func relationFilter(filters []string, field, value string) []string {
	if value == "" {
		return filters
	}
	return append(filters, field+`="`+escape(value)+`"`)
}

// appointmentPage pages appointment_requests under extra filters.
func appointmentPage(app core.App, query map[string]string, filters []string, sort string, expand []string,
	project func(map[string]any) map[string]any) (map[string]any, error) {
	pageNumber, perPage, err := pagination(query)
	if err != nil {
		return nil, err
	}
	if filters, err = statusFilter(filters, query["status"]); err != nil {
		return nil, err
	}
	result, err := pageOf(app, "appointment_requests", strings.Join(filters, " && "), sort, pageNumber, perPage, expand...)
	if err != nil {
		return nil, err
	}
	if err := withCurrentLead(app, result.Items...); err != nil {
		return nil, err
	}
	return mappedPage(result, project), nil
}

// withCurrentLead names the lesson's current lead teacher on appointments that
// became lessons, so a substituted lesson shows who actually teaches it.
// appointment.teacherId itself stays the teacher the student booked.
func withCurrentLead(app core.App, records ...map[string]any) error {
	sessionIDs := []string{}
	for _, record := range records {
		if id := relationID(record["sessionId"]); id != "" {
			sessionIDs = append(sessionIDs, id)
		}
	}
	sessionIDs = uniqueIDs(sessionIDs)
	leads := map[string]map[string]any{}
	for start := 0; start < len(sessionIDs); start += relationChunkSize {
		chunk := sessionIDs[start:min(start+relationChunkSize, len(sessionIDs))]
		rows, err := list(app, "session_teachers", anyFilter("sessionId", chunk)+` && role="lead" && `+teachingRow, "", "teacherId")
		if err != nil {
			return err
		}
		for _, row := range rows {
			leads[relationID(row["sessionId"])] = row
		}
	}
	for _, record := range records {
		lead, ok := leads[relationID(record["sessionId"])]
		if !ok || relationID(lead["teacherId"]) == relationID(record["teacherId"]) {
			continue
		}
		expand, _ := record["expand"].(map[string]any)
		expand = copyMap(expand)
		expand["teacherId"] = expanded(lead, "teacherId")
		record["expand"], record["teacherId"] = expand, lead["teacherId"]
	}
	return nil
}

func pageQuery(status string, perPage int) map[string]string {
	return map[string]string{"status": status, "page": "1", "perPage": strconv.Itoa(perPage)}
}

// relatedRecord is the expanded relation, or the record fetched by id.
func relatedRecord(app core.App, record map[string]any, field, collection string) (map[string]any, error) {
	if value := expanded(record, field); value["id"] != nil {
		return value, nil
	}
	return get(app, collection, relationID(record[field]))
}

// studentBookingOptions lists active offerings for courses the student holds course credit for.
func studentBookingOptions(app core.App, studentID, courseID string) ([]any, error) {
	if err := requiredBookingID(studentID, "BOOKING_STUDENT_REQUIRED"); err != nil {
		return nil, err
	}
	batches, err := list(app, "credit_batches",
		`studentId="`+escape(studentID)+`" && availableQuantity>0 && creditTypeId.kind="course"`,
		"effectiveExpiresAt,priority,created", "creditTypeId", "creditTypeId.courseSpecId")
	if err != nil {
		return nil, err
	}
	courseIDs := map[string]bool{}
	for _, batch := range batches {
		creditType := expanded(batch, "creditTypeId")
		id := relationID(creditType["courseSpecId"])
		if course := expanded(creditType, "courseSpecId"); course["id"] != nil {
			id = jsx.String(course["id"])
		}
		if id != "" {
			courseIDs[id] = true
		}
	}
	if courseID != "" {
		if !courseIDs[courseID] {
			return nil, Fail("BOOKING_COURSE_NOT_ELIGIBLE", "当前课程没有可预约课时", nil)
		}
		courseIDs = map[string]bool{courseID: true}
	}
	options := []any{}
	if len(courseIDs) == 0 {
		return options, nil
	}
	offerings, err := list(app, "teacher_course_offerings", `status="active"`, "courseSpecId,teacherId", "teacherId", "courseSpecId", "policyId")
	if err != nil {
		return nil, err
	}
	for _, offering := range offerings {
		if courseIDs[relationID(offering["courseSpecId"])] {
			options = append(options, bookingOption(offering))
		}
	}
	return options, nil
}

func scheduleClaims(app core.App, ownerType, ownerID, from, to, excludeSourceID string) ([]map[string]any, error) {
	filter := `ownerType="` + ownerType + `" && ownerId="` + escape(ownerID) + `" && status="active"` +
		` && cellStartAt<"` + escape(filterTime(to)) + `" && cellEndAt>"` + escape(filterTime(from)) + `"`
	if excludeSourceID != "" {
		filter += ` && sourceId!="` + escape(excludeSourceID) + `"`
	}
	return list(app, "schedule_claims", filter, "cellStartAt")
}

// availableSlots lists an offering's open slots the student can pay for, given both calendars.
func availableSlots(app core.App, studentID string, query map[string]string) (map[string]any, error) {
	if err := requiredBookingID(studentID, "BOOKING_STUDENT_REQUIRED"); err != nil {
		return nil, err
	}
	if err := requiredBookingID(query["offeringId"], "BOOKING_OFFERING_REQUIRED"); err != nil {
		return nil, err
	}
	offering, err := get(app, "teacher_course_offerings", query["offeringId"], "teacherId", "courseSpecId", "creditTypeId", "policyId")
	if err != nil {
		return nil, err
	}
	if offering["status"] != "active" {
		return nil, Fail("BOOKING_OFFERING_INACTIVE", "该教师暂未开放预约", nil)
	}
	course, err := relatedRecord(app, offering, "courseSpecId", "course_specs")
	if err != nil {
		return nil, err
	}
	creditType, err := relatedRecord(app, offering, "creditTypeId", "credit_types")
	if err != nil {
		return nil, err
	}
	policyRecord, err := relatedRecord(app, offering, "policyId", "booking_policies")
	if err != nil {
		return nil, err
	}
	teacherID := relationID(offering["teacherId"])
	rules, err := list(app, "teacher_availability_rules", `teacherId="`+escape(teacherID)+`" && status="active"`, "weekday,startMinute")
	if err != nil {
		return nil, err
	}
	overrides, err := list(app, "teacher_availability_overrides", `teacherId="`+escape(teacherID)+`" && status="active"`, "startAt")
	if err != nil {
		return nil, err
	}
	teacherClaims, err := scheduleClaims(app, "teacher", teacherID, query["from"], query["to"], query["excludeSourceId"])
	if err != nil {
		return nil, err
	}
	studentClaims, err := scheduleClaims(app, "student", studentID, query["from"], query["to"], query["excludeSourceId"])
	if err != nil {
		return nil, err
	}
	creditTypeID := relationID(offering["creditTypeId"])
	batches, err := list(app, "credit_batches", bookingBatchFilter(studentID, creditTypeID), fefoSort)
	if err != nil {
		return nil, err
	}
	if creditType["kind"] != "course" || creditType["consumable"] != true {
		return nil, Fail("BOOKING_CREDIT_TYPE_INVALID", "预约课程配置无效", nil)
	}
	policy, err := normalizeBookingPolicy(policyRecord)
	if err != nil {
		return nil, err
	}
	offeringRules := []map[string]any{}
	for _, rule := range rules {
		if id := relationID(rule["offeringId"]); id == "" || id == offering["id"] {
			offeringRules = append(offeringRules, rule)
		}
	}
	now := clock()
	slots, err := generateAvailableSlots(slotQuery{
		policy: policy, durationMinutes: jsx.Number(jsx.Get(course, "durationMinutes")), now: now.UnixMilli(),
		from: query["from"], to: query["to"], availabilityMode: offering["availabilityMode"],
		rules: offeringRules, overrides: overrides, claims: append(teacherClaims, studentClaims...),
		eligible: func(startAt string) (bool, error) {
			plan, err := planReservation(batches, 1, reservationContext{creditType: creditType, now: iso(now),
				creditTypeID: creditTypeID, sessionStart: startAt})
			return err == nil && plan.missing == 0, err
		},
	})
	if err != nil {
		return nil, err
	}
	withCourse := copyMap(offering)
	expand, _ := offering["expand"].(map[string]any)
	expand = copyMap(expand)
	expand["courseSpecId"] = course
	withCourse["expand"] = expand
	return map[string]any{"offering": bookingOption(withCourse), "slots": slots}, nil
}

func listStudentAppointments(app core.App, studentID string, query map[string]string) (map[string]any, error) {
	return appointmentPage(app, query, []string{`studentId="` + escape(studentID) + `"`}, "-requestedStartAt", appointmentExpand, studentAppointment)
}

func listTeacherAppointments(app core.App, teacherID string, query map[string]string) (map[string]any, error) {
	return appointmentPage(app, query, []string{`teacherId="` + escape(teacherID) + `"`}, "requestedStartAt", appointmentExpand, teacherAppointment)
}

func getStudentAppointment(app core.App, studentID, appointmentID string) (map[string]any, error) {
	record, err := get(app, "appointment_requests", appointmentID, appointmentExpand...)
	if err != nil {
		return nil, err
	}
	if relationID(record["studentId"]) != studentID {
		return nil, Fail("APPOINTMENT_STUDENT_FORBIDDEN", "不能查看其他学员的预约", nil)
	}
	if err := withCurrentLead(app, record); err != nil {
		return nil, err
	}
	return studentAppointment(record), nil
}

func getTeacherAppointment(app core.App, teacherID, appointmentID string) (map[string]any, error) {
	record, err := get(app, "appointment_requests", appointmentID, appointmentExpand...)
	if err != nil {
		return nil, err
	}
	if relationID(record["teacherId"]) != teacherID {
		return nil, Fail("APPOINTMENT_TEACHER_FORBIDDEN", "不能查看其他教师的预约", nil)
	}
	if err := withCurrentLead(app, record); err != nil {
		return nil, err
	}
	return teacherAppointment(record), nil
}

func teacherBookingDashboard(app core.App, teacherID string) (map[string]any, error) {
	pending, err := listTeacherAppointments(app, teacherID, pageQuery("pending", 5))
	if err != nil {
		return nil, err
	}
	confirmed, err := listTeacherAppointments(app, teacherID, pageQuery("confirmed,rescheduled", 8))
	if err != nil {
		return nil, err
	}
	offerings, err := list(app, "teacher_course_offerings", `teacherId="`+escape(teacherID)+`" && status="active"`,
		"courseSpecId", "teacherId", "courseSpecId")
	if err != nil {
		return nil, err
	}
	options := make([]any, len(offerings))
	for i, offering := range offerings {
		options[i] = bookingOption(offering)
	}
	return map[string]any{"pending": pending["items"], "confirmed": confirmed["items"], "pendingCount": pending["totalItems"],
		"offerings": options}, nil
}

func teacherAvailability(app core.App, teacherID, offeringID string) (map[string]any, error) {
	offering, err := get(app, "teacher_course_offerings", offeringID, "courseSpecId", "policyId")
	if err != nil {
		return nil, err
	}
	if relationID(offering["teacherId"]) != teacherID {
		return nil, Fail("BOOKING_OFFERING_FORBIDDEN", "不能查看其他教师的可预约时间", nil)
	}
	policyRecord, err := relatedRecord(app, offering, "policyId", "booking_policies")
	if err != nil {
		return nil, err
	}
	scope := `teacherId="` + escape(teacherID) + `" && offeringId="` + escape(offeringID) + `" && status="active"`
	rules, err := list(app, "teacher_availability_rules", scope, "weekday,startMinute")
	if err != nil {
		return nil, err
	}
	overrides, err := list(app, "teacher_availability_overrides", scope, "startAt")
	if err != nil {
		return nil, err
	}
	policy, err := normalizeBookingPolicy(policyRecord)
	if err != nil {
		return nil, err
	}
	ruleItems := make([]any, len(rules))
	for i, rule := range rules {
		ruleItems[i] = map[string]any{"id": rule["id"], "weekday": jsx.Number(rule["weekday"]),
			"startMinute": jsx.Number(rule["startMinute"]), "endMinute": jsx.Number(rule["endMinute"]),
			"effectiveFrom": rule["effectiveFrom"], "effectiveTo": or(rule["effectiveTo"], nil)}
	}
	overrideItems := make([]any, len(overrides))
	for i, override := range overrides {
		overrideItems[i] = map[string]any{"id": override["id"], "type": override["type"], "startAt": override["startAt"],
			"endAt": override["endAt"], "reason": override["reason"]}
	}
	return map[string]any{"offering": bookingOption(offering), "policy": policy, "rules": ruleItems, "overrides": overrideItems}, nil
}

func opsBookingDashboard(app core.App) (map[string]any, error) {
	pending, err := opsAppointments(app, pageQuery("pending", 6))
	if err != nil {
		return nil, err
	}
	upcoming, err := opsAppointments(app, pageQuery("confirmed,rescheduled", 8))
	if err != nil {
		return nil, err
	}
	conflicts, err := opsConflicts(app, pageQuery("open", 6))
	if err != nil {
		return nil, err
	}
	return map[string]any{"pending": pending["items"], "pendingCount": pending["totalItems"], "upcoming": upcoming["items"],
		"openConflicts": conflicts["items"], "openConflictCount": conflicts["totalItems"]}, nil
}

func opsBookingReferenceData(app core.App) (map[string]any, error) {
	teachers, err := list(app, "teachers", "verified=true && blocked=false", "cellphone")
	if err != nil {
		return nil, err
	}
	courses, err := list(app, "course_specs", `status="active" && deliveryMode="one_to_one"`, "name")
	if err != nil {
		return nil, err
	}
	creditTypes, err := list(app, "credit_types", `status="active" && kind="course" && consumable=true`, "name")
	if err != nil {
		return nil, err
	}
	policies, err := list(app, "booking_policies", `status="active"`, "-version")
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"teachers": projectAll(teachers, func(record map[string]any) map[string]any {
			return map[string]any{"id": record["id"], "name": personName(record, "授课教师"),
				"cellphone": or(record["cellphone"], ""), "avatar": personAvatar(record)}
		}),
		"courses": projectAll(courses, func(record map[string]any) map[string]any {
			return map[string]any{"id": record["id"], "code": or(record["code"], ""), "name": or(record["name"], "课程"),
				"durationMinutes": jsx.Number(or(record["durationMinutes"], 0.0)), "defaultCreditTypeId": relationID(record["defaultCreditTypeId"])}
		}),
		"creditTypes": projectAll(creditTypes, func(record map[string]any) map[string]any {
			return map[string]any{"id": record["id"], "code": or(record["code"], ""), "name": or(record["name"], "课时类型"),
				"courseSpecId": relationID(record["courseSpecId"]), "unitLabel": or(record["unitLabel"], "课时")}
		}),
		"policies": projectAll(policies, policyProjection),
	}, nil
}

func projectAll(items []map[string]any, mapper func(map[string]any) map[string]any) []any {
	result := make([]any, len(items))
	for i, item := range items {
		result[i] = mapper(item)
	}
	return result
}

func policyProjection(record map[string]any) map[string]any {
	return map[string]any{
		"id": record["id"], "code": record["code"], "name": record["name"], "timezone": record["timezone"],
		"defaultWindows": record["defaultWindows"], "slotStepMinutes": jsx.Number(jsx.Get(record, "slotStepMinutes")),
		"claimGranularityMinutes": jsx.Number(or(record["claimGranularityMinutes"], 15.0)),
		"minLeadMinutes":          jsx.Number(jsx.Get(record, "minLeadMinutes")), "maxAdvanceDays": jsx.Number(jsx.Get(record, "maxAdvanceDays")),
		"responseTtlMinutes":        jsx.Number(jsx.Get(record, "responseTtlMinutes")),
		"responseCutoffMinutes":     jsx.Number(jsx.Get(record, "responseCutoffMinutes")),
		"cancellationCutoffMinutes": jsx.Number(jsx.Get(record, "cancellationCutoffMinutes")),
		"version":                   jsx.Number(jsx.Get(record, "version")),
		"effectiveFrom":             record["effectiveFrom"], "effectiveTo": or(record["effectiveTo"], nil), "status": record["status"],
	}
}

func offeringProjection(record map[string]any) map[string]any {
	shaped := copyMap(record)
	shaped["id"] = "offering:" + jsx.String(record["id"])
	shaped["requestedStartAt"], shaped["requestedEndAt"], shaped["responseDeadline"] = "", "", ""
	projected := teacherAppointment(shaped)
	return map[string]any{
		"id": record["id"], "teacher": projected["teacher"], "course": projected["course"],
		"creditTypeId": relationID(record["creditTypeId"]), "policyId": relationID(record["policyId"]),
		"location": or(record["location"], ""), "availabilityMode": record["availabilityMode"],
		"status": record["status"], "version": jsx.Number(or(record["version"], 1.0)),
	}
}

func opsAppointments(app core.App, query map[string]string) (map[string]any, error) {
	filters := []string{}
	filters = relationFilter(filters, "teacherId", query["teacherId"])
	filters = relationFilter(filters, "studentId", query["studentId"])
	filters = relationFilter(filters, "courseSpecId", query["courseSpecId"])
	if query["from"] != "" {
		filters = append(filters, `requestedEndAt>"`+escape(filterTime(query["from"]))+`"`)
	}
	if query["to"] != "" {
		filters = append(filters, `requestedStartAt<"`+escape(filterTime(query["to"]))+`"`)
	}
	// Hono puts the status filter first; the conjunction is the same either way.
	return appointmentPage(app, query, filters, "-requestedAt", opsExpand, teacherAppointment)
}

func opsAppointment(app core.App, id string) (map[string]any, error) {
	if id == "" {
		return nil, Fail("APPOINTMENT_ID_REQUIRED", "预约编号不能为空", nil)
	}
	record, err := get(app, "appointment_requests", id, opsExpand...)
	if err != nil {
		return nil, err
	}
	events, err := list(app, "appointment_events", `appointmentId="`+escape(id)+`"`, "created")
	if err != nil {
		return nil, err
	}
	claims, err := list(app, "schedule_claims", `appointmentId="`+escape(id)+`"`, "ownerType,cellStartAt")
	if err != nil {
		return nil, err
	}
	result := teacherAppointment(record)
	result["events"], result["claims"] = events, claims
	return result, nil
}

func opsPolicies(app core.App, query map[string]string) (map[string]any, error) {
	pageNumber, perPage, err := pagination(query)
	if err != nil {
		return nil, err
	}
	filter := ""
	if query["status"] != "" {
		filter = `status="` + escape(query["status"]) + `"`
	}
	result, err := pageOf(app, "booking_policies", filter, "-version", pageNumber, perPage)
	if err != nil {
		return nil, err
	}
	return mappedPage(result, policyProjection), nil
}

func opsOfferings(app core.App, query map[string]string) (map[string]any, error) {
	pageNumber, perPage, err := pagination(query)
	if err != nil {
		return nil, err
	}
	filters := relationFilter(nil, "teacherId", query["teacherId"])
	filters = relationFilter(filters, "courseSpecId", query["courseSpecId"])
	if query["status"] != "" {
		filters = append(filters, `status="`+escape(query["status"])+`"`)
	}
	result, err := pageOf(app, "teacher_course_offerings", strings.Join(filters, " && "), "courseSpecId,teacherId",
		pageNumber, perPage, "teacherId", "courseSpecId", "creditTypeId", "policyId")
	if err != nil {
		return nil, err
	}
	return mappedPage(result, offeringProjection), nil
}

func opsAvailability(app core.App, query map[string]string) (map[string]any, error) {
	filters := relationFilter(nil, "teacherId", query["teacherId"])
	filters = relationFilter(filters, "offeringId", query["offeringId"])
	if query["status"] != "" {
		filters = append(filters, `status="`+escape(query["status"])+`"`)
	}
	filter := strings.Join(filters, " && ")
	rules, err := list(app, "teacher_availability_rules", filter, "teacherId,weekday,startMinute")
	if err != nil {
		return nil, err
	}
	overrides, err := list(app, "teacher_availability_overrides", filter, "teacherId,startAt")
	if err != nil {
		return nil, err
	}
	return map[string]any{"rules": rules, "overrides": overrides}, nil
}

func opsConflicts(app core.App, query map[string]string) (map[string]any, error) {
	pageNumber, perPage, err := pagination(query)
	if err != nil {
		return nil, err
	}
	filters := []string{}
	if query["status"] != "" {
		filters = append(filters, `status="`+escape(query["status"])+`"`)
	}
	filters = relationFilter(filters, "teacherId", query["teacherId"])
	result, err := pageOf(app, "booking_conflicts", strings.Join(filters, " && "), "-startAt", pageNumber, perPage,
		"teacherId", "studentId", "sessionId", "appointmentId")
	if err != nil {
		return nil, err
	}
	return mappedPage(result, identity), nil
}
