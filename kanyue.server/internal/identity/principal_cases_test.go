package identity

import (
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/config"
	"kanyue.server/internal/httpx"
	"kanyue.server/internal/records"
	"kanyue.server/internal/testkit"
)

// WeChat principal rules ported from Hono's courseBookingWechatIdentity tests.

type principalFixture struct {
	app              core.App
	service          *service
	student, teacher *core.Record
}

func principalSetup(t *testing.T) principalFixture {
	t.Helper()
	app := testkit.NewApp(t)
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	return principalFixture{
		app:     app,
		service: &service{signer: signer, cfg: config.Config{WechatAppID: "wx-app"}},
		student: testkit.Create(t, app, "students", map[string]any{"sn": "student-sn", "cellphone": "13800138000", "realName": "学员甲"}),
		teacher: testkit.Create(t, app, "teachers", map[string]any{"sn": "teacher-sn", "cellphone": "13800138000", "email": "t@example.com",
			"password": "teacher-pass", "realName": "林老师", "verified": true, "courseCreditCapabilities": []string{"course_credit.teacher"}}),
	}
}

func (f principalFixture) bind(t *testing.T, role, principalID, unionID string) {
	t.Helper()
	testkit.Create(t, f.app, "wechat_identities", map[string]any{"appId": "wx-app", "openId": "openid", "unionId": unionID,
		"principalType": role, "principalId": principalID, "status": "active"})
}

func failsWithMessage(t *testing.T, err error, message string) {
	t.Helper()
	var coded *httpx.CodedError
	if !errors.As(err, &coded) || coded.Message != message {
		t.Fatalf("error = %v, want %s", err, message)
	}
}

// Hono: courseBookingWechatIdentity › verified teacher discovery and principal issuance persist identity and trusted capabilities
func TestTeacherPrincipalPersistsIdentityAndCapabilities(t *testing.T) {
	f := principalSetup(t)
	teacher, err := findByCellphone(f.app, "teachers", "13800138000")
	if err != nil || teacher.Id != f.teacher.Id {
		t.Fatalf("teacher = %v, %v", teacher, err)
	}
	issued, err := f.service.issuePrincipal(f.app, "teacher", teacher, wechatRef{openID: "openid", unionID: "unionid"})
	if err != nil || issued["role"] != "teacher" || fmtCapabilities(issued["courseCreditCapabilities"]) != "course_credit.teacher" {
		t.Fatalf("issued = %v, %v", issued, err)
	}
	identity, err := f.app.FindFirstRecordByFilter("wechat_identities", `principalType="teacher"`)
	if err != nil || identity.GetString("principalId") != teacher.Id || identity.GetString("unionId") != "unionid" {
		t.Fatalf("identity = %v, %v", identity, err)
	}
	claims := f.service.signer.SessionUser(issued["token"].(string))
	if capabilities, _ := claims["courseCreditCapabilities"].([]any); len(capabilities) != 1 || capabilities[0] != "course_credit.teacher" {
		t.Fatalf("claims = %v", claims)
	}
}

func fmtCapabilities(value any) string {
	list, _ := value.([]string)
	if len(list) != 1 {
		return ""
	}
	return list[0]
}

// Hono: courseBookingWechatIdentity › role challenge only allows its signed student and teacher principals
func TestRoleChallengeAllowsOnlySignedPrincipals(t *testing.T) {
	f := principalSetup(t)
	challenge, err := f.service.createRoleChallenge([]candidate{{"student", f.student}, {"teacher", f.teacher}}, "13800138000",
		wechatRef{openID: "openid", unionID: "unionid"})
	if err != nil || challenge["requiresRoleSelection"] != true {
		t.Fatalf("challenge = %v, %v", challenge, err)
	}
	roles := challenge["roles"].([]roleOption)
	if len(roles) != 2 || roles[0].Role != "student" || roles[1].Role != "teacher" {
		t.Fatalf("roles = %v", roles)
	}
	selected, err := f.service.completeRoleChallenge(f.app, challenge["challenge"], "teacher")
	if err != nil || selected["id"] != f.teacher.Id {
		t.Fatalf("selected = %v, %v", selected, err)
	}
	_, err = f.service.completeRoleChallenge(f.app, challenge["challenge"], "guardian")
	failsWithMessage(t, err, "所选身份不可用")
}

// Hono: courseBookingWechatIdentity › bound identities can be listed and switched without trusting client principal ids
func TestBoundIdentitiesListAndSwitch(t *testing.T) {
	f := principalSetup(t)
	f.bind(t, "student", f.student.Id, "unionid")
	f.bind(t, "teacher", f.teacher.Id, "unionid")
	roles, err := f.service.listRoles(f.app, "openid")
	if err != nil || len(roles) != 2 || roles[0].Role != "student" || roles[1].Role != "teacher" {
		t.Fatalf("roles = %v, %v", roles, err)
	}
	switched, err := f.service.switchRole(f.app, "openid", "student")
	if err != nil || switched["role"] != "student" || switched["id"] != f.student.Id {
		t.Fatalf("switched = %v, %v", switched, err)
	}
	_, err = f.service.switchRole(f.app, "openid", "guardian")
	failsWithMessage(t, err, "微信身份类型无效")
}

// Hono: courseBookingWechatIdentity › identity validation rejects blocked or unverified principals and normalizes capability arrays
func TestPrincipalValidationAndCapabilities(t *testing.T) {
	f := principalSetup(t)
	f.teacher.Set("verified", false)
	failsWithMessage(t, validatePrincipal("teacher", f.teacher), "教师账号尚未通过审核")
	f.student.Set("blocked", true)
	failsWithMessage(t, validatePrincipal("student", f.student), "账号已停用")
	f.teacher.Set("courseCreditCapabilities", []any{"course_credit.teacher", "", "course_credit.teacher", 1})
	if got := records.Capabilities(f.teacher, "courseCreditCapabilities"); len(got) != 1 || got[0] != "course_credit.teacher" {
		t.Fatalf("capabilities = %v", got)
	}
}

// Hono: courseBookingWechatIdentity › identity edge paths reject stale challenges and skip unavailable bound principals
func TestIdentityEdgePaths(t *testing.T) {
	f := principalSetup(t)
	if err := f.service.bindIdentity(f.app, "student", f.student.Id, wechatRef{}); err != nil {
		t.Fatal(err)
	}
	if count, _ := f.app.CountRecords("wechat_identities"); count != 0 {
		t.Fatal("binding without an openid must be a no-op")
	}
	// The schema rejects unknown principal types, so an unverified teacher stands in for an unavailable principal.
	f.teacher.Set("verified", false)
	if err := f.app.Save(f.teacher); err != nil {
		t.Fatal(err)
	}
	f.bind(t, "teacher", f.teacher.Id, "")
	if roles, err := f.service.listRoles(f.app, "openid"); err != nil || len(roles) != 0 {
		t.Fatalf("roles = %v, %v", roles, err)
	}
	_, err := f.service.listRoles(f.app, "")
	failsWithMessage(t, err, "当前登录未绑定微信身份")

	other, _ := f.service.signer.Sign("wechat-role", "openid", "role_challenge", false, auth.Claims{"challengeType": "other"}, challengeTTL)
	_, err = f.service.completeRoleChallenge(f.app, other, "student")
	failsWithMessage(t, err, "身份选择凭证无效")
	stale, _ := f.service.signer.Sign("wechat-role", "openid", "role_challenge", false, auth.Claims{
		"challengeType": challengeType, "challengeExpiresAt": time.Now().Unix(), "roles": []string{"student"},
		"principals": map[string]string{"student": f.student.Id}, "openid": "openid",
	}, challengeTTL)
	_, err = f.service.completeRoleChallenge(f.app, stale, "student")
	failsWithMessage(t, err, "身份选择凭证已过期")
}

// Hono: courseBookingWechatIdentity › student principal issuance and identity update use server-side role facts
func TestStudentPrincipalUpdatesIdentity(t *testing.T) {
	f := principalSetup(t)
	f.bind(t, "student", f.student.Id, "old-union")
	issued, err := f.service.issuePrincipal(f.app, "student", f.student, wechatRef{openID: "openid", unionID: "new-union"})
	if err != nil || issued["isAdmin"] != false || len(issued["courseCreditCapabilities"].([]string)) != 0 {
		t.Fatalf("issued = %v, %v", issued, err)
	}
	identity, _ := f.app.FindFirstRecordByFilter("wechat_identities", `principalType="student"`)
	if identity.GetString("unionId") != "new-union" {
		t.Fatalf("unionId = %s", identity.GetString("unionId"))
	}
	if validatePrincipal("guardian", f.student) == nil {
		t.Fatal("guardian must not be an available principal")
	}
	blank := testkit.Create(t, f.app, "students", map[string]any{"cellphone": "{{PHONE_mnlbc30x}}"})
	if newRoleOption("teacher", blank).Name != "教师" || newRoleOption("student", blank).Name != "学员" {
		t.Fatal("role option name fallback")
	}
	blank.Set("courseCreditCapabilities", nil)
	if got := records.Capabilities(blank, "courseCreditCapabilities"); got == nil || len(got) != 0 {
		t.Fatalf("empty capabilities = %v", got)
	}
}

// Hono: courseBookingWechatRoleRoutes › wechat role handlers map unavailable principals to forbidden and other failures to bad request
func TestWechatRoleRoutesMapFailures(t *testing.T) {
	app, handler, signer := setup(t, config.Config{WechatAppID: "wx-app"})
	s := &service{signer: signer, cfg: config.Config{WechatAppID: "wx-app"}}
	teacher := testkit.Create(t, app, "teachers", map[string]any{"sn": "T1", "cellphone": "13800138000", "email": "t@example.com",
		"password": "teacher-pass", "verified": true})
	student := testkit.Create(t, app, "students", map[string]any{"sn": "S1", "cellphone": "13800138000"})
	challenge, err := s.createRoleChallenge([]candidate{{"student", student}, {"teacher", teacher}}, "13800138000", wechatRef{openID: "openid"})
	if err != nil {
		t.Fatal(err)
	}
	teacher.Set("verified", false)
	if err := app.Save(teacher); err != nil {
		t.Fatal(err)
	}
	unavailable := testkit.Call(t, handler, http.MethodPost, "/v1/user/wechat-role-login", map[string]any{"challenge": challenge["challenge"], "role": "teacher"}, nil)
	if unavailable.Code() != 403 || unavailable.Body["message"] != "教师账号尚未通过审核" {
		t.Fatalf("unavailable principal = %v", unavailable.Body)
	}
	token, _ := signer.Sign(student.Id, "S1", "student", false, nil, auth.AppTokenTTL)
	if roles := testkit.Call(t, handler, http.MethodGet, "/v1/user/wechat-roles", nil, testkit.Bearer(token)); roles.Code() != 400 || roles.Body["message"] != "当前登录未绑定微信身份" {
		t.Fatalf("roles without openid = %v", roles.Body)
	}
	if switched := testkit.Call(t, handler, http.MethodPost, "/v1/user/switch-wechat-role", map[string]any{"role": "teacher"}, testkit.Bearer(token)); switched.Code() != 400 || switched.Body["message"] != notFound {
		t.Fatalf("switch without identity = %v", switched.Body)
	}
	failsWithMessage(t, roleError(errors.New("boom"), false, "切换身份失败"), "切换身份失败")
	var coded *httpx.CodedError
	if !errors.As(roleError(&httpx.CodedError{Code: 403, Message: "已停用"}, false, "x"), &coded) || coded.Code != 400 {
		t.Fatal("without keepCode a coded error becomes a bad request")
	}
}
