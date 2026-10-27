package coursecredit

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"kanyue.server/internal/testkit"
)

// Booking read models ported from Hono's courseBookingOpsQuery and courseBookingQuery tests.

func (f bookingFixture) openConflict(t *testing.T) string {
	t.Helper()
	start := time.Now().UTC().Add(72 * time.Hour)
	return testkit.Create(t, f.app, "booking_conflicts", map[string]any{"type": "teacher_overlap", "status": "open", "teacherId": f.teacherID,
		"startAt": start, "endAt": start.Add(time.Hour), "details": map[string]any{"source": "test"}, "version": 1}).Id
}

// Hono: courseBookingOpsQuery › operations dashboard combines pending, upcoming, and open-conflict work queues
func TestOpsBookingDashboardQueues(t *testing.T) {
	f := bookingSetup(t, true)
	f.confirmed(t, 40, "r1")
	f.pending(t, 10, "r2")
	f.openConflict(t)
	dashboard, err := opsBookingDashboard(f.app)
	if err != nil || dashboard["pendingCount"] != 1 || len(dashboard["upcoming"].([]any)) != 1 || dashboard["openConflictCount"] != 1 {
		t.Fatalf("dashboard = %v, %v", dashboard, err)
	}
}

// Hono: courseBookingOpsQuery › appointment operations queries escape filters and include events and claims in detail
func TestOpsAppointmentFiltersAndDetail(t *testing.T) {
	f := bookingSetup(t, true)
	confirmed, _ := f.confirmed(t, 40, "r1")
	f.pending(t, 10, "r2")
	if filter := strings.Join(relationFilter(nil, "teacherId", `teacher"x`), ""); filter != `teacherId="teacher\"x"` {
		t.Fatalf("escaped filter = %s", filter)
	}
	query := map[string]string{"status": "pending,confirmed", "teacherId": f.teacherID, "studentId": f.studentID, "courseSpecId": f.specID,
		"from": iso(time.Now().UTC()), "to": iso(time.Now().UTC().Add(30 * 24 * time.Hour)), "page": "2", "perPage": "1"}
	page, err := opsAppointments(f.app, query)
	if err != nil || page["page"] != 2 || page["totalItems"] != 2 || len(page["items"].([]any)) != 1 {
		t.Fatalf("page = %v, %v", page, err)
	}
	query["teacherId"] = `teacher"x`
	if page, err = opsAppointments(f.app, query); err != nil || page["totalItems"] != 0 {
		t.Fatalf("quoted teacher = %v, %v", page, err)
	}
	detail, err := opsAppointment(f.app, confirmed)
	if err != nil || len(detail["events"].([]map[string]any)) != 2 || len(detail["claims"].([]map[string]any)) != 8 {
		t.Fatalf("detail = %v, %v", detail, err)
	}
}

// Hono: courseBookingOpsQuery › policy, offering, availability, and conflict projections remain pagination-safe
func TestOpsBookingConfigurationProjections(t *testing.T) {
	f := bookingSetup(t, true)
	if _, err := saveWeeklyAvailability(f.app, f.teacherCmd("w1", map[string]any{"rules": []any{
		map[string]any{"weekday": 1.0, "startMinute": 540.0, "endMinute": 600.0}}})); err != nil {
		t.Fatal(err)
	}
	start := time.Now().UTC().Truncate(24 * time.Hour).Add(48 * time.Hour)
	if _, err := createAvailabilityOverride(f.app, f.teacherCmd("o1", map[string]any{"type": "unavailable",
		"startAt": iso(start), "endAt": iso(start.Add(time.Hour))})); err != nil {
		t.Fatal(err)
	}
	conflict := f.openConflict(t)
	policies, err := opsPolicies(f.app, map[string]string{"status": "active"})
	if err != nil || items(policies)[0]["slotStepMinutes"] != 30.0 {
		t.Fatalf("policies = %v, %v", policies, err)
	}
	offerings, err := opsOfferings(f.app, map[string]string{"teacherId": f.teacherID, "status": "active"})
	if err != nil || items(offerings)[0]["teacher"].(map[string]any)["name"] != "王老师" {
		t.Fatalf("offerings = %v, %v", offerings, err)
	}
	availability, err := opsAvailability(f.app, map[string]string{"offeringId": f.offeringID, "status": "active"})
	if err != nil || len(availability["rules"].([]map[string]any)) != 1 || len(availability["overrides"].([]map[string]any)) != 1 {
		t.Fatalf("availability = %v, %v", availability, err)
	}
	conflicts, err := opsConflicts(f.app, map[string]string{"teacherId": f.teacherID, "status": "open"})
	if err != nil || items(conflicts)[0]["id"] != conflict {
		t.Fatalf("conflicts = %v, %v", conflicts, err)
	}
}

// Hono: courseBookingOpsQuery › Admin reference data exposes selectable academic labels without raw teacher records
func TestOpsReferenceDataHidesTeacherRecords(t *testing.T) {
	f := bookingSetup(t, true)
	reference, err := opsBookingReferenceData(f.app)
	if err != nil {
		t.Fatal(err)
	}
	teachers := reference["teachers"].([]any)
	first := teachers[1].(map[string]any) // sorted by cellphone: the unnamed teacher has none
	if len(first) != 4 || first["name"] != "王老师" || first["cellphone"] == "" || first["password"] != nil || first["email"] != nil {
		t.Fatalf("teacher reference = %v", first)
	}
	if teachers[0].(map[string]any)["cellphone"] != "" || teachers[0].(map[string]any)["name"] != "授课教师" {
		t.Fatalf("teachers must sort by cellphone, got %v", teachers)
	}
	course := reference["courses"].([]any)[0].(map[string]any)
	credit := reference["creditTypes"].([]any)[0].(map[string]any)
	policy := reference["policies"].([]any)[0].(map[string]any)
	if course["durationMinutes"] != 60.0 || credit["courseSpecId"] != f.specID || policy["name"] != "全天" {
		t.Fatalf("reference = %v", reference)
	}
}

// Hono: courseBookingOpsQuery › query helpers reject excessive status filters and normalize relation fallbacks
func TestBookingQueryHelpers(t *testing.T) {
	statuses := make([]string, 11)
	for i := range statuses {
		statuses[i] = fmt.Sprintf("s%d", i)
	}
	_, err := statusFilter(nil, strings.Join(statuses, ","))
	failsWith(t, err, "BOOKING_STATUS_FILTER_INVALID")
	policy := map[string]any{"id": "policy", "defaultWindows": defaultBookingWindows(), "effectiveTo": ""}
	if projected := policyProjection(policy); projected["effectiveTo"] != nil || projected["claimGranularityMinutes"] != 15.0 {
		t.Fatalf("policy projection = %v", projected)
	}
	offering := map[string]any{"id": "offering", "teacherId": "teacher", "courseSpecId": "course", "creditTypeId": "credit", "status": "active"}
	if course := offeringProjection(offering)["course"].(map[string]any); course["courseId"] != "course" {
		t.Fatalf("offering course = %v", course)
	}
}

// Hono: courseBookingOpsQuery › Admin booking projections preserve legacy labels and safe empty fallbacks
func TestBookingProjectionFallbacks(t *testing.T) {
	if filters, err := statusFilter([]string{}, ""); err != nil || len(filters) != 0 {
		t.Fatalf("empty status = %v, %v", filters, err)
	}
	for want, record := range map[string]map[string]any{
		"旧姓名":  {"realname": "旧姓名"},
		"微信昵称": {"nickName": "微信昵称", "avatarUrl": "avatar-url"},
		"兼容昵称": {"nickname": "兼容昵称", "avatar": "avatar"},
		"授课教师": {},
	} {
		if got := personName(record, "授课教师"); got != want {
			t.Fatalf("personName(%v) = %v", record, got)
		}
	}
	if personAvatar(map[string]any{}) != "" || personAvatar(map[string]any{"avatarUrl": "a", "avatar": "b"}) != "a" {
		t.Fatal("avatar fallback")
	}
	projected := offeringProjection(map[string]any{"id": "offering", "teacherId": "teacher", "courseSpecId": "course",
		"creditTypeId": map[string]any{"id": "credit-object"}, "location": "", "policyId": nil, "availabilityMode": "default",
		"status": "active", "version": 0.0,
		"expand": map[string]any{"teacherId": map[string]any{"id": "teacher", "realName": "林老师"}, "courseSpecId": map[string]any{"id": "course", "name": "一对一声乐课"}}})
	if fmtJSON(projected) != `{"availabilityMode":"default","course":{"courseId":"course","name":"一对一声乐课"},"creditTypeId":"credit-object","id":"offering","location":"","policyId":"","status":"active","teacher":{"avatar":"","name":"林老师","teacherId":"teacher"},"version":1}` {
		t.Fatalf("offering fallback = %s", fmtJSON(projected))
	}
	f := bookingSetup(t, true)
	reference, err := opsBookingReferenceData(f.app)
	if err != nil {
		t.Fatal(err)
	}
	if credit := reference["creditTypes"].([]any)[0].(map[string]any); credit["unitLabel"] != "课时" {
		t.Fatalf("credit fallback = %v", credit)
	}
	if course := reference["courses"].([]any)[0].(map[string]any); course["defaultCreditTypeId"] != "" {
		t.Fatalf("course fallback = %v", course)
	}
	if policies, err := opsPolicies(f.app, map[string]string{}); err != nil || policies["totalItems"] != 1 {
		t.Fatalf("unfiltered policies = %v, %v", policies, err)
	}
	if result := testkit.Call(t, f.handler, http.MethodGet, "/ops/course-bookings/policies", nil, f.ops); result.Code() != 10000 {
		t.Fatalf("policies route = %v", result.Body)
	}
}

// Hono: courseBookingQuery › student booking options expose courses and teachers without internal credit data
func TestStudentBookingOptionsHideCreditData(t *testing.T) {
	f := bookingSetup(t, true)
	options, err := studentBookingOptions(f.app, f.studentID, "")
	if err != nil || len(options) != 1 {
		t.Fatalf("options = %v, %v", options, err)
	}
	option := options[0].(map[string]any)
	if option["course"].(map[string]any)["name"] != "声乐一对一" || option["teacher"].(map[string]any)["name"] != "王老师" {
		t.Fatalf("option = %v", option)
	}
	if _, leaked := option["creditTypeId"]; leaked {
		t.Fatalf("credit type leaked: %v", option)
	}
	batch := batchOf(t, f.app, f.studentID)
	batch.Set("availableQuantity", 0)
	if err := f.app.Save(batch); err != nil {
		t.Fatal(err)
	}
	if options, err = studentBookingOptions(f.app, f.studentID, ""); err != nil || len(options) != 0 {
		t.Fatalf("options without available credit = %v, %v", options, err)
	}
}

// Hono: courseBookingQuery › slot query combines teacher rules, overrides, claims, and exact lesson eligibility
func TestSlotQueryExcludesOwnSessionAndUsesStoredTimeText(t *testing.T) {
	f := bookingSetup(t, true)
	id, sessionID := f.confirmed(t, 40, "r1")
	appointment, _ := get(f.app, "appointment_requests", id)
	start, end := iso(asTime(t, appointment["requestedStartAt"])), iso(asTime(t, appointment["requestedEndAt"]))
	query := map[string]string{"offeringId": f.offeringID, "from": start, "to": end}
	busy, err := availableSlots(f.app, f.studentID, query)
	if err != nil || len(busy["slots"].([]any)) != 0 {
		t.Fatalf("busy slots = %v, %v", busy, err)
	}
	query["excludeSourceId"] = sessionID
	free, err := availableSlots(f.app, f.studentID, query)
	if err != nil || fmtJSON(free["slots"]) != fmtJSON([]any{map[string]any{"startAt": start, "endAt": end}}) {
		t.Fatalf("own session slot = %v, %v", free, err)
	}
	claims, err := scheduleClaims(f.app, "teacher", f.teacherID, start, end, sessionID)
	if err != nil || len(claims) != 0 {
		t.Fatalf("excluded claims = %v, %v", claims, err)
	}
	if claims, err = scheduleClaims(f.app, "teacher", f.teacherID, start, end, ""); err != nil || len(claims) != 4 {
		t.Fatalf("claims = %d, %v", len(claims), err)
	}
	if filter := bookingBatchFilter(f.studentID, f.creditID); !strings.Contains(filter, `status="active"`) {
		t.Fatalf("batch filter = %s", filter)
	}
}

// Hono: courseBookingQuery › appointment lists are ownership-safe and project role-specific actions
func TestAppointmentListsAreOwnershipSafe(t *testing.T) {
	f := bookingSetup(t, true)
	id := f.pending(t, 10, "r1")
	students, err := listStudentAppointments(f.app, f.studentID, map[string]string{"page": "1", "perPage": "10"})
	if err != nil || items(students)[0]["canWithdraw"] != true || items(students)[0]["student"] != nil {
		t.Fatalf("student page = %v, %v", students, err)
	}
	teachers, err := listTeacherAppointments(f.app, f.teacherID, map[string]string{"status": "pending"})
	if err != nil || items(teachers)[0]["student"].(map[string]any)["name"] != "学员甲" || items(teachers)[0]["canConfirm"] != true {
		t.Fatalf("teacher page = %v, %v", teachers, err)
	}
	dashboard, err := teacherBookingDashboard(f.app, f.teacherID)
	if err != nil || dashboard["pendingCount"] != 1 || dashboard["offerings"].([]any)[0].(map[string]any)["offeringId"] != f.offeringID {
		t.Fatalf("dashboard = %v, %v", dashboard, err)
	}
	if others, _ := listTeacherAppointments(f.app, "other", map[string]string{}); others["totalItems"] != 0 {
		t.Fatalf("other teacher sees %v", others)
	}
	_, err = getStudentAppointment(f.app, "other", id)
	failsWith(t, err, "APPOINTMENT_STUDENT_FORBIDDEN")
	_, err = getTeacherAppointment(f.app, "other", id)
	failsWith(t, err, "APPOINTMENT_TEACHER_FORBIDDEN")
}

func queryAppointment(changes map[string]any) map[string]any {
	record := map[string]any{"id": "appointment", "studentId": "student", "teacherId": "teacher", "offeringId": "offering",
		"courseSpecId": "course", "sessionId": "", "status": "pending", "requestedStartAt": domainStart, "requestedEndAt": domainEnd,
		"responseDeadline": "2026-08-02T00:00:00.000Z", "version": 1.0,
		"expand": map[string]any{
			"studentId":    map[string]any{"id": "student", "realName": "学员甲"},
			"teacherId":    map[string]any{"id": "teacher", "realName": "林老师"},
			"offeringId":   map[string]any{"id": "offering", "location": "第一教室"},
			"courseSpecId": map[string]any{"id": "course", "name": "一对一声乐"},
		}}
	for key, value := range changes {
		record[key] = value
	}
	return record
}

// Hono: courseBookingQuery › booking projection helpers tolerate relation fallbacks and stable filters
func TestBookingProjectionHelpers(t *testing.T) {
	if filter := bookingBatchFilter(`student"x`, "credit"); !strings.Contains(filter, `student\"x`) {
		t.Fatalf("batch filter = %s", filter)
	}
	if option := bookingOption(map[string]any{"id": "offering", "courseSpecId": "course", "teacherId": "teacher"}); option["course"].(map[string]any)["courseId"] != "course" {
		t.Fatalf("option = %v", option)
	}
	if studentAppointment(queryAppointment(map[string]any{"status": "confirmed", "sessionId": "session"}))["canCancel"] != true {
		t.Fatal("confirmed appointment must be cancellable")
	}
	if teacherAppointment(queryAppointment(nil))["student"].(map[string]any)["studentId"] != "student" {
		t.Fatal("teacher projection must name the student")
	}
	filters, err := statusFilter(nil, "pending,confirmed")
	if err != nil || filters[0] != `(status="pending" || status="confirmed")` {
		t.Fatalf("filters = %v, %v", filters, err)
	}
	_, err = statusFilter(nil, strings.Repeat("pending,", 10)+"pending")
	failsWith(t, err, "BOOKING_STATUS_FILTER_INVALID")
}

// Hono: courseBookingQuery › booking projections cover display fallbacks without exposing internal entitlement data
func TestBookingDisplayFallbacks(t *testing.T) {
	projected := studentAppointment(map[string]any{"id": "fallback", "status": "rescheduled", "courseSpecId": "", "teacherId": "", "sessionId": "",
		"requestedStartAt": domainStart, "requestedEndAt": domainEnd,
		"expand": map[string]any{
			"offeringId": map[string]any{"courseName": "视唱练耳", "location": ""},
			"teacherId":  map[string]any{"id": "teacher", "realname": "周老师", "avatar": "avatar.png"},
			"sessionId":  map[string]any{"id": "lesson", "location": "线上教室"},
		}})
	if projected["course"].(map[string]any)["name"] != "视唱练耳" || projected["teacher"].(map[string]any)["name"] != "周老师" ||
		projected["teacher"].(map[string]any)["avatar"] != "avatar.png" || projected["location"] != "线上教室" ||
		projected["lessonId"] != "lesson" || projected["responseDeadline"] != nil || projected["canWithdraw"] != false {
		t.Fatalf("student fallback = %v", projected)
	}
	teacher := teacherAppointment(queryAppointment(map[string]any{"version": 0.0, "studentId": "",
		"expand": map[string]any{"studentId": map[string]any{"id": "student", "nickname": "小林", "avatar": "student.png"}}}))
	if student := teacher["student"].(map[string]any); student["name"] != "小林" || student["avatar"] != "student.png" || teacher["version"] != 1.0 {
		t.Fatalf("teacher fallback = %v", teacher)
	}
	option := bookingOption(map[string]any{"id": "option", "location": "", "courseSpecId": "", "teacherId": "",
		"expand": map[string]any{"courseSpecId": map[string]any{"name": "", "durationMinutes": ""}, "teacherId": map[string]any{"nickName": "陈老师"}}})
	course := option["course"].(map[string]any)
	if course["name"] != "课程" || course["durationMinutes"] != 0.0 || option["teacher"].(map[string]any)["name"] != "陈老师" {
		t.Fatalf("option fallback = %v", option)
	}
}

// Hono: courseBookingQuery › booking query edge paths handle empty eligibility, filters, calendar ranges, and relation fallback
func TestBookingQueryEdgePaths(t *testing.T) {
	f := bookingSetup(t, true)
	if options, err := studentBookingOptions(f.app, f.studentID, f.specID); err != nil || len(options) != 1 {
		t.Fatalf("course options = %v, %v", options, err)
	}
	_, err := studentBookingOptions(f.app, f.studentID, "other")
	failsWith(t, err, "BOOKING_COURSE_NOT_ELIGIBLE")
	empty := testkit.Create(t, f.app, "students", map[string]any{"cellphone": "13900000009"})
	if options, err := studentBookingOptions(f.app, empty.Id, ""); err != nil || len(options) != 0 {
		t.Fatalf("no credit options = %v, %v", options, err)
	}
	availability, err := teacherAvailability(f.app, f.teacherID, f.offeringID)
	if err != nil || availability["policy"].(map[string]any)["timezone"] != "Asia/Shanghai" {
		t.Fatalf("availability = %v, %v", availability, err)
	}
	_, err = teacherAvailability(f.app, "other", f.offeringID)
	failsWith(t, err, "BOOKING_OFFERING_FORBIDDEN")
	offering := map[string]any{"policyId": f.policyID}
	if related, err := relatedRecord(f.app, offering, "policyId", "booking_policies"); err != nil || related["id"] != f.policyID {
		t.Fatalf("fetched relation = %v, %v", related, err)
	}
	offering["expand"] = map[string]any{"policyId": map[string]any{"id": "expanded"}}
	if related, err := relatedRecord(f.app, offering, "policyId", "booking_policies"); err != nil || related["id"] != "expanded" {
		t.Fatalf("expanded relation = %v, %v", related, err)
	}
}
