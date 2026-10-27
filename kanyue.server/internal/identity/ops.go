package identity

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/audit"
	"kanyue.server/internal/auth"
	"kanyue.server/internal/httpx"
	"kanyue.server/internal/records"
)

// Admin sign-in; rules match Hono's OpsAuthService.

const minPasswordLength = 8

var registrationPhone = regexp.MustCompile(`^1\d{10}$`)

type opsProfile struct {
	ID                       string   `json:"id"`
	SN                       string   `json:"sn"`
	Role                     string   `json:"role"`
	IsAdmin                  bool     `json:"isAdmin"`
	Cellphone                string   `json:"cellphone"`
	NickName                 string   `json:"nickName"`
	RealName                 string   `json:"realName"`
	Avatar                   string   `json:"avatar"`
	Verified                 bool     `json:"verified"`
	Blocked                  bool     `json:"blocked"`
	PasswordChangeRequired   bool     `json:"passwordChangeRequired"`
	CourseCreditCapabilities []string `json:"courseCreditCapabilities"`
}

type opsSession struct {
	Token   string     `json:"token"`
	Profile opsProfile `json:"profile"`
}

// newOpsProfile reads admin rights from idAdmin, the field Hono's `idAdmin ?? isAdmin` always hits.
func newOpsProfile(teacher *core.Record) opsProfile {
	isAdmin := teacher.GetBool("idAdmin")
	role := "teacher"
	if isAdmin {
		role = "admin"
	}
	return opsProfile{
		ID:                       teacher.Id,
		SN:                       teacher.GetString("sn"),
		Role:                     role,
		IsAdmin:                  isAdmin,
		Cellphone:                teacher.GetString("cellphone"),
		NickName:                 firstNonEmpty(teacher.GetString("nickName"), teacher.GetString("realName")),
		RealName:                 teacher.GetString("realName"),
		Avatar:                   teacher.GetString("avatar"),
		Verified:                 teacher.GetBool("verified"),
		Blocked:                  teacher.GetBool("blocked"),
		PasswordChangeRequired:   teacher.GetBool("opsPasswordChangeRequired"),
		CourseCreditCapabilities: records.Capabilities(teacher, "courseCreditCapabilities"),
	}
}

func (p opsProfile) actor() *audit.Actor {
	return &audit.Actor{ID: p.ID, Role: p.Role}
}

func (s *service) signOps(teacher *core.Record, isAdmin, passwordChangeRequired bool) (string, error) {
	return s.signer.Sign(teacher.Id, teacher.GetString("sn"), "teacher", isAdmin, auth.Claims{
		"scope":                    auth.OpsScope,
		"passwordChangeRequired":   passwordChangeRequired,
		"courseCreditCapabilities": records.Capabilities(teacher, "courseCreditCapabilities"),
	}, auth.OpsTokenTTL)
}

func (s *service) opsLogin(e *core.RequestEvent) error {
	body := httpx.ReadBody(e)
	data, err := s.loginOps(e, body)
	return reply(e, data, err)
}

func (s *service) loginOps(e *core.RequestEvent, body httpx.Body) (any, error) {
	account := normalizeString(firstTruthy(body, "account", "username", "cellphone"))
	password := paramText(body["password"])
	if account == "" || !truthy(body["password"]) {
		return nil, &httpx.CodedError{Code: 400, Message: "账号和密码不能为空"}
	}
	teacher, err := e.App.FindFirstRecordByFilter("teachers",
		"(cellphone = {:account} || username = {:account} || email = {:account})", dbx.Params{"account": account})
	if err != nil && !isNoRows(err) {
		return nil, err
	}
	if teacher == nil || !teacherPasswordMatches(teacher, password) {
		audit.Denied(e.App, nil, "ops.auth.login", "teacher", "", map[string]any{"account": account})
		return nil, &httpx.CodedError{Code: 401, Message: "后台账号或密码错误"}
	}
	// Hono passed the teacher record as actor; it has no role, so these rows are "anonymous".
	if teacher.GetBool("blocked") {
		audit.Denied(e.App, &audit.Actor{ID: teacher.Id}, "ops.auth.login", "teacher", teacher.Id, map[string]any{"reason": "blocked"})
		return nil, &httpx.CodedError{Code: 403, Message: "该教师账号已被禁用"}
	}
	if !teacher.GetBool("verified") {
		audit.Denied(e.App, &audit.Actor{ID: teacher.Id}, "ops.auth.login", "teacher", teacher.Id, map[string]any{"reason": "unverified"})
		return nil, &httpx.CodedError{Code: 403, Message: "教师账号未审核"}
	}
	teacher.Set("lastLoginAt", time.Now())
	teacher.Set("lastLoginMethod", "ops-password")
	if err := e.App.Save(teacher); err != nil {
		return nil, err
	}
	profile := newOpsProfile(teacher)
	token, err := s.signOps(teacher, profile.IsAdmin, profile.PasswordChangeRequired)
	if err != nil {
		return nil, err
	}
	audit.Record(e.App, audit.Entry{Actor: profile.actor(), Action: "ops.auth.login", ResourceType: "teacher", ResourceID: teacher.Id})
	return opsSession{Token: token, Profile: profile}, nil
}

func (s *service) opsMe(e *core.RequestEvent) error {
	teacher, err := s.opsTeacher(e)
	if err != nil {
		return reply(e, nil, err)
	}
	return reply(e, map[string]any{"profile": newOpsProfile(teacher)}, nil)
}

func (s *service) opsChangePassword(e *core.RequestEvent) error {
	body := httpx.ReadBody(e)
	data, err := s.changePassword(e, body)
	return reply(e, data, err)
}

func (s *service) changePassword(e *core.RequestEvent, body httpx.Body) (any, error) {
	teacher, err := s.opsTeacher(e)
	if err != nil {
		return nil, err
	}
	current, next, confirm := body.String("currentPassword"), body.String("newPassword"), body.String("confirmPassword")
	switch {
	case current == "" || next == "":
		return nil, &httpx.CodedError{Code: 400, Message: "当前密码和新密码不能为空"}
	case httpx.JSLength(next) < minPasswordLength:
		return nil, &httpx.CodedError{Code: 400, Message: fmt.Sprintf("新密码至少需要 %d 位", minPasswordLength)}
	case next == current:
		return nil, &httpx.CodedError{Code: 400, Message: "新密码不能与当前密码相同"}
	case next != confirm:
		return nil, &httpx.CodedError{Code: 400, Message: "两次输入的新密码不一致"}
	}
	user := auth.User(e)
	if !teacherPasswordMatches(teacher, current) {
		audit.Denied(e.App, &audit.Actor{ID: auth.ClaimString(user, "id"), Role: auth.ClaimString(user, "role")},
			"ops.auth.change_password", "teacher", teacher.Id, map[string]any{"reason": "password_mismatch"})
		return nil, &httpx.CodedError{Code: 401, Message: "当前密码不正确"}
	}
	teacher.SetPassword(next)
	teacher.Set("opsPasswordChangeRequired", false)
	teacher.Set("lastPasswordChangedAt", time.Now())
	if err := e.App.Save(teacher); err != nil {
		return nil, err
	}
	profile := newOpsProfile(teacher)
	token, err := s.signOps(teacher, profile.IsAdmin, false)
	if err != nil {
		return nil, err
	}
	audit.Record(e.App, audit.Entry{Actor: profile.actor(), Action: "ops.auth.change_password", ResourceType: "teacher", ResourceID: teacher.Id})
	return opsSession{Token: token, Profile: profile}, nil
}

// opsTeacher loads the signed-in teacher and rejects blocked or unverified accounts.
func (s *service) opsTeacher(e *core.RequestEvent) (*core.Record, error) {
	user := auth.User(e)
	if auth.ClaimString(user, "id") == "" || auth.ClaimString(user, "role") != "teacher" {
		return nil, &httpx.CodedError{Code: 403, Message: "后台仅允许教师或管理员访问"}
	}
	teacher, err := e.App.FindRecordById("teachers", auth.ClaimString(user, "id"))
	if err != nil {
		return nil, err
	}
	if teacher.GetBool("blocked") || !teacher.GetBool("verified") {
		return nil, &httpx.CodedError{Code: 403, Message: "教师账号不可用"}
	}
	return teacher, nil
}

func (s *service) opsRegister(e *core.RequestEvent) error {
	body := httpx.ReadBody(e)
	data, err := s.register(e, body)
	return reply(e, data, err)
}

// register creates a blocked, unverified teacher an admin activates later.
func (s *service) register(e *core.RequestEvent, body httpx.Body) (any, error) {
	if !s.cfg.OpsRegistrationEnabled {
		audit.Denied(e.App, nil, "ops.auth.register", "teacher", "", map[string]any{"reason": "disabled"})
		return nil, &httpx.CodedError{Code: 403, Message: "教务系统注册未开放"}
	}
	realName := normalizeString(firstTruthy(body, "realName", "realname"))
	nickName := firstNonEmpty(normalizeString(firstTruthy(body, "nickName", "nickname")), realName)
	cellphone := normalizeString(body["cellphone"])
	password := body.String("password")
	switch {
	case cellphone == "":
		return nil, &httpx.CodedError{Code: 400, Message: "手机号不能为空"}
	case !registrationPhone.MatchString(cellphone):
		return nil, &httpx.CodedError{Code: 400, Message: "手机号格式不正确"}
	case password == "":
		return nil, &httpx.CodedError{Code: 400, Message: "密码不能为空"}
	case httpx.JSLength(password) < minPasswordLength:
		return nil, &httpx.CodedError{Code: 400, Message: "密码至少需要 8 位"}
	case realName == "" && nickName == "":
		return nil, &httpx.CodedError{Code: 400, Message: "姓名不能为空"}
	}
	existing, err := findByCellphone(e.App, "teachers", cellphone)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, &httpx.CodedError{Code: 409, Message: "该手机号已注册"}
	}
	target, err := e.App.FindCollectionByNameOrId("teachers")
	if err != nil {
		return nil, err
	}
	teacher := core.NewRecord(target)
	teacher.Set("sn", fmt.Sprintf("teacher_%d_%s", time.Now().UnixMilli(), randomBase36(6)))
	teacher.Set("username", cellphone)
	teacher.Set("cellphone", cellphone)
	teacher.SetPassword(password)
	teacher.Set("nickName", nickName)
	teacher.Set("realName", realName)
	teacher.Set("blocked", true)
	teacher.Set("verified", false)
	teacher.Set("idAdmin", false)
	if err := e.App.Save(teacher); err != nil {
		if isDuplicateTeacher(err) {
			return nil, &httpx.CodedError{Code: 409, Message: "该手机号已注册"}
		}
		return nil, err
	}
	profile := newOpsProfile(teacher)
	audit.Record(e.App, audit.Entry{
		Actor:        profile.actor(),
		Action:       "ops.auth.register",
		ResourceType: "teacher",
		ResourceID:   teacher.Id,
		Metadata:     map[string]any{"ip": loginIP(e, ""), "status": "pending_activation"},
	})
	return map[string]any{"status": "pending_activation", "message": "注册成功，请等待管理员激活", "profile": profile}, nil
}

func isDuplicateTeacher(err error) bool {
	text := strings.ToLower(err.Error())
	field := strings.Contains(text, "cellphone") || strings.Contains(text, "username") || strings.Contains(text, "手机号")
	return field && (strings.Contains(text, "unique") || strings.Contains(text, "already"))
}
