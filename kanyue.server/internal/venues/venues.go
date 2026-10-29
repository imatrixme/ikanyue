// Package venues serves studio venues. Rules and field shapes match Hono's venueService.
package venues

import (
	"errors"
	"fmt"
	"math"
	"mime/multipart"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"

	"kanyue.server/internal/audit"
	"kanyue.server/internal/auth"
	"kanyue.server/internal/httpx"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/migrations"
	"kanyue.server/internal/records"
)

const collection = "venues"

var phonePattern = regexp.MustCompile(`^[0-9+\-\s]{0,20}$`)

var fieldLimits = []struct {
	name, label string
	limit       int
}{
	{"address", "地址", 120}, {"intro", "简介", 120}, {"name", "场馆名称", 40}, {"openingHours", "营业时间", 80},
}

type Module struct {
	Signer *auth.Signer
	// PublicAssetBaseURL and PBPublicURL build the cover URL, as for activity covers.
	PublicAssetBaseURL string
	PBPublicURL        string
}

type venue struct {
	Address      string `json:"address"`
	Bookable     bool   `json:"bookable"`
	CoverURL     string `json:"coverUrl"`
	ID           string `json:"id"`
	Intro        string `json:"intro"`
	Name         string `json:"name"`
	OpeningHours string `json:"openingHours"`
	Phone        string `json:"phone"`
	SortOrder    *int   `json:"sortOrder,omitempty"`
	Status       string `json:"status,omitempty"`
}

type listResult struct {
	Items []venue `json:"items"`
}

func (m Module) Register(se *core.ServeEvent) {
	se.Router.GET("/v1/public/venues", func(e *core.RequestEvent) error {
		return httpx.Respond(e, func() (any, error) { return m.list(e.App, `status = "active"`, false) })
	})
	se.Router.GET("/ops/venues", m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
		return httpx.Respond(e, func() (any, error) {
			if err := assertAdmin(e); err != nil {
				return nil, err
			}
			return m.list(e.App, "", true)
		})
	}))
	se.Router.POST("/ops/venues", m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
		body := httpx.ReadBody(e)
		return httpx.Respond(e, func() (any, error) { return m.save(e, "", false, body) })
	}))
	se.Router.POST("/ops/venues/{id}", m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
		body := httpx.ReadBody(e)
		return httpx.Respond(e, func() (any, error) { return m.save(e, strings.TrimSpace(e.Request.PathValue("id")), true, body) })
	}))
	se.Router.POST("/ops/venues/{id}/cover", m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
		return httpx.Respond(e, func() (any, error) { return m.uploadCover(e, strings.TrimSpace(e.Request.PathValue("id"))) })
	}))
}

func (m Module) list(app core.App, filter string, admin bool) (listResult, error) {
	records, err := app.FindRecordsByFilter(collection, filter, "sortOrder", 200, 0)
	if err != nil {
		return listResult{}, err
	}
	items := make([]venue, 0, len(records))
	for _, record := range records {
		items = append(items, m.project(record, admin))
	}
	return listResult{Items: items}, nil
}

// uploadCover replaces the venue's cover; the previous file is removed by PocketBase.
func (m Module) uploadCover(e *core.RequestEvent, id string) (any, error) {
	if err := e.Request.ParseMultipartForm(32 << 20); err != nil && !errors.Is(err, http.ErrNotMultipart) {
		return nil, userError("封面上传请求解析失败")
	}
	if err := assertAdmin(e); err != nil {
		return nil, err
	}
	if id == "" {
		return nil, userError("场馆不能为空")
	}
	var header *multipart.FileHeader
	if form := e.Request.MultipartForm; form != nil && len(form.File["cover"]) > 0 {
		header = form.File["cover"][0]
	}
	switch {
	case header == nil:
		return nil, userError("请选择封面图片")
	case header.Size <= 0:
		return nil, userError("封面图片不能为空")
	case header.Size > migrations.VenueCoverMaxSize:
		return nil, userError("封面图片不能超过 5MB")
	case !slices.Contains(migrations.VenueCoverTypes, strings.ToLower(header.Header.Get("Content-Type"))):
		return nil, userError("仅支持 JPG、PNG 或 WebP 图片")
	}
	record, err := e.App.FindRecordById(collection, id)
	if err != nil {
		return nil, err
	}
	file, err := filesystem.NewFileFromMultipart(header)
	if err != nil {
		return nil, err
	}
	record.Set("cover", file)
	if err := e.App.Save(record); err != nil {
		return nil, err
	}
	result := m.project(record, true)
	user := auth.User(e)
	audit.Record(e.App, audit.Entry{
		Actor:        &audit.Actor{ID: auth.ClaimString(user, "id"), Role: auth.ClaimString(user, "role")},
		Action:       "ops.venue.cover",
		ResourceType: collection,
		ResourceID:   result.ID,
		Outcome:      "success",
		Metadata:     map[string]any{"name": result.Name},
	})
	return result, nil
}

func (m Module) save(e *core.RequestEvent, id string, update bool, input httpx.Body) (any, error) {
	if err := assertAdmin(e); err != nil {
		return nil, err
	}
	// A blank path id must not fall through to creating a venue.
	if update && id == "" {
		return nil, userError("场馆不能为空")
	}
	target, err := e.App.FindCollectionByNameOrId(collection)
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(target)
	merged := httpx.Body{}
	if update {
		if record, err = e.App.FindRecordById(collection, id); err != nil {
			return nil, err
		}
		for key, value := range record.PublicExport() {
			merged[key] = value
		}
	}
	for key, value := range input {
		merged[key] = value
	}
	payload, err := validate(merged)
	if err != nil {
		return nil, err
	}
	for key, value := range payload {
		record.Set(key, value)
	}
	if err := e.App.Save(record); err != nil {
		return nil, err
	}
	result := m.project(record, true)
	action := "ops.venue.create"
	if update {
		action = "ops.venue.update"
	}
	user := auth.User(e)
	audit.Record(e.App, audit.Entry{
		Actor:        &audit.Actor{ID: auth.ClaimString(user, "id"), Role: auth.ClaimString(user, "role")},
		Action:       action,
		ResourceType: collection,
		ResourceID:   result.ID,
		Outcome:      "success",
		Metadata:     map[string]any{"bookable": result.Bookable, "name": result.Name, "status": result.Status},
	})
	return result, nil
}

func validate(input httpx.Body) (map[string]any, error) {
	payload := map[string]any{
		"address":      trimmed(input["address"]),
		"bookable":     input["bookable"] == true || input["bookable"] == "true",
		"intro":        trimmed(input["intro"]),
		"name":         trimmed(input["name"]),
		"openingHours": trimmed(input["openingHours"]),
		"phone":        trimmed(input["phone"]),
		"sortOrder":    toInteger(input["sortOrder"]),
		"status":       "active",
	}
	if input["status"] == "inactive" {
		payload["status"] = "inactive"
	}
	if payload["name"] == "" {
		return nil, userError("场馆名称不能为空")
	}
	for _, field := range fieldLimits {
		if jsx.Length(payload[field.name].(string)) > field.limit {
			return nil, userError(fmt.Sprintf("%s不能超过 %d 个字", field.label, field.limit))
		}
	}
	if !phonePattern.MatchString(payload["phone"].(string)) {
		return nil, userError("咨询电话只能包含数字、空格、+ 和 -")
	}
	return payload, nil
}

func (m Module) project(record *core.Record, admin bool) venue {
	result := venue{
		Address:      record.GetString("address"),
		Bookable:     record.GetBool("bookable"),
		CoverURL:     records.FileURL(record, record.GetString("cover"), m.PublicAssetBaseURL, m.PBPublicURL),
		ID:           record.Id,
		Intro:        record.GetString("intro"),
		Name:         record.GetString("name"),
		OpeningHours: record.GetString("openingHours"),
		Phone:        record.GetString("phone"),
	}
	if admin {
		sortOrder := int(record.GetFloat("sortOrder"))
		result.SortOrder = &sortOrder
		result.Status = "active"
		if record.GetString("status") == "inactive" {
			result.Status = "inactive"
		}
	}
	return result
}

func assertAdmin(e *core.RequestEvent) error {
	user := auth.User(e)
	if auth.ClaimString(user, "id") == "" || !auth.ClaimBool(user, "isAdmin") {
		return &httpx.CodedError{Code: 403, Message: "需要管理员权限"}
	}
	return nil
}

func userError(message string) error {
	return &httpx.CodedError{Code: 400, Message: message}
}

func trimmed(value any) string {
	text, _ := value.(string)
	return strings.TrimSpace(text)
}

// toInteger follows JS Math.trunc(Number(value)) with non-finite results as 0.
func toInteger(value any) int {
	var number float64
	switch v := value.(type) {
	case float64:
		number = v
	case bool:
		if v {
			number = 1
		}
	case string:
		text := strings.TrimSpace(v)
		if text == "" {
			return 0
		}
		parsed, err := strconv.ParseFloat(text, 64)
		if err != nil {
			return 0
		}
		number = parsed
	case nil:
		return 0
	default:
		return 0
	}
	if math.IsNaN(number) || math.IsInf(number, 0) {
		return 0
	}
	return int(math.Trunc(number))
}
