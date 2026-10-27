package identity

import (
	"database/sql"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/httpx"
	"kanyue.server/internal/records"
)

const placeholderAvatar = "https://example.com/default-avatar.png"

// login is POST /v1/user/login: students first, then teachers; unknown phones never self-register.
func (s *service) login(e *core.RequestEvent) error {
	body := httpx.ReadBody(e)
	cellphone, password := body.Text("cellphone"), body.Text("password")
	if cellphone == "" || password == "" {
		return httpx.Error(e, 400, "手机号和密码不能为空")
	}
	if s.failures.blocked(cellphone) {
		return httpx.Error(e, 429, "登录尝试次数过多，请 15 分钟后再试")
	}
	reject := func() (any, error) {
		s.failures.fail(cellphone)
		return nil, &httpx.CodedError{Code: 401, Message: "手机号或密码错误"}
	}
	return httpx.Respond(e, func() (any, error) {
		student, err := findByCellphone(e.App, "students", cellphone)
		if err != nil {
			return nil, err
		}
		if student != nil {
			if student.GetString("password") == "" || student.GetString("password") != md5Hex(password) {
				return reject()
			}
			if student.GetBool("blocked") {
				return nil, &httpx.CodedError{Code: 403, Message: "该账号已被封禁，请联系客服"}
			}
			s.touchLogin(e, student, "password")
			data := records.Export(student)
			s.setAvatar(data, student, placeholderAvatar)
			if value, ok := data["idAdmin"]; ok {
				data["isAdmin"] = value
				delete(data, "idAdmin")
			} else {
				data["isAdmin"] = false
			}
			token, err := s.signer.Sign(student.Id, student.GetString("sn"), "student", false, nil, auth.AppTokenTTL)
			if err != nil {
				return nil, err
			}
			data["token"], data["role"] = token, "student"
			s.failures.clear(cellphone)
			return records.StripPrivate(data), nil
		}

		teacher, err := findByCellphone(e.App, "teachers", cellphone)
		if err != nil {
			return nil, err
		}
		if teacher == nil || !teacherPasswordMatches(teacher, password) {
			return reject()
		}
		if teacher.GetBool("blocked") {
			return nil, &httpx.CodedError{Code: 403, Message: "该账号已被封禁，请联系客服"}
		}
		if !teacher.GetBool("verified") {
			return nil, &httpx.CodedError{Code: 403, Message: "账号正在审核中，请耐心等待"}
		}
		s.touchLogin(e, teacher, "password")
		data := records.Export(teacher)
		s.setAvatar(data, teacher, placeholderAvatar)
		isAdmin := teacher.GetBool("idAdmin")
		delete(data, "idAdmin")
		token, err := s.signer.Sign(teacher.Id, teacher.GetString("sn"), "teacher", isAdmin, auth.Claims{
			"courseCreditCapabilities": records.RawArray(teacher, "courseCreditCapabilities"),
		}, auth.AppTokenTTL)
		if err != nil {
			return nil, err
		}
		data["token"], data["role"], data["isAdmin"] = token, "teacher", isAdmin
		s.failures.clear(cellphone)
		return records.StripPrivate(data), nil
	})
}

// refresh is POST /v1/user/refresh. Like Hono it answers with the record as read
// before stamping the refresh time.
func (s *service) refresh(e *core.RequestEvent) error {
	user := auth.User(e)
	role := auth.ClaimString(user, "role")
	if role != "student" && role != "teacher" {
		return httpx.Error(e, 400, "无效的用户角色")
	}
	return httpx.Respond(e, func() (any, error) {
		record, err := e.App.FindRecordById(collectionFor(role), auth.ClaimString(user, "id"))
		if err != nil {
			return nil, &httpx.CodedError{Code: 404, Message: "用户不存在或已被删除"}
		}
		if record.GetBool("blocked") {
			return nil, &httpx.CodedError{Code: 403, Message: "该账号已被封禁，请联系客服"}
		}
		if role == "teacher" && !record.GetBool("verified") {
			return nil, &httpx.CodedError{Code: 403, Message: "账号正在审核中，请耐心等待"}
		}
		data := records.Export(record)
		stampLogin(e, record, "refresh")
		if err := e.App.Save(record); err != nil {
			return nil, err
		}
		s.setAvatar(data, record, "")

		isAdmin, extra := false, auth.Claims(nil)
		if role == "teacher" {
			isAdmin = record.GetBool("isAdmin")
			extra = auth.Claims{
				"courseCreditCapabilities": records.RawArray(record, "courseCreditCapabilities"),
				"wechatOpenId":             auth.ClaimString(user, "wechatOpenId"),
			}
		}
		token, err := s.signer.Sign(auth.ClaimString(user, "id"), auth.ClaimString(user, "sn"), role, isAdmin, extra, auth.AppTokenTTL)
		if err != nil {
			return nil, err
		}
		data["token"], data["role"], data["isAdmin"] = token, role, isAdmin
		return records.StripPrivate(data), nil
	})
}

var updatableFields = []struct{ name, legacy, label string }{
	{"realName", "realname", "姓名"}, {"nickName", "nickname", "昵称"},
	{"avatar", "", ""}, {"gender", "", ""}, {"age", "", ""}, {"province", "", ""},
}

// update is POST /v1/user/update; legacy realname/nickname aliases are accepted and echoed.
func (s *service) update(e *core.RequestEvent) error {
	user := auth.User(e)
	body := httpx.ReadBody(e)
	changes := map[string]any{}
	for _, field := range updatableFields {
		if body.Has(field.name) {
			changes[field.name] = body[field.name]
		} else if field.legacy != "" && body.Has(field.legacy) {
			changes[field.name] = body[field.legacy]
		}
	}
	if len(changes) == 0 {
		return httpx.Error(e, 400, "没有提供要更新的字段")
	}
	if avatar, ok := changes["avatar"]; ok {
		if text, isText := avatar.(string); !truthy(avatar) || (isText && trimmedEmpty(text)) {
			changes["avatar"] = s.cfg.DefaultAvatar
		}
	}
	role := auth.ClaimString(user, "role")
	if role != "student" && role != "teacher" {
		return httpx.Error(e, 400, "无效的用户角色")
	}
	return httpx.Respond(e, func() (any, error) {
		record, err := e.App.FindRecordById(collectionFor(role), auth.ClaimString(user, "id"))
		if err != nil {
			return nil, &httpx.CodedError{Code: 404, Message: "用户不存在或已被删除"}
		}
		for key, value := range changes {
			record.Set(key, value)
		}
		if err := e.App.Save(record); err != nil {
			return nil, &httpx.CodedError{Code: 500, Message: "Failed to update record."}
		}
		data := records.Export(record)
		if trimmedEmpty(record.GetString("avatar")) {
			data["avatar"] = s.cfg.DefaultAvatar
		}
		for _, field := range updatableFields[:2] {
			value, ok := changes[field.name]
			if !ok {
				continue
			}
			persisted := record.GetString(field.name)
			if persisted != jsString(value) {
				return nil, &httpx.CodedError{Code: 500, Message: field.label + "更新未生效"}
			}
			data[field.name], data[field.legacy] = persisted, persisted
		}
		return records.StripPrivate(data), nil
	})
}

func (s *service) setAvatar(data map[string]any, record *core.Record, placeholder string) {
	avatar := record.GetString("avatar")
	url := records.FileURL(record, avatar, s.cfg.PublicAssetBaseURL, s.cfg.PBPublicURL)
	data["avatarUrl"] = firstNonEmpty(url, avatar, s.cfg.DefaultAvatar, placeholder)
	data["avatar"] = firstNonEmpty(avatar, s.cfg.DefaultAvatar, placeholder)
}

// touchLogin stamps the login; like Hono a failed stamp never blocks sign-in.
func (s *service) touchLogin(e *core.RequestEvent, record *core.Record, method string) {
	stampLogin(e, record, method)
	if err := e.App.Save(record); err != nil {
		log.Printf("login stamp %s: %v", record.Collection().Name, err)
	}
}

func stampLogin(e *core.RequestEvent, record *core.Record, method string) {
	record.Set("lastLoginAt", time.Now())
	record.Set("lastLoginIp", loginIP(e, "unknown"))
	record.Set("lastLoginMethod", method)
}

// findByCellphone returns nil when no record matches.
func findByCellphone(app core.App, collection, cellphone string) (*core.Record, error) {
	record := &core.Record{}
	err := app.RecordQuery(collection).AndWhere(dbx.HashExp{"cellphone": cellphone}).Limit(1).One(record)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return record, nil
}

func isNoRows(err error) bool {
	return errors.Is(err, sql.ErrNoRows)
}

func trimmedEmpty(value string) bool {
	return strings.TrimSpace(value) == ""
}
