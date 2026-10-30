package coursecredit

import (
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/jsx"
)

// Shadow preview: Hono's CourseCreditShadowService. Settlement previews of real
// sessions are compared with academic expectations; nothing is written.

func runShadow(app core.App, input map[string]any) (map[string]any, error) {
	return shadowRun(input, func(sessionID string) (any, error) { return previewSettlement(app, sessionID) })
}

func shadowRun(input map[string]any, preview func(string) (any, error)) (map[string]any, error) {
	sessionIDs, err := validateShadowSessionIDs(input["sessionIds"])
	if err != nil {
		return nil, err
	}
	expectations, err := shadowExpectations(input["expectations"])
	if err != nil {
		return nil, err
	}
	reports := []any{}
	differenceCount := 0
	for _, sessionID := range sessionIDs {
		expected := expectations[sessionID]
		var report map[string]any
		if actual, err := preview(sessionID); err != nil {
			report = failedShadowSession(sessionID, err, expected)
		} else {
			report = compareShadowSession(sessionID, actual.(map[string]any), expected)
		}
		differenceCount += len(report["differences"].([]any))
		reports = append(reports, report)
	}
	status := "failed"
	if differenceCount == 0 {
		status = "passed"
	}
	return map[string]any{
		"differenceCount": differenceCount, "generatedAt": iso(clock()), "reports": reports,
		"sessionCount": len(reports), "status": status, "writeCount": 0,
	}, nil
}

func validateShadowSessionIDs(value any) ([]string, error) {
	values, ok := value.([]any)
	if !ok || len(values) == 0 {
		return nil, Fail("SHADOW_SESSION_IDS_REQUIRED", "影子运行必须选择至少一节真实课堂", nil)
	}
	if len(values) > 100 {
		return nil, Fail("SHADOW_SESSION_LIMIT_EXCEEDED", "单次影子运行最多处理 100 节课堂", nil)
	}
	ids := make([]string, len(values))
	for i, item := range values {
		ids[i] = strings.TrimSpace(jsText(item))
		if ids[i] == "" {
			return nil, Fail("SHADOW_SESSION_ID_INVALID", "影子课堂编号不能为空", nil)
		}
	}
	if len(uniqueStrings(ids)) != len(ids) {
		return nil, Fail("SHADOW_SESSION_DUPLICATE", "影子课堂编号不能重复", nil)
	}
	return ids, nil
}

func shadowExpectations(value any) (map[string]map[string]any, error) {
	result := map[string]map[string]any{}
	values, _ := value.([]any)
	for _, item := range values {
		expectation, err := normalizeShadowExpectation(item)
		if err != nil {
			return nil, err
		}
		id := expectation["sessionId"].(string)
		if result[id] != nil {
			return nil, Fail("SHADOW_EXPECTATION_DUPLICATE", "同一课堂不能重复填写教务预期", nil)
		}
		result[id] = expectation
	}
	return result, nil
}

func normalizeShadowExpectation(value any) (map[string]any, error) {
	item, _ := value.(map[string]any)
	sessionID := strings.TrimSpace(jsText(item["sessionId"]))
	if sessionID == "" {
		return nil, Fail("SHADOW_EXPECTATION_SESSION_REQUIRED", "教务预期必须关联课堂", nil)
	}
	canSettle, ok := item["canSettle"].(bool)
	if !ok {
		return nil, Fail("SHADOW_EXPECTATION_SETTLE_REQUIRED", "教务预期必须明确课堂能否核销", nil)
	}
	students, err := normalizeShadowRows(item["students"], "sessionStudentId", "action")
	if err != nil {
		return nil, err
	}
	teachers, err := normalizeShadowRows(item["teachers"], "sessionTeacherId", "action", "quantity")
	if err != nil {
		return nil, err
	}
	return map[string]any{"canSettle": canSettle, "sessionId": sessionID, "students": students, "teachers": teachers}, nil
}

func normalizeShadowRows(value any, idKey string, fields ...string) ([]any, error) {
	values, _ := value.([]any)
	rows := []any{}
	ids := []string{}
	for _, item := range values {
		source, _ := item.(map[string]any)
		id := strings.TrimSpace(jsText(source[idKey]))
		if id == "" {
			return nil, Fail("SHADOW_EXPECTATION_ROW_INVALID", "教务预期明细必须包含关系编号", nil)
		}
		row := map[string]any{idKey: id}
		for _, field := range fields {
			if fieldValue, present := source[field]; present {
				row[field] = fieldValue
			}
		}
		ids = append(ids, id)
		rows = append(rows, row)
	}
	if len(uniqueStrings(ids)) != len(ids) {
		return nil, Fail("SHADOW_EXPECTATION_ROW_DUPLICATE", "教务预期明细不能重复", nil)
	}
	return rows, nil
}

func compareShadowSession(sessionID string, actual, expected map[string]any) map[string]any {
	differences := []any{}
	if expected == nil {
		differences = append(differences, shadowDifference("EXPECTATION_MISSING", "session", true, false))
	} else {
		if actual["canSettle"] != expected["canSettle"] {
			differences = append(differences, shadowDifference("CAN_SETTLE_MISMATCH", "canSettle", expected["canSettle"], actual["canSettle"]))
		}
		differences = append(differences, compareShadowRows(expected["students"], actual["students"], "sessionStudentId", "action")...)
		differences = append(differences, compareShadowRows(expected["teachers"], actual["teachers"], "sessionTeacherId", "action", "quantity")...)
	}
	return map[string]any{"actual": actual, "differences": differences, "expectationProvided": expected != nil,
		"expected": nullable(expected), "sessionId": sessionID}
}

func compareShadowRows(expected, actual any, idKey string, fields ...string) []any {
	rowsByID := func(value any) ([]string, map[string]map[string]any) {
		order := []string{}
		byID := map[string]map[string]any{}
		values, _ := value.([]any)
		for _, item := range values {
			row, _ := item.(map[string]any)
			id := jsx.String(row[idKey])
			if _, seen := byID[id]; !seen {
				order = append(order, id)
			}
			byID[id] = row
		}
		return order, byID
	}
	expectedOrder, expectedByID := rowsByID(expected)
	actualOrder, actualByID := rowsByID(actual)
	differences := []any{}
	for _, id := range expectedOrder {
		row := expectedByID[id]
		observed, found := actualByID[id]
		if !found {
			differences = append(differences, shadowDifference("EXPECTED_ROW_MISSING", idKey+":"+id, row, nil))
			continue
		}
		for _, field := range fields {
			if !shadowSame(row[field], observed[field]) {
				differences = append(differences, shadowDifference("EXPECTED_VALUE_MISMATCH", idKey+":"+id+"."+field, row[field], observed[field]))
			}
		}
	}
	for _, id := range actualOrder {
		if _, found := expectedByID[id]; !found {
			differences = append(differences, shadowDifference("UNEXPECTED_ROW", idKey+":"+id, nil, actualByID[id]))
		}
	}
	return differences
}

func failedShadowSession(sessionID string, err error, expected map[string]any) map[string]any {
	code, message := errorCode(err), "影子计算失败"
	if code == "" {
		code = "COURSE_CREDIT_INTERNAL_ERROR"
	} else if err.Error() != "" {
		message = err.Error()
	}
	return map[string]any{
		"actual": nil,
		"differences": []any{shadowDifference("SHADOW_PREVIEW_FAILED", "session", nullable(expected),
			map[string]any{"errorCode": code, "message": message})},
		"expectationProvided": expected != nil, "expected": nullable(expected), "sessionId": sessionID,
	}
}

func shadowDifference(code, field string, expected, actual any) map[string]any {
	return map[string]any{"actual": actual, "code": code, "expected": expected, "field": field}
}

// shadowSame is strict equality, except that a number on either side compares numerically.
func shadowSame(left, right any) bool {
	if isNumeric(left) || isNumeric(right) {
		a, b := jsx.Number(left), jsx.Number(right)
		return a == b
	}
	return left == right
}

func isNumeric(value any) bool {
	switch value.(type) {
	case float64, int, int64:
		return true
	}
	return false
}

func nullable(value map[string]any) any {
	if value == nil {
		return nil
	}
	return value
}

// MigrationModule serves the legacy migration workspace and the settlement shadow run.
type MigrationModule struct {
	Signer *auth.Signer
	// Enabled is COURSE_CREDIT_MIGRATION_ENABLED; only apply is gated.
	Enabled bool
}

func (m MigrationModule) Register(se *core.ServeEvent) {
	router := se.Router
	query := func(capabilities []string, fn func(e *core.RequestEvent) (any, error)) func(*core.RequestEvent) error {
		return m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
			return Query(e, func() (any, error) {
				for _, capability := range capabilities {
					if err := RequireCapability(auth.User(e), capability); err != nil {
						return nil, err
					}
				}
				return fn(e)
			})
		})
	}
	operator := []string{Finance, Academic}
	router.GET("/ops/course-credits/migration/inventory", query(operator, func(e *core.RequestEvent) (any, error) {
		return migrationInventory(e.App)
	}))
	router.POST("/ops/course-credits/migration/preview", query(operator, func(e *core.RequestEvent) (any, error) {
		body, err := ReadJSONBody(e)
		if err != nil {
			return nil, err
		}
		return previewMigration(e.App, body.Values)
	}))
	router.POST("/ops/course-credits/migration/apply", m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
		return Command(e, "applyCourseCreditMigration", func() (map[string]any, error) {
			if !m.Enabled {
				return nil, Fail("COURSE_CREDIT_FEATURE_DISABLED", "历史课程数据迁移尚未开放", map[string]any{"feature": "migration"})
			}
			for _, capability := range operator {
				if err := RequireCapability(auth.User(e), capability); err != nil {
					return nil, err
				}
			}
			body, err := ReadJSONBody(e)
			if err != nil {
				return nil, err
			}
			return applyMigration(e.App, bookingInput(body, actorOf(e), nil))
		})
	}))
	router.POST("/ops/course-credits/shadow/preview", query([]string{Academic, Settlement}, func(e *core.RequestEvent) (any, error) {
		body, err := ReadJSONBody(e)
		if err != nil {
			return nil, err
		}
		return runShadow(e.App, body.Values)
	}))
}
