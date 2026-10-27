package coursecredit

import (
	"math"
	"regexp"
	"slices"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/records"
)

// adminSchema is one writable resource of Hono's AdminResourceCommandService.
// Revisioned resources never change in place: an update creates the next version.
type adminSchema struct {
	collection string
	fields     []string
	statuses   []string
	validate   func(map[string]any) error
	revisioned bool
}

var adminSchemas = map[string]adminSchema{
	"courseSpecs": {
		collection: "course_specs",
		fields:     []string{"code", "name", "deliveryMode", "durationMinutes", "teacherTier", "status", "defaultCreditTypeId", "metadata"},
		statuses:   []string{"draft", "active", "inactive"},
		validate:   validateCourseSpec,
	},
	"packages": {
		collection: "packages",
		fields: []string{"code", "name", "description", "saleChannel", "activationMode", "activationDeadlineDays",
			"validityDurationDays", "expiryPolicy", "status"},
		statuses: []string{"draft", "active", "inactive"},
		validate: validatePackage,
	},
	"grantLines": {
		collection: "package_grant_lines",
		fields:     []string{"packageId", "creditTypeId", "quantity"},
		validate:   validateGrantLine,
	},
	"priceVersions": {
		collection: "price_versions",
		fields:     []string{"packageId", "currency", "listAmount", "saleAmount", "validFrom", "validTo", "version", "status", "grantSnapshot"},
		statuses:   []string{"draft", "active", "inactive"},
		validate:   validatePriceVersion,
		revisioned: true,
	},
}

func createResource(app core.App, name string, actor Actor, input Body) (map[string]any, error) {
	config := adminSchemas[name]
	data, err := normalizeResourceInput(name, input, nil)
	if err != nil {
		return nil, err
	}
	id := ids.Record()
	if err := commit(app, config.collection, "", id, data, auditEntry(actor, name, id, "create", map[string]any{})); err != nil {
		return nil, err
	}
	return map[string]any{"id": id, "resource": name, "status": or(data["status"], "active")}, nil
}

func updateResource(app core.App, name, id string, actor Actor, input Body) (map[string]any, error) {
	if id == "" {
		return nil, Fail("ADMIN_RESOURCE_ID_REQUIRED", "资源编号不能为空", nil)
	}
	config := adminSchemas[name]
	record, err := app.FindRecordById(config.collection, id)
	if err != nil {
		return nil, err
	}
	current := records.JSON(record)
	data, err := normalizeResourceInput(name, input, current)
	if err != nil {
		return nil, err
	}
	if config.revisioned {
		return createRevision(app, name, current, data, actor)
	}
	if err := commit(app, config.collection, id, "", data, auditEntry(actor, name, id, "update", map[string]any{})); err != nil {
		return nil, err
	}
	return map[string]any{"id": id, "resource": name, "status": or(data["status"], or(current["status"], "active"))}, nil
}

func setStatus(app core.App, name, id string, status any, actor Actor) (map[string]any, error) {
	if text, ok := status.(string); !ok || !slices.Contains(adminSchemas[name].statuses, text) {
		return nil, Fail("ADMIN_RESOURCE_STATUS_INVALID", "资源状态无效", map[string]any{"status": status})
	}
	if name == "packages" && status == "active" {
		if err := validatePackagePublication(app, id); err != nil {
			return nil, err
		}
	}
	return updateResource(app, name, id, actor, Body{Values: map[string]any{"status": status}, Keys: []string{"status"}})
}

func validatePackagePublication(app core.App, packageID string) error {
	escaped := records.EscapeFilter(packageID)
	lines, err := app.FindRecordsByFilter("package_grant_lines", `packageId="`+escaped+`"`, "creditTypeId", 0, 0)
	if err != nil {
		return err
	}
	prices, err := app.FindRecordsByFilter("price_versions", `packageId="`+escaped+`" && status="active"`, "-version", 0, 0)
	if err != nil {
		return err
	}
	if len(lines) == 0 {
		return Fail("PACKAGE_GRANT_LINES_REQUIRED", "课包启用前必须配置课时", nil)
	}
	if len(prices) == 0 {
		return Fail("PACKAGE_ACTIVE_PRICE_REQUIRED", "课包启用前必须配置有效价格", nil)
	}
	return nil
}

func createRevision(app core.App, name string, current, data map[string]any, actor Actor) (map[string]any, error) {
	config := adminSchemas[name]
	id := ids.Record()
	version := max(positiveVersion(current["version"])+1, positiveVersion(jsx.Get(data, "version")))
	data["version"] = version
	previousID, _ := current["id"].(string)
	metadata := map[string]any{"previousId": previousID, "version": version}
	if err := commit(app, config.collection, "", id, data, auditEntry(actor, name, id, "create_revision", metadata)); err != nil {
		return nil, err
	}
	return map[string]any{"id": id, "previousId": previousID, "resource": name, "status": data["status"], "version": version}, nil
}

// commit writes the resource and its audit row in one transaction, like Hono's batch plan.
// updateID selects an update; otherwise a record is created with createID.
func commit(app core.App, collectionName, updateID, createID string, data map[string]any, auditRow map[string]any) error {
	err := app.RunInTransaction(func(tx core.App) error {
		var record *core.Record
		if updateID != "" {
			found, err := tx.FindRecordById(collectionName, updateID)
			if err != nil {
				return err
			}
			record = found
		} else {
			collection, err := tx.FindCollectionByNameOrId(collectionName)
			if err != nil {
				return err
			}
			record = core.NewRecord(collection)
			record.Id = createID
		}
		records.SetKnown(record, data)
		if err := tx.Save(record); err != nil {
			return err
		}
		auditCollection, err := tx.FindCollectionByNameOrId("ops_audit_logs")
		if err != nil {
			return err
		}
		row := core.NewRecord(auditCollection)
		row.Id, _ = auditRow["id"].(string)
		records.SetKnown(row, auditRow)
		return tx.Save(row)
	})
	if err != nil {
		return batchFailed(err)
	}
	return nil
}

func auditEntry(actor Actor, resourceType, resourceID, action string, metadata map[string]any) map[string]any {
	role := actor.Role
	if role == "" {
		role = "admin"
	}
	return map[string]any{
		"id":           ids.Record(),
		"actorId":      actor.ID,
		"actorRole":    role,
		"action":       "course_operations." + resourceType + "." + action,
		"resourceType": resourceType,
		"resourceId":   resourceID,
		"outcome":      "success",
		"metadata":     metadata,
	}
}

// normalizeResourceInput rejects unknown fields, overlays input on the current
// record, validates the result and keeps only schema fields.
func normalizeResourceInput(name string, input Body, current map[string]any) (map[string]any, error) {
	config := adminSchemas[name]
	unknown := []string{}
	for _, key := range input.Keys {
		if !slices.Contains(config.fields, key) {
			unknown = append(unknown, key)
		}
	}
	if len(unknown) > 0 {
		return nil, Fail("ADMIN_RESOURCE_FIELD_INVALID", "请求包含不支持的字段", map[string]any{"fields": unknown})
	}
	data := map[string]any{}
	for _, source := range []map[string]any{current, input.Values} {
		for _, field := range config.fields {
			if value, ok := source[field]; ok {
				data[field] = value
			}
		}
	}
	if err := config.validate(data); err != nil {
		return nil, err
	}
	return data, nil
}

func validateCourseSpec(data map[string]any) error {
	return first(
		requiredText(data, "code", "COURSE_CODE_REQUIRED"),
		requiredText(data, "name", "COURSE_NAME_REQUIRED"),
		oneOf(data, "deliveryMode", []string{"one_to_one", "group", "workshop", "online", "hybrid"}, "COURSE_DELIVERY_MODE_INVALID"),
		positiveInteger(data, "durationMinutes", "COURSE_DURATION_INVALID"),
		oneOf(data, "status", []string{"draft", "active", "inactive"}, "COURSE_STATUS_INVALID"),
	)
}

func validatePackage(data map[string]any) error {
	err := first(
		requiredText(data, "code", "PACKAGE_CODE_REQUIRED"),
		requiredText(data, "name", "PACKAGE_NAME_REQUIRED"),
		oneOf(data, "saleChannel", []string{"admin", "wechat", "website", "offline", "all"}, "PACKAGE_CHANNEL_INVALID"),
		oneOf(data, "activationMode", []string{"GRANT_TIME", "FIRST_RESERVATION", "FIRST_CHECK_IN", "FIRST_COMPLETED_SESSION", "TERM_START"}, "PACKAGE_ACTIVATION_MODE_INVALID"),
		oneOf(data, "expiryPolicy", []string{"FIXED_DURATION", "TERM_END", "NO_EXPIRY"}, "PACKAGE_EXPIRY_POLICY_INVALID"),
		oneOf(data, "status", []string{"draft", "active", "inactive"}, "PACKAGE_STATUS_INVALID"),
		optional(data, "activationDeadlineDays", nonNegativeInteger, "PACKAGE_ACTIVATION_DEADLINE_INVALID"),
		optional(data, "validityDurationDays", nonNegativeInteger, "PACKAGE_VALIDITY_INVALID"),
	)
	if err != nil {
		return err
	}
	if data["activationMode"] != "GRANT_TIME" {
		if blank(jsx.Get(data, "activationDeadlineDays")) {
			return Fail("PACKAGE_ACTIVATION_DEADLINE_REQUIRED", "延迟生效课包必须设置激活期限", nil)
		}
		if err := nonNegativeInteger(data, "activationDeadlineDays", "PACKAGE_ACTIVATION_DEADLINE_REQUIRED"); err != nil {
			return err
		}
	}
	if data["expiryPolicy"] == "FIXED_DURATION" {
		if blank(jsx.Get(data, "validityDurationDays")) {
			return Fail("PACKAGE_VALIDITY_REQUIRED", "固定期限课包必须设置有效天数", nil)
		}
		return nonNegativeInteger(data, "validityDurationDays", "PACKAGE_VALIDITY_REQUIRED")
	}
	return nil
}

func validateGrantLine(data map[string]any) error {
	return first(
		requiredText(data, "packageId", "PACKAGE_ID_REQUIRED"),
		requiredText(data, "creditTypeId", "CREDIT_TYPE_ID_REQUIRED"),
		positiveInteger(data, "quantity", "GRANT_QUANTITY_INVALID"),
	)
}

var currencyPattern = regexp.MustCompile(`^[A-Z]{3}$`)

func validatePriceVersion(data map[string]any) error {
	if err := requiredText(data, "packageId", "PACKAGE_ID_REQUIRED"); err != nil {
		return err
	}
	currency := jsx.Get(data, "currency")
	if !jsx.Truthy(currency) {
		currency = ""
	}
	if !currencyPattern.MatchString(jsx.String(currency)) {
		return Fail("PRICE_CURRENCY_INVALID", "币种必须是三位大写代码", nil)
	}
	err := first(
		nonNegativeNumber(data, "listAmount", "PRICE_LIST_AMOUNT_INVALID"),
		nonNegativeNumber(data, "saleAmount", "PRICE_SALE_AMOUNT_INVALID"),
	)
	if err != nil {
		return err
	}
	if !(jsx.Number(jsx.Get(data, "saleAmount")) <= jsx.Number(jsx.Get(data, "listAmount"))) {
		return Fail("PRICE_SALE_AMOUNT_INVALID", "销售价不能高于标价", nil)
	}
	return first(
		validDate(data, "validFrom", "PRICE_VALID_FROM_INVALID"),
		optionalLaterDate(data, "validTo", "validFrom", "PRICE_VALID_TO_INVALID"),
		positiveInteger(data, "version", "PRICE_VERSION_INVALID"),
		oneOf(data, "status", []string{"draft", "active", "inactive"}, "PRICE_STATUS_INVALID"),
	)
}

// first returns the first failure; arguments are evaluated eagerly, which is fine
// because every check is a pure read of data.
func first(errs ...error) error {
	for _, err := range errs {
		if err != nil {
			return err
		}
	}
	return nil
}

func requiredText(data map[string]any, key, code string) error {
	if text, ok := data[key].(string); ok && strings.TrimSpace(text) != "" {
		return nil
	}
	return Fail(code, "必填文本不能为空", nil)
}

func oneOf(data map[string]any, key string, values []string, code string) error {
	if text, ok := data[key].(string); ok && slices.Contains(values, text) {
		return nil
	}
	return Fail(code, "选项值无效", nil)
}

func positiveInteger(data map[string]any, key, code string) error {
	value := jsx.Get(data, key)
	if jsx.IsInteger(value) && jsx.Number(value) > 0 {
		return nil
	}
	return Fail(code, "必须是正整数", nil)
}

func nonNegativeInteger(data map[string]any, key, code string) error {
	value := jsx.Get(data, key)
	if jsx.IsInteger(value) && jsx.Number(value) >= 0 {
		return nil
	}
	return Fail(code, "必须是非负整数", nil)
}

func nonNegativeNumber(data map[string]any, key, code string) error {
	value := jsx.Get(data, key)
	if jsx.IsFinite(value) && jsx.Number(value) >= 0 {
		return nil
	}
	return Fail(code, "必须是非负数", nil)
}

func optional(data map[string]any, key string, check func(map[string]any, string, string) error, code string) error {
	if blank(jsx.Get(data, key)) {
		return nil
	}
	return check(data, key, code)
}

// blank is Hono's `value === undefined || value === null || value === ”`.
func blank(value any) bool {
	switch v := value.(type) {
	case nil, jsx.Undefined:
		return true
	case string:
		return v == ""
	}
	return false
}

func validDate(data map[string]any, key, code string) error {
	if _, ok := jsx.DateParse(jsx.Get(data, key)); !ok {
		return Fail(code, "日期无效", nil)
	}
	return nil
}

func optionalLaterDate(data map[string]any, key, startKey, code string) error {
	if !jsx.Truthy(jsx.Get(data, key)) {
		return nil
	}
	if err := validDate(data, startKey, code); err != nil {
		return err
	}
	if err := validDate(data, key, code); err != nil {
		return err
	}
	end, _ := jsx.DateParse(jsx.Get(data, key))
	start, _ := jsx.DateParse(jsx.Get(data, startKey))
	if !end.After(start) {
		return Fail(code, "结束时间必须晚于开始时间", nil)
	}
	return nil
}

func positiveVersion(value any) int {
	if jsx.IsInteger(value) && jsx.Number(value) > 0 && jsx.Number(value) < math.MaxInt32 {
		return int(jsx.Number(value))
	}
	return 1
}
