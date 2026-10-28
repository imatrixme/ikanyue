package coursecredit

import (
	"net/http"
	"slices"
	"testing"

	"kanyue.server/internal/testkit"
)

// Conversion rule cases ported from Hono's courseCreditConversion,
// courseCreditConversionRuleVersions and courseCreditAdminResourceCommands tests.

func conversionRule(changes map[string]any) map[string]any {
	return with2(map[string]any{
		"sourceCreditTypeId": "A", "targetCreditTypeId": "B", "sourceQuantity": 2.0, "targetQuantity": 1.0,
		"minSourceQuantity": 2.0, "maxSourceQuantity": nil, "expiryPolicy": "RESET_ON_CONVERSION", "activationMode": "GRANT_TIME",
		"validityDurationDays": 60.0, "activationDeadlineDays": 30.0, "referenceValueLimit": nil,
		"validFrom": "2026-01-02T00:00:00Z", "validTo": "2027-01-01T00:00:00Z", "status": "active",
	}, changes)
}

// Hono: courseCreditConversion › conversion rules require directed positive integer ratios and explicit policies
func TestConversionRuleShape(t *testing.T) {
	if err := validateConversionRuleShape(conversionRule(nil)); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		changes map[string]any
		code    string
	}{
		{map[string]any{"targetCreditTypeId": "A"}, "CONVERSION_SELF_LOOP"},
		{map[string]any{"sourceCreditTypeId": ""}, "CONVERSION_TYPE_REQUIRED"},
		{map[string]any{"sourceQuantity": 0.0}, "INVALID_CONVERSION_RATIO"},
		{map[string]any{"targetQuantity": 0.5}, "INVALID_CREDIT_QUANTITY"},
		{map[string]any{"targetQuantity": "1"}, "INVALID_CREDIT_QUANTITY"},
		{map[string]any{"minSourceQuantity": 3.0}, "INVALID_CONVERSION_STEP"},
		{map[string]any{"maxSourceQuantity": 1.0}, "INVALID_CONVERSION_MAX"},
		{map[string]any{"expiryPolicy": "UNKNOWN"}, "INVALID_EXPIRY_POLICY"},
		{map[string]any{"activationMode": "UNKNOWN"}, "INVALID_ACTIVATION_MODE"},
		{map[string]any{"validityDurationDays": -1.0}, "INVALID_CREDIT_QUANTITY"},
		{map[string]any{"expiryPolicy": "RESET_ON_ACTIVATION", "activationMode": "GRANT_TIME"}, "INVALID_ACTIVATION_MODE"},
		{map[string]any{"activationMode": "FIRST_CHECK_IN", "activationDeadlineDays": 1.5}, "INVALID_CREDIT_QUANTITY"},
	}
	for _, c := range cases {
		if code := errorCode(validateConversionRuleShape(conversionRule(c.changes))); code != c.code {
			t.Fatalf("%v = %q, want %s", c.changes, code, c.code)
		}
	}
	if err := validateConversionRuleShape(conversionRule(map[string]any{"expiryPolicy": "INHERIT_SOURCE", "validityDurationDays": nil})); err != nil {
		t.Fatalf("inherit needs no validity: %v", err)
	}
}

// Hono: courseCreditConversion › conversion graph accepts lossy cycles and rejects value limits and profitable cycles
func TestConversionGraph(t *testing.T) {
	types := []map[string]any{{"id": "A", "referenceUnitValue": 300.0}, {"id": "B", "referenceUnitValue": 150.0}, {"id": "C", "referenceUnitValue": 100.0}}
	edge := func(source, target string, sourceQuantity, targetQuantity float64, extra map[string]any) map[string]any {
		changes := map[string]any{"sourceCreditTypeId": source, "targetCreditTypeId": target, "sourceQuantity": sourceQuantity,
			"targetQuantity": targetQuantity, "minSourceQuantity": sourceQuantity}
		for key, value := range extra {
			changes[key] = value
		}
		return conversionRule(changes)
	}
	if err := assertNoProfitableConversionCycles([]map[string]any{edge("A", "B", 1, 2, nil), edge("B", "A", 3, 1, nil)}, types); err != nil {
		t.Fatalf("lossy cycle = %v", err)
	}
	if err := assertNoProfitableConversionCycles([]map[string]any{edge("A", "B", 1, 1, nil), edge("B", "C", 1, 1, nil)}, types); err != nil {
		t.Fatalf("acyclic = %v", err)
	}
	err := assertNoProfitableConversionCycles([]map[string]any{edge("A", "B", 1, 2, nil), edge("B", "A", 1, 1, nil)}, types)
	if errorCode(err) != "CONVERSION_PROFITABLE_CYCLE" {
		t.Fatalf("profitable cycle = %v", err)
	}
	if cycle, _ := err.(*Error).Details["cycle"].([]string); len(cycle) < 3 || cycle[0] != cycle[len(cycle)-1] {
		t.Fatalf("cycle = %v", err.(*Error).Details)
	}
	if code := errorCode(assertNoProfitableConversionCycles([]map[string]any{edge("A", "B", 1, 2, map[string]any{"referenceValueLimit": 0.5})}, types)); code != "CONVERSION_REFERENCE_VALUE_EXCEEDED" {
		t.Fatalf("value limit = %s", code)
	}
	if code := errorCode(assertNoProfitableConversionCycles([]map[string]any{conversionRule(nil)}, types[:1])); code != "CONVERSION_TYPE_REQUIRED" {
		t.Fatalf("unknown type = %s", code)
	}
	if code := errorCode(assertNoProfitableConversionCycles([]map[string]any{conversionRule(nil)},
		[]map[string]any{{"id": "A", "referenceUnitValue": 0.0}, {"id": "B", "referenceUnitValue": 150.0}})); code != "INVALID_REFERENCE_VALUE" {
		t.Fatalf("zero reference value = %s", code)
	}
}

// Hono: courseCreditConversionRuleVersions › latest conversion version controls publication and deactivation semantics
func TestLatestConversionVersions(t *testing.T) {
	rule := func(changes map[string]any) map[string]any {
		return with2(map[string]any{"id": "rule", "sourceCreditTypeId": "A", "targetCreditTypeId": "B", "version": 1.0, "status": "active"}, changes)
	}
	active := rule(map[string]any{"id": "v1"})
	inactive := rule(map[string]any{"id": "v2", "version": 2.0, "status": "inactive"})
	other := rule(map[string]any{"id": "other", "sourceCreditTypeId": "B", "targetCreditTypeId": "C"})
	latest := []string{}
	for _, item := range latestConversionRules([]map[string]any{active, inactive, other}) {
		latest = append(latest, item["id"].(string))
	}
	if !slices.Equal(latest, []string{"v2", "other"}) {
		t.Fatalf("latest = %v", latest)
	}
	if current := currentConversionRule([]map[string]any{active, inactive}, active); current["id"] != "v2" {
		t.Fatalf("current = %v", current)
	}
	// Equal versions fall back to created, then id.
	older := rule(map[string]any{"id": "b", "created": "2026-01-01 00:00:00.000Z"})
	newer := rule(map[string]any{"id": "a", "created": "2026-02-01 00:00:00.000Z"})
	if current := currentConversionRule([]map[string]any{newer}, older); current["id"] != "a" {
		t.Fatalf("created tie-break = %v", current)
	}
	if current := currentConversionRule([]map[string]any{rule(map[string]any{"id": "a"})}, rule(map[string]any{"id": "b"})); current["id"] != "b" {
		t.Fatalf("id tie-break = %v", current)
	}
}

// Hono: courseCreditAdminResourceCommands › conversion publication creates immutable versions and rejects profitable graphs
func TestConversionRuleRoutes(t *testing.T) {
	app, handler, tokens := setup(t)
	a := testkit.Create(t, app, "credit_types", map[string]any{"code": "a", "name": "A", "kind": "universal", "referenceUnitValue": 100, "status": "active"})
	b := testkit.Create(t, app, "credit_types", map[string]any{"code": "b", "name": "B", "kind": "universal", "referenceUnitValue": 100, "status": "active"})
	body := map[string]any{"sourceCreditTypeId": b.Id, "targetCreditTypeId": a.Id, "sourceQuantity": 1, "targetQuantity": 1,
		"minSourceQuantity": 1, "maxSourceQuantity": 100, "expiryPolicy": "INHERIT_SOURCE", "activationMode": "GRANT_TIME",
		"reversible": false, "referenceValueLimit": 1, "validFrom": "2026-01-01T00:00:00Z", "version": 1, "status": "active"}
	post := func(url string, body map[string]any, headers map[string]string) map[string]any {
		t.Helper()
		return testkit.Call(t, handler, http.MethodPost, url, body, headers).Body
	}

	if result := post("/ops/course-operations/conversion-rules", body, tokens.admin); result["errorCode"] != "CONVERSION_RULE_MUST_START_DRAFT" {
		t.Fatalf("active create = %v", result)
	}
	if result := post("/ops/course-operations/conversion-rules", with2(body, map[string]any{"status": "draft", "reversible": "no"}), tokens.admin); result["errorCode"] != "CONVERSION_REVERSIBLE_INVALID" {
		t.Fatalf("reversible = %v", result)
	}
	if result := post("/ops/course-operations/conversion-rules", with2(body, map[string]any{"status": "draft"}), tokens.plain); result["errorCode"] != "COURSE_CREDIT_CAPABILITY_REQUIRED" {
		t.Fatalf("academic create = %v", result)
	}
	created := post("/ops/course-operations/conversion-rules", with2(body, map[string]any{"status": "draft"}), tokens.finance)
	ruleID, _ := created["data"].(map[string]any)["id"].(string)
	if created["code"] != float64(10000) || ruleID == "" {
		t.Fatalf("create = %v", created)
	}

	publishBody := post("/ops/course-operations/conversion-rules/"+ruleID+"/status", map[string]any{"status": "active"}, tokens.admin)
	published, _ := publishBody["data"].(map[string]any)
	if published["previousId"] != ruleID || published["version"] != float64(2) || published["status"] != "active" {
		t.Fatalf("publish = %v", publishBody)
	}
	activeID := published["id"].(string)
	if stale := post("/ops/course-operations/conversion-rules/"+ruleID+"/status", map[string]any{"status": "inactive"}, tokens.admin); stale["errorCode"] != "CONVERSION_RULE_SUPERSEDED" {
		t.Fatalf("superseded = %v", stale)
	}
	revised := testkit.Call(t, handler, http.MethodPatch, "/ops/course-operations/conversion-rules/"+activeID, map[string]any{"targetQuantity": 1, "maxSourceQuantity": 50}, tokens.admin).Data()
	if revised["previousId"] != activeID || revised["version"] != float64(3) {
		t.Fatalf("revise = %v", revised)
	}
	latestID := revised["id"].(string)

	// The forward rule a→b at 1:2 closes a profitable cycle with b→a at 1:1.
	forward := post("/ops/course-operations/conversion-rules", with2(body, map[string]any{"sourceCreditTypeId": a.Id, "targetCreditTypeId": b.Id,
		"targetQuantity": 2, "referenceValueLimit": 2, "status": "draft"}), tokens.admin)["data"].(map[string]any)
	if cycle := post("/ops/course-operations/conversion-rules/"+forward["id"].(string)+"/status", map[string]any{"status": "active"}, tokens.admin); cycle["errorCode"] != "CONVERSION_PROFITABLE_CYCLE" {
		t.Fatalf("cycle = %v", cycle)
	}
	deactivated := post("/ops/course-operations/conversion-rules/"+latestID+"/status", map[string]any{"status": "inactive"}, tokens.admin)["data"].(map[string]any)
	if deactivated["status"] != "inactive" || deactivated["version"] != float64(4) {
		t.Fatalf("deactivate = %v", deactivated)
	}
	if allowed := post("/ops/course-operations/conversion-rules/"+forward["id"].(string)+"/status", map[string]any{"status": "active"}, tokens.admin); allowed["code"] != float64(10000) {
		t.Fatalf("publish once the reverse rule is inactive = %v", allowed)
	}

	list := testkit.Call(t, handler, http.MethodGet, "/ops/course-credits/conversion-rules?status=active", nil, tokens.finance).Data()
	// The list shows every stored version: b→a v2 and v3 and a→b v2 are active rows.
	rows, _ := list["items"].([]any)
	if len(rows) != 3 || list["totalItems"] != float64(3) {
		t.Fatalf("active list = %v", list)
	}
	detail := testkit.Call(t, handler, http.MethodGet, "/ops/course-credits/conversion-rules/"+latestID, nil, tokens.finance).Data()
	if detail["id"] != latestID || detail["maxSourceQuantity"] != float64(50) || detail["sourceCreditTypeId"] != b.Id {
		t.Fatalf("detail = %v", detail)
	}
	if denied := testkit.Call(t, handler, http.MethodGet, "/ops/course-credits/conversion-rules", nil, tokens.plain); denied.Body["errorCode"] != "COURSE_CREDIT_CAPABILITY_REQUIRED" {
		t.Fatalf("academic list = %v", denied.Body)
	}
	if audits, _ := app.FindRecordsByFilter("ops_audit_logs", `resourceType="conversionRules" && action="course_operations.conversionRules.create_revision"`, "", 0, 0); len(audits) != 4 {
		t.Fatalf("revision audits = %d", len(audits))
	}
}
