// Package activities serves the mini program's public activity list and detail.
// Only published activities are visible and every caller value is a filter
// literal, as in Hono's activity/find.
package activities

import (
	"database/sql"
	"errors"
	"log"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/httpx"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/records"
)

const (
	collection  = "activities"
	defaultSort = "-created"
	// pbDate is how PocketBase stores and compares dates.
	pbDate = "2006-01-02 15:04:05.000Z"
)

var sortable = map[string]bool{"created": true, "updated": true, "startTime": true, "sequence": true}

type Module struct {
	// PublicAssetBaseURL and PBPublicURL build image URLs (Hono's getFileUrl).
	PublicAssetBaseURL string
	PBPublicURL        string
}

func (m Module) Register(se *core.ServeEvent) {
	se.Router.GET("/v1/activity/find", m.find)
}

func (m Module) find(e *core.RequestEvent) error {
	query := e.Request.URL.Query()
	if id := query.Get("id"); id != "" {
		record, err := e.App.FindRecordById(collection, id)
		if errors.Is(err, sql.ErrNoRows) || (err == nil && record.GetString("status") != "active") {
			return httpx.Error(e, 404, "活动不存在")
		}
		if err != nil {
			log.Printf("活动查询失败: %v", err)
			return httpx.Error(e, 500, "查询失败，请稍后重试")
		}
		return httpx.DataMessage(e, m.withFileURLs(record), "查询成功")
	}

	rawPage := "1"
	if query.Has("page") {
		rawPage = query.Get("page")
	}
	rawLimit := query.Get("limit")
	if rawLimit == "" {
		rawLimit = query.Get("perPage")
	}
	if rawLimit == "" {
		rawLimit = "20"
	}
	page, limit := jsx.Number(rawPage), jsx.Number(rawLimit)
	if !jsx.IsInteger(page) || !jsx.IsInteger(limit) || page < 1 || limit < 1 {
		return httpx.Error(e, 400, "页码和每页数量必须为正整数")
	}
	if limit > 100 {
		return httpx.Error(e, 400, "每页数量不能超过100")
	}

	filters := []string{`status = "active"`}
	for _, tag := range strings.Split(query.Get("tags"), ",") {
		if tag = strings.TrimSpace(tag); tag != "" {
			filters = append(filters, "tags ~ "+literal(tag))
		}
	}
	if kind := strings.TrimSpace(query.Get("type")); kind != "" {
		filters = append(filters, "type = "+literal(kind))
	}
	if location := strings.TrimSpace(query.Get("location")); location != "" {
		filters = append(filters, "location ~ "+literal(location))
	}
	for _, bound := range []struct{ operator, snake, camel string }{
		{">=", "start_time_gte", "startTimeGte"},
		{"<=", "start_time_lte", "startTimeLte"},
	} {
		raw := query.Get(bound.snake)
		if raw == "" {
			raw = query.Get(bound.camel)
		}
		if raw = strings.TrimSpace(raw); raw == "" {
			continue
		}
		parsed, ok := jsx.DateParse(raw)
		if !ok {
			return httpx.Error(e, 400, "活动时间范围无效")
		}
		// Hono compared against the ISO form with a "T", which sorts after the
		// stored "YYYY-MM-DD HH:MM:SS" on the boundary day; the stored form is exact.
		filters = append(filters, "startTime "+bound.operator+" "+literal(parsed.UTC().Format(pbDate)))
	}

	result, err := records.Page(e.App, collection, strings.Join(filters, " && "), safeSort(query.Get("sort")), int(page), int(limit))
	if err != nil {
		log.Printf("活动列表查询失败: %v", err)
		return httpx.Error(e, 500, "查询失败，请稍后重试")
	}
	items := make([]map[string]any, 0, len(result.Items))
	for _, record := range result.Items {
		items = append(items, m.withFileURLs(record))
	}
	return httpx.DataMessage(e, map[string]any{
		"items":      items,
		"totalItems": result.TotalItems,
		"totalPages": result.TotalPages,
		"page":       result.Page,
		"perPage":    result.PerPage,
	}, "查询成功")
}

// withFileURLs is Hono's processActivityFiles.
func (m Module) withFileURLs(record *core.Record) map[string]any {
	data := records.JSON(record)
	if cover := record.GetString("coverImage"); cover != "" {
		data["coverImageUrl"] = records.FileURL(record, cover, m.PublicAssetBaseURL, m.PBPublicURL)
	}
	if images := record.GetStringSlice("images"); len(images) > 0 {
		urls := make([]string, 0, len(images))
		for _, image := range images {
			urls = append(urls, records.FileURL(record, image, m.PublicAssetBaseURL, m.PBPublicURL))
		}
		data["imageUrls"] = urls
	}
	return data
}

// safeSort keeps the caller's sort only when every field is whitelisted.
func safeSort(value string) string {
	fields := strings.Split(value, ",")
	for i, field := range fields {
		fields[i] = strings.TrimSpace(field)
		name := fields[i]
		if strings.HasPrefix(name, "-") || strings.HasPrefix(name, "+") {
			name = name[1:]
		}
		if !sortable[name] {
			return defaultSort
		}
	}
	return strings.Join(fields, ",")
}

func literal(value string) string {
	return `"` + records.EscapeFilter(value) + `"`
}
