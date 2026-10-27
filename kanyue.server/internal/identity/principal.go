package identity

import (
	"database/sql"
	"errors"
	"log"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/httpx"
	"kanyue.server/internal/records"
)

// Rules match Hono's WechatIdentityService.

const (
	challengeTTL  = 5 * time.Minute
	challengeType = "wechat-role-selection"
	notFound      = "The requested resource wasn't found."
)

type wechatRef struct {
	openID, unionID string
}

type candidate struct {
	role   string
	record *core.Record
}

type roleOption struct {
	Role   string `json:"role"`
	ID     string `json:"id"`
	Name   string `json:"name"`
	Avatar string `json:"avatar"`
}

func collectionFor(role string) string {
	if role == "teacher" {
		return "teachers"
	}
	return "students"
}

// validatePrincipal codes: unavailable/unverified are 403 on role login, an invalid role is 400.
func validatePrincipal(role string, record *core.Record) error {
	if record == nil || record.GetBool("blocked") {
		return &httpx.CodedError{Code: 403, Message: "账号已停用"}
	}
	if role == "teacher" {
		if !record.GetBool("verified") {
			return &httpx.CodedError{Code: 403, Message: "教师账号尚未通过审核"}
		}
		return nil
	}
	if role != "student" {
		return &httpx.CodedError{Code: 400, Message: "微信身份类型无效"}
	}
	return nil
}

func newRoleOption(role string, record *core.Record) roleOption {
	name := firstNonEmpty(record.GetString("realName"), record.GetString("nickName"))
	if name == "" {
		name = "学员"
		if role == "teacher" {
			name = "教师"
		}
	}
	return roleOption{Role: role, ID: record.Id, Name: name, Avatar: record.GetString("avatar")}
}

func (s *service) issuePrincipal(app core.App, role string, record *core.Record, ref wechatRef) (map[string]any, error) {
	if err := validatePrincipal(role, record); err != nil {
		return nil, err
	}
	if err := s.bindIdentity(app, role, record.Id, ref); err != nil {
		return nil, err
	}
	// Hono reads `idAdmin ?? isAdmin`; idAdmin always exists on teachers.
	isAdmin := role == "teacher" && record.GetBool("idAdmin")
	capabilities := []string{}
	if role == "teacher" {
		capabilities = records.Capabilities(record, "courseCreditCapabilities")
	}
	token, err := s.signer.Sign(record.Id, record.GetString("sn"), role, isAdmin, auth.Claims{
		"courseCreditCapabilities": capabilities,
		"wechatOpenId":             ref.openID,
	}, auth.AppTokenTTL)
	if err != nil {
		return nil, err
	}
	data := records.PublicUser(record)
	data["role"] = role
	data["isAdmin"] = isAdmin
	data["courseCreditCapabilities"] = capabilities
	data["token"] = token
	return data, nil
}

func (s *service) bindIdentity(app core.App, principalType, principalID string, ref wechatRef) error {
	if ref.openID == "" || s.cfg.WechatAppID == "" {
		return nil
	}
	record, err := app.FindFirstRecordByFilter("wechat_identities",
		"appId = {:appId} && openId = {:openId} && principalType = {:type} && principalId = {:id}",
		dbx.Params{"appId": s.cfg.WechatAppID, "openId": ref.openID, "type": principalType, "id": principalID})
	if errors.Is(err, sql.ErrNoRows) {
		target, findErr := app.FindCollectionByNameOrId("wechat_identities")
		if findErr != nil {
			return findErr
		}
		record, err = core.NewRecord(target), nil
	}
	if err != nil {
		return err
	}
	record.Set("appId", s.cfg.WechatAppID)
	record.Set("openId", ref.openID)
	record.Set("unionId", ref.unionID)
	record.Set("principalType", principalType)
	record.Set("principalId", principalID)
	record.Set("status", "active")
	record.Set("lastUsedAt", time.Now())
	return app.Save(record)
}

func (s *service) createRoleChallenge(candidates []candidate, cellphone string, ref wechatRef) (map[string]any, error) {
	roles := make([]string, 0, len(candidates))
	principals := map[string]string{}
	options := make([]roleOption, 0, len(candidates))
	for _, item := range candidates {
		roles = append(roles, item.role)
		principals[item.role] = item.record.Id
		options = append(options, newRoleOption(item.role, item.record))
	}
	expiresAt := time.Now().Add(challengeTTL).Unix()
	challenge, err := s.signer.Sign("wechat-role", ref.openID, "role_challenge", false, auth.Claims{
		"appId":              s.cfg.WechatAppID,
		"cellphone":          cellphone,
		"challengeType":      challengeType,
		"challengeExpiresAt": expiresAt,
		"openid":             ref.openID,
		"unionid":            ref.unionID,
		"principals":         principals,
		"roles":              roles,
	}, challengeTTL)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"requiresRoleSelection": true,
		"challenge":             challenge,
		"expiresAt":             expiresAt,
		"roles":                 options,
	}, nil
}

func (s *service) completeRoleChallenge(app core.App, challenge, role any) (map[string]any, error) {
	token, _ := challenge.(string)
	claims := s.signer.Verify(token)
	if claims == nil || claims["challengeType"] != challengeType {
		return nil, &httpx.CodedError{Code: 400, Message: "身份选择凭证无效"}
	}
	expiresAt, _ := claims["challengeExpiresAt"].(float64)
	if int64(expiresAt) <= time.Now().Unix() {
		return nil, &httpx.CodedError{Code: 400, Message: "身份选择凭证已过期"}
	}
	roleName, _ := role.(string)
	allowed := false
	if roles, ok := claims["roles"].([]any); ok {
		for _, item := range roles {
			allowed = allowed || (roleName != "" && item == roleName)
		}
	}
	if !allowed {
		return nil, &httpx.CodedError{Code: 400, Message: "所选身份不可用"}
	}
	principals, _ := claims["principals"].(map[string]any)
	principalID, _ := principals[roleName].(string)
	record, err := app.FindRecordById(collectionFor(roleName), principalID)
	if err != nil {
		return nil, err
	}
	return s.issuePrincipal(app, roleName, record, wechatRef{
		openID:  auth.ClaimString(claims, "openid"),
		unionID: auth.ClaimString(claims, "unionid"),
	})
}

func (s *service) listRoles(app core.App, openID string) ([]roleOption, error) {
	if openID == "" {
		return nil, &httpx.CodedError{Code: 400, Message: "当前登录未绑定微信身份"}
	}
	identities, err := app.FindRecordsByFilter("wechat_identities",
		`appId = {:appId} && openId = {:openId} && status = "active"`, "principalType", 0, 0,
		dbx.Params{"appId": s.cfg.WechatAppID, "openId": openID})
	if err != nil {
		return nil, err
	}
	roles := []roleOption{}
	for _, item := range identities {
		role := item.GetString("principalType")
		record, err := app.FindRecordById(collectionFor(role), item.GetString("principalId"))
		if err != nil {
			return nil, err
		}
		if validatePrincipal(role, record) == nil {
			roles = append(roles, newRoleOption(role, record))
		}
	}
	return roles, nil
}

func (s *service) switchRole(app core.App, openID string, role any) (map[string]any, error) {
	roleName, _ := role.(string)
	if roleName != "student" && roleName != "teacher" {
		return nil, &httpx.CodedError{Code: 400, Message: "微信身份类型无效"}
	}
	identity, err := app.FindFirstRecordByFilter("wechat_identities",
		`appId = {:appId} && openId = {:openId} && principalType = {:type} && status = "active"`,
		dbx.Params{"appId": s.cfg.WechatAppID, "openId": openID, "type": roleName})
	if err != nil {
		return nil, err
	}
	record, err := app.FindRecordById(collectionFor(roleName), identity.GetString("principalId"))
	if err != nil {
		return nil, err
	}
	return s.issuePrincipal(app, roleName, record, wechatRef{openID: openID, unionID: identity.GetString("unionId")})
}

// roleError maps failures like Hono's role handlers: a coded error keeps its code
// only when keepCode is set, a missing record carries PocketBase's message.
func roleError(err error, keepCode bool, fallbackMessage string) error {
	var coded *httpx.CodedError
	switch {
	case errors.As(err, &coded):
		if keepCode {
			return coded
		}
		return &httpx.CodedError{Code: 400, Message: coded.Message}
	case errors.Is(err, sql.ErrNoRows):
		return &httpx.CodedError{Code: 400, Message: notFound}
	default:
		log.Printf("wechat role: %v", err)
		return &httpx.CodedError{Code: 400, Message: fallbackMessage}
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
