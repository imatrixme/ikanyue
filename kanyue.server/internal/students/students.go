// Package students serves the admin student directory (/ops/students).
// Rules and field shapes match Hono's StudentAdminService.
package students

import (
	"crypto/md5"
	"encoding/hex"
	"errors"
	"math"
	"strings"

	validation "github.com/go-ozzo/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/audit"
	"kanyue.server/internal/auth"
	"kanyue.server/internal/httpx"
	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/records"
)

const collection = "students"

type Module struct {
	Signer *auth.Signer
}

type student struct {
	Avatar      string `json:"avatar"`
	Blocked     bool   `json:"blocked"`
	Cellphone   string `json:"cellphone"`
	Created     string `json:"created"`
	ID          string `json:"id"`
	LastLoginAt string `json:"lastLoginAt"`
	NickName    string `json:"nickName"`
	RealName    string `json:"realName"`
	Updated     string `json:"updated"`
}

type pagination struct {
	Page       int `json:"page"`
	PerPage    int `json:"perPage"`
	TotalItems int `json:"totalItems"`
	TotalPages int `json:"totalPages"`
}

type listResult struct {
	Items      []student  `json:"items"`
	Pagination pagination `json:"pagination"`
}

func (m Module) Register(se *core.ServeEvent) {
	se.Router.GET("/ops/students", m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
		return httpx.Respond(e, func() (any, error) { return list(e) })
	}))
	se.Router.POST("/ops/students", m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
		body := httpx.ReadBody(e)
		return httpx.Respond(e, func() (any, error) { return create(e, body) })
	}))
	se.Router.POST("/ops/students/{id}", m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
		body := httpx.ReadBody(e)
		return httpx.Respond(e, func() (any, error) { return update(e, e.Request.PathValue("id"), body) })
	}))
}

func list(e *core.RequestEvent) (listResult, error) {
	if err := assertAdmin(e); err != nil {
		return listResult{}, err
	}
	query := e.Request.URL.Query()
	page := positivePage(query.Get("page"), 1)
	perPageValue := query.Get("perPage")
	if perPageValue == "" {
		perPageValue = query.Get("limit")
	}
	perPage := min(100, positivePage(perPageValue, 20))
	keyword := query.Get("q")
	if keyword == "" {
		keyword = query.Get("keyword")
	}
	keyword = strings.TrimSpace(keyword)
	filters := []string{}
	if keyword != "" {
		value := records.EscapeFilter(keyword)
		filters = append(filters, `(realName ~ "`+value+`" || nickName ~ "`+value+`" || cellphone ~ "`+value+`")`)
	}
	switch strings.TrimSpace(query.Get("status")) {
	case "active":
		filters = append(filters, "blocked = false")
	case "inactive":
		filters = append(filters, "blocked = true")
	}
	result, err := records.Page(e.App, collection, strings.Join(filters, " && "), sortValue(query.Get("sort")), page, perPage)
	if err != nil {
		return listResult{}, err
	}
	items := make([]student, 0, len(result.Items))
	for _, record := range result.Items {
		items = append(items, project(record))
	}
	return listResult{
		Items:      items,
		Pagination: pagination{Page: result.Page, PerPage: result.PerPage, TotalItems: result.TotalItems, TotalPages: result.TotalPages},
	}, nil
}

func create(e *core.RequestEvent, input httpx.Body) (student, error) {
	if err := assertAdmin(e); err != nil {
		return student{}, err
	}
	cellphone, err := required(input, "cellphone", "手机号不能为空")
	if err != nil {
		return student{}, err
	}
	realName, err := required(input, "realName", "学员姓名不能为空")
	if err != nil {
		return student{}, err
	}
	password, err := required(input, "password", "初始密码不能为空")
	if err != nil {
		return student{}, err
	}
	if err := ensureUniqueCellphone(e.App, cellphone, ""); err != nil {
		return student{}, err
	}
	target, err := e.App.FindCollectionByNameOrId(collection)
	if err != nil {
		return student{}, err
	}
	record := core.NewRecord(target)
	records.SetKnown(record, map[string]any{
		"blocked":   normalizeBoolean(input["blocked"]),
		"cellphone": cellphone,
		"gender":    0,
		"nickName":  trimmed(input["nickName"]),
		"password":  md5Hex(password),
		"realName":  realName,
		"sn":        ids.UUID(),
		"tokenKey":  ids.UUID(),
	})
	if err := e.App.Save(record); err != nil {
		return student{}, storeError(err, "Failed to create record.")
	}
	auditStudent(e, "ops.students.create", record.Id, map[string]any{"cellphone": cellphone})
	return project(record), nil
}

func update(e *core.RequestEvent, id string, input httpx.Body) (student, error) {
	if err := assertAdmin(e); err != nil {
		return student{}, err
	}
	studentID := strings.TrimSpace(id)
	if studentID == "" {
		return student{}, userError(400, "学员不能为空")
	}
	current, err := e.App.FindRecordById(collection, studentID)
	if err != nil {
		return student{}, err
	}
	cellphone, err := required(input, "cellphone", "手机号不能为空")
	if err != nil {
		return student{}, err
	}
	realName, err := required(input, "realName", "学员姓名不能为空")
	if err != nil {
		return student{}, err
	}
	if cellphone != strings.TrimSpace(current.GetString("cellphone")) {
		if err := ensureUniqueCellphone(e.App, cellphone, studentID); err != nil {
			return student{}, err
		}
	}
	blocked := normalizeBoolean(input["blocked"])
	data := map[string]any{
		"blocked":   blocked,
		"cellphone": cellphone,
		"nickName":  trimmed(input["nickName"]),
		"realName":  realName,
	}
	if password := trimmed(input["password"]); password != "" {
		data["password"] = md5Hex(password)
	}
	records.SetKnown(current, data)
	if err := e.App.Save(current); err != nil {
		return student{}, storeError(err, "Failed to update record.")
	}
	auditStudent(e, "ops.students.update", studentID, map[string]any{"blocked": blocked, "cellphone": cellphone})
	return project(current), nil
}

func ensureUniqueCellphone(app core.App, cellphone, ignoredID string) error {
	matches, err := app.FindRecordsByFilter(collection, `cellphone = "`+records.EscapeFilter(cellphone)+`"`, "", 2, 0)
	if err != nil {
		return err
	}
	for _, match := range matches {
		if match.Id != ignoredID {
			return userError(409, "手机号已注册")
		}
	}
	return nil
}

func auditStudent(e *core.RequestEvent, action, resourceID string, metadata map[string]any) {
	user := auth.User(e)
	audit.Record(e.App, audit.Entry{
		Actor:        &audit.Actor{ID: auth.ClaimString(user, "id"), Role: auth.ClaimString(user, "role")},
		Action:       action,
		ResourceType: collection,
		ResourceID:   resourceID,
		Metadata:     metadata,
	})
}

func project(record *core.Record) student {
	return student{
		Avatar:      strings.TrimSpace(record.GetString("avatar")),
		Blocked:     record.GetBool("blocked"),
		Cellphone:   strings.TrimSpace(record.GetString("cellphone")),
		Created:     record.GetString("created"),
		ID:          record.Id,
		LastLoginAt: strings.TrimSpace(record.GetString("lastLoginAt")),
		NickName:    strings.TrimSpace(record.GetString("nickName")),
		RealName:    strings.TrimSpace(record.GetString("realName")),
		Updated:     record.GetString("updated"),
	}
}

// storeError is the PocketBase REST failure Hono passed through for rejected writes.
func storeError(err error, message string) error {
	var fields validation.Errors
	if errors.As(err, &fields) {
		return userError(400, message)
	}
	return err
}

func assertAdmin(e *core.RequestEvent) error {
	user := auth.User(e)
	if auth.ClaimString(user, "id") == "" || !jsx.Truthy(user["isAdmin"]) {
		return userError(403, "需要管理员权限")
	}
	return nil
}

func required(input httpx.Body, key, message string) (string, error) {
	text := trimmed(input[key])
	if text == "" {
		return "", userError(400, message)
	}
	return text, nil
}

func userError(code int, message string) error {
	return &httpx.CodedError{Code: code, Message: message}
}

func trimmed(value any) string {
	text, _ := value.(string)
	return strings.TrimSpace(text)
}

// normalizeBoolean is Hono's opsUtils.normalizeBoolean.
func normalizeBoolean(value any) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		return v == "true" || v == "1"
	case float64:
		return v == 1
	}
	return false
}

// positivePage is Number(value) when finite and positive, floored; otherwise the fallback.
func positivePage(value string, fallback int) int {
	number := jsx.Number(value)
	if math.IsNaN(number) || math.IsInf(number, 0) || number <= 0 {
		return fallback
	}
	return int(math.Floor(number))
}

func sortValue(value string) string {
	switch strings.TrimSpace(value) {
	case "name-asc":
		return "realName"
	case "name-desc":
		return "-realName"
	case "created-asc":
		return "created"
	}
	return "-created"
}

func md5Hex(value string) string {
	sum := md5.Sum([]byte(value))
	return hex.EncodeToString(sum[:])
}
