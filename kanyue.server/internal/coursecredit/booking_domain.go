package coursecredit

import (
	"math"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/records"
)

// Hono's services/courseCredits/booking pure rules: booking policy, Shanghai
// local time, slot generation, schedule claims, the appointment state machine,
// appointment projections and appointment materialization into a session.

const (
	bookingTimezone      = "Asia/Shanghai"
	claimGranularity     = 15
	shanghaiOffsetMillis = 8 * 60 * 60 * 1000
	minuteMillis         = 60000
)

func defaultBookingWindows() []any {
	return []any{
		map[string]any{"startMinute": 540.0, "endMinute": 660.0},
		map[string]any{"startMinute": 840.0, "endMinute": 1140.0},
	}
}

func defaultBookingPolicy() map[string]any {
	return map[string]any{
		"timezone":                  bookingTimezone,
		"defaultWindows":            defaultBookingWindows(),
		"slotStepMinutes":           30.0,
		"claimGranularityMinutes":   float64(claimGranularity),
		"minLeadMinutes":            720.0,
		"maxAdvanceDays":            30.0,
		"responseTtlMinutes":        1440.0,
		"responseCutoffMinutes":     360.0,
		"cancellationCutoffMinutes": 720.0,
		"version":                   1.0,
	}
}

// normalizeBookingPolicy is `{...DEFAULT_BOOKING_POLICY, ...value}` with normalized windows, validated.
func normalizeBookingPolicy(value map[string]any) (map[string]any, error) {
	policy := defaultBookingPolicy()
	for key, item := range value {
		policy[key] = item
	}
	windows := value["defaultWindows"]
	if !jsx.Truthy(windows) {
		windows = defaultBookingWindows()
	}
	normalized, err := normalizeWindows(windows)
	if err != nil {
		return nil, err
	}
	policy["defaultWindows"] = normalized
	return policy, validateBookingPolicy(policy)
}

func validateBookingPolicy(policy map[string]any) error {
	if policy["timezone"] != bookingTimezone {
		return Fail("BOOKING_TIMEZONE_UNSUPPORTED", "预约暂只支持 Asia/Shanghai 时区", nil)
	}
	if err := positiveIntegerField(policy["slotStepMinutes"], "BOOKING_SLOT_STEP_INVALID"); err != nil {
		return err
	}
	if err := positiveIntegerField(policy["claimGranularityMinutes"], "BOOKING_CLAIM_GRANULARITY_INVALID"); err != nil {
		return err
	}
	if policy["claimGranularityMinutes"] != float64(claimGranularity) {
		return Fail("BOOKING_CLAIM_GRANULARITY_IMMUTABLE", "日历占位粒度固定为 15 分钟", nil)
	}
	if math.Mod(jsx.Number(policy["slotStepMinutes"]), claimGranularity) != 0 {
		return Fail("BOOKING_SLOT_ALIGNMENT_INVALID", "预约开始步长必须是占位粒度的整数倍", nil)
	}
	checks := []struct {
		key, code string
		positive  bool
	}{
		{"minLeadMinutes", "BOOKING_MIN_LEAD_INVALID", false},
		{"maxAdvanceDays", "BOOKING_MAX_ADVANCE_INVALID", true},
		{"responseTtlMinutes", "BOOKING_RESPONSE_TTL_INVALID", true},
		{"responseCutoffMinutes", "BOOKING_RESPONSE_CUTOFF_INVALID", false},
		{"cancellationCutoffMinutes", "BOOKING_CANCELLATION_CUTOFF_INVALID", false},
		{"version", "BOOKING_POLICY_VERSION_INVALID", true},
	}
	for _, check := range checks {
		var err error
		if check.positive {
			err = positiveIntegerField(policy[check.key], check.code)
		} else if !jsx.IsInteger(policy[check.key]) || jsx.Number(policy[check.key]) < 0 {
			err = Fail(check.code, "必须是非负整数", nil)
		}
		if err != nil {
			return err
		}
	}
	return nil
}

func positiveIntegerField(value any, code string) error {
	if !jsx.IsInteger(value) || jsx.Number(value) <= 0 {
		return Fail(code, "必须是正整数", nil)
	}
	return nil
}

type window struct{ start, end int }

func (w window) asMap() map[string]any {
	return map[string]any{"startMinute": float64(w.start), "endMinute": float64(w.end)}
}

// normalizeWindows validates time-of-day windows and returns them sorted.
func normalizeWindows(value any) ([]any, error) {
	items, ok := value.([]any)
	if !ok || len(items) == 0 {
		return nil, Fail("BOOKING_WINDOWS_REQUIRED", "至少需要一个可预约时间窗", nil)
	}
	windows := make([]window, len(items))
	for i, item := range items {
		entry, _ := item.(map[string]any)
		start, err := windowMinute(jsx.Get(entry, "startMinute"), "BOOKING_WINDOW_START_INVALID", false)
		if err != nil {
			return nil, err
		}
		end, err := windowMinute(jsx.Get(entry, "endMinute"), "BOOKING_WINDOW_END_INVALID", true)
		if err != nil {
			return nil, err
		}
		windows[i] = window{start, end}
	}
	slices.SortStableFunc(windows, func(a, b window) int { return a.start - b.start })
	result := make([]any, len(windows))
	for i, w := range windows {
		if w.end <= w.start {
			return nil, Fail("BOOKING_WINDOW_RANGE_INVALID", "预约时间窗结束时间必须晚于开始时间", nil)
		}
		if i > 0 && w.start < windows[i-1].end {
			return nil, Fail("BOOKING_WINDOWS_OVERLAP", "预约时间窗不能重叠", nil)
		}
		result[i] = w.asMap()
	}
	return result, nil
}

func windowMinute(value any, code string, allowEnd bool) (int, error) {
	limit := 1439.0
	if allowEnd {
		limit = 1440
	}
	number := jsx.Number(value)
	if !jsx.IsInteger(value) || number < 0 || number > limit {
		return 0, Fail(code, "分钟数无效", nil)
	}
	return int(number), nil
}

// policyWindows reads the windows of a normalized policy.
func policyWindows(policy map[string]any) []window {
	items, _ := policy["defaultWindows"].([]any)
	result := make([]window, 0, len(items))
	for _, item := range items {
		entry, _ := item.(map[string]any)
		result = append(result, window{int(jsx.Number(entry["startMinute"])), int(jsx.Number(entry["endMinute"]))})
	}
	return result
}

func policyNumber(policy map[string]any, key string) float64 { return jsx.Number(policy[key]) }

// responseDeadline is the earlier of the response TTL and the cutoff before the lesson.
func responseDeadline(requestedAt string, startAt any, policy map[string]any) (string, error) {
	normalized, err := normalizeBookingPolicy(policy)
	if err != nil {
		return "", err
	}
	requested, ok := millis(requestedAt)
	if !ok {
		return "", Fail("BOOKING_REQUESTED_AT_INVALID", "日期无效", nil)
	}
	start, ok := millis(startAt)
	if !ok {
		return "", Fail("BOOKING_START_INVALID", "日期无效", nil)
	}
	ttl := requested + int64(policyNumber(normalized, "responseTtlMinutes")*minuteMillis)
	cutoff := start - int64(policyNumber(normalized, "responseCutoffMinutes")*minuteMillis)
	return fromMillis(min(ttl, cutoff)), nil
}

// localPart is a moment in Asia/Shanghai (fixed +08:00): date, ISO weekday (Sunday 7), minute of day.
type localPart struct {
	date    string
	weekday int
	minute  int
}

func localPartsAt(ms int64) localPart {
	shifted := time.UnixMilli(ms + shanghaiOffsetMillis).UTC()
	weekday := int(shifted.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	return localPart{shifted.Format(time.DateOnly), weekday, shifted.Hour()*60 + shifted.Minute()}
}

func localParts(value any) localPart {
	ms, _ := millis(value)
	return localPartsAt(ms)
}

func localDateMinute(date string, minute int) int64 {
	year, month, day := dateNumbers(date)
	return time.Date(year, time.Month(month), day, 0, minute-8*60, 0, 0, time.UTC).UnixMilli()
}

func addLocalDays(date string, count int) string {
	year, month, day := dateNumbers(date)
	return time.Date(year, time.Month(month), day+count, 0, 0, 0, 0, time.UTC).Format(time.DateOnly)
}

func dateNumbers(date string) (int, int, int) {
	parts := strings.Split(date, "-")
	numbers := [3]int{}
	for i := 0; i < len(parts) && i < 3; i++ {
		numbers[i], _ = strconv.Atoi(parts[i])
	}
	return numbers[0], numbers[1], numbers[2]
}

func overlaps(startA, endA, startB, endB any) bool {
	a0, ok1 := millis(startA)
	a1, ok2 := millis(endA)
	b0, ok3 := millis(startB)
	b1, ok4 := millis(endB)
	return ok1 && ok2 && ok3 && ok4 && a0 < b1 && a1 > b0
}

func sameRange(startA, endA, startB, endB any) bool {
	a0, ok1 := millis(startA)
	a1, ok2 := millis(endA)
	b0, ok3 := millis(startB)
	b1, ok4 := millis(endB)
	return ok1 && ok2 && ok3 && ok4 && a0 == b0 && a1 == b1
}

// slotQuery is generateAvailableSlots' input.
type slotQuery struct {
	policy           map[string]any
	durationMinutes  any
	now              int64
	from, to         string
	availabilityMode any
	rules            []map[string]any
	overrides        []map[string]any
	claims           []map[string]any
	eligible         func(startAt string) (bool, error)
}

// generateAvailableSlots lists bookable starts inside [from, to) for a policy and a teacher's calendar.
func generateAvailableSlots(input slotQuery) ([]any, error) {
	policy, err := normalizeBookingPolicy(input.policy)
	if err != nil {
		return nil, err
	}
	duration := jsx.Number(input.durationMinutes)
	if !jsx.IsInteger(duration) || duration <= 0 || math.Mod(duration, claimGranularity) != 0 {
		return nil, Fail("BOOKING_DURATION_INVALID", "课程时长必须是占位粒度的正整数倍", nil)
	}
	from, ok := millis(input.from)
	if !ok {
		return nil, Fail("BOOKING_FROM_INVALID", "日期无效", nil)
	}
	to, ok := millis(input.to)
	if !ok {
		return nil, Fail("BOOKING_TO_INVALID", "日期无效", nil)
	}
	if to <= from {
		return nil, Fail("BOOKING_RANGE_INVALID", "预约查询结束时间必须晚于开始时间", nil)
	}
	now := input.now
	maxTo := now + int64(policyNumber(policy, "maxAdvanceDays")*dayMillis)
	minStart := now + int64(policyNumber(policy, "minLeadMinutes")*minuteMillis)
	step := int(policyNumber(policy, "slotStepMinutes"))
	length := int(duration)
	slots := []any{}
	endDate := localPartsAt(min(to, maxTo)).date
	for date := localPartsAt(max(from, now)).date; date <= endDate; date = addLocalDays(date, 1) {
		weekday := localPartsAt(localDateMinute(date, 0)).weekday
		for _, w := range effectiveWindows(date, weekday, policy, input) {
			for minute := alignMinute(w.start, step); minute+length <= w.end; minute += step {
				start := localDateMinute(date, minute)
				end := localDateMinute(date, minute+length)
				if start < minStart || start < from || end > to || start > maxTo {
					continue
				}
				startAt, endAt := fromMillis(start), fromMillis(end)
				if blockedByOverride(startAt, endAt, input.overrides) || blockedByClaim(startAt, endAt, input.claims) {
					continue
				}
				if input.eligible != nil {
					eligible, err := input.eligible(startAt)
					if err != nil {
						return nil, err
					}
					if !eligible {
						continue
					}
				}
				slots = append(slots, map[string]any{"startAt": startAt, "endAt": endAt})
			}
		}
	}
	return slots, nil
}

func effectiveWindows(date string, weekday int, policy map[string]any, input slotQuery) []window {
	base := policyWindows(policy)
	if input.availabilityMode != "custom" {
		return base
	}
	active := []window{}
	for _, rule := range input.rules {
		if jsx.Number(rule["weekday"]) == float64(weekday) && rule["status"] != "inactive" && effectiveOnDate(rule, date) {
			active = append(active, window{int(jsx.Number(rule["startMinute"])), int(jsx.Number(rule["endMinute"]))})
		}
	}
	recurring := base
	if len(active) > 0 {
		recurring = intersections(base, active)
	}
	temporary := []window{}
	for _, override := range input.overrides {
		if override["status"] != "cancelled" && override["type"] == "available" {
			temporary = append(temporary, overrideWindowsForDate(override, date)...)
		}
	}
	return mergeWindows(append(slices.Clone(recurring), intersections(base, temporary)...))
}

func overrideWindowsForDate(override map[string]any, date string) []window {
	start := localParts(override["startAt"])
	end := localParts(override["endAt"])
	if date < start.date || date > end.date {
		return nil
	}
	result := window{0, 1440}
	if date == start.date {
		result.start = start.minute
	}
	if date == end.date {
		result.end = end.minute
	}
	return []window{result}
}

func intersections(left, right []window) []window {
	result := []window{}
	for _, first := range left {
		for _, second := range right {
			start, end := max(first.start, second.start), min(first.end, second.end)
			if end > start {
				result = append(result, window{start, end})
			}
		}
	}
	return mergeWindows(result)
}

func mergeWindows(windows []window) []window {
	slices.SortStableFunc(windows, func(a, b window) int { return a.start - b.start })
	result := []window{}
	for _, w := range windows {
		if last := len(result) - 1; last >= 0 && w.start <= result[last].end {
			result[last].end = max(result[last].end, w.end)
			continue
		}
		result = append(result, w)
	}
	return result
}

func blockedByOverride(startAt, endAt string, overrides []map[string]any) bool {
	for _, override := range overrides {
		if override["status"] != "cancelled" && override["type"] == "unavailable" &&
			overlaps(startAt, endAt, override["startAt"], override["endAt"]) {
			return true
		}
	}
	return false
}

func blockedByClaim(startAt, endAt string, claims []map[string]any) bool {
	for _, claim := range claims {
		if claim["status"] == "active" && overlaps(startAt, endAt, claim["cellStartAt"], claim["cellEndAt"]) {
			return true
		}
	}
	return false
}

func effectiveOnDate(rule map[string]any, date string) bool {
	start, end := "", ""
	if jsx.Truthy(rule["effectiveFrom"]) {
		start = localParts(rule["effectiveFrom"]).date
	}
	if jsx.Truthy(rule["effectiveTo"]) {
		end = localParts(rule["effectiveTo"]).date
	}
	return (start == "" || start <= date) && (end == "" || end > date)
}

func alignMinute(minute, step int) int {
	return int(math.Ceil(float64(minute)/float64(step))) * step
}

// scheduleClaim describes one owner's calendar occupation for a session.
type scheduleClaim struct {
	ownerType, ownerID, sourceID, appointmentID string
	startAt, endAt                              any
	granularity                                 any
}

// build cuts the occupation into granularity-sized cells, one active claim each.
func (c scheduleClaim) build() ([]map[string]any, error) {
	if !slices.Contains([]string{"teacher", "student", "room"}, c.ownerType) {
		return nil, Fail("BOOKING_CLAIM_OWNER_INVALID", "日历占位所有者类型无效", nil)
	}
	if c.ownerID == "" {
		return nil, Fail("BOOKING_CLAIM_OWNER_REQUIRED", "日历占位所有者不能为空", nil)
	}
	granularity := jsx.Number(c.granularity)
	if !jsx.IsInteger(c.granularity) || granularity <= 0 {
		return nil, Fail("BOOKING_CLAIM_GRANULARITY_INVALID", "占位粒度无效", nil)
	}
	start, ok1 := millis(c.startAt)
	end, ok2 := millis(c.endAt)
	if !ok1 || !ok2 || end <= start {
		return nil, Fail("BOOKING_CLAIM_TIME_INVALID", "占位时间无效", nil)
	}
	cell := int64(granularity) * minuteMillis
	first := int64(math.Floor(float64(start)/float64(cell))) * cell
	last := int64(math.Ceil(float64(end)/float64(cell))) * cell
	claims := []map[string]any{}
	for at := first; at < last; at += cell {
		claims = append(claims, map[string]any{
			"id": ids.Record(), "ownerType": c.ownerType, "ownerId": c.ownerID,
			"cellStartAt": fromMillis(at), "cellEndAt": fromMillis(at + cell),
			"sourceType": "session", "sourceId": c.sourceID, "appointmentId": c.appointmentID,
			"status": "active", "releasedAt": "", "version": 1,
		})
	}
	return claims, nil
}

// appointmentClaimPlan claims the teacher's and then the student's cells for a session.
func appointmentClaimPlan(appointmentID string, startAt, endAt any, granularity any, sessionID, teacherID, studentID string) ([]step, error) {
	plan := []step{}
	for _, owner := range [][2]string{{"teacher", teacherID}, {"student", studentID}} {
		claims, err := scheduleClaim{ownerType: owner[0], ownerID: owner[1], sourceID: sessionID, appointmentID: appointmentID,
			startAt: startAt, endAt: endAt, granularity: granularity}.build()
		if err != nil {
			return nil, err
		}
		for _, claim := range claims {
			plan = append(plan, create("schedule_claims", claim))
		}
	}
	return plan, nil
}

func releaseClaimPlan(claims []map[string]any, at, operationID string) []step {
	plan := []step{}
	for _, claim := range claims {
		if claim["status"] != "active" {
			continue
		}
		version := positiveVersion(claim["version"])
		id := jsx.String(claim["id"])
		plan = append(plan,
			versionClaim("schedule_claim", id, version, operationID),
			update("schedule_claims", id, map[string]any{"status": "released", "releasedAt": at, "version": version + 1}))
	}
	return plan
}

// claimGranularityOf is `Number(appointment.policySnapshot?.claimGranularityMinutes || 15)`.
func claimGranularityOf(appointment map[string]any) float64 {
	snapshot, _ := appointment["policySnapshot"].(map[string]any)
	return jsx.Number(or(snapshot["claimGranularityMinutes"], float64(claimGranularity)))
}

var appointmentTransitions = map[string][]string{
	"pending":     {"confirmed", "declined", "withdrawn", "expired", "slot_taken", "eligibility_lost"},
	"confirmed":   {"cancelled", "rescheduled", "fulfilled"},
	"rescheduled": {"rescheduled", "cancelled", "fulfilled"},
}

func transitionAppointment(current any, next string) error {
	status, _ := current.(string)
	if !slices.Contains(appointmentTransitions[status], next) {
		return Fail("APPOINTMENT_STATUS_TRANSITION_INVALID", "预约状态流转无效", map[string]any{"current": current, "next": next})
	}
	return nil
}

// orChain is JavaScript `a || b || … || last`.
func orChain(values ...any) any {
	for _, value := range values[:len(values)-1] {
		if jsx.Truthy(value) {
			return value
		}
	}
	return values[len(values)-1]
}

func personName(record map[string]any, fallback string) any {
	return orChain(record["realName"], record["realname"], record["nickName"], record["nickname"], fallback)
}

func personAvatar(record map[string]any) any {
	return orChain(record["avatarUrl"], record["avatar"], "")
}

func studentAppointment(record map[string]any) map[string]any {
	offering := expanded(record, "offeringId")
	course := expanded(record, "courseSpecId")
	teacher := expanded(record, "teacherId")
	session := expanded(record, "sessionId")
	return map[string]any{
		"appointmentId": record["id"],
		"status":        record["status"],
		"course": map[string]any{
			"courseId": or(course["id"], relationID(record["courseSpecId"])),
			"name":     orChain(course["name"], offering["courseName"], "课程"),
		},
		"teacher": map[string]any{
			"teacherId": or(teacher["id"], relationID(record["teacherId"])),
			"name":      personName(teacher, "授课教师"),
			"avatar":    personAvatar(teacher),
		},
		"startAt":          record["requestedStartAt"],
		"endAt":            record["requestedEndAt"],
		"location":         orChain(offering["location"], session["location"], ""),
		"note":             or(record["note"], ""),
		"responseReason":   or(record["responseReason"], ""),
		"responseDeadline": or(record["responseDeadline"], nil),
		"lessonId":         orChain(session["id"], relationID(record["sessionId"]), ""),
		"canWithdraw":      record["status"] == "pending",
		"canCancel":        record["status"] == "confirmed" || record["status"] == "rescheduled",
	}
}

func teacherAppointment(record map[string]any) map[string]any {
	projected := studentAppointment(record)
	student := expanded(record, "studentId")
	projected["student"] = map[string]any{
		"studentId": or(student["id"], relationID(record["studentId"])),
		"name":      personName(student, "学员"),
		"avatar":    personAvatar(student),
	}
	projected["canConfirm"] = record["status"] == "pending"
	projected["canDecline"] = record["status"] == "pending"
	projected["version"] = jsx.Number(or(record["version"], 1.0))
	return projected
}

func bookingOption(offering map[string]any) map[string]any {
	course := expanded(offering, "courseSpecId")
	teacher := expanded(offering, "teacherId")
	return map[string]any{
		"offeringId": offering["id"],
		"course": map[string]any{
			"courseId":        or(course["id"], relationID(offering["courseSpecId"])),
			"name":            or(course["name"], "课程"),
			"durationMinutes": jsx.Number(or(course["durationMinutes"], 0.0)),
		},
		"teacher": map[string]any{
			"teacherId": or(teacher["id"], relationID(offering["teacherId"])),
			"name":      personName(teacher, "授课教师"),
			"avatar":    personAvatar(teacher),
		},
		"location": or(offering["location"], ""),
	}
}

// materialized is the session an appointment confirmation creates.
type materialized struct {
	session, sessionStudent, sessionTeacher map[string]any
}

// materializeAppointment builds the one-to-one session, its student and lead teacher.
func materializeAppointment(appointment, course, offering, teacherRule map[string]any, at string) (materialized, error) {
	if !jsx.Truthy(appointment["id"]) || !jsx.Truthy(course["name"]) || offering == nil {
		return materialized{}, Fail("BOOKING_MATERIALIZATION_INPUT_INVALID", "预约课堂物化信息不完整", nil)
	}
	snapshot, err := teacherRuleSnapshot(teacherRule, relationID(appointment["courseSpecId"]))
	if err != nil {
		return materialized{}, err
	}
	sessionID := ids.Record()
	ms, _ := millis(at)
	session := map[string]any{
		"id":                   sessionID,
		"code":                 operationNo("APT", time.UnixMilli(ms), sessionID),
		"title":                jsx.String(course["name"]) + "预约课",
		"status":               "scheduled",
		"startAt":              appointment["requestedStartAt"],
		"endAt":                appointment["requestedEndAt"],
		"location":             or(offering["location"], ""),
		"requiredCreditTypeId": relationID(appointment["creditTypeId"]),
		"requiredQuantity":     1,
		"attendanceRuleSnapshot": map[string]any{
			"version": 1, "present": "consume", "late": "consume", "leave": "release", "absent": "consume",
		},
		"settlementRuleSnapshot": map[string]any{"version": 1, "cancelled": "release"},
		"teacherRuleSnapshot":    snapshot,
		"rosterVersion":          1,
		"version":                1,
		"settlementOperationId":  "",
		"correctionBaseStatus":   "",
		"originType":             "appointment",
		"appointmentId":          appointment["id"],
		"cancellationType":       "",
		"cancelledAt":            "",
	}
	return materialized{
		session: session,
		sessionStudent: map[string]any{
			"id": ids.Record(), "sessionId": sessionID, "studentId": relationID(appointment["studentId"]),
			"sourceClassIds": []any{}, "attendanceStatus": "scheduled", "creditStatus": "reserved",
			"eligibilityReason": "", "checkedInAt": "", "settledAt": "", "version": 1,
		},
		sessionTeacher: map[string]any{
			"id": ids.Record(), "sessionId": sessionID, "teacherId": relationID(appointment["teacherId"]),
			"role": "lead", "assignmentSource": "appointment", "actualStatus": "planned", "creditStatus": "pending",
		},
	}, nil
}

// teacherRuleSnapshot freezes the lead teacher's earning rule onto the session.
func teacherRuleSnapshot(rule map[string]any, courseSpecID string) (map[string]any, error) {
	if !jsx.Truthy(rule["id"]) {
		return nil, Fail("BOOKING_TEACHER_RULE_REQUIRED", "该课程缺少有效的教师课酬规则", nil)
	}
	if relationID(rule["courseSpecId"]) != courseSpecID {
		return nil, Fail("BOOKING_TEACHER_RULE_COURSE_MISMATCH", "教师规则与预约课程不匹配", nil)
	}
	compensation := normalizeCancellationCompensation(rule["cancellationCompensation"])
	lead := map[string]any{"ruleId": rule["id"], "courseSpecId": courseSpecID}
	for _, field := range []string{"baseQuantity", "durationFactor", "participantFactor"} {
		number := jsx.Number(or(rule[field], 0.0))
		if math.IsNaN(number) || math.IsInf(number, 0) || number < 0 {
			return nil, Fail("BOOKING_TEACHER_RULE_INVALID", "教师规则系数必须是非负数", nil)
		}
		lead[field] = number
	}
	version := 1.0
	if jsx.IsInteger(rule["version"]) && jsx.Number(rule["version"]) > 0 {
		version = jsx.Number(rule["version"])
	}
	// validateTeacherRuleSnapshot: only the checks a freshly built lead rule can fail.
	if _, ok := rule["id"].(string); !ok {
		return nil, Fail("TEACHER_RULE_ID_REQUIRED", "Teacher rule id is required", map[string]any{"role": "lead"})
	}
	if courseSpecID == "" {
		return nil, Fail("TEACHER_RULE_COURSE_REQUIRED", "Teacher rule course specification is required", map[string]any{"role": "lead"})
	}
	if jsx.Truthy(compensation) {
		if err := validateCancellationCompensation(compensation, "lead"); err != nil {
			return nil, err
		}
		lead["cancellationCompensation"] = compensation
	}
	return map[string]any{"version": version, "rules": map[string]any{"lead": lead}}, nil
}

// normalizeCancellationCompensation turns a legacy `{cancelled: n}` into a policy;
// anything without a numeric `cancelled` passes through for validation.
func normalizeCancellationCompensation(value any) any {
	if value == nil {
		return nil
	}
	if entry, ok := value.(map[string]any); ok && jsx.IsFinite(jsx.Get(entry, "cancelled")) {
		if quantity := jsx.Number(entry["cancelled"]); quantity > 0 {
			return map[string]any{"quantity": quantity, "eligibleActualStatuses": []any{"confirmed"}}
		}
		return nil
	}
	return value
}

// validateCancellationCompensation is the domain's check of a compensation policy.
func validateCancellationCompensation(value any, role string) error {
	details := map[string]any{"role": role}
	policy, ok := value.(map[string]any)
	if !ok {
		return Fail("TEACHER_CANCELLATION_POLICY_INVALID", "Cancellation compensation must be an object", details)
	}
	quantity, isNumber := policy["quantity"].(float64)
	if !isNumber || math.IsInf(quantity, 0) || roundQuantity(quantity) <= 0 {
		return Fail("TEACHER_CANCELLATION_QUANTITY_INVALID", "Cancellation compensation quantity must be positive", details)
	}
	statuses, _ := policy["eligibleActualStatuses"].([]any)
	if len(statuses) == 0 {
		return Fail("TEACHER_CANCELLATION_STATUSES_REQUIRED", "Cancellation compensation requires eligible statuses", details)
	}
	seen := map[any]bool{}
	for _, status := range statuses {
		text, _ := status.(string)
		if seen[status] || !slices.Contains([]string{"planned", "confirmed", "absent", "cancelled"}, text) {
			return Fail("TEACHER_CANCELLATION_STATUS_INVALID", "Cancellation compensation contains an invalid status", details)
		}
		seen[status] = true
	}
	return nil
}

func escape(value string) string { return records.EscapeFilter(value) }

func roundQuantity(value float64) float64 {
	return math.Round((value+2.220446049250313e-16)*1_000_000) / 1_000_000
}

// findTeacherRule is the active lead earning rule for a course at a moment.
func findTeacherRule(app core.App, courseSpecID string, at any) (map[string]any, error) {
	safeAt := escape(filterTime(at))
	rules, err := list(app, "teacher_credit_rules",
		`courseSpecId="`+escape(courseSpecID)+`" && role="lead" && status="active"`+
			` && validFrom<="`+safeAt+`" && (validTo="" || validTo>"`+safeAt+`")`, "-version")
	if err != nil {
		return nil, err
	}
	if len(rules) == 0 {
		return nil, Fail("BOOKING_TEACHER_RULE_REQUIRED", "该课程缺少有效的教师课酬规则", nil)
	}
	return rules[0], nil
}
