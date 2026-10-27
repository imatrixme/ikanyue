package identity

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/config"
	"kanyue.server/internal/testkit"
)

func setup(t *testing.T, cfg config.Config) (core.App, http.Handler, *auth.Signer) {
	t.Helper()
	app := testkit.NewApp(t)
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	return app, testkit.Serve(t, app, Module{Signer: signer, Config: cfg}.Register), signer
}

func TestPasswordLogin(t *testing.T) {
	app, handler, signer := setup(t, config.Config{DefaultAvatar: "https://cdn.test/default.png"})
	testkit.Create(t, app, "students", map[string]any{
		"sn": "S1", "cellphone": "13800000001", "password": md5Hex("secret1"), "nickName": "学员", "wechatId": "hidden",
	})
	testkit.Create(t, app, "teachers", map[string]any{
		"sn": "T1", "cellphone": "13900000001", "email": "t1@example.com", "password": "teacher-pass",
		"verified": true, "idAdmin": true, "courseCreditCapabilities": []string{"grant"},
	})
	testkit.Create(t, app, "teachers", map[string]any{
		"sn": "T2", "cellphone": "13900000002", "email": "t2@example.com", "password": "teacher-pass",
	})

	student := testkit.Call(t, handler, http.MethodPost, "/v1/user/login", map[string]any{"cellphone": "13800000001", "password": "secret1"}, nil)
	data := student.Data()
	if student.Code() != 10000 || data["role"] != "student" || data["isAdmin"] != false || data["avatar"] != "https://cdn.test/default.png" {
		t.Fatalf("student login: %v", student.Body)
	}
	for _, private := range []string{"password", "tokenKey", "wechatId", "lastLoginIp"} {
		if _, ok := data[private]; ok {
			t.Fatalf("student login leaked %s", private)
		}
	}
	if claims := signer.SessionUser(data["token"].(string)); claims["role"] != "student" || claims["sn"] != "S1" {
		t.Fatalf("student token claims: %v", claims)
	}

	teacher := testkit.Call(t, handler, http.MethodPost, "/v1/user/login", map[string]any{"cellphone": "13900000001", "password": "teacher-pass"}, nil)
	if teacher.Code() != 10000 || teacher.Data()["role"] != "teacher" || teacher.Data()["isAdmin"] != true {
		t.Fatalf("teacher login: %v", teacher.Body)
	}
	if _, ok := teacher.Data()["idAdmin"]; ok {
		t.Fatal("idAdmin should be folded into isAdmin")
	}
	claims := signer.SessionUser(teacher.Data()["token"].(string))
	if capabilities, _ := claims["courseCreditCapabilities"].([]any); len(capabilities) != 1 {
		t.Fatalf("teacher token claims: %v", claims)
	}

	pending := testkit.Call(t, handler, http.MethodPost, "/v1/user/login", map[string]any{"cellphone": "13900000002", "password": "teacher-pass"}, nil)
	if pending.Code() != 403 || pending.Body["message"] != "账号正在审核中，请耐心等待" {
		t.Fatalf("unverified teacher: %v", pending.Body)
	}
	empty := testkit.Call(t, handler, http.MethodPost, "/v1/user/login", map[string]any{"cellphone": "13800000001"}, nil)
	if empty.Code() != 400 || empty.Body["message"] != "手机号和密码不能为空" {
		t.Fatalf("missing password: %v", empty.Body)
	}
}

func TestPasswordLoginThrottlesAfterFiveFailures(t *testing.T) {
	_, handler, _ := setup(t, config.Config{})
	body := map[string]any{"cellphone": "13700000000", "password": "nope"}
	for i := 0; i < failureLimit; i++ {
		if result := testkit.Call(t, handler, http.MethodPost, "/v1/user/login", body, nil); result.Code() != 401 || result.Body["message"] != "手机号或密码错误" {
			t.Fatalf("attempt %d: %v", i, result.Body)
		}
	}
	if result := testkit.Call(t, handler, http.MethodPost, "/v1/user/login", body, nil); result.Code() != 429 {
		t.Fatalf("expected throttle, got %v", result.Body)
	}
}

func TestRefreshAndUpdate(t *testing.T) {
	app, handler, signer := setup(t, config.Config{DefaultAvatar: "https://cdn.test/default.png"})
	student := testkit.Create(t, app, "students", map[string]any{"sn": "S1", "cellphone": "13800000001", "nickName": "旧昵称"})
	token, _ := signer.Sign(student.Id, "S1", "student", false, nil, auth.AppTokenTTL)

	refreshed := testkit.Call(t, handler, http.MethodPost, "/v1/user/refresh", nil, testkit.Bearer(token))
	if refreshed.Code() != 10000 || refreshed.Data()["role"] != "student" || refreshed.Data()["token"] == "" {
		t.Fatalf("refresh: %v", refreshed.Body)
	}
	reloaded, _ := app.FindRecordById("students", student.Id)
	if reloaded.GetString("lastLoginMethod") != "refresh" {
		t.Fatalf("refresh should stamp the login, got %q", reloaded.GetString("lastLoginMethod"))
	}

	updated := testkit.Call(t, handler, http.MethodPost, "/v1/user/update", map[string]any{"nickname": "新昵称", "avatar": " "}, testkit.Bearer(token))
	data := updated.Data()
	if updated.Code() != 10000 || data["nickName"] != "新昵称" || data["nickname"] != "新昵称" || data["avatar"] != "https://cdn.test/default.png" {
		t.Fatalf("update: %v", updated.Body)
	}
	if none := testkit.Call(t, handler, http.MethodPost, "/v1/user/update", map[string]any{"unknown": 1}, testkit.Bearer(token)); none.Code() != 400 {
		t.Fatalf("empty update: %v", none.Body)
	}

	unauthorized := testkit.Call(t, handler, http.MethodPost, "/v1/user/refresh", nil, nil)
	if unauthorized.Code() != 403 || unauthorized.Body["errorCode"] != "AUTH_SESSION_INVALID" || unauthorized.Body["message"] != "未授权，请登录后操作" {
		t.Fatalf("missing token: %v", unauthorized.Body)
	}
}

func TestOpsAuth(t *testing.T) {
	app, handler, signer := setup(t, config.Config{})
	teacher := testkit.Create(t, app, "teachers", map[string]any{
		"sn": "T1", "cellphone": "13900000001", "username": "zhang", "email": "t1@example.com", "password": "initial-pass",
		"verified": true, "idAdmin": true, "opsPasswordChangeRequired": true, "realName": "张老师",
	})

	wrong := testkit.Call(t, handler, http.MethodPost, "/ops/auth/login", map[string]any{"account": "zhang", "password": "bad-pass"}, nil)
	if wrong.Code() != 401 || wrong.Body["message"] != "后台账号或密码错误" {
		t.Fatalf("wrong password: %v", wrong.Body)
	}
	login := testkit.Call(t, handler, http.MethodPost, "/ops/auth/login", map[string]any{"account": "zhang", "password": "initial-pass"}, nil)
	profile, _ := login.Data()["profile"].(map[string]any)
	if login.Code() != 10000 || profile["role"] != "admin" || profile["passwordChangeRequired"] != true || profile["nickName"] != "张老师" {
		t.Fatalf("ops login: %v", login.Body)
	}
	token := login.Data()["token"].(string)
	if claims := signer.SessionUser(token); claims["scope"] != auth.OpsScope || claims["passwordChangeRequired"] != true {
		t.Fatalf("ops token claims: %v", claims)
	}
	if audits, _ := app.CountRecords("ops_audit_logs"); audits != 1 {
		t.Fatalf("want the allowed login audited once (anonymous denials fail validation like Hono), got %d", audits)
	}

	me := testkit.Call(t, handler, http.MethodGet, "/ops/auth/me", nil, testkit.Bearer(token))
	if me.Code() != 10000 || me.Data()["profile"].(map[string]any)["id"] != teacher.Id {
		t.Fatalf("me: %v", me.Body)
	}
	for _, check := range []struct {
		body    map[string]any
		code    int
		message string
	}{
		{map[string]any{"currentPassword": "initial-pass"}, 400, "当前密码和新密码不能为空"},
		{map[string]any{"currentPassword": "initial-pass", "newPassword": "short"}, 400, "新密码至少需要 8 位"},
		{map[string]any{"currentPassword": "initial-pass", "newPassword": "initial-pass"}, 400, "新密码不能与当前密码相同"},
		{map[string]any{"currentPassword": "initial-pass", "newPassword": "next-pass-1", "confirmPassword": "x"}, 400, "两次输入的新密码不一致"},
		{map[string]any{"currentPassword": "bad-pass-0", "newPassword": "next-pass-1", "confirmPassword": "next-pass-1"}, 401, "当前密码不正确"},
	} {
		result := testkit.Call(t, handler, http.MethodPost, "/ops/auth/change-password", check.body, testkit.Bearer(token))
		if result.Code() != check.code || result.Body["message"] != check.message {
			t.Fatalf("change-password %v: %v", check.body, result.Body)
		}
	}
	changed := testkit.Call(t, handler, http.MethodPost, "/ops/auth/change-password",
		map[string]any{"currentPassword": "initial-pass", "newPassword": "next-pass-1", "confirmPassword": "next-pass-1"}, testkit.Bearer(token))
	if changed.Code() != 10000 || changed.Data()["profile"].(map[string]any)["passwordChangeRequired"] != false {
		t.Fatalf("change-password: %v", changed.Body)
	}
	reloaded, _ := app.FindRecordById("teachers", teacher.Id)
	if !reloaded.ValidatePassword("next-pass-1") || reloaded.GetBool("opsPasswordChangeRequired") {
		t.Fatal("password change was not persisted")
	}

	appToken, _ := signer.Sign(teacher.Id, "T1", "teacher", true, nil, auth.AppTokenTTL)
	if result := testkit.Call(t, handler, http.MethodGet, "/ops/auth/me", nil, testkit.Bearer(appToken)); result.Body["message"] != "后台登录已过期，请重新登录" {
		t.Fatalf("mini program token on ops: %v", result.Body)
	}
	if result := testkit.Call(t, handler, http.MethodPost, "/ops/auth/register", map[string]any{"cellphone": "13900000009"}, nil); result.Code() != 403 || result.Body["message"] != "教务系统注册未开放" {
		t.Fatalf("register disabled: %v", result.Body)
	}
}

// fakeWechat answers jscode2session with a fixed session key.
func fakeWechat(t *testing.T, openID, sessionKey string) string {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("js_code") == "" || r.URL.Query().Get("appid") != "wx-test" {
			_ = json.NewEncoder(w).Encode(map[string]any{"errcode": 40029, "errmsg": "invalid code"})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"openid": openID, "session_key": sessionKey})
	}))
	t.Cleanup(server.Close)
	return server.URL
}

func encryptPhone(t *testing.T, sessionKey, iv string, phone map[string]any) string {
	t.Helper()
	key, _ := base64.StdEncoding.DecodeString(sessionKey)
	vector, _ := base64.StdEncoding.DecodeString(iv)
	plain, _ := json.Marshal(phone)
	padding := aes.BlockSize - len(plain)%aes.BlockSize
	plain = append(plain, bytes.Repeat([]byte{byte(padding)}, padding)...)
	block, err := aes.NewCipher(key)
	if err != nil {
		t.Fatal(err)
	}
	out := make([]byte, len(plain))
	cipher.NewCBCEncrypter(block, vector).CryptBlocks(out, plain)
	return base64.StdEncoding.EncodeToString(out)
}

// Hono: courseBookingWechatRoleRoutes › wechat role handlers complete a challenge, list bound roles, and switch by token identity
func TestWechatLoginCreatesStudentThenOffersRoleChoice(t *testing.T) {
	sessionKey := base64.StdEncoding.EncodeToString([]byte("0123456789abcdef"))
	iv := base64.StdEncoding.EncodeToString([]byte("fedcba9876543210"))
	cfg := config.Config{WechatAppID: "wx-test", WechatSecret: "s", WechatSessionURL: fakeWechat(t, "openid-1", sessionKey)}
	app, handler, signer := setup(t, cfg)

	rawData := `{"nickName":"微信昵称"}`
	digest := sha1.Sum([]byte(rawData + sessionKey))
	login := func(phone string, signature string) testkit.Response {
		return testkit.Call(t, handler, http.MethodPost, "/v1/user/wechat-login", map[string]any{
			"code":      "js-code",
			"rawData":   rawData,
			"signature": signature,
			"userInfo":  map[string]any{"nickName": "微信昵称", "avatarUrl": "https://wx.test/a.png"},
			"phone":     map[string]any{"encryptedData": encryptPhone(t, sessionKey, iv, map[string]any{"purePhoneNumber": phone}), "iv": iv},
		}, nil)
	}

	if bad := login("13800000001", "forged"); bad.Code() != 403 || bad.Body["message"] != "微信用户信息校验失败，请重新授权" {
		t.Fatalf("forged signature: %v", bad.Body)
	}
	created := login("+86 138 0000 0001", hex.EncodeToString(digest[:]))
	if created.Code() != 10000 || created.Data()["role"] != "student" || created.Data()["nickName"] != "微信昵称" || created.Data()["cellphone"] != "13800000001" {
		t.Fatalf("new student: %v", created.Body)
	}
	if claims := signer.SessionUser(created.Data()["token"].(string)); claims["wechatOpenId"] != "openid-1" {
		t.Fatalf("wechat token claims: %v", claims)
	}

	teacher := testkit.Create(t, app, "teachers", map[string]any{
		"sn": "T1", "cellphone": "13800000001", "email": "t@example.com", "password": "teacher-pass", "verified": true, "realName": "王老师",
	})
	challenge := login("13800000001", hex.EncodeToString(digest[:]))
	if challenge.Data()["requiresRoleSelection"] != true || len(challenge.Data()["roles"].([]any)) != 2 {
		t.Fatalf("role challenge: %v", challenge.Body)
	}
	if replay := testkit.Call(t, handler, http.MethodPost, "/v1/user/refresh", nil, testkit.Bearer(challenge.Data()["challenge"].(string))); replay.Body["errorCode"] != "AUTH_SESSION_INVALID" {
		t.Fatalf("challenge must not act as a session: %v", replay.Body)
	}

	chosen := testkit.Call(t, handler, http.MethodPost, "/v1/user/wechat-role-login",
		map[string]any{"challenge": challenge.Data()["challenge"], "role": "teacher"}, nil)
	if chosen.Code() != 10000 || chosen.Data()["role"] != "teacher" || chosen.Data()["id"] != teacher.Id {
		t.Fatalf("role login: %v", chosen.Body)
	}
	teacherToken := chosen.Data()["token"].(string)
	roles := testkit.Call(t, handler, http.MethodGet, "/v1/user/wechat-roles", nil, testkit.Bearer(teacherToken))
	if list, _ := roles.Body["data"].([]any); roles.Code() != 10000 || len(list) != 2 {
		t.Fatalf("wechat roles: %v", roles.Body)
	}
	switched := testkit.Call(t, handler, http.MethodPost, "/v1/user/switch-wechat-role", map[string]any{"role": "student"}, testkit.Bearer(teacherToken))
	if switched.Code() != 10000 || switched.Data()["role"] != "student" {
		t.Fatalf("switch role: %v", switched.Body)
	}
	if invalid := testkit.Call(t, handler, http.MethodPost, "/v1/user/wechat-role-login", map[string]any{"challenge": "x", "role": "teacher"}, nil); invalid.Code() != 400 || invalid.Body["message"] != "身份选择凭证无效" {
		t.Fatalf("invalid challenge: %v", invalid.Body)
	}
}
