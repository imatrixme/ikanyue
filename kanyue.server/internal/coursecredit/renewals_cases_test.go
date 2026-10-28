package coursecredit

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/migrations"
	"kanyue.server/internal/testkit"
)

// Renewal reminder cases: the pure rules, the daily scan's cooldown and rounds,
// ops sends with the daily limit, the student and teacher views, WeChat delivery.

func TestRenewalReasonRules(t *testing.T) {
	now := time.Date(2026, 10, 28, 2, 0, 0, 0, time.UTC)
	day := int64(dayMillis)
	cases := []struct {
		name   string
		course renewalCourse
		want   string
	}{
		{"low after use", renewalCourse{remaining: 2, used: 3}, "low_balance"},
		{"used up", renewalCourse{remaining: 0, used: 10}, "low_balance"},
		{"fresh trial is not low", renewalCourse{remaining: 2}, ""},
		{"plenty left", renewalCourse{remaining: 3, used: 3}, ""},
		{"expiring in 14 days", renewalCourse{remaining: 5, expiresAt: now.UnixMilli() + 14*day}, "expiring"},
		{"expiring in 15 days", renewalCourse{remaining: 5, expiresAt: now.UnixMilli() + 15*day}, ""},
		{"awaiting activation", renewalCourse{remaining: 0, used: 4, awaitingActivation: true}, ""},
		{"lapsed by expiry", renewalCourse{remaining: 0, used: 4, lapsed: true}, ""},
	}
	for _, c := range cases {
		if got := renewalReason(c.course, now); got != c.want {
			t.Errorf("%s: reason = %q, want %q", c.name, got, c.want)
		}
	}
}

func TestRenewalCoursesUseLatestGrantAndLiveExpiry(t *testing.T) {
	now := time.Date(2026, 10, 28, 2, 0, 0, 0, time.UTC)
	spec := map[string]any{"id": "spec1", "name": "声乐一对一"}
	creditType := map[string]any{"id": "type1", "courseSpecId": "spec1", "expand": map[string]any{"courseSpecId": spec}}
	batch := func(id, created, expires, status string, available, consumed float64) map[string]any {
		return map[string]any{"id": id, "studentId": "s1", "creditTypeId": "type1", "created": created, "status": status,
			"effectiveExpiresAt": expires, "availableQuantity": available, "consumedQuantity": consumed,
			"expand": map[string]any{"creditTypeId": creditType}}
	}
	courses := renewalCourses([]map[string]any{
		batch("b1", "2026-09-01 00:00:00.000Z", "2026-11-01 00:00:00.000Z", "depleted", 0, 4),
		batch("b2", "2026-10-01 00:00:00.000Z", "2026-12-31 00:00:00.000Z", "active", 1, 1),
	}, now)
	if len(courses) != 1 {
		t.Fatalf("courses = %+v", courses)
	}
	course := courses[0]
	// The depleted batch's earlier expiry does not count: nothing is left in it.
	if course.courseID != "spec1" || course.remaining != 1 || course.used != 5 || course.roundKey != "s1:spec1:b2" ||
		course.expiresAt != time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC).UnixMilli() || course.lapsed {
		t.Fatalf("course = %+v", course)
	}
	lapsed := renewalCourses([]map[string]any{batch("b3", "2026-01-01 00:00:00.000Z", "2026-03-01 00:00:00.000Z", "expired", 0, 2)}, now)
	if !lapsed[0].lapsed || renewalReason(lapsed[0], now) != "" {
		t.Fatalf("lapsed = %+v", lapsed[0])
	}
}

func TestRenewalMessageIsPriceFreeAndInAcademyTime(t *testing.T) {
	// 18:00Z is the next morning in Shanghai.
	expiry := time.Date(2026, 11, 9, 18, 0, 0, 0, time.UTC).UnixMilli()
	course := renewalCourse{courseName: "声乐一对一", remaining: 1.5, expiresAt: expiry}
	for reason, want := range map[string]string{
		"low_balance": "《声乐一对一》剩余 1.5 节课时，有效期至 2026-11-10。可在课包页查看续费课包。",
		"expiring":    "《声乐一对一》剩余 1.5 节课时，将于 2026-11-10 到期。可在课包页查看续费课包。",
	} {
		if got := renewalMessage(course, reason); got != want {
			t.Errorf("%s message = %q", reason, got)
		}
	}
	if got := renewalMessage(renewalCourse{courseName: "合唱"}, "manual"); got != "《合唱》课时已用完。可在课包页查看续费课包。" {
		t.Errorf("used up message = %q", got)
	}
}

type renewalFixture struct {
	ledgerFixture
	signer    *auth.Signer
	teacherID string
}

func renewalSetup(t *testing.T, wechat *RenewalWechat) renewalFixture {
	t.Helper()
	f := renewalFixture{ledgerFixture: ledgerSetup(t, true)}
	if err := migrations.EnsureRenewalReminders(f.app); err != nil {
		t.Fatal(err)
	}
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	f.signer = signer
	teacher, err := f.app.FindFirstRecordByFilter("teachers", "email='ops@example.com'")
	if err != nil {
		t.Fatal(err)
	}
	f.teacherID = teacher.Id
	f.handler = testkit.Serve(t, f.app, RenewalsModule{Signer: signer, Wechat: wechat}.Register)
	// One lesson left after three, valid well past the expiry window.
	put(t, f.app, "credit_batches", map[string]any{"studentId": f.studentID, "creditTypeId": f.creditTypeID, "originalQuantity": 4,
		"availableQuantity": 1, "consumedQuantity": 3, "status": "active", "effectiveExpiresAt": "2099-01-01 00:00:00.000Z"})
	return f
}

func (f renewalFixture) token(t *testing.T, id, role string, extra auth.Claims) map[string]string {
	t.Helper()
	value, err := f.signer.Sign(id, "S1", role, false, extra, auth.OpsTokenTTL)
	if err != nil {
		t.Fatal(err)
	}
	return testkit.Bearer(value)
}

func (f renewalFixture) reminders(t *testing.T) []map[string]any {
	t.Helper()
	rows, err := list(f.app, "renewal_reminders", "", "dedupeKey")
	if err != nil {
		t.Fatal(err)
	}
	return rows
}

func TestRenewalScanKeepsCooldownAndRoundLimit(t *testing.T) {
	f := renewalSetup(t, nil)
	now := clock()
	day := 24 * time.Hour
	scan := func(at time.Time, want int) {
		t.Helper()
		created, err := scanRenewals(f.app, nil, at)
		if err != nil || created != want {
			t.Fatalf("scan at +%v = %d, %v; want %d", at.Sub(now), created, err, want)
		}
	}
	scan(now, 1)
	first := f.reminders(t)[0]
	if first["trigger"] != "auto" || first["reason"] != "low_balance" || first["wechatStatus"] != "skipped" ||
		first["wechatError"] != "未配置订阅消息模板" || first["courseSpecId"] != f.specID ||
		!strings.Contains(first["message"].(string), "剩余 1 节课时") {
		t.Fatalf("first reminder = %v", first)
	}
	scan(now, 0)            // rerun on the same day
	scan(now.Add(6*day), 0) // cooldown
	scan(now.Add(8*day), 1)
	scan(now.Add(16*day), 1)
	scan(now.Add(24*day), 0) // three per round
	keys := map[string]bool{}
	for _, row := range f.reminders(t) {
		keys[row["dedupeKey"].(string)] = true
	}
	if len(keys) != 3 {
		t.Fatalf("dedupe keys = %v", keys)
	}
	// Renewal lands: plenty of lessons again, so the new round stays quiet.
	put(t, f.app, "credit_batches", map[string]any{"studentId": f.studentID, "creditTypeId": f.creditTypeID, "originalQuantity": 10,
		"availableQuantity": 10, "status": "active", "effectiveExpiresAt": "2099-06-01 00:00:00.000Z"})
	scan(now.Add(32*day), 0)
}

func TestRenewalRoutesSendOnceADayAndStayReadOnlyForTeachers(t *testing.T) {
	f := renewalSetup(t, nil)
	other := put(t, f.app, "students", map[string]any{"realName": "无课学员"}).Id
	send := func(headers map[string]string) testkit.Response {
		return testkit.Call(t, f.handler, http.MethodPost, "/ops/course-operations/renewal-reminders",
			map[string]any{"studentIds": []string{f.studentID, other, f.studentID}}, headers)
	}

	failed(t, send(f.plain), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "send without finance")
	result := ok(t, send(f.ops), "send")
	got := items(result)
	if result["sent"] != 1.0 || result["rejected"] != 1.0 || len(got) != 2 || got[0]["status"] != "sent" ||
		got[0]["wechatStatus"] != "skipped" || got[1]["status"] != "rejected" || got[1]["message"] != "该学员没有可提醒的课程" {
		t.Fatalf("send = %v", result)
	}
	again := items(ok(t, send(f.ops), "send again"))
	if again[0]["status"] != "rejected" || again[0]["message"] != "今天已经提醒过该学员，明天再试" {
		t.Fatalf("second send = %v", again)
	}
	rows := f.reminders(t)
	if len(rows) != 1 || rows[0]["trigger"] != "manual" || rows[0]["operatorId"] != f.teacherID {
		t.Fatalf("reminders = %v", rows)
	}

	listed := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-credits/renewals", nil, f.ops), "ops list")
	candidates := items(listed)
	if len(candidates) != 1 || candidates[0]["studentName"] != "学员甲" || candidates[0]["reason"] != "low_balance" ||
		candidates[0]["remindedToday"] != true || candidates[0]["lastReminder"].(map[string]any)["trigger"] != "manual" {
		t.Fatalf("ops list = %v", listed)
	}

	student := f.token(t, f.studentID, "student", nil)
	unread := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/student/renewal-reminders", nil, student), "student list")
	reminders := items(unread)
	if len(reminders) != 1 || reminders[0]["sender"] != "看乐教务" || unread["subscribeTemplateId"] != "" ||
		strings.ContainsAny(reminders[0]["message"].(string), "¥元价") {
		t.Fatalf("student list = %v", unread)
	}
	if read := ok(t, testkit.Call(t, f.handler, http.MethodPost, "/v1/student/renewal-reminders/read", map[string]any{}, student), "read"); read["read"] != 1.0 {
		t.Fatalf("read = %v", read)
	}
	if left := items(ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/student/renewal-reminders", nil, student), "after read")); len(left) != 0 {
		t.Fatalf("unread after read = %v", left)
	}
	failed(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/student/renewal-reminders", nil, f.teacher), 403,
		"STUDENT_LEARNING_STUDENT_REQUIRED", "teacher reading student reminders")

	// The teacher sees their own student, but has no way to send.
	put(t, f.app, "session_students", map[string]any{"sessionId": f.sessionID, "studentId": f.studentID, "attendanceStatus": "scheduled"})
	teacher := f.token(t, f.teacherID, "teacher", auth.Claims{"courseCreditCapabilities": []string{Teacher}})
	due := items(ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/teacher/renewals", nil, teacher), "teacher list"))
	if len(due) != 1 || due[0]["studentId"] != f.studentID || due[0]["lastReminder"] != nil {
		t.Fatalf("teacher list = %v", due)
	}
	if result := send(teacher); result.Code() != 403 {
		t.Fatalf("teacher send = %v", result.Body)
	}
	stranger := f.token(t, put(t, f.app, "teachers", map[string]any{"email": "t2@example.com", "password": "x1234567"}).Id,
		"teacher", auth.Claims{"courseCreditCapabilities": []string{Teacher}})
	if none := items(ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/teacher/renewals", nil, stranger), "other teacher")); len(none) != 0 {
		t.Fatalf("other teacher list = %v", none)
	}
}

func TestRenewalWechatDeliveryUsesSubscribeGrants(t *testing.T) {
	var mu sync.Mutex
	sent := []map[string]any{}
	refuse := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		mu.Lock()
		defer mu.Unlock()
		switch {
		case r.URL.Path == "/cgi-bin/stable_token" && body["appid"] == "app1" && body["secret"] == "sec1":
			_, _ = w.Write([]byte(`{"access_token":"tok","expires_in":7200}`))
		case r.URL.Path == "/cgi-bin/message/subscribe/send" && r.URL.Query().Get("access_token") == "tok" && !refuse:
			sent = append(sent, body)
			_, _ = w.Write([]byte(`{"errcode":0,"errmsg":"ok"}`))
		default:
			_, _ = w.Write([]byte(`{"errcode":43101,"errmsg":"user refuse to accept the msg"}`))
		}
	}))
	defer server.Close()

	if _, err := NewRenewalWechat("", "", "tpl1", `{"thing1":"{course}"}`, "", server.URL); err == nil {
		t.Fatal("a template without app credentials must be rejected")
	}
	if _, err := NewRenewalWechat("app1", "sec1", "tpl1", `[]`, "", server.URL); err == nil {
		t.Fatal("template data must be an object")
	}
	if off, err := NewRenewalWechat("", "", " ", "", "", ""); err != nil || off.TemplateID() != "" {
		t.Fatalf("blank template = %v, %v", off, err)
	}
	wechat, err := NewRenewalWechat("app1", "sec1", "tpl1",
		`{"thing1":"{course}","number2":"{remaining}","thing3":"{sender}：{message}"}`, "trial", server.URL)
	if err != nil {
		t.Fatal(err)
	}
	f := renewalSetup(t, wechat)

	if _, err := subscribeRenewals(f.app, f.studentID, ""); err == nil {
		t.Fatal("subscribing needs a WeChat identity")
	}
	student := f.token(t, f.studentID, "student", auth.Claims{"wechatOpenId": "openid-1"})
	granted := ok(t, testkit.Call(t, f.handler, http.MethodPost, "/v1/student/renewal-reminders/subscriptions", map[string]any{}, student), "subscribe")
	if granted["credits"] != 1.0 {
		t.Fatalf("subscribe = %v", granted)
	}
	if unread := ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/student/renewal-reminders", nil, student), "list"); unread["subscribeTemplateId"] != "tpl1" {
		t.Fatalf("template id = %v", unread)
	}

	now := clock()
	if created, err := scanRenewals(f.app, wechat, now); err != nil || created != 1 {
		t.Fatalf("scan = %d, %v", created, err)
	}
	if rows := f.reminders(t); rows[0]["wechatStatus"] != "sent" {
		t.Fatalf("delivery = %v", rows[0])
	}
	if len(sent) != 1 || sent[0]["touser"] != "openid-1" || sent[0]["template_id"] != "tpl1" ||
		sent[0]["page"] != renewalPage || sent[0]["miniprogram_state"] != "trial" {
		t.Fatalf("sent = %v", sent)
	}
	data := sent[0]["data"].(map[string]any)
	if data["thing1"].(map[string]any)["value"] != "声乐课时" || data["number2"].(map[string]any)["value"] != "1" ||
		len([]rune(data["thing3"].(map[string]any)["value"].(string))) != 20 {
		t.Fatalf("template data = %v", data)
	}

	// The grant is used up: the next reminder still lands in-app, WeChat is skipped.
	if created, _ := scanRenewals(f.app, wechat, now.Add(8*24*time.Hour)); created != 1 {
		t.Fatal("second scan must still create the in-app reminder")
	}
	if rows := f.reminders(t); rows[1]["wechatStatus"] != "skipped" || rows[1]["wechatError"] != "学员未授权订阅消息" {
		t.Fatalf("second delivery = %v", rows[1])
	}

	// WeChat refusing is recorded as failed and the reminder stays.
	ok(t, testkit.Call(t, f.handler, http.MethodPost, "/v1/student/renewal-reminders/subscriptions", map[string]any{}, student), "subscribe again")
	mu.Lock()
	refuse = true
	mu.Unlock()
	if created, _ := scanRenewals(f.app, wechat, now.Add(16*24*time.Hour)); created != 1 {
		t.Fatal("third scan must still create the in-app reminder")
	}
	if rows := f.reminders(t); len(rows) != 3 || rows[2]["wechatStatus"] != "failed" || !strings.Contains(rows[2]["wechatError"].(string), "43101") {
		t.Fatalf("third delivery = %v", rows)
	}
}
