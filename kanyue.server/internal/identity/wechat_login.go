package identity

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"regexp"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/httpx"
)

var (
	whitespace    = regexp.MustCompile(`\s+`)
	chinaPrefix   = regexp.MustCompile(`^\+?86`)
	duplicateHint = []string{"already exists", "duplicate", "must be unique", "validation_not_unique", "value must be unique", "unique constraint", "手机号已注册"}
)

// wechatLogin is POST /v1/user/wechat-login: binds an existing student by WeChat id
// or phone, offers a role choice when the phone also belongs to a teacher, and
// otherwise creates the student.
func (s *service) wechatLogin(e *core.RequestEvent) error {
	body := httpx.ReadBody(e)
	query := e.Request.URL.Query()
	code := firstNonEmpty(
		strings.TrimSpace(paramText(body["code"])), strings.TrimSpace(paramText(body["authCode"])),
		strings.TrimSpace(paramText(body["auth_code"])), strings.TrimSpace(query.Get("code")),
		strings.TrimSpace(query.Get("authCode")), strings.TrimSpace(query.Get("auth_code")),
	)
	userInfo, phone := objectParam(body["userInfo"]), objectParam(body["phone"])
	encryptedData, iv := phone["encryptedData"], phone["iv"]
	if code == "" {
		return httpx.Error(e, 400, "缺少微信登录凭证")
	}
	if !truthy(encryptedData) || !truthy(iv) {
		return httpx.Error(e, 400, "缺少微信手机号授权信息")
	}

	session, err := s.wechat.exchange(code)
	if err != nil {
		log.Printf("wechat jscode2session: %v", err)
		return httpx.Error(e, 500, fallback(err.Error(), "微信认证失败，请稍后重试"))
	}
	if session.OpenID == "" || session.SessionKey == "" {
		return httpx.Error(e, 500, "微信返回数据异常，请稍后重试")
	}
	if !validSignature(paramText(body["rawData"]), session.SessionKey, paramText(body["signature"])) {
		return httpx.Error(e, 403, "微信用户信息校验失败，请重新授权")
	}
	decrypted, err := decryptPhone(session.SessionKey, paramText(encryptedData), paramText(iv))
	if err != nil {
		log.Printf("wechat phone decrypt: %v", err)
		return httpx.Error(e, 400, "微信手机号解析失败，请重新授权")
	}
	cellphone := normalizeCellphone(firstNonEmpty(decrypted.PurePhoneNumber, decrypted.PhoneNumber))
	if cellphone == "" {
		return httpx.Error(e, 400, "未获取到有效的手机号")
	}
	ref := wechatRef{openID: session.OpenID, unionID: session.UnionID}

	student, err := findStudent(e.App, ref, cellphone)
	if err != nil {
		log.Printf("wechat login student lookup: %v", err)
		return httpx.Error(e, 500, "查询用户信息失败，请稍后再试")
	}
	teacher, err := findByCellphone(e.App, "teachers", cellphone)
	if err != nil {
		log.Printf("wechat login teacher lookup: %v", err)
		return httpx.Error(e, 500, "查询用户身份失败，请稍后再试")
	}
	if teacher != nil && validatePrincipal("teacher", teacher) != nil {
		teacher = nil
	}
	if teacher != nil && (student == nil || student.GetBool("blocked")) {
		data, err := s.issuePrincipal(e.App, "teacher", teacher, ref)
		return reply(e, data, err)
	}

	info := hydrateUserInfo(userInfo)
	if student != nil {
		if student.GetBool("blocked") {
			return httpx.Error(e, 403, "该账号已被封禁，请联系客服")
		}
		if err := s.saveWechatProfile(e, student, ref, info, cellphone); err != nil {
			log.Printf("wechat login profile update: %v", err)
			return httpx.Error(e, 500, "更新用户信息失败，请稍后重试")
		}
		if teacher != nil {
			data, err := s.createRoleChallenge([]candidate{{"student", student}, {"teacher", teacher}}, cellphone, ref)
			return reply(e, data, err)
		}
	} else {
		created, err := s.createWechatStudent(e, ref, info, cellphone)
		if err != nil {
			var coded *httpx.CodedError
			if errors.As(err, &coded) {
				return httpx.Error(e, coded.Code, coded.Message)
			}
			log.Printf("wechat login create student: %v", err)
			return httpx.Error(e, 500, "创建用户失败，请稍后重试")
		}
		student = created
	}

	if trimmedEmpty(student.GetString("avatar")) {
		student.Set("avatar", s.cfg.DefaultAvatar)
	}
	data, err := s.issuePrincipal(e.App, "student", student, ref)
	return reply(e, data, err)
}

func (s *service) createWechatStudent(e *core.RequestEvent, ref wechatRef, info map[string]any, cellphone string) (*core.Record, error) {
	target, err := e.App.FindCollectionByNameOrId("students")
	if err != nil {
		return nil, err
	}
	gender := info["gender"]
	if !truthy(gender) {
		gender = 0
	}
	student := core.NewRecord(target)
	student.Set("cellphone", cellphone)
	student.Set("password", "")
	student.Set("tokenKey", uuidV4())
	student.Set("sn", uuidV4())
	student.Set("nickName", firstNonEmpty(info["nickName"].(string), "微信用户"+lastFour(cellphone)))
	student.Set("avatar", firstNonEmpty(info["avatarUrl"].(string), s.cfg.DefaultAvatar))
	student.Set("gender", gender)
	student.Set("blocked", false)
	student.Set("wechatUserInfo", info)
	stampLogin(e, student, "wechat")
	setWechatIDs(student, ref)
	err = e.App.Save(student)
	if err == nil {
		return student, nil
	}
	if !isDuplicate(err) {
		return nil, err
	}

	// A concurrent sign-in created the same student; recover it instead of failing.
	log.Printf("wechat login duplicate create, recovering: %v", err)
	existing, findErr := findStudent(e.App, ref, cellphone)
	if findErr != nil || existing == nil {
		return nil, errors.Join(err, findErr)
	}
	if existing.GetBool("blocked") {
		return nil, &httpx.CodedError{Code: 403, Message: "该账号已被封禁，请联系客服"}
	}
	if err := s.saveWechatProfile(e, existing, ref, info, cellphone); err != nil {
		return nil, err
	}
	return existing, nil
}

// saveWechatProfile fills only blank profile fields. Gender and age are number
// fields that always hold a value, so Hono never overwrote them either.
func (s *service) saveWechatProfile(e *core.RequestEvent, student *core.Record, ref wechatRef, info map[string]any, cellphone string) error {
	student.Set("wechatUserInfo", info)
	student.Set("cellphone", cellphone)
	stampLogin(e, student, "wechat")
	setWechatIDs(student, ref)
	if trimmedEmpty(student.GetString("nickName")) {
		student.Set("nickName", firstNonEmpty(info["nickName"].(string), "微信用户"+lastFour(cellphone)))
	}
	if trimmedEmpty(student.GetString("avatar")) {
		student.Set("avatar", firstNonEmpty(info["avatarUrl"].(string), s.cfg.DefaultAvatar))
	}
	return e.App.Save(student)
}

func (s *service) wechatRoleLogin(e *core.RequestEvent) error {
	body := httpx.ReadBody(e)
	return httpx.Respond(e, func() (any, error) {
		data, err := s.completeRoleChallenge(e.App, body["challenge"], body["role"])
		if err != nil {
			return nil, roleError(err, true, "身份选择失败")
		}
		return data, nil
	})
}

func (s *service) wechatRoles(e *core.RequestEvent) error {
	return httpx.Respond(e, func() (any, error) {
		roles, err := s.listRoles(e.App, auth.ClaimString(auth.User(e), "wechatOpenId"))
		if err != nil {
			return nil, roleError(err, false, "获取身份列表失败")
		}
		return roles, nil
	})
}

func (s *service) switchWechatRole(e *core.RequestEvent) error {
	body := httpx.ReadBody(e)
	return httpx.Respond(e, func() (any, error) {
		data, err := s.switchRole(e.App, auth.ClaimString(auth.User(e), "wechatOpenId"), body["role"])
		if err != nil {
			return nil, roleError(err, false, "切换身份失败")
		}
		return data, nil
	})
}

// findStudent looks up by WeChat ids first, then by phone; nil when neither matches.
func findStudent(app core.App, ref wechatRef, cellphone string) (*core.Record, error) {
	clauses, params := []string{}, dbx.Params{}
	if ref.openID != "" {
		clauses, params["openId"] = append(clauses, "wechatId = {:openId}"), ref.openID
	}
	if ref.unionID != "" {
		clauses, params["unionId"] = append(clauses, "wechatUnionId = {:unionId}"), ref.unionID
	}
	if len(clauses) > 0 {
		record, err := app.FindFirstRecordByFilter("students", strings.Join(clauses, " || "), params)
		if err == nil {
			return record, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
	}
	if cellphone = normalizeCellphone(cellphone); cellphone == "" {
		return nil, nil
	}
	return findByCellphone(app, "students", cellphone)
}

func setWechatIDs(student *core.Record, ref wechatRef) {
	if ref.openID != "" {
		student.Set("wechatId", ref.openID)
	}
	if ref.unionID != "" {
		student.Set("wechatUnionId", ref.unionID)
	}
}

func hydrateUserInfo(userInfo map[string]any) map[string]any {
	text := func(keys ...string) string {
		for _, key := range keys {
			if truthy(userInfo[key]) {
				return paramText(userInfo[key])
			}
		}
		return ""
	}
	orEmpty := func(key string) any {
		if userInfo[key] == nil {
			return ""
		}
		return userInfo[key]
	}
	return map[string]any{
		"avatarUrl": text("avatarUrl", "avatar"),
		"nickName":  text("nickName", "nickname"),
		"gender":    orEmpty("gender"),
		"language":  text("language"),
		"city":      text("city"),
		"province":  text("province"),
		"country":   text("country"),
		"age":       orEmpty("age"),
	}
}

func normalizeCellphone(value string) string {
	return chinaPrefix.ReplaceAllString(whitespace.ReplaceAllString(strings.TrimSpace(value), ""), "")
}

func lastFour(value string) string {
	runes := []rune(value)
	if len(runes) <= 4 {
		return value
	}
	return string(runes[len(runes)-4:])
}

func isDuplicate(err error) bool {
	text := strings.ToLower(err.Error())
	for _, hint := range duplicateHint {
		if strings.Contains(text, hint) {
			return true
		}
	}
	return false
}

// objectParam accepts an object or its JSON string form, as WeChat form posts send.
func objectParam(value any) map[string]any {
	switch v := value.(type) {
	case map[string]any:
		return v
	case string:
		parsed := map[string]any{}
		if json.Unmarshal([]byte(v), &parsed) == nil && parsed != nil {
			return parsed
		}
	}
	return map[string]any{}
}

// paramText is `${value}` for scalars and "" for missing values.
func paramText(value any) string {
	if value == nil {
		return ""
	}
	return jsString(value)
}
