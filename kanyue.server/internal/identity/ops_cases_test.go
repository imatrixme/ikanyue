package identity

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/config"
	"kanyue.server/internal/httpx"
	"kanyue.server/internal/testkit"
)

// Ops sign-in cases ported from Hono's opsLiteAuth tests. The guarded route stands in
// for any ops route behind RequireOps(false), like Hono's /ops/reward-items.

type opsFixture struct {
	app                                 core.App
	handler                             http.Handler
	signer                              *auth.Signer
	teacher, admin, blocked, unverified *core.Record
}

func opsSetup(t *testing.T, cfg config.Config) opsFixture {
	t.Helper()
	app := testkit.NewApp(t)
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	guarded := func(se *core.ServeEvent) {
		se.Router.GET("/ops/reward-items", signer.RequireOps(false, func(e *core.RequestEvent) error {
			return httpx.Respond(e, func() (any, error) { return map[string]any{"allowed": true}, nil })
		}))
	}
	f := opsFixture{app: app, signer: signer,
		handler: testkit.Serve(t, app, Module{Signer: signer, Config: cfg}.Register, guarded)}
	teacher := func(fields map[string]any) *core.Record {
		base := map[string]any{"password": "secret-pass", "verified": true}
		for key, value := range fields {
			base[key] = value
		}
		return testkit.Create(t, app, "teachers", base)
	}
	f.teacher = teacher(map[string]any{"sn": "T1", "cellphone": "13900000001", "email": "t1@example.com"})
	f.admin = teacher(map[string]any{"sn": "A1", "username": "admin", "email": "admin@example.com", "password": "admin-pass", "idAdmin": true})
	f.blocked = teacher(map[string]any{"sn": "B1", "cellphone": "13800000009", "email": "b@example.com", "blocked": true})
	f.unverified = teacher(map[string]any{"sn": "U1", "cellphone": "13900000009", "email": "u@example.com", "verified": false})
	for _, phone := range []string{"13800000001", "13800000002"} {
		testkit.Create(t, app, "students", map[string]any{"cellphone": phone, "password": md5Hex("secret-pass")})
	}
	return f
}

func (f opsFixture) login(t *testing.T, body map[string]any) testkit.Response {
	t.Helper()
	return testkit.Call(t, f.handler, http.MethodPost, "/ops/auth/login", body, nil)
}

// Hono: opsLiteAuth › ops auth accepts only verified teacher/admin accounts and never creates students
func TestOpsLoginAcceptsOnlyVerifiedTeachers(t *testing.T) {
	f := opsSetup(t, config.Config{})
	teacher := f.login(t, map[string]any{"cellphone": "13900000001", "password": "secret-pass"})
	profile := teacher.Data()["profile"].(map[string]any)
	if teacher.Code() != 10000 || profile["role"] != "teacher" || profile["isAdmin"] != false {
		t.Fatalf("teacher = %v", teacher.Body)
	}
	if admin := f.login(t, map[string]any{"account": "admin", "password": "admin-pass"}); admin.Code() != 10000 ||
		admin.Data()["profile"].(map[string]any)["role"] != "admin" {
		t.Fatalf("admin = %v", admin.Body)
	}
	for phone, code := range map[string]int{"13800000001": 401, "13800000009": 403, "13900000009": 403} {
		if result := f.login(t, map[string]any{"cellphone": phone, "password": "secret-pass"}); result.Code() != code {
			t.Fatalf("%s = %v", phone, result.Body)
		}
	}
	if total, _ := f.app.CountRecords("students"); total != 2 {
		t.Fatalf("students = %d", total)
	}
	if logins, _ := f.app.FindRecordsByFilter("ops_audit_logs", `action="ops.auth.login"`, "", 0, 0); len(logins) == 0 {
		t.Fatal("login not audited")
	}
}

// Hono: opsLiteAuth › default admin login can be forced through password change before ops access
func TestOpsDefaultAdminMustChangePassword(t *testing.T) {
	f := opsSetup(t, config.Config{})
	f.admin.Set("opsPasswordChangeRequired", true)
	if err := f.app.Save(f.admin); err != nil {
		t.Fatal(err)
	}
	login := f.login(t, map[string]any{"username": "admin", "password": "admin-pass"})
	if login.Code() != 10000 || login.Data()["profile"].(map[string]any)["passwordChangeRequired"] != true {
		t.Fatalf("login = %v", login.Body)
	}
	token := testkit.Bearer(login.Data()["token"].(string))
	if me := testkit.Call(t, f.handler, http.MethodGet, "/ops/auth/me", nil, token); me.Code() != 10000 {
		t.Fatalf("me = %v", me.Body)
	}
	if guarded := testkit.Call(t, f.handler, http.MethodGet, "/ops/reward-items", nil, token); guarded.Body["message"] != "首次登录必须先修改默认密码" {
		t.Fatalf("guarded = %v", guarded.Body)
	}
	changed := testkit.Call(t, f.handler, http.MethodPost, "/ops/auth/change-password", map[string]any{"currentPassword": "admin-pass",
		"newPassword": "next-pass-1", "confirmPassword": "next-pass-1"}, token)
	if changed.Code() != 10000 || changed.Data()["profile"].(map[string]any)["passwordChangeRequired"] != false {
		t.Fatalf("changed = %v", changed.Body)
	}
	if reloaded, _ := f.app.FindRecordById("teachers", f.admin.Id); reloaded.GetBool("opsPasswordChangeRequired") {
		t.Fatal("flag not cleared")
	}
	fresh := testkit.Bearer(changed.Data()["token"].(string))
	if guarded := testkit.Call(t, f.handler, http.MethodGet, "/ops/reward-items", nil, fresh); guarded.Code() != 10000 {
		t.Fatalf("guarded after change = %v", guarded.Body)
	}
}

// Hono: opsLiteAuth › ops teacher registration is gated and creates pending inactive accounts
func TestOpsRegistrationIsGated(t *testing.T) {
	body := map[string]any{"cellphone": "13800138009", "password": "secret123", "realName": "待审老师"}
	disabled := opsSetup(t, config.Config{})
	if result := testkit.Call(t, disabled.handler, http.MethodPost, "/ops/auth/register", body, nil); result.Code() != 403 {
		t.Fatalf("disabled = %v", result.Body)
	}
	enabled := opsSetup(t, config.Config{OpsRegistrationEnabled: true})
	// Registration writes no email (Hono neither), so the studio schema keeps teacher email optional.
	teachers, err := enabled.app.FindCollectionByNameOrId("teachers")
	if err != nil {
		t.Fatal(err)
	}
	teachers.Fields.GetByName("email").(*core.EmailField).Required = false
	if err := enabled.app.Save(teachers); err != nil {
		t.Fatal(err)
	}
	registered := testkit.Call(t, enabled.handler, http.MethodPost, "/ops/auth/register", body, nil)
	profile, _ := registered.Data()["profile"].(map[string]any)
	if registered.Code() != 10000 || registered.Data()["status"] != "pending_activation" || profile["verified"] != false || profile["blocked"] != true {
		t.Fatalf("registered = %v", registered.Body)
	}
	body["realName"] = "重复老师"
	if again := testkit.Call(t, enabled.handler, http.MethodPost, "/ops/auth/register", body, nil); again.Code() != 409 {
		t.Fatalf("duplicate = %v", again.Body)
	}
}

// Hono: opsLiteAuth › ops auth service and middleware cover validation, profile, token, and failure branches
func TestOpsAuthBranches(t *testing.T) {
	f := opsSetup(t, config.Config{})
	if empty := f.login(t, map[string]any{"cellphone": "", "password": ""}); empty.Code() != 400 {
		t.Fatalf("empty = %v", empty.Body)
	}
	sign := func(id, role string, extra auth.Claims) map[string]string {
		token, err := f.signer.Sign(id, "sn", role, true, extra, auth.OpsTokenTTL)
		if err != nil {
			t.Fatal(err)
		}
		return testkit.Bearer(token)
	}
	ops := auth.Claims{"scope": auth.OpsScope}
	me := func(headers map[string]string) testkit.Response {
		return testkit.Call(t, f.handler, http.MethodGet, "/ops/auth/me", nil, headers)
	}
	for name, headers := range map[string]map[string]string{
		"anonymous": nil, "bad token": testkit.Bearer("bad-token"), "student": sign("student", "student", ops),
		"blocked": sign(f.blocked.Id, "teacher", ops),
	} {
		if result := me(headers); result.Code() != 403 {
			t.Fatalf("%s = %v", name, result.Body)
		}
	}
	teacher := sign(f.teacher.Id, "teacher", ops)
	for _, item := range []struct {
		body    map[string]any
		message string
	}{
		{map[string]any{}, "当前密码和新密码不能为空"},
		{map[string]any{"currentPassword": "secret-pass", "newPassword": "short", "confirmPassword": "short"}, "新密码至少需要 8 位"},
		{map[string]any{"currentPassword": "secret-pass", "newPassword": "newSecret123", "confirmPassword": "different123"}, "两次输入的新密码不一致"},
		{map[string]any{"currentPassword": "wrongSecret", "newPassword": "newSecret123", "confirmPassword": "newSecret123"}, "当前密码不正确"},
	} {
		if result := testkit.Call(t, f.handler, http.MethodPost, "/ops/auth/change-password", item.body, teacher); result.Body["message"] != item.message {
			t.Fatalf("%v = %v", item.body, result.Body)
		}
	}
	if result := testkit.Call(t, f.handler, http.MethodPost, "/ops/auth/change-password", map[string]any{},
		sign(f.teacher.Id, "student", ops)); result.Body["message"] != "后台仅允许教师或管理员访问" {
		t.Fatalf("student change = %v", result.Body)
	}

	guarded := sign(f.teacher.Id, "teacher", auth.Claims{"scope": auth.OpsScope, "passwordChangeRequired": true})
	if result := me(guarded); result.Code() != 10000 {
		t.Fatalf("guarded me = %v", result.Body)
	}
	if result := testkit.Call(t, f.handler, http.MethodGet, "/ops/reward-items", nil, guarded); result.Body["message"] != "首次登录必须先修改默认密码" {
		t.Fatalf("guarded route = %v", result.Body)
	}
}

// Hono: opsLiteAuth › ops utility helpers keep light branch request and projection behavior stable
func TestOpsRequestHelpers(t *testing.T) {
	f := opsSetup(t, config.Config{})
	login := f.login(t, map[string]any{"cellphone": "13900000001", "password": "secret-pass"})
	token := login.Data()["token"].(string)
	// A token header is trimmed and accepted like a bearer token.
	if result := testkit.Call(t, f.handler, http.MethodGet, "/ops/auth/me", nil, map[string]string{"token": " " + token + " "}); result.Code() != 10000 {
		t.Fatalf("token header = %v", result.Body)
	}
	// Malformed JSON reads as an empty body; form bodies are read as fields.
	if result := testkit.Raw(t, f.handler, http.MethodPost, "/ops/auth/login", "{bad", map[string]string{"Content-Type": "application/json"}); result.Body["message"] != "账号和密码不能为空" {
		t.Fatalf("bad json = %v", result.Body)
	}
	form := testkit.Raw(t, f.handler, http.MethodPost, "/ops/auth/login", "cellphone=13800000001&password=secret-pass",
		map[string]string{"Content-Type": "application/x-www-form-urlencoded"})
	if form.Code() != 401 {
		t.Fatalf("form = %v", form.Body)
	}
	form = testkit.Raw(t, f.handler, http.MethodPost, "/ops/auth/login", "account=admin&password=admin-pass",
		map[string]string{"Content-Type": "application/x-www-form-urlencoded"})
	if form.Code() != 10000 {
		t.Fatalf("form login = %v", form.Body)
	}
}

// Hono: opsLiteAuth › ops login filter treats the account as a literal value
func TestOpsLoginAccountIsLiteral(t *testing.T) {
	f := opsSetup(t, config.Config{})
	for _, account := range []string{`a" || id!="`, `admin" || username!="`, `a\b`, `a\`} {
		if result := f.login(t, map[string]any{"account": account, "password": "admin-pass"}); result.Code() != 401 {
			t.Fatalf("%q = %v", account, result.Body)
		}
	}
	if plain := f.login(t, map[string]any{"account": "admin", "password": "admin-pass"}); plain.Code() != 10000 {
		t.Fatalf("plain account = %v", plain.Body)
	}
}

// Hono: opsLiteAuth › ops tokens carry ops scope and a 12 hour expiry
func TestOpsTokenScopeAndExpiry(t *testing.T) {
	f := opsSetup(t, config.Config{})
	login := f.login(t, map[string]any{"cellphone": "13900000001", "password": "secret-pass"})
	claims := f.signer.SessionUser(login.Data()["token"].(string))
	exp, _ := claims["exp"].(float64)
	iat, _ := claims["iat"].(float64)
	if claims["scope"] != auth.OpsScope || exp-iat != 12*3600 {
		t.Fatalf("claims = %v", claims)
	}
}
