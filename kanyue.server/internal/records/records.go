// Package records exports PocketBase records the way Hono received them from the
// REST API as a superuser, and strips credential fields before they leave the API.
package records

import (
	"encoding/json"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/search"
)

// privateUserFields never leave the API (Hono's PRIVATE_USER_FIELDS).
var privateUserFields = []string{
	"password", "passwordHash", "tokenKey", "wechatId", "wechatOpenId",
	"wechatUnionId", "wechatUserInfo", "lastLoginIp",
}

// Export matches a superuser REST response: hidden fields visible, auth email visible.
func Export(record *core.Record) map[string]any {
	record.Unhide(record.Collection().Fields.FieldNames()...)
	record.IgnoreEmailVisibility(true)
	return record.PublicExport()
}

func PublicUser(record *core.Record) map[string]any {
	return StripPrivate(Export(record))
}

// StripPrivate is Hono's publicUser applied to an already-built response map.
func StripPrivate(data map[string]any) map[string]any {
	for _, field := range privateUserFields {
		delete(data, field)
	}
	return data
}

// RawArray returns a JSON array field as stored, or [] (Hono's Array.isArray fallback).
func RawArray(record *core.Record, field string) []any {
	var raw []any
	if err := record.UnmarshalJSONField(field, &raw); err != nil || raw == nil {
		return []any{}
	}
	return raw
}

// SetKnown assigns only fields the collection defines; PocketBase's REST API
// silently ignores unknown keys, which Hono payloads rely on.
func SetKnown(record *core.Record, data map[string]any) {
	fields := record.Collection().Fields
	for key, value := range data {
		if fields.GetByName(key) != nil {
			record.Set(key, value)
		}
	}
}

// FileURL mirrors Hono's getFileUrl: public bucket first, then the PocketBase file route.
func FileURL(record *core.Record, filename, publicAssetBaseURL, pbPublicURL string) string {
	if filename == "" {
		return ""
	}
	if strings.HasPrefix(filename, "http://") || strings.HasPrefix(filename, "https://") {
		return filename
	}
	base := strings.TrimRight(strings.TrimSpace(publicAssetBaseURL), "/")
	if base != "" {
		return base + "/" + record.Collection().Id + "/" + record.Id + "/" + filename
	}
	base = strings.TrimRight(strings.TrimSpace(pbPublicURL), "/")
	if base == "" {
		return ""
	}
	return base + "/api/files/" + record.Collection().Id + "/" + record.Id + "/" + filename
}

// Truthy matches Hono's checks for bool-ish stored values.
func Truthy(value any) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		return v == "true" || v == "1"
	case float64:
		return v == 1
	case int:
		return v == 1
	}
	return false
}

// Capabilities returns distinct non-blank strings from a JSON array field.
func Capabilities(record *core.Record, field string) []string {
	result := []string{}
	var raw []any
	if err := record.UnmarshalJSONField(field, &raw); err != nil {
		return result
	}
	seen := map[string]bool{}
	for _, item := range raw {
		text, ok := item.(string)
		if !ok || strings.TrimSpace(text) == "" || seen[text] {
			continue
		}
		seen[text] = true
		result = append(result, text)
	}
	return result
}

// PageResult is PocketBase's list response metadata.
type PageResult struct {
	Page       int
	PerPage    int
	TotalItems int
	TotalPages int
	Items      []*core.Record
}

// Page runs a filtered, sorted page query the way the superuser REST list endpoint does.
func Page(app core.App, collectionName, filter, sort string, page, perPage int) (PageResult, error) {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return PageResult{}, err
	}
	resolver := core.NewRecordFieldResolver(app, collection, nil, true)
	provider := search.NewProvider(resolver).
		Query(app.RecordQuery(collection)).
		Page(page).
		PerPage(perPage)
	if sort != "" {
		provider.Sort(search.ParseSortFromString(sort))
	}
	if filter != "" {
		provider.Filter([]search.FilterData{search.FilterData(filter)})
	}
	items := []*core.Record{}
	result, err := provider.Exec(&items)
	if err != nil {
		return PageResult{}, err
	}
	return PageResult{Page: result.Page, PerPage: result.PerPage, TotalItems: result.TotalItems, TotalPages: result.TotalPages, Items: items}, nil
}

// JSON is a record as Hono decoded it from REST JSON: dates as strings, json fields decoded.
func JSON(record *core.Record) map[string]any {
	raw, _ := json.Marshal(Export(record))
	data := map[string]any{}
	_ = json.Unmarshal(raw, &data)
	return data
}

// EscapeFilter quotes a value for a filter string literal (Hono's escapeFilter).
func EscapeFilter(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, `\`, `\\`), `"`, `\"`)
}
