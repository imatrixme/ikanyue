// Package venues serves studio venues. Rules and field shapes match Hono's venueService.
package venues

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/audit"
	"kanyue.server/internal/auth"
	"kanyue.server/internal/httpx"
	"kanyue.server/internal/jsx"
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
}

type venue struct {
	Address      string `json:"address"`
	Bookable     bool   `json:"bookable"`
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
		return httpx.Respond(e, func() (any, error) { return list(e.App, `status = "active"`, false) })
	})
	se.Router.GET("/ops/venues", m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
		return httpx.Respond(e, func() (any, error) {
			if err := assertAdmin(e); err != nil {
				return nil, err
			}
			return list(e.App, "", true)
		})
	}))
	se.Router.POST("/ops/venues", m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
		body := httpx.ReadBody(e)
		return httpx.Respond(e, func() (any, error) { return save(e, "", false, body) })
	}))
	se.Router.POST("/ops/venues/{id}", m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
		body := httpx.ReadBody(e)
		return httpx.Respond(e, func() (any, error) { return save(e, strings.TrimSpace(e.Request.PathValue("id")), true, body) })
	}))
}

func list(app core.App, filter string, admin bool) (listResult, error) {
	records, err := app.FindRecordsByFilter(collection, filter, "sortOrder", 200, 0)
	if err != nil {
		return listResult{}, err
	}
	items := make([]venue, 0, len(records))
	for _, record := range records {
		items = append(items, project(record, admin))
	}
	return listResult{Items: items}, nil
}

func save(e *core.RequestEvent, id string, update bool, input httpx.Body) (any, error) {
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
	result := project(record, true)
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

func project(record *core.Record, admin bool) venue {
	result := venue{
		Address:      record.GetString("address"),
		Bookable:     record.GetBool("bookable"),
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
