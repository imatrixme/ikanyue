package coursecredit

import (
	"slices"
	"strconv"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/jsx"
)

// The owner's dashboard: a few numbers for today, this week or this month in Beijing time,
// lessons by teacher for reconciling with them, and students who need attention. Read only,
// computed on demand; no money and no teacher pay.

const (
	// attentionLimit bounds each attention list.
	attentionLimit = 20
	// absenceDays is how long a student holding lessons may go without one before the owner is told.
	absenceDays = 21
	// reconciliationLimit bounds one teacher's lesson list; more stays in the web admin.
	reconciliationLimit = 500
)

type dashboardRange struct {
	period, label string
	from, to      int64
	// month, previous and next are "YYYY-MM" for a month range; next is "" once it would be the future.
	month, previous, next string
}

func (r dashboardRange) view() map[string]any {
	return map[string]any{"period": r.period, "from": fromMillis(r.from), "to": fromMillis(r.to), "label": r.label,
		"month": r.month, "previous": r.previous, "next": r.next}
}

// lessonFilter keeps lessons that started inside the range; session is the relation path, "" for sessions itself.
func (r dashboardRange) lessonFilter(session string) string {
	field := "startAt"
	if session != "" {
		field = session + ".startAt"
	}
	return field + `>="` + filterTime(fromMillis(r.from)) + `" && ` + field + `<"` + filterTime(fromMillis(r.to)) + `"`
}

func monthDay(date string) string {
	_, month, day := dateNumbers(date)
	return strconv.Itoa(month) + " 月 " + strconv.Itoa(day) + " 日"
}

// periodRange is today, the week from Monday or a calendar month in Beijing time: the current
// month, or month ("YYYY-MM") for an earlier one.
func periodRange(period, month string, now time.Time) (dashboardRange, error) {
	today := localPartsAt(now.UnixMilli())
	switch or(period, "today") {
	case "today":
		return dashboardRange{period: "today", label: monthDay(today.date),
			from: localDateMinute(today.date, 0), to: localDateMinute(addLocalDays(today.date, 1), 0)}, nil
	case "week":
		monday := addLocalDays(today.date, 1-today.weekday)
		return dashboardRange{period: "week", label: monthDay(monday) + " – " + monthDay(addLocalDays(monday, 6)),
			from: localDateMinute(monday, 0), to: localDateMinute(addLocalDays(monday, 7), 0)}, nil
	case "month":
		year, current, _ := dateNumbers(today.date)
		latest := time.Date(year, time.Month(current), 1, 0, 0, 0, 0, time.UTC)
		first := latest
		if month != "" {
			parsed, err := time.Parse("2006-01", month)
			if err != nil || parsed.After(latest) {
				return dashboardRange{}, Fail("DASHBOARD_MONTH_INVALID", "只能查看本月及以前的月份", nil)
			}
			first = parsed
		}
		r := dashboardRange{period: "month", label: first.Format("2006 年 1 月"),
			from: localDateMinute(first.Format(time.DateOnly), 0), to: localDateMinute(first.AddDate(0, 1, 0).Format(time.DateOnly), 0),
			month: first.Format("2006-01"), previous: first.AddDate(0, -1, 0).Format("2006-01")}
		if first.Before(latest) {
			r.next = first.AddDate(0, 1, 0).Format("2006-01")
		}
		return r, nil
	}
	return dashboardRange{}, Fail("DASHBOARD_PERIOD_INVALID", "时间段只能是今天、本周或本月", nil)
}

func total(app core.App, collection, filter string) (int, error) {
	result, err := pageOf(app, collection, filter, "", 1, 1)
	return result.TotalItems, err
}

// confirmedLeads maps each confirmed lesson of the range to the teacher who taught it.
func confirmedLeads(app core.App, r dashboardRange, teacherID string, expand ...string) ([]map[string]any, error) {
	filter := `role="lead" && actualStatus="confirmed" && sessionId.status="settled" && ` + r.lessonFilter("sessionId")
	if teacherID != "" {
		filter += ` && teacherId="` + escape(teacherID) + `"`
	}
	return list(app, "session_teachers", filter, "sessionId.startAt", expand...)
}

// usedCredits sums consumed lesson credits per settled lesson of the range.
func usedCredits(app core.App, r dashboardRange) (map[string]float64, error) {
	rows, err := list(app, "session_credit_allocations", `status="consumed" && sessionStudentId.sessionId.status="settled" && `+
		r.lessonFilter("sessionStudentId.sessionId"), "", "sessionStudentId")
	if err != nil {
		return nil, err
	}
	credits := map[string]float64{}
	for _, row := range rows {
		credits[relationID(expanded(row, "sessionStudentId")["sessionId"])] += quantity(row["quantity"])
	}
	return credits, nil
}

func ownerDashboard(app core.App, period, month string, now time.Time) (map[string]any, error) {
	r, err := periodRange(period, month, now)
	if err != nil {
		return nil, err
	}
	lessons, err := total(app, "sessions", `status="settled" && `+r.lessonFilter(""))
	if err != nil {
		return nil, err
	}
	credits, err := usedCredits(app, r)
	if err != nil {
		return nil, err
	}
	used := 0.0
	for _, value := range credits {
		used += value
	}
	batches, err := list(app, "credit_batches", `compensationSourceBatchId="" && status!="cancelled" && created>="`+
		filterTime(fromMillis(r.from))+`" && created<"`+filterTime(fromMillis(r.to))+`"`, "")
	if err != nil {
		return nil, err
	}
	granted := 0.0
	for _, batch := range batches {
		granted += quantity(batch["originalQuantity"])
	}
	requested, err := total(app, "appointment_requests", `requestedAt>="`+filterTime(fromMillis(r.from))+`" && requestedAt<"`+filterTime(fromMillis(r.to))+`"`)
	if err != nil {
		return nil, err
	}
	cancelled, err := total(app, "appointment_requests", `status="cancelled" && cancelledAt>="`+filterTime(fromMillis(r.from))+
		`" && cancelledAt<"`+filterTime(fromMillis(r.to))+`"`)
	if err != nil {
		return nil, err
	}
	joined, err := total(app, "students", `created>="`+filterTime(fromMillis(r.from))+`" && created<"`+filterTime(fromMillis(r.to))+`"`)
	if err != nil {
		return nil, err
	}
	teachers, err := teacherRows(app, r, credits)
	if err != nil {
		return nil, err
	}
	renewals, err := renewalAttention(app, now)
	if err != nil {
		return nil, err
	}
	inactive, err := longAbsentStudents(app, now)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"range":    r.view(),
		"lessons":  map[string]any{"count": lessons, "credits": used},
		"grants":   map[string]any{"credits": granted},
		"bookings": map[string]any{"requested": requested, "cancelled": cancelled},
		"students": map[string]any{"joined": joined},
		"teachers": teachers, "renewals": renewals, "inactive": inactive,
	}, nil
}

// teacherRows counts each active teacher's confirmed lessons; a one-teacher studio has nothing to reconcile.
func teacherRows(app core.App, r dashboardRange, credits map[string]float64) ([]any, error) {
	teachers, err := list(app, "teachers", "blocked=false && verified=true", "created")
	if err != nil || len(teachers) < 2 {
		return []any{}, err
	}
	leads, err := confirmedLeads(app, r, "")
	if err != nil {
		return nil, err
	}
	lessons, used := map[string]int{}, map[string]float64{}
	for _, row := range leads {
		id := relationID(row["teacherId"])
		lessons[id]++
		used[id] += credits[relationID(row["sessionId"])]
	}
	rows := make([]map[string]any, len(teachers))
	for i, teacher := range teachers {
		id := jsx.String(teacher["id"])
		rows[i] = map[string]any{"teacherId": id, "name": personName(teacher, "教师"), "lessons": lessons[id], "credits": used[id]}
	}
	slices.SortStableFunc(rows, func(a, b map[string]any) int { return b["lessons"].(int) - a["lessons"].(int) })
	result := make([]any, len(rows))
	for i, row := range rows {
		result[i] = row
	}
	return result, nil
}

// teacherReconciliation lists every lesson one teacher confirmed in the range, to settle up with them.
func teacherReconciliation(app core.App, teacherID, period, month string, now time.Time) (map[string]any, error) {
	r, err := periodRange(period, month, now)
	if err != nil {
		return nil, err
	}
	teacher, err := get(app, "teachers", teacherID)
	if err != nil {
		return nil, err
	}
	leads, err := confirmedLeads(app, r, teacherID, "sessionId", "sessionId.requiredCreditTypeId")
	if err != nil {
		return nil, err
	}
	truncated := len(leads) > reconciliationLimit
	if truncated {
		leads = leads[:reconciliationLimit]
	}
	sessionIDs := make([]string, len(leads))
	for i, row := range leads {
		sessionIDs[i] = relationID(row["sessionId"])
	}
	names, credits := map[string][]any{}, map[string]float64{}
	for _, chunk := range idChunks(sessionIDs) {
		roster, err := list(app, "session_students", anyIDFilter("sessionId", chunk)+` && attendanceStatus!="cancelled"`, "created", "studentId")
		if err != nil {
			return nil, err
		}
		for _, row := range roster {
			id := relationID(row["sessionId"])
			names[id] = append(names[id], personName(expanded(row, "studentId"), "学员"))
		}
		allocations, err := list(app, "session_credit_allocations", `status="consumed" && `+
			anyIDFilter("sessionStudentId.sessionId", chunk), "", "sessionStudentId")
		if err != nil {
			return nil, err
		}
		for _, row := range allocations {
			credits[relationID(expanded(row, "sessionStudentId")["sessionId"])] += quantity(row["quantity"])
		}
	}
	items, used := make([]any, len(leads)), 0.0
	for i, row := range leads {
		session := expanded(row, "sessionId")
		id := jsx.String(session["id"])
		used += credits[id]
		items[i] = map[string]any{"sessionId": id, "title": or(session["title"], or(expanded(session, "requiredCreditTypeId")["name"], "课程")),
			"startAt": session["startAt"], "endAt": session["endAt"], "students": or(names[id], []any{}), "credits": credits[id]}
	}
	return map[string]any{"range": r.view(), "teacher": teacherCard(teacher), "count": len(items), "credits": used,
		"items": items, "truncated": truncated}, nil
}

// renewalAttention is each student's most urgent course by the renewal reminder rule, low balances first.
func renewalAttention(app core.App, now time.Time) ([]any, error) {
	courses, err := loadRenewalCourses(app, nil, now)
	if err != nil {
		return nil, err
	}
	rank := map[string]int{"low_balance": 0, "expiring": 1}
	best := map[string]renewalCourse{}
	order := []string{}
	for _, course := range courses {
		reason := renewalReason(course, now)
		if reason == "" {
			continue
		}
		current, ok := best[course.studentID]
		if !ok {
			order = append(order, course.studentID)
		}
		if !ok || rank[reason] < rank[renewalReason(current, now)] ||
			(rank[reason] == rank[renewalReason(current, now)] && course.remaining < current.remaining) {
			best[course.studentID] = course
		}
	}
	slices.SortStableFunc(order, func(a, b string) int {
		left, right := best[a], best[b]
		if diff := rank[renewalReason(left, now)] - rank[renewalReason(right, now)]; diff != 0 {
			return diff
		}
		return int(left.remaining - right.remaining)
	})
	order = order[:min(len(order), attentionLimit)]
	names, err := studentNames(app, order)
	if err != nil {
		return nil, err
	}
	items := make([]any, len(order))
	for i, id := range order {
		course := best[id]
		expiresAt := ""
		if course.expiresAt > 0 {
			expiresAt = fromMillis(course.expiresAt)
		}
		items[i] = map[string]any{"studentId": id, "name": names[id], "courseName": course.courseName,
			"remaining": course.remaining, "reason": renewalReason(course, now), "expiresAt": expiresAt}
	}
	return items, nil
}

// longAbsentStudents hold lessons, have nothing booked ahead and have not had a lesson for absenceDays;
// one who never came counts from their first grant. Longest absence first.
func longAbsentStudents(app core.App, now time.Time) ([]any, error) {
	batches, err := list(app, "credit_batches", `availableQuantity>0 && status!="cancelled" && status!="expired"`, "created")
	if err != nil {
		return nil, err
	}
	remaining, since := map[string]float64{}, map[string]int64{}
	holders := []string{}
	for _, batch := range batches {
		id := relationID(batch["studentId"])
		if _, ok := remaining[id]; !ok {
			holders = append(holders, id)
			since[id], _ = millis(batch["created"])
		}
		remaining[id] += quantity(batch["availableQuantity"])
	}
	nowMs, cutoff := now.UnixMilli(), now.UnixMilli()-absenceDays*dayMillis
	last := map[string]int64{}
	booked := map[string]bool{}
	for _, chunk := range idChunks(holders) {
		rows, err := list(app, "session_students", anyIDFilter("studentId", chunk)+
			` && attendanceStatus!="cancelled" && sessionId.status!="cancelled" && sessionId.status!="draft"`, "", "sessionId")
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			id := relationID(row["studentId"])
			start, _ := millis(expanded(row, "sessionId")["startAt"])
			if start > nowMs {
				booked[id] = true
			} else if start > last[id] {
				last[id] = start
			}
		}
	}
	type absence struct {
		id   string
		from int64
	}
	absent := []absence{}
	for _, id := range holders {
		from := since[id]
		if last[id] > 0 {
			from = last[id]
		}
		if !booked[id] && from <= cutoff {
			absent = append(absent, absence{id, from})
		}
	}
	slices.SortStableFunc(absent, func(a, b absence) int {
		if a.from < b.from {
			return -1
		}
		if a.from > b.from {
			return 1
		}
		return 0
	})
	absent = absent[:min(len(absent), attentionLimit)]
	ids := make([]string, len(absent))
	for i, item := range absent {
		ids[i] = item.id
	}
	names, err := studentNames(app, ids)
	if err != nil {
		return nil, err
	}
	items := make([]any, len(absent))
	for i, item := range absent {
		lastLessonAt := ""
		if last[item.id] > 0 {
			lastLessonAt = fromMillis(last[item.id])
		}
		items[i] = map[string]any{"studentId": item.id, "name": names[item.id], "remaining": remaining[item.id],
			"lastLessonAt": lastLessonAt, "days": (nowMs - item.from) / dayMillis}
	}
	return items, nil
}
