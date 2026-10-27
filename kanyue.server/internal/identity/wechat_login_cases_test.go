package identity

import (
	"bytes"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/config"
	"kanyue.server/internal/testkit"
)

// WeChat login cases ported from Hono's wechatLoginCore/Failures/Forms/Recovery
// tests. Hono mocked the PocketBase SDK; here the real collections run, a fake
// jscode2session server answers the exchange, and record hooks inject failures.

const loginPhone = "13900000011"

type wechatFixture struct {
	app        core.App
	handler    http.Handler
	signer     *auth.Signer
	sessionKey string
	iv         string
	session    map[string]any
}

func wechatSetup(t *testing.T) *wechatFixture {
	t.Helper()
	f := &wechatFixture{
		sessionKey: base64.StdEncoding.EncodeToString([]byte("0123456789abcdef")),
		iv:         base64.StdEncoding.EncodeToString([]byte("fedcba9876543210")),
	}
	f.session = map[string]any{"openid": "openid-1", "unionid": "unionid-1", "session_key": f.sessionKey}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(f.session)
	}))
	t.Cleanup(server.Close)
	f.app, f.handler, f.signer = setup(t, config.Config{WechatAppID: "wx-test", WechatSecret: "s", WechatSessionURL: server.URL})
	return f
}

// body mirrors Hono's buildLoginBody; rawData/signature are left out so the
// signature check is skipped, as Hono does when either part is missing.
func (f *wechatFixture) body(t *testing.T, phone map[string]any, overrides map[string]any) map[string]any {
	t.Helper()
	if phone == nil {
		phone = map[string]any{"purePhoneNumber": loginPhone}
	}
	body := map[string]any{
		"code":     "wx-code",
		"userInfo": map[string]any{"nickName": "看乐用户", "avatarUrl": "https://example.com/avatar.png", "gender": 1},
		"phone":    map[string]any{"encryptedData": encryptPhone(t, f.sessionKey, f.iv, phone), "iv": f.iv},
	}
	for key, value := range overrides {
		if value == nil {
			delete(body, key)
		} else {
			body[key] = value
		}
	}
	return body
}

func (f *wechatFixture) login(t *testing.T, body map[string]any) testkit.Response {
	t.Helper()
	return testkit.Call(t, f.handler, http.MethodPost, "/v1/user/wechat-login", body, nil)
}

func (f *wechatFixture) student(t *testing.T, fields map[string]any) *core.Record {
	t.Helper()
	return testkit.Create(t, f.app, "students", fields)
}

// raceCreate makes the next student create lose a race: insert (when given) is
// saved first, then the create returns createErr or its own unique violation.
func (f *wechatFixture) raceCreate(t *testing.T, insert map[string]any, createErr error) {
	t.Helper()
	fired := false
	f.app.OnRecordCreate("students").BindFunc(func(e *core.RecordEvent) error {
		if fired {
			return e.Next()
		}
		fired = true
		if insert != nil {
			f.student(t, insert)
		}
		if createErr != nil {
			return createErr
		}
		return e.Next()
	})
}

func failUpdates(app core.App, message string) {
	app.OnRecordUpdate("students").BindFunc(func(*core.RecordEvent) error { return errors.New(message) })
}

func wantError(t *testing.T, result testkit.Response, code int, message string) {
	t.Helper()
	if result.Code() != code || result.Body["message"] != message || result.Body["data"] != nil {
		t.Fatalf("want %d %q, got %v", code, message, result.Body)
	}
}

func noWechatID(t *testing.T, data map[string]any) {
	t.Helper()
	if _, leaked := data["wechatId"]; leaked {
		t.Fatalf("wechatId leaked: %v", data)
	}
}

// Hono: wechatLoginCore › wechat login reuses an existing student when create hits a duplicate constraint
func TestWechatLoginReusesStudentAfterDuplicateCreate(t *testing.T) {
	f := wechatSetup(t)
	f.raceCreate(t, map[string]any{"sn": "sn_1", "cellphone": loginPhone}, nil)

	result := f.login(t, f.body(t, nil, nil))
	data := result.Data()
	if result.Code() != 10000 || data["cellphone"] != loginPhone || data["token"] == "" || data["nickName"] != "看乐用户" {
		t.Fatalf("login = %v", result.Body)
	}
	noWechatID(t, data)
	stored, err := f.app.FindRecordById("students", data["id"].(string))
	if err != nil || stored.GetString("sn") != "sn_1" || stored.GetString("wechatId") != "openid-1" || stored.GetString("wechatUnionId") != "unionid-1" {
		t.Fatalf("recovered = %v, %v", stored, err)
	}
	if total, _ := f.app.CountRecords("students"); total != 1 {
		t.Fatalf("students = %d", total)
	}
}

// Hono: wechatLoginCore › wechat login does not persist an empty wechatUnionId on new student creation
func TestWechatLoginSkipsEmptyUnionID(t *testing.T) {
	f := wechatSetup(t)
	f.session["openid"], f.session["unionid"] = "openid-2", ""
	other := f.student(t, map[string]any{"cellphone": "13900000022", "wechatUnionId": ""})

	result := f.login(t, f.body(t, nil, map[string]any{"code": "wx-code-2"}))
	if result.Code() != 10000 || result.Data()["id"] == other.Id {
		t.Fatalf("login = %v", result.Body)
	}
	created, _ := f.app.FindRecordById("students", result.Data()["id"].(string))
	if created.GetString("wechatId") != "openid-2" || created.GetString("wechatUnionId") != "" {
		t.Fatalf("created = %v", created)
	}
}

// Hono: wechatLoginCore › wechat login rejects requests without code or encrypted phone data
func TestWechatLoginRequiresCodeAndPhone(t *testing.T) {
	f := wechatSetup(t)
	wantError(t, f.login(t, f.body(t, nil, map[string]any{"code": ""})), 400, "缺少微信登录凭证")
	wantError(t, f.login(t, f.body(t, nil, map[string]any{"phone": map[string]any{"encryptedData": "", "iv": "iv-data"}})),
		400, "缺少微信手机号授权信息")
}

// Hono: wechatLoginCore › wechat login normalizes JSON string request bodies
func TestWechatLoginAcceptsJSONStringBody(t *testing.T) {
	f := wechatSetup(t)
	inner, _ := json.Marshal(f.body(t, nil, map[string]any{"code": nil, "auth_code": "string-code"}))
	outer, _ := json.Marshal(string(inner))
	result := testkit.Raw(t, f.handler, http.MethodPost, "/v1/user/wechat-login", string(outer), nil)
	if result.Code() != 10000 {
		t.Fatalf("string body = %v", result.Body)
	}
	noWechatID(t, result.Data())
	wantError(t, testkit.Raw(t, f.handler, http.MethodPost, "/v1/user/wechat-login", "not valid json", nil), 400, "缺少微信登录凭证")
}

// Hono: wechatLoginCore › wechat login accepts decrypted phoneNumber payloads and creates a tokenized student
func TestWechatLoginAcceptsPhoneNumberPayload(t *testing.T) {
	f := wechatSetup(t)
	f.session["unionid"] = nil
	result := f.login(t, f.body(t, map[string]any{"phoneNumber": "+86 139 0000 0011"}, nil))
	data := result.Data()
	if result.Code() != 10000 || data["cellphone"] != loginPhone || data["role"] != "student" || data["isAdmin"] != false {
		t.Fatalf("login = %v", result.Body)
	}
	claims := f.signer.SessionUser(data["token"].(string))
	if claims["id"] != data["id"] || claims["role"] != "student" || claims["isAdmin"] != false {
		t.Fatalf("claims = %v", claims)
	}
}

// Hono: wechatLoginFailures › wechat login handles session exchange and malformed session failures
func TestWechatLoginReportsSessionFailures(t *testing.T) {
	f := wechatSetup(t)
	f.session = map[string]any{"errcode": 40029, "errmsg": "exchange failed"}
	wantError(t, f.login(t, f.body(t, nil, nil)), 500, "exchange failed")
	f.session = map[string]any{"openid": "", "session_key": ""}
	wantError(t, f.login(t, f.body(t, nil, nil)), 500, "微信返回数据异常，请稍后重试")
}

// Hono: wechatLoginFailures › wechat login validates signature and decrypts phone numbers
func TestWechatLoginValidatesSignatureAndPhone(t *testing.T) {
	f := wechatSetup(t)
	wantError(t, f.login(t, f.body(t, nil, map[string]any{"rawData": `{"nickName":"看乐用户"}`, "signature": "signature"})),
		403, "微信用户信息校验失败，请重新授权")
	rawData := `{"nickName":"看乐用户"}`
	digest := sha1.Sum([]byte(rawData + f.sessionKey))
	signed := f.body(t, nil, map[string]any{"rawData": rawData, "signature": hex.EncodeToString(digest[:])})
	if result := f.login(t, signed); result.Code() != 10000 {
		t.Fatalf("signed = %v", result.Body)
	}

	wantError(t, f.login(t, f.body(t, nil, map[string]any{"phone": map[string]any{"encryptedData": "broken", "iv": f.iv}})),
		400, "微信手机号解析失败，请重新授权")
	wantError(t, f.login(t, f.body(t, map[string]any{"purePhoneNumber": ""}, nil)), 400, "未获取到有效的手机号")
}

// Hono: wechatLoginFailures › wechat login rejects blocked existing students and reports lookup failures
func TestWechatLoginRejectsBlockedStudentsAndLookupFailures(t *testing.T) {
	f := wechatSetup(t)
	f.student(t, map[string]any{"cellphone": loginPhone, "blocked": true})
	wantError(t, f.login(t, f.body(t, nil, nil)), 403, "该账号已被封禁，请联系客服")

	if _, err := f.app.DB().NewQuery("ALTER TABLE students RENAME TO students_offline").Execute(); err != nil {
		t.Fatal(err)
	}
	wantError(t, f.login(t, f.body(t, nil, nil)), 500, "查询用户信息失败，请稍后再试")
}

// Hono: wechatLoginFailures › wechat login reports update and create failures
func TestWechatLoginReportsWriteFailures(t *testing.T) {
	updates := wechatSetup(t)
	updates.student(t, map[string]any{"cellphone": loginPhone})
	failUpdates(updates.app, "update failed")
	wantError(t, updates.login(t, updates.body(t, nil, nil)), 500, "更新用户信息失败，请稍后重试")

	creates := wechatSetup(t)
	creates.raceCreate(t, nil, errors.New("database unavailable"))
	wantError(t, creates.login(t, creates.body(t, nil, nil)), 500, "创建用户失败，请稍后重试")
}

// Hono: wechatLoginFailures › wechat login duplicate recovery reports update failures after finding existing student
func TestWechatLoginDuplicateRecoveryUpdateFailure(t *testing.T) {
	f := wechatSetup(t)
	f.raceCreate(t, map[string]any{"cellphone": loginPhone}, nil)
	failUpdates(f.app, "recovery update failed")
	wantError(t, f.login(t, f.body(t, nil, nil)), 500, "创建用户失败，请稍后重试")
}

// Hono: wechatLoginForms › wechat login accepts query auth code and parsed form body payloads
func TestWechatLoginAcceptsQueryCodeAndURLEncodedForm(t *testing.T) {
	f := wechatSetup(t)
	f.session["unionid"] = ""
	existing := f.student(t, map[string]any{"sn": "sn_form", "cellphone": loginPhone})
	phone, _ := json.Marshal(map[string]any{"encryptedData": encryptPhone(t, f.sessionKey, f.iv, map[string]any{"purePhoneNumber": loginPhone}), "iv": f.iv})
	form := url.Values{}
	form.Set("phone", string(phone))
	form.Set("userInfo", `{"nickname":"表单用户","avatar":"https://example.com/form-avatar.png","gender":"2","age":"11"}`)

	result := testkit.Raw(t, f.handler, http.MethodPost, "/v1/user/wechat-login?authCode=query-code", form.Encode(),
		map[string]string{"Content-Type": "application/x-www-form-urlencoded", "X-Real-IP": "127.0.0.1"})
	if result.Code() != 10000 || result.Data()["id"] != existing.Id || result.Data()["nickName"] != "表单用户" {
		t.Fatalf("form login = %v", result.Body)
	}
	stored, _ := f.app.FindRecordById("students", existing.Id)
	info := map[string]any{}
	_ = stored.UnmarshalJSONField("wechatUserInfo", &info)
	if stored.GetString("lastLoginIp") != "127.0.0.1" || stored.GetString("avatar") != "https://example.com/form-avatar.png" ||
		info["gender"] != "2" || info["age"] != "11" {
		t.Fatalf("stored = %v, info = %v", stored, info)
	}
}

// Hono: wechatLoginForms › wechat login accepts FormData parsed bodies
func TestWechatLoginAcceptsMultipartForm(t *testing.T) {
	f := wechatSetup(t)
	existing := f.student(t, map[string]any{"sn": "sn_formdata", "cellphone": loginPhone})
	phone, _ := json.Marshal(map[string]any{"encryptedData": encryptPhone(t, f.sessionKey, f.iv, map[string]any{"purePhoneNumber": loginPhone}), "iv": f.iv})
	var buffer bytes.Buffer
	writer := multipart.NewWriter(&buffer)
	for key, value := range map[string]string{"auth_code": "formdata-code", "phone": string(phone),
		"userInfo": `{"nickName":"FormData 用户"}`, "rawData": "{}"} {
		_ = writer.WriteField(key, value)
	}
	_ = writer.Close()

	result := testkit.Raw(t, f.handler, http.MethodPost, "/v1/user/wechat-login", buffer.String(),
		map[string]string{"Content-Type": writer.FormDataContentType(), "X-Forwarded-For": "10.0.0.1"})
	if result.Code() != 10000 || result.Data()["nickName"] != "FormData 用户" {
		t.Fatalf("multipart login = %v", result.Body)
	}
	if stored, _ := f.app.FindRecordById("students", existing.Id); stored.GetString("lastLoginIp") != "10.0.0.1" {
		t.Fatalf("login ip = %q", stored.GetString("lastLoginIp"))
	}
}

// Hono: wechatLoginRecovery › wechat login duplicate recovery handles missing and blocked duplicated records
func TestWechatLoginDuplicateRecoveryMissingOrBlocked(t *testing.T) {
	missing := wechatSetup(t)
	missing.raceCreate(t, nil, errors.New("value must be unique"))
	wantError(t, missing.login(t, missing.body(t, nil, nil)), 500, "创建用户失败，请稍后重试")

	blocked := wechatSetup(t)
	blocked.raceCreate(t, map[string]any{"cellphone": loginPhone, "blocked": true}, nil)
	wantError(t, blocked.login(t, blocked.body(t, nil, nil)), 403, "该账号已被封禁，请联系客服")
}

// Hono: wechatLoginRecovery › wechat login recovers duplicate creates from 409 status errors
// Go saves straight to the database, so a lost race surfaces as a duplicate error
// rather than an SDK 409; recovery then finds the winner by WeChat id.
func TestWechatLoginRecoversDuplicateByWechatID(t *testing.T) {
	f := wechatSetup(t)
	f.raceCreate(t, map[string]any{"sn": "sn_duplicate", "cellphone": "13900000033", "wechatId": "openid-1",
		"nickName": "已有用户", "avatar": "https://example.com/avatar.png"}, errors.New("duplicate wechatId"))
	result := f.login(t, f.body(t, nil, nil))
	if result.Code() != 10000 || result.Data()["nickName"] != "已有用户" || result.Data()["cellphone"] != loginPhone {
		t.Fatalf("recovered = %v", result.Body)
	}
	noWechatID(t, result.Data())
	stored, _ := f.app.FindFirstRecordByData("students", "wechatId", "openid-1")
	if stored == nil || stored.Id != result.Data()["id"] {
		t.Fatalf("stored = %v", stored)
	}
}
