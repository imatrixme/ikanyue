package coursecredit

import (
	"net/http"
	"testing"
	"time"

	"kanyue.server/internal/testkit"
)

// Owner dashboard cases (OpenSpec add-owner-dashboard): numbers for today, this week or this
// month in Beijing time, lessons by teacher for reconciliation and students who need attention.

func TestDashboardPeriodRanges(t *testing.T) {
	cases := []struct {
		now, period, month, from, to, label, previous, next string
	}{
		// Sunday 1 November 23:00 in Beijing: the week started on Monday 26 October.
		{"2026-11-01T15:00:00Z", "today", "", "2026-10-31T16:00:00.000Z", "2026-11-01T16:00:00.000Z", "11 月 1 日", "", ""},
		{"2026-11-01T15:00:00Z", "week", "", "2026-10-25T16:00:00.000Z", "2026-11-01T16:00:00.000Z", "10 月 26 日 – 11 月 1 日", "", ""},
		{"2026-11-01T15:00:00Z", "month", "", "2026-10-31T16:00:00.000Z", "2026-11-30T16:00:00.000Z", "2026 年 11 月", "2026-10", ""},
		// Saturday 31 October 18:00 in Beijing, the last day of the month.
		{"2026-10-31T10:00:00Z", "month", "", "2026-09-30T16:00:00.000Z", "2026-10-31T16:00:00.000Z", "2026 年 10 月", "2026-09", ""},
		{"2026-10-31T10:00:00Z", "", "", "2026-10-30T16:00:00.000Z", "2026-10-31T16:00:00.000Z", "10 月 31 日", "", ""},
		// An earlier month crosses the year and can step forward again.
		{"2026-10-31T10:00:00Z", "month", "2026-01", "2025-12-31T16:00:00.000Z", "2026-01-31T16:00:00.000Z", "2026 年 1 月", "2025-12", "2026-02"},
		{"2026-10-31T10:00:00Z", "month", "2026-10", "2026-09-30T16:00:00.000Z", "2026-10-31T16:00:00.000Z", "2026 年 10 月", "2026-09", ""},
	}
	for _, c := range cases {
		now, _ := time.Parse(time.RFC3339, c.now)
		r, err := periodRange(c.period, c.month, now)
		if err != nil {
			t.Fatal(err)
		}
		if view := r.view(); view["from"] != c.from || view["to"] != c.to || view["label"] != c.label ||
			view["previous"] != c.previous || view["next"] != c.next {
			t.Fatalf("%s %s %s = %v", c.now, c.period, c.month, view)
		}
	}
	_, err := periodRange("year", "", time.Now())
	failsWith(t, err, "DASHBOARD_PERIOD_INVALID")
	now, _ := time.Parse(time.RFC3339, "2026-10-31T10:00:00Z")
	for _, month := range []string{"2026-11", "2026-13", "10-2026"} {
		_, err = periodRange("month", month, now)
		failsWith(t, err, "DASHBOARD_MONTH_INVALID")
	}
}

// backdate moves a record's creation time, as if it had been created days ago.
func backdate(t *testing.T, f substitutionFixture, collection, id string, days int) {
	t.Helper()
	at := filterTime(time.Now().UTC().Add(-time.Duration(days) * 24 * time.Hour))
	if _, err := f.app.DB().NewQuery("UPDATE " + collection + " SET created={:at} WHERE id={:id}").
		Bind(map[string]any{"at": at, "id": id}).Execute(); err != nil {
		t.Fatal(err)
	}
}

func TestOwnerDashboard(t *testing.T) {
	f := substitutionSetup(t)
	_, first := f.confirmed(t, 40, "a1")
	_, second := f.confirmed(t, 80, "a2")
	f.pending(t, 120, "a3")
	// Both lessons started a minute ago, so they belong to today.
	start := time.Now().UTC().Add(-time.Minute)
	for _, id := range []string{first, second} {
		patch(t, f.app, "sessions", id, map[string]any{"startAt": iso(start), "endAt": iso(start.Add(time.Hour))})
	}
	ok(t, f.substitute(t, f.owner, second, f.otherID, "s1"), "substitute")
	ok(t, f.post(t, f.teacher, "/v1/workbench/lessons/"+first+"/confirm", map[string]any{}, "k1"), "teacher confirms")
	ok(t, f.post(t, f.otherTeacher, "/v1/workbench/lessons/"+second+"/confirm", map[string]any{}, "k2"), "substitute confirms")

	dashboard := func(period string) map[string]any {
		return ok(t, testkit.Call(t, f.workbench, http.MethodGet, "/v1/workbench/dashboard?period="+period, nil, f.owner), "dashboard "+period)
	}
	today := dashboard("today")
	granted := batchOf(t, f.app, f.studentID).GetFloat("originalQuantity")
	if lessons := today["lessons"].(map[string]any); lessons["count"] != 2.0 || lessons["credits"] != 2.0 {
		t.Fatalf("lessons = %v", lessons)
	}
	if grants := today["grants"].(map[string]any); grants["credits"] != granted || len(grants) != 1 {
		t.Fatalf("grants = %v (granted %v)", grants, granted)
	}
	if bookings := today["bookings"].(map[string]any); bookings["requested"] != 3.0 || bookings["cancelled"] != 0.0 {
		t.Fatalf("bookings = %v", bookings)
	}
	if students := today["students"].(map[string]any); students["joined"] != 1.0 {
		t.Fatalf("students = %v", students)
	}
	// Teachers: the substituted lesson counts for 李老师; the owner is listed with none.
	counts := map[any]any{}
	for _, row := range today["teachers"].([]any) {
		counts[row.(map[string]any)["teacherId"]] = row.(map[string]any)["lessons"]
	}
	if counts[f.teacherID] != 1.0 || counts[f.otherID] != 1.0 || counts[f.ownerID] != 0.0 || len(counts) != 3 {
		t.Fatalf("teachers = %v", today["teachers"])
	}
	if month := dashboard("month"); month["lessons"].(map[string]any)["count"] != 2.0 || month["range"].(map[string]any)["period"] != "month" {
		t.Fatalf("month = %v", month)
	} else {
		// The month before holds none of today's lessons, for the dashboard or a teacher.
		previous := month["range"].(map[string]any)["previous"].(string)
		if earlier := dashboard("month&month=" + previous); earlier["lessons"].(map[string]any)["count"] != 0.0 ||
			earlier["range"].(map[string]any)["next"] != month["range"].(map[string]any)["month"] {
			t.Fatalf("previous month = %v", earlier)
		}
		earlier := ok(t, testkit.Call(t, f.workbench, http.MethodGet, "/v1/workbench/dashboard/teachers/"+f.otherID+"?period=month&month="+previous, nil, f.owner), "previous reconcile")
		if earlier["count"] != 0.0 {
			t.Fatalf("previous reconcile = %v", earlier)
		}
	}

	// Reconciliation lists the substitute's lesson with its student.
	reconcile := ok(t, testkit.Call(t, f.workbench, http.MethodGet, "/v1/workbench/dashboard/teachers/"+f.otherID+"?period=week", nil, f.owner), "reconcile")
	lessons := reconcile["items"].([]any)
	if reconcile["count"] != 1.0 || reconcile["credits"] != 1.0 || len(lessons) != 1 {
		t.Fatalf("reconcile = %v", reconcile)
	}
	if lesson := lessons[0].(map[string]any); lesson["sessionId"] != second || lesson["students"].([]any)[0] != "学员甲" || lesson["credits"] != 1.0 {
		t.Fatalf("reconciled lesson = %v", lesson)
	}

	// Undoing a confirmation takes the lesson out.
	ok(t, f.post(t, f.owner, "/v1/workbench/lessons/"+first+"/reverse", map[string]any{"reason": "确认错了这节课"}, "r1"), "undo")
	if again := dashboard("today"); again["lessons"].(map[string]any)["count"] != 1.0 {
		t.Fatalf("after undo = %v", again["lessons"])
	}

	failed(t, testkit.Call(t, f.workbench, http.MethodGet, "/v1/workbench/dashboard", nil, f.teacher), 403, "COURSE_CREDIT_ADMIN_REQUIRED", "hired teacher")
	failed(t, testkit.Call(t, f.workbench, http.MethodGet, "/v1/workbench/dashboard?period=year", nil, f.owner), 400, "DASHBOARD_PERIOD_INVALID", "period")
	failed(t, testkit.Call(t, f.workbench, http.MethodGet, "/v1/workbench/dashboard?period=month&month=2999-01", nil, f.owner), 400, "DASHBOARD_MONTH_INVALID", "future month")
}

func TestDashboardSoloStudioHasNoTeacherRows(t *testing.T) {
	f := substitutionSetup(t)
	for _, id := range []string{f.teacherID, f.otherID} {
		patch(t, f.app, "teachers", id, map[string]any{"blocked": true})
	}
	view := ok(t, testkit.Call(t, f.workbench, http.MethodGet, "/v1/workbench/dashboard", nil, f.owner), "solo")
	if rows := view["teachers"].([]any); len(rows) != 0 {
		t.Fatalf("teachers = %v", rows)
	}
}

func TestDashboardAttentionLists(t *testing.T) {
	f := substitutionSetup(t)
	now := time.Now().UTC()
	student := func(name string, available float64, grantedDaysAgo int) string {
		record := put(t, f.app, "students", map[string]any{"realName": name})
		batch := put(t, f.app, "credit_batches", map[string]any{"studentId": record.Id, "creditTypeId": f.creditID, "status": "active",
			"originalQuantity": 10, "availableQuantity": available, "consumedQuantity": 10 - available})
		backdate(t, f, "credit_batches", batch.Id, grantedDaysAgo)
		return record.Id
	}
	lesson := func(studentID string, at time.Time) {
		session := put(t, f.app, "sessions", map[string]any{"code": "past-" + studentID, "title": "声乐", "status": "settled", "startAt": iso(at),
			"endAt": iso(at.Add(time.Hour)), "originType": "admin", "version": 1})
		put(t, f.app, "session_students", map[string]any{"sessionId": session.Id, "studentId": studentID, "attendanceStatus": "present"})
	}
	never := student("没来过", 5, 40)
	away := student("很久没来", 5, 60)
	lesson(away, now.Add(-30*24*time.Hour))
	booked := student("约了下周", 5, 60)
	lesson(booked, now.Add(-30*24*time.Hour))
	future := put(t, f.app, "sessions", map[string]any{"code": "future", "title": "声乐", "status": "scheduled", "startAt": iso(now.Add(7 * 24 * time.Hour)),
		"endAt": iso(now.Add(7*24*time.Hour + time.Hour)), "originType": "admin", "version": 1})
	put(t, f.app, "session_students", map[string]any{"sessionId": future.Id, "studentId": booked, "attendanceStatus": "scheduled"})
	recent := student("刚来过", 5, 60)
	lesson(recent, now.Add(-3*24*time.Hour))
	empty := student("没课时了", 0, 60)
	low := student("快用完", 1, 5)

	view := ok(t, testkit.Call(t, f.workbench, http.MethodGet, "/v1/workbench/dashboard", nil, f.owner), "dashboard")
	inactive := view["inactive"].([]any)
	if len(inactive) != 2 {
		t.Fatalf("inactive = %v", inactive)
	}
	longest, later := inactive[0].(map[string]any), inactive[1].(map[string]any)
	if longest["studentId"] != never || longest["days"] != 40.0 || longest["lastLessonAt"] != "" || longest["name"] != "没来过" {
		t.Fatalf("longest absence = %v", longest)
	}
	if later["studentId"] != away || later["days"] != 30.0 || later["remaining"] != 5.0 || later["lastLessonAt"] == "" {
		t.Fatalf("second absence = %v", later)
	}
	// Low balances first, fewest lessons first: used up, then one left. Students with plenty are not listed.
	renewals := view["renewals"].([]any)
	if len(renewals) != 2 {
		t.Fatalf("renewals = %v", renewals)
	}
	if top := renewals[0].(map[string]any); top["studentId"] != empty || top["reason"] != "low_balance" || top["remaining"] != 0.0 {
		t.Fatalf("used up = %v", top)
	}
	if next := renewals[1].(map[string]any); next["studentId"] != low || next["remaining"] != 1.0 || next["name"] != "快用完" {
		t.Fatalf("one left = %v", next)
	}
}
