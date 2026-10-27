package coursecredit

import (
	"net/http"
	"testing"
	"time"

	"kanyue.server/internal/testkit"
)

// Booking configuration cases ported from Hono's courseBookingAdminService and
// courseBookingAvailabilityService tests.

// bookingCmd is a command input with Hono's commandMetadata for an admin actor.
func bookingCmd(key string, fields map[string]any) map[string]any {
	input := map[string]any{"actorId": "admin", "actorRole": "admin", "idempotencyKey": key, "traceId": "trace-" + key}
	for name, value := range fields {
		input[name] = value
	}
	return input
}

func (f bookingFixture) offeringInput(key string, fields map[string]any) map[string]any {
	input := bookingCmd(key, map[string]any{"teacherId": f.teacherID, "courseSpecId": f.specID, "creditTypeId": f.creditID,
		"policyId": f.policyID, "location": "一号教室", "status": "active"})
	for name, value := range fields {
		input[name] = value
	}
	return input
}

// Hono: courseBookingAdminService › policy revision deactivates the previous active policy and persists the next version atomically
func TestPolicyRevisionRetiresActiveVersion(t *testing.T) {
	f := bookingSetup(t, true)
	result, err := createPolicyRevision(f.app, bookingCmd("p2", map[string]any{"code": "default", "name": "默认预约策略",
		"status": "active", "effectiveFrom": "2026-08-02T00:00:00.000Z"}))
	if err != nil || result["version"] != 2 || result["status"] != "active" {
		t.Fatalf("revision = %v, %v", result, err)
	}
	old, _ := get(f.app, "booking_policies", f.policyID)
	if old["status"] != "inactive" || old["effectiveTo"] != "2026-08-02 00:00:00.000Z" {
		t.Fatalf("previous = %v", old)
	}
	created, _ := get(f.app, "booking_policies", result["policyId"].(string))
	if fmtJSON(created["defaultWindows"]) != `[{"endMinute":660,"startMinute":540},{"endMinute":1140,"startMinute":840}]` {
		t.Fatalf("default windows = %v", created["defaultWindows"])
	}
}

// Hono: courseBookingAdminService › offering creation binds a verified teacher to an exact one-to-one course credit
func TestOfferingCreationBindsTeacherCourseAndCredit(t *testing.T) {
	f := bookingSetup(t, true)
	offering, _ := get(f.app, "teacher_course_offerings", f.offeringID)
	if offering["teacherId"] != f.teacherID || offering["courseSpecId"] != f.specID || offering["creditTypeId"] != f.creditID ||
		offering["status"] != "active" || offering["version"] != 1.0 {
		t.Fatalf("offering = %v", offering)
	}
}

// Hono: courseBookingAdminService › offering update uses a version claim and keeps teacher-course identity immutable
func TestOfferingUpdateClaimsVersionAndKeepsIdentity(t *testing.T) {
	f := bookingSetup(t, true)
	patch(t, f.app, "teacher_course_offerings", f.offeringID, map[string]any{"availabilityMode": "custom"})
	result, err := saveOffering(f.app, f.offeringInput("u1", map[string]any{"offeringId": f.offeringID, "status": "inactive", "location": "二号教室"}))
	if err != nil || result["version"] != 2 {
		t.Fatalf("update = %v, %v", result, err)
	}
	claim, err := f.app.FindFirstRecordByFilter("credit_version_claims", `entityType="teacher_offering" && entityId="`+f.offeringID+`"`)
	if err != nil || claim.GetInt("expectedVersion") != 1 {
		t.Fatalf("claim = %v, %v", claim, err)
	}
	updated, _ := get(f.app, "teacher_course_offerings", f.offeringID)
	if updated["availabilityMode"] != "custom" || updated["location"] != "二号教室" || updated["status"] != "inactive" {
		t.Fatalf("updated = %v", updated)
	}
	spec := testkit.Create(t, f.app, "course_specs", map[string]any{"code": "piano1v1", "name": "钢琴一对一", "deliveryMode": "one_to_one", "durationMinutes": 60, "status": "active"})
	credit := testkit.Create(t, f.app, "credit_types", map[string]any{"code": "piano1v1", "name": "钢琴课时", "kind": "course", "courseSpecId": spec.Id, "consumable": true, "referenceUnitValue": 100, "status": "active"})
	_, err = saveOffering(f.app, f.offeringInput("u2", map[string]any{"offeringId": f.offeringID, "courseSpecId": spec.Id, "creditTypeId": credit.Id}))
	failsWith(t, err, "BOOKING_OFFERING_IDENTITY_IMMUTABLE")
}

// Hono: courseBookingAdminService › conflict resolution is version guarded and active offerings reject unsafe relations
func TestConflictResolutionAndUnsafeOfferingRelations(t *testing.T) {
	f := bookingSetup(t, true)
	start := time.Now().UTC().Add(72 * time.Hour)
	conflict := testkit.Create(t, f.app, "booking_conflicts", map[string]any{"type": "teacher_overlap", "status": "open", "teacherId": f.teacherID,
		"startAt": start, "endAt": start.Add(time.Hour), "details": map[string]any{"source": "test"}, "version": 3})
	_, err := saveOffering(f.app, f.offeringInput("o1", map[string]any{"offeringId": f.offeringID}))
	failsWith(t, err, "BOOKING_CONFLICTS_UNRESOLVED")
	result, err := resolveConflict(f.app, bookingCmd("k1", map[string]any{"conflictId": conflict.Id, "resolution": "已调整历史课程时间"}))
	if err != nil || result["status"] != "resolved" {
		t.Fatalf("resolve = %v, %v", result, err)
	}
	if resolved, _ := get(f.app, "booking_conflicts", conflict.Id); resolved["version"] != 4.0 || resolved["resolution"] != "已调整历史课程时间" {
		t.Fatalf("conflict = %v", resolved)
	}
	group := testkit.Create(t, f.app, "course_specs", map[string]any{"code": "choir", "name": "合唱", "deliveryMode": "group", "durationMinutes": 60, "status": "active"})
	_, err = saveOffering(f.app, f.offeringInput("o2", map[string]any{"courseSpecId": group.Id}))
	failsWith(t, err, "BOOKING_COURSE_NOT_ONE_TO_ONE")
}

// Hono: courseBookingAdminService › booking policy normalization rejects mutable claim granularity and invalid effective periods
func TestPolicyRejectsGranularityChangeAndBadPeriod(t *testing.T) {
	_, err := policyPayload(map[string]any{"claimGranularityMinutes": 30.0})
	failsWith(t, err, "BOOKING_CLAIM_GRANULARITY_IMMUTABLE")
	f := bookingSetup(t, true)
	_, err = createPolicyRevision(f.app, bookingCmd("p1", map[string]any{"code": "default", "name": "默认", "status": "active",
		"effectiveFrom": "2026-08-02T00:00:00.000Z", "effectiveTo": "2026-08-01T00:00:00.000Z"}))
	failsWith(t, err, "BOOKING_POLICY_EFFECTIVE_TO_INVALID")
}

// Hono: courseBookingAdminService › Admin booking validation rejects incomplete policies, offerings, and unsafe activation
func TestBookingAdminValidation(t *testing.T) {
	f := bookingSetup(t, true)
	for code, fields := range map[string]map[string]any{
		"BOOKING_POLICY_CODE_REQUIRED":          {},
		"BOOKING_POLICY_NAME_REQUIRED":          {"code": "code"},
		"BOOKING_POLICY_STATUS_INVALID":         {"code": "code", "name": "name", "status": "unknown"},
		"BOOKING_POLICY_EFFECTIVE_FROM_INVALID": {"code": "code", "name": "name", "status": "draft", "effectiveFrom": "invalid"},
	} {
		_, err := createPolicyRevision(f.app, bookingCmd("v-"+code, fields))
		failsWith(t, err, code)
	}
	_, err := saveOffering(f.app, bookingCmd("o0", map[string]any{}))
	failsWith(t, err, "BOOKING_OFFERING_FIELD_REQUIRED")
	_, err = saveOffering(f.app, f.offeringInput("o1", map[string]any{"status": "unknown"}))
	failsWith(t, err, "BOOKING_OFFERING_STATUS_INVALID")

	patch(t, f.app, "teachers", f.teacherID, map[string]any{"verified": false})
	_, err = saveOffering(f.app, f.offeringInput("o2", nil))
	failsWith(t, err, "BOOKING_TEACHER_UNAVAILABLE")
	patch(t, f.app, "teachers", f.teacherID, map[string]any{"verified": true})
	patch(t, f.app, "credit_types", f.creditID, map[string]any{"consumable": false})
	_, err = saveOffering(f.app, f.offeringInput("o3", nil))
	failsWith(t, err, "BOOKING_CREDIT_TYPE_INVALID")
	patch(t, f.app, "credit_types", f.creditID, map[string]any{"consumable": true})

	draft, err := createPolicyRevision(f.app, bookingCmd("d1", map[string]any{"code": "evening", "name": "晚间", "status": "draft",
		"effectiveFrom": "2026-08-02T00:00:00.000Z", "effectiveTo": "2026-09-01T00:00:00.000Z"}))
	if err != nil || draft["version"] != 1 {
		t.Fatalf("draft = %v, %v", draft, err)
	}
	second, err := createPolicyRevision(f.app, bookingCmd("d2", map[string]any{"code": "evening", "name": "晚间", "status": "draft",
		"effectiveFrom": "2026-08-02T00:00:00.000Z"}))
	if err != nil || second["version"] != 2 {
		t.Fatalf("second draft = %v, %v", second, err)
	}
	if first, _ := get(f.app, "booking_policies", draft["policyId"].(string)); first["status"] != "draft" {
		t.Fatal("a draft revision must not retire other versions")
	}
	_, err = saveOffering(f.app, f.offeringInput("o4", map[string]any{"policyId": draft["policyId"]}))
	failsWith(t, err, "BOOKING_POLICY_NOT_ACTIVE")
	if _, err := saveOffering(f.app, f.offeringInput("o5", map[string]any{"offeringId": f.offeringID, "policyId": draft["policyId"], "status": "draft"})); err != nil {
		t.Fatalf("draft offering on draft policy: %v", err)
	}

	start := time.Now().UTC().Add(72 * time.Hour)
	closed := testkit.Create(t, f.app, "booking_conflicts", map[string]any{"type": "teacher_overlap", "status": "resolved", "teacherId": f.teacherID,
		"startAt": start, "endAt": start.Add(time.Hour), "details": map[string]any{"source": "test"}, "version": 2})
	_, err = resolveConflict(f.app, bookingCmd("c1", map[string]any{"conflictId": closed.Id, "resolution": "已经处理完成"}))
	failsWith(t, err, "BOOKING_CONFLICT_NOT_OPEN")
}

// teacherCmd is a command input for the fixture's teacher on its offering.
func (f bookingFixture) teacherCmd(key string, fields map[string]any) map[string]any {
	input := map[string]any{"actorId": f.teacherID, "actorRole": "teacher", "idempotencyKey": key, "traceId": "trace-" + key,
		"teacherId": f.teacherID, "offeringId": f.offeringID}
	for name, value := range fields {
		input[name] = value
	}
	return input
}

// Hono: courseBookingAvailabilityService › teacher replaces weekly availability and can restore institution defaults
func TestWeeklyAvailabilityReplaceAndRestore(t *testing.T) {
	f := bookingSetup(t, true)
	rules := func(items ...map[string]any) []any {
		result := []any{}
		for _, item := range items {
			result = append(result, item)
		}
		return result
	}
	first, err := saveWeeklyAvailability(f.app, f.teacherCmd("w1", map[string]any{"rules": rules(map[string]any{"weekday": 1.0, "startMinute": 540.0, "endMinute": 600.0})}))
	if err != nil || first["availabilityMode"] != "custom" {
		t.Fatalf("first = %v, %v", first, err)
	}
	second, err := saveWeeklyAvailability(f.app, f.teacherCmd("w2", map[string]any{"rules": rules(map[string]any{"weekday": 1.0, "startMinute": 540.0, "endMinute": 660.0})}))
	if err != nil || second["ruleCount"] != 1 {
		t.Fatalf("second = %v, %v", second, err)
	}
	active, _ := f.app.FindRecordsByFilter("teacher_availability_rules", `offeringId="`+f.offeringID+`" && status="active"`, "", 0, 0)
	if len(active) != 1 || active[0].GetInt("endMinute") != 660 {
		t.Fatalf("active rules = %v", active)
	}
	if offering, _ := get(f.app, "teacher_course_offerings", f.offeringID); offering["availabilityMode"] != "custom" {
		t.Fatalf("offering = %v", offering)
	}
	restored, err := saveWeeklyAvailability(f.app, f.teacherCmd("w3", map[string]any{"rules": []any{}}))
	if err != nil || restored["availabilityMode"] != "default" {
		t.Fatalf("restored = %v, %v", restored, err)
	}
	if active, _ = f.app.FindRecordsByFilter("teacher_availability_rules", `offeringId="`+f.offeringID+`" && status="active"`, "", 0, 0); len(active) != 0 {
		t.Fatalf("rules left active: %d", len(active))
	}
}

// Hono: courseBookingAvailabilityService › teacher creates and cancels a future date override with ownership and policy guards
func TestAvailabilityOverrideCreateAndCancel(t *testing.T) {
	f := bookingSetup(t, true)
	start := time.Now().UTC().Truncate(24 * time.Hour).Add(48*time.Hour + 2*time.Hour)
	created, err := createAvailabilityOverride(f.app, f.teacherCmd("o1", map[string]any{"type": "available",
		"startAt": iso(start), "endAt": iso(start.Add(time.Hour)), "reason": "临时加开"}))
	if err != nil || created["status"] != "active" {
		t.Fatalf("created = %v, %v", created, err)
	}
	if record, _ := get(f.app, "teacher_availability_overrides", created["overrideId"].(string)); record["type"] != "available" {
		t.Fatalf("override = %v", record)
	}
	_, err = createAvailabilityOverride(f.app, f.teacherCmd("o2", map[string]any{"type": "available",
		"startAt": iso(time.Now().UTC().Add(-time.Hour)), "endAt": iso(time.Now().UTC())}))
	failsWith(t, err, "BOOKING_OVERRIDE_TIME_INVALID")
	cancelled, err := cancelAvailabilityOverride(f.app, f.teacherCmd("o3", map[string]any{"overrideId": created["overrideId"]}))
	if err != nil || cancelled["status"] != "cancelled" {
		t.Fatalf("cancelled = %v, %v", cancelled, err)
	}
	if record, _ := get(f.app, "teacher_availability_overrides", created["overrideId"].(string)); record["version"] != 2.0 {
		t.Fatalf("override version = %v", record["version"])
	}
}

// Hono: courseBookingAvailabilityService › academic operators derive teacher ownership from offering and override records
func TestOperatorAvailabilityUsesOfferingTeacher(t *testing.T) {
	f := bookingSetup(t, true)
	weekly := ok(t, f.call(t, f.ops, http.MethodPut, "/ops/course-bookings/offerings/"+f.offeringID+"/availability",
		map[string]any{"teacherId": "spoofed", "rules": []any{map[string]any{"weekday": 2, "startMinute": 540, "endMinute": 600}}}, "w1"), "weekly")
	if weekly["ruleCount"] != 1.0 {
		t.Fatalf("weekly = %v", weekly)
	}
	rule, err := f.app.FindFirstRecordByFilter("teacher_availability_rules", `offeringId="`+f.offeringID+`" && status="active"`)
	if err != nil || rule.GetString("teacherId") != f.teacherID {
		t.Fatalf("rule = %v, %v", rule, err)
	}
	start := time.Now().UTC().Truncate(24 * time.Hour).Add(48 * time.Hour)
	created := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/offerings/"+f.offeringID+"/availability-overrides",
		map[string]any{"type": "unavailable", "startAt": iso(start), "endAt": iso(start.Add(time.Hour))}, "o1"), "override")
	if created["status"] != "active" {
		t.Fatalf("created = %v", created)
	}
	if record, _ := get(f.app, "teacher_availability_overrides", created["overrideId"].(string)); record["teacherId"] != f.teacherID {
		t.Fatalf("override owner = %v", record["teacherId"])
	}
	cancelled := ok(t, f.call(t, f.ops, http.MethodPost, "/ops/course-bookings/availability-overrides/"+created["overrideId"].(string)+"/cancel", nil, "o2"), "cancel")
	if cancelled["status"] != "cancelled" {
		t.Fatalf("cancelled = %v", cancelled)
	}
}

// Hono: courseBookingAvailabilityService › availability validation prevents overlap and teacher time outside institution windows
func TestAvailabilityStaysInsideInstitutionWindows(t *testing.T) {
	windows := policyWindows(defaultBookingPolicy())
	_, err := normalizeWeeklyRules([]any{map[string]any{"weekday": 2.0, "startMinute": 540.0, "endMinute": 600.0},
		map[string]any{"weekday": 2.0, "startMinute": 590.0, "endMinute": 630.0}}, windows)
	failsWith(t, err, "BOOKING_WINDOWS_OVERLAP")
	_, err = normalizeWeeklyRules([]any{map[string]any{"weekday": 2.0, "startMinute": 480.0, "endMinute": 540.0}}, windows)
	failsWith(t, err, "BOOKING_WINDOW_OUTSIDE_POLICY")

	f := bookingSetup(t, true)
	narrow, err := createPolicyRevision(f.app, bookingCmd("p1", map[string]any{"code": "narrow", "name": "机构时间", "status": "active",
		"effectiveFrom": "2020-01-01T00:00:00.000Z"}))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := saveOffering(f.app, f.offeringInput("s1", map[string]any{"offeringId": f.offeringID, "policyId": narrow["policyId"]})); err != nil {
		t.Fatal(err)
	}
	// 08:00 in Shanghai, before the institution opens at 09:00.
	early := time.Now().UTC().Truncate(24 * time.Hour).Add(48 * time.Hour)
	window := map[string]any{"startAt": iso(early), "endAt": iso(early.Add(time.Hour))}
	_, err = createAvailabilityOverride(f.app, f.teacherCmd("o1", map[string]any{"type": "available", "startAt": window["startAt"], "endAt": window["endAt"]}))
	failsWith(t, err, "BOOKING_OVERRIDE_OUTSIDE_POLICY")
	if _, err := createAvailabilityOverride(f.app, f.teacherCmd("o2", map[string]any{"type": "unavailable", "startAt": window["startAt"], "endAt": window["endAt"]})); err != nil {
		t.Fatalf("blocking time outside opening hours: %v", err)
	}
}
