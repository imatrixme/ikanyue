package identity

import (
	"errors"
	"net/http"
	"net/url"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/config"
	"kanyue.server/internal/testkit"
)

// Page-facing user route cases ported from Hono's pageFacingUserRoutes tests.
// Hono routed fake identities by path; Go reads them from the session token.

type userFixture struct {
	app     core.App
	handler http.Handler
	signer  *auth.Signer
	ids     map[string]string
}

func userSetup(t *testing.T, cfg config.Config) *userFixture {
	t.Helper()
	f := &userFixture{ids: map[string]string{}}
	f.app, f.handler, f.signer = setup(t, cfg)
	for name, fields := range map[string]map[string]any{
		"student":        {"sn": "S1", "cellphone": "13900000011", "password": md5Hex("secret"), "avatar": "avatar.jpg", "tokenKey": "k"},
		"blocked":        {"cellphone": "13900000001", "password": md5Hex("secret"), "blocked": true},
		"studentNoStamp": {"cellphone": "13900000002", "password": md5Hex("secret")},
	} {
		f.ids[name] = testkit.Create(t, f.app, "students", fields).Id
	}
	for name, fields := range map[string]map[string]any{
		"teacher":        {"sn": "T1", "cellphone": "13700000000", "email": "t1@example.com", "verified": true, "idAdmin": true, "isAdmin": true},
		"teacherBlocked": {"cellphone": "13900000022", "email": "t2@example.com", "verified": true, "blocked": true},
		"teacherPending": {"cellphone": "13900000033", "email": "t3@example.com"},
		"teacherNoStamp": {"cellphone": "{{PHONE_9hbz9ipi}}", "email": "t4@example.com", "verified": true},
	} {
		fields["password"] = "secret-pass"
		f.ids[name] = testkit.Create(t, f.app, "teachers", fields).Id
	}
	return f
}

func (f *userFixture) token(t *testing.T, role, name string) map[string]string {
	t.Helper()
	id := f.ids[name]
	if id == "" {
		id = name
	}
	token, err := f.signer.Sign(id, "SN", role, false, nil, auth.AppTokenTTL)
	if err != nil {
		t.Fatal(err)
	}
	return testkit.Bearer(token)
}

func (f *userFixture) form(t *testing.T, path string, fields map[string]string, headers map[string]string) testkit.Response {
	t.Helper()
	values := url.Values{}
	for key, value := range fields {
		values.Set(key, value)
	}
	all := map[string]string{"Content-Type": "application/x-www-form-urlencoded"}
	for key, value := range headers {
		all[key] = value
	}
	return testkit.Raw(t, f.handler, http.MethodPost, path, values.Encode(), all)
}

func (f *userFixture) post(t *testing.T, path string, body map[string]any, headers map[string]string) testkit.Response {
	t.Helper()
	return testkit.Call(t, f.handler, http.MethodPost, path, body, headers)
}

// failSaves fails every save of one record, before or after a hook rewrite.
func failSaves(app core.App, collection, id string, rewrite func(*core.Record)) {
	app.OnRecordUpdate(collection).BindFunc(func(e *core.RecordEvent) error {
		if e.Record.Id != id {
			return e.Next()
		}
		if rewrite != nil {
			rewrite(e.Record)
			return e.Next()
		}
		return errors.New("update failed")
	})
}

func wantCode(t *testing.T, result testkit.Response, code int, what string) {
	t.Helper()
	if result.Code() != code {
		t.Fatalf("%s: want %d, got %v", what, code, result.Body)
	}
}

// Hono: pageFacingUserRoutes › teacher password matching supports legacy hashes and PocketBase auth records
// Teachers are an auth collection, so the stored hash never reaches application
// code and Hono's legacy MD5 branch cannot fire; only the auth check remains.
func TestTeacherPasswordMatchesAuthRecords(t *testing.T) {
	f := userSetup(t, config.Config{})
	teacher, _ := f.app.FindRecordById("teachers", f.ids["teacher"])
	if !teacherPasswordMatches(teacher, "secret-pass") || teacherPasswordMatches(teacher, "wrong") {
		t.Fatal("auth password check")
	}
	teacher.SetEmail("")
	if teacherPasswordMatches(teacher, "secret-pass") {
		t.Fatal("a teacher without email must not authenticate")
	}
}

// Hono: pageFacingUserRoutes › user routes cover miniapp profile login, refresh, and update flow
func TestUserProfileLoginRefreshAndUpdate(t *testing.T) {
	f := userSetup(t, config.Config{PBPublicURL: "https://pb.example.com"})
	login := f.post(t, "/v1/user/login", map[string]any{"cellphone": "13900000011", "password": "secret"}, nil)
	data := login.Data()
	collection, _ := f.app.FindCollectionByNameOrId("students")
	if login.Code() != 10000 || data["role"] != "student" || data["isAdmin"] != false ||
		data["avatarUrl"] != "https://pb.example.com/api/files/"+collection.Id+"/"+f.ids["student"]+"/avatar.jpg" {
		t.Fatalf("login = %v", login.Body)
	}
	for _, private := range []string{"password", "tokenKey"} {
		if _, leaked := data[private]; leaked {
			t.Fatalf("login leaked %s", private)
		}
	}
	method := func() string {
		record, _ := f.app.FindRecordById("students", f.ids["student"])
		return record.GetString("lastLoginMethod")
	}
	if method() != "password" {
		t.Fatalf("login method = %q", method())
	}

	session := testkit.Bearer(data["token"].(string))
	if refreshed := f.post(t, "/v1/user/refresh", nil, session); refreshed.Code() != 10000 || refreshed.Data()["token"] == "" || method() != "refresh" {
		t.Fatalf("refresh = %v, method %q", refreshed.Body, method())
	}

	updated := f.post(t, "/v1/user/update", map[string]any{"nickname": "新昵称", "realname": "王同学", "gender": 2, "age": 12,
		"province": "上海市", "avatar": "", "ignored": "field"}, session)
	data = updated.Data()
	if updated.Code() != 10000 || data["nickName"] != "新昵称" || data["nickname"] != "新昵称" || data["realName"] != "王同学" ||
		data["realname"] != "王同学" || data["gender"] != 2.0 || data["avatar"] != "" {
		t.Fatalf("update = %v", updated.Body)
	}
	if _, leaked := data["ignored"]; leaked {
		t.Fatalf("ignored field echoed: %v", data)
	}
	stored, _ := f.app.FindRecordById("students", f.ids["student"])
	if stored.GetInt("age") != 12 || stored.GetString("province") != "上海市" || stored.GetString("avatar") != "" {
		t.Fatalf("stored = %v", stored)
	}
}

// Hono: pageFacingUserRoutes › user login route covers miniapp auth success and rejection paths
func TestUserLoginOutcomes(t *testing.T) {
	f := userSetup(t, config.Config{})
	failSaves(f.app, "students", f.ids["studentNoStamp"], nil)
	failSaves(f.app, "teachers", f.ids["teacherNoStamp"], nil)
	login := func(cellphone, password string) testkit.Response {
		return f.form(t, "/v1/user/login", map[string]string{"cellphone": cellphone, "password": password}, nil)
	}

	wantCode(t, login("", ""), 400, "empty")
	wantCode(t, login("13900000011", "wrong"), 401, "student wrong password")
	wantCode(t, login("13900000001", "secret"), 403, "blocked student")
	if stampless := login("13900000002", "secret"); stampless.Code() != 10000 || stampless.Data()["isAdmin"] != false {
		t.Fatalf("student stamp failure must not block login: %v", stampless.Body)
	}

	wantCode(t, login("13700000000", "wrong"), 401, "teacher wrong password")
	wantCode(t, login("13900000022", "secret-pass"), 403, "blocked teacher")
	wantCode(t, login("13900000033", "secret-pass"), 403, "pending teacher")
	teacher := login("13700000000", "secret-pass")
	if teacher.Code() != 10000 || teacher.Data()["role"] != "teacher" || teacher.Data()["isAdmin"] != true {
		t.Fatalf("teacher = %v", teacher.Body)
	}
	if claims := f.signer.SessionUser(teacher.Data()["token"].(string)); claims["id"] != f.ids["teacher"] || claims["isAdmin"] != true {
		t.Fatalf("teacher claims = %v", claims)
	}
	if stampless := login("{{PHONE_9hbz9ipi}}", "secret-pass"); stampless.Code() != 10000 || stampless.Data()["isAdmin"] != false {
		t.Fatalf("teacher stamp failure must not block login: %v", stampless.Body)
	}

	students, _ := f.app.CountRecords("students")
	wantCode(t, login("13800000000", "secret"), 401, "unknown phone")
	if after, _ := f.app.CountRecords("students"); after != students {
		t.Fatal("unknown phone created a student")
	}
	if _, err := f.app.DB().NewQuery("ALTER TABLE students RENAME TO students_offline").Execute(); err != nil {
		t.Fatal(err)
	}
	wantCode(t, login("13900000011", "secret"), 500, "query failure")
}

// Hono: pageFacingUserRoutes › user refresh route covers unauthorized, student, teacher, and invalid-role paths
func TestUserRefreshOutcomes(t *testing.T) {
	f := userSetup(t, config.Config{})
	failSaves(f.app, "students", f.ids["studentNoStamp"], nil)
	refresh := func(headers map[string]string) testkit.Response {
		return f.post(t, "/v1/user/refresh", nil, headers)
	}

	wantCode(t, refresh(nil), 403, "anonymous")
	wantCode(t, refresh(f.token(t, "student", "missing00000000")), 404, "missing student")
	wantCode(t, refresh(f.token(t, "student", "blocked")), 403, "blocked student")
	wantCode(t, refresh(f.token(t, "student", "studentNoStamp")), 500, "stamp failure")
	if student := refresh(f.token(t, "student", "student")); student.Code() != 10000 || student.Data()["avatar"] != "avatar.jpg" {
		t.Fatalf("student = %v", student.Body)
	}

	teacher := refresh(f.token(t, "teacher", "teacher"))
	if teacher.Code() != 10000 || teacher.Data()["role"] != "teacher" || teacher.Data()["isAdmin"] != true {
		t.Fatalf("teacher = %v", teacher.Body)
	}
	wantCode(t, refresh(f.token(t, "teacher", "teacherBlocked")), 403, "blocked teacher")
	wantCode(t, refresh(f.token(t, "teacher", "teacherPending")), 403, "pending teacher")
	wantCode(t, refresh(f.token(t, "teacher", "missing00000000")), 404, "missing teacher")
	wantCode(t, refresh(f.token(t, "other", "student")), 400, "invalid role")
}

// Hono: pageFacingUserRoutes › user update route covers field filtering, role routing, and update failures
func TestUserUpdateOutcomes(t *testing.T) {
	f := userSetup(t, config.Config{})
	failSaves(f.app, "students", f.ids["studentNoStamp"], nil)
	failSaves(f.app, "students", f.ids["blocked"], func(record *core.Record) { record.Set("nickName", "旧昵称") })
	failSaves(f.app, "teachers", f.ids["teacherNoStamp"], nil)
	nickname := map[string]any{"nickname": "新昵称"}

	wantCode(t, f.post(t, "/v1/user/update", nickname, nil), 403, "anonymous")
	wantCode(t, f.post(t, "/v1/user/update", map[string]any{"ignored": "field"}, f.token(t, "student", "student")), 400, "no fields")
	wantCode(t, f.post(t, "/v1/user/update", nickname, f.token(t, "student", "missing00000000")), 404, "missing student")
	wantCode(t, f.post(t, "/v1/user/update", nickname, f.token(t, "student", "studentNoStamp")), 500, "save failure")
	if ignored := f.post(t, "/v1/user/update", nickname, f.token(t, "student", "blocked")); ignored.Code() != 500 || ignored.Body["message"] != "昵称更新未生效" {
		t.Fatalf("silently ignored update = %v", ignored.Body)
	}

	teacher := f.form(t, "/v1/user/update", map[string]string{"nickname": "老师", "avatar": "https://example.com/avatar.jpg"},
		f.token(t, "teacher", "teacher"))
	if teacher.Code() != 10000 || teacher.Data()["nickName"] != "老师" || teacher.Data()["nickname"] != "老师" ||
		teacher.Data()["avatar"] != "https://example.com/avatar.jpg" {
		t.Fatalf("teacher = %v", teacher.Body)
	}
	wantCode(t, f.post(t, "/v1/user/update", nickname, f.token(t, "teacher", "missing00000000")), 404, "missing teacher")
	wantCode(t, f.post(t, "/v1/user/update", nickname, f.token(t, "teacher", "teacherNoStamp")), 500, "teacher save failure")
	wantCode(t, f.post(t, "/v1/user/update", nickname, f.token(t, "other", "student")), 400, "invalid role")
}

// Hono: pageFacingUserRoutes › user login escapes the account and throttles repeated failures
func TestUserLoginTreatsAccountLiterallyAndThrottles(t *testing.T) {
	f := userSetup(t, config.Config{})
	login := func(cellphone, password string) testkit.Response {
		return f.form(t, "/v1/user/login", map[string]string{"cellphone": cellphone, "password": password}, nil)
	}
	for _, account := range []string{`x" || id != "`, `a\`} {
		wantCode(t, login(account, "secret"), 401, account)
	}
	for attempt := 0; attempt < failureLimit; attempt++ {
		wantCode(t, login("13900000011", "wrong"), 401, "guess")
	}
	if throttled := login("13900000011", "secret"); throttled.Code() != 429 {
		t.Fatalf("correct password while throttled = %v", throttled.Body)
	}
}
