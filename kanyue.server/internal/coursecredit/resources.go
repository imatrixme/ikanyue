package coursecredit

import (
	"slices"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/jsx"
	"kanyue.server/internal/records"
)

// resource is one read model of Hono's CourseCreditOpsQueryService.
type resource struct {
	collection   string
	sort         string
	fields       []string
	statuses     []string
	baseFilter   string
	filterFields []string
	rawFields    []string
}

// resources grows as later stages take over more course-credit routes.
var resources = map[string]resource{
	"courseSpecs": {
		collection: "course_specs", sort: "name",
		fields: []string{"id", "code", "name", "deliveryMode", "durationMinutes", "teacherTier",
			"status", "defaultCreditTypeId", "created", "updated"},
		statuses: []string{"draft", "active", "inactive"},
	},
	"creditTypes": {
		collection: "credit_types", sort: "kind,name",
		fields: []string{"id", "code", "name", "kind", "courseSpecId", "consumable", "unitLabel",
			"referenceUnitValue", "status", "created", "updated"},
		statuses: []string{"draft", "active", "inactive"},
	},
	"packages": {
		collection: "packages", sort: "name",
		fields: []string{"id", "code", "name", "description", "saleChannel", "activationMode",
			"activationDeadlineDays", "validityDurationDays", "expiryPolicy", "status", "created", "updated"},
		statuses: []string{"draft", "active", "inactive"},
	},
	"grantLines": {
		collection: "package_grant_lines", sort: "packageId,creditTypeId",
		fields:       []string{"id", "packageId", "creditTypeId", "quantity", "created", "updated"},
		filterFields: []string{"packageId", "creditTypeId"},
	},
	"priceVersions": {
		collection: "price_versions", sort: "-validFrom,-version",
		fields: []string{"id", "packageId", "currency", "listAmount", "saleAmount", "validFrom",
			"validTo", "version", "status", "created"},
		statuses: []string{"draft", "active", "inactive"},
	},
}

// listQueryNames are the query parameters Hono's generic list handler forwards.
var listQueryNames = []string{
	"page", "perPage", "status", "studentId", "teacherId", "classId", "sessionId",
	"priceVersionId", "creditTypeId", "attendanceStatus", "creditStatus", "actualStatus",
	"actorId", "resourceType", "resourceId", "sourceId", "outcome",
}

type page struct {
	Page       int              `json:"page"`
	PerPage    int              `json:"perPage"`
	TotalItems int              `json:"totalItems"`
	TotalPages int              `json:"totalPages"`
	Items      []map[string]any `json:"items"`
}

func listResource(app core.App, name string, query map[string]string) (page, error) {
	config := resources[name]
	pageNumber, perPage, err := pagination(query)
	if err != nil {
		return page{}, err
	}
	filters := []string{}
	if config.baseFilter != "" {
		filters = append(filters, config.baseFilter)
	}
	if status := query["status"]; status != "" {
		if !slices.Contains(config.statuses, status) {
			return page{}, Fail("OPS_FILTER_STATUS_INVALID", "Resource status filter is invalid", nil)
		}
		filters = append(filters, `status="`+records.EscapeFilter(status)+`"`)
	}
	for _, field := range config.filterFields {
		if value := query[field]; value != "" {
			filters = append(filters, field+`="`+records.EscapeFilter(value)+`"`)
		}
	}
	result, err := records.Page(app, config.collection, strings.Join(filters, " && "), config.sort, pageNumber, perPage)
	if err != nil {
		return page{}, err
	}
	items := make([]map[string]any, 0, len(result.Items))
	for _, record := range result.Items {
		items = append(items, project(records.JSON(record), config.fields, config.rawFields))
	}
	return page{Page: result.Page, PerPage: result.PerPage, TotalItems: result.TotalItems, TotalPages: result.TotalPages, Items: items}, nil
}

func getResource(app core.App, name, id string) (map[string]any, error) {
	config := resources[name]
	if id == "" {
		return nil, Fail("OPS_RESOURCE_ID_REQUIRED", "Resource id is required", nil)
	}
	filter := `id="` + records.EscapeFilter(id) + `"`
	if config.baseFilter != "" {
		filter += " && (" + config.baseFilter + ")"
	}
	result, err := records.Page(app, config.collection, filter, "", 1, 1)
	if err != nil {
		return nil, err
	}
	if len(result.Items) == 0 {
		return nil, Fail("OPS_RESOURCE_NOT_FOUND", "Course-credit resource was not found", map[string]any{"resource": name})
	}
	return project(records.JSON(result.Items[0]), config.fields, config.rawFields), nil
}

// pagination is Hono's queryService pagination: positive integers, perPage at most 100.
func pagination(query map[string]string) (int, int, error) {
	pageNumber, err := pageParam(query, "page", 1)
	if err != nil {
		return 0, 0, err
	}
	perPage, err := pageParam(query, "perPage", 20)
	if err != nil {
		return 0, 0, err
	}
	if perPage > 100 {
		return 0, 0, Fail("PER_PAGE_INVALID", "perPage must not exceed 100", nil)
	}
	return pageNumber, perPage, nil
}

func pageParam(query map[string]string, key string, fallback int) (int, error) {
	value, ok := query[key]
	if !ok || value == "" {
		return fallback, nil
	}
	number := jsx.Number(value)
	if !jsx.IsInteger(value) || number <= 0 {
		return 0, Fail("PAGINATION_INVALID", "Pagination values must be positive integers", nil)
	}
	return int(number), nil
}

// project keeps the listed fields; relation values collapse to ids unless raw.
func project(record map[string]any, fields, rawFields []string) map[string]any {
	result := make(map[string]any, len(fields))
	for _, field := range fields {
		value := record[field]
		if !slices.Contains(rawFields, field) {
			value = relationOrValue(value)
		}
		result[field] = value
	}
	return result
}

func relationOrValue(value any) any {
	switch v := value.(type) {
	case []any:
		ids := make([]any, len(v))
		for i, item := range v {
			ids[i] = relationID(item)
		}
		return ids
	case map[string]any:
		return relationID(v)
	}
	return value
}

func relationID(value any) string {
	switch v := value.(type) {
	case []any:
		if len(v) == 0 {
			return ""
		}
		return relationID(v[0])
	case map[string]any:
		id, _ := v["id"].(string)
		return id
	case string:
		return v
	case nil:
		return ""
	}
	// JavaScript `value || ''` keeps other truthy scalars as they are; ids are strings in practice.
	return jsx.String(value)
}
