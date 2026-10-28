package coursecredit

import (
	"math"
	"slices"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/jsx"
	"kanyue.server/internal/records"
)

// Conversion rule management: Hono's conversionRules admin resource with its
// publication guard (domain/conversion.js and conversionRuleVersions.js). Student
// self-service conversion had no caller and was not ported.

var conversionExpiryPolicies = []string{"INHERIT_SOURCE", "RESET_ON_CONVERSION", "RESET_ON_ACTIVATION", "MIN_SOURCE_AND_NEW", "TARGET_TERM_END"}

func validateConversionRuleInput(data map[string]any) error {
	err := first(
		positiveInteger(data, "version", "CONVERSION_VERSION_INVALID"),
		oneOf(data, "status", []string{"draft", "active", "inactive"}, "CONVERSION_STATUS_INVALID"),
		validDate(data, "validFrom", "CONVERSION_VALID_FROM_INVALID"),
		optionalLaterDate(data, "validTo", "validFrom", "CONVERSION_VALID_TO_INVALID"),
	)
	if err != nil {
		return err
	}
	if _, ok := data["reversible"].(bool); !ok {
		return Fail("CONVERSION_REVERSIBLE_INVALID", "可逆设置必须为布尔值", nil)
	}
	if !blank(jsx.Get(data, "referenceValueLimit")) {
		if err := nonNegativeNumber(data, "referenceValueLimit", "CONVERSION_REFERENCE_LIMIT_INVALID"); err != nil {
			return err
		}
	}
	return validateConversionRuleShape(data)
}

// strictInteger is Number.isInteger(value) without coercion, as the domain checks use it.
func strictInteger(value any) (float64, bool) {
	number, ok := value.(float64)
	if !ok {
		if integer, isInt := value.(int); isInt {
			number, ok = float64(integer), true
		}
	}
	return number, ok && !math.IsInf(number, 0) && number == math.Trunc(number)
}

// assertNonNegativeInteger is domain/quantities.assertNonNegativeInteger.
func assertNonNegativeInteger(value any, name string) error {
	if number, ok := strictInteger(value); ok && number >= 0 {
		return nil
	}
	return Fail("INVALID_CREDIT_QUANTITY", name+" must be a non-negative integer", map[string]any{"name": name, "value": value})
}

// absent is `value === null || value === undefined`.
func absent(value any) bool {
	switch value.(type) {
	case nil, jsx.Undefined:
		return true
	}
	return false
}

// validateConversionRuleShape is domain/conversion.validateConversionRuleShape.
func validateConversionRuleShape(rule map[string]any) error {
	source, target := jsx.Get(rule, "sourceCreditTypeId"), jsx.Get(rule, "targetCreditTypeId")
	if !jsx.Truthy(source) || !jsx.Truthy(target) {
		return Fail("CONVERSION_TYPE_REQUIRED", "source and target credit types are required", nil)
	}
	if source == target {
		return Fail("CONVERSION_SELF_LOOP", "source and target credit types must differ", nil)
	}
	for _, name := range []string{"sourceQuantity", "targetQuantity", "minSourceQuantity"} {
		if err := assertNonNegativeInteger(jsx.Get(rule, name), name); err != nil {
			return err
		}
		if jsx.Number(rule[name]) <= 0 {
			return Fail("INVALID_CONVERSION_RATIO", name+" must be greater than zero", nil)
		}
	}
	minimum := jsx.Number(rule["minSourceQuantity"])
	if math.Mod(minimum, jsx.Number(rule["sourceQuantity"])) != 0 {
		return Fail("INVALID_CONVERSION_STEP", "minimum source quantity must align with source ratio", nil)
	}
	if maximum := jsx.Get(rule, "maxSourceQuantity"); !absent(maximum) {
		if err := assertNonNegativeInteger(maximum, "maxSourceQuantity"); err != nil {
			return err
		}
		if jsx.Number(maximum) < minimum {
			return Fail("INVALID_CONVERSION_MAX", "maximum source quantity must not be below minimum", nil)
		}
	}
	policy, _ := rule["expiryPolicy"].(string)
	if !slices.Contains(conversionExpiryPolicies, policy) {
		return Fail("INVALID_EXPIRY_POLICY", "conversion expiry policy is not supported", nil)
	}
	mode, _ := rule["activationMode"].(string)
	if !slices.Contains(activationModes, mode) {
		return Fail("INVALID_ACTIVATION_MODE", "conversion activation mode is not supported", nil)
	}
	if mode != "GRANT_TIME" {
		if err := assertNonNegativeInteger(jsx.Get(rule, "activationDeadlineDays"), "activationDeadlineDays"); err != nil {
			return err
		}
	}
	if slices.Contains([]string{"RESET_ON_CONVERSION", "RESET_ON_ACTIVATION", "MIN_SOURCE_AND_NEW"}, policy) {
		if err := assertNonNegativeInteger(jsx.Get(rule, "validityDurationDays"), "validityDurationDays"); err != nil {
			return err
		}
	}
	if policy == "RESET_ON_ACTIVATION" {
		if mode == "GRANT_TIME" {
			return Fail("INVALID_ACTIVATION_MODE", "RESET_ON_ACTIVATION requires a deferred activation mode", nil)
		}
		return assertNonNegativeInteger(jsx.Get(rule, "activationDeadlineDays"), "activationDeadlineDays")
	}
	return nil
}

// assertNoProfitableConversionCycles rejects reference-value overruns and any
// cycle that ends with more credit than it started with (Bellman-Ford on log ratios).
func assertNoProfitableConversionCycles(rules []map[string]any, creditTypes []map[string]any) error {
	types := map[string]map[string]any{}
	for _, creditType := range creditTypes {
		types[jsx.String(creditType["id"])] = creditType
	}
	type edge struct {
		source, target string
		weight         float64
	}
	nodes := []string{}
	addNode := func(node string) {
		if !slices.Contains(nodes, node) {
			nodes = append(nodes, node)
		}
	}
	edges := make([]edge, 0, len(rules))
	for _, rule := range rules {
		if err := validateConversionRuleShape(rule); err != nil {
			return err
		}
		sourceID, targetID := jsx.String(rule["sourceCreditTypeId"]), jsx.String(rule["targetCreditTypeId"])
		source, target := types[sourceID], types[targetID]
		if source == nil || target == nil {
			return Fail("CONVERSION_TYPE_REQUIRED", "conversion rule references an unknown credit type", nil)
		}
		sourceValue := jsx.Number(rule["sourceQuantity"]) * jsx.Number(source["referenceUnitValue"])
		targetValue := jsx.Number(rule["targetQuantity"]) * jsx.Number(target["referenceUnitValue"])
		if !(sourceValue > 0 && targetValue > 0) {
			return Fail("INVALID_REFERENCE_VALUE", "credit type reference values must be positive", nil)
		}
		ratio := targetValue / sourceValue
		if limit := jsx.Get(rule, "referenceValueLimit"); !absent(limit) && !(ratio <= jsx.Number(limit)+epsilon) {
			return Fail("CONVERSION_REFERENCE_VALUE_EXCEEDED", "conversion exceeds its reference value limit", map[string]any{"valueRatio": ratio})
		}
		addNode(sourceID)
		addNode(targetID)
		edges = append(edges, edge{sourceID, targetID, math.Log(jsx.Number(rule["targetQuantity"]) / jsx.Number(rule["sourceQuantity"]))})
	}

	distance := map[string]float64{}
	for _, node := range nodes {
		distance[node] = 0
	}
	predecessor := map[string]string{}
	updated := ""
	for range nodes {
		updated = ""
		for _, e := range edges {
			if candidate := distance[e.source] + e.weight; candidate > distance[e.target]+1e-12 {
				distance[e.target] = candidate
				predecessor[e.target] = e.source
				updated = e.target
			}
		}
		if updated == "" {
			return nil
		}
	}
	cycleNode := updated
	for range nodes {
		cycleNode = predecessor[cycleNode]
	}
	cycle := []string{cycleNode}
	for current := predecessor[cycleNode]; current != "" && current != cycleNode && len(cycle) <= len(nodes); current = predecessor[current] {
		cycle = append(cycle, current)
	}
	cycle = append(cycle, cycleNode)
	slices.Reverse(cycle)
	return Fail("CONVERSION_PROFITABLE_CYCLE", "conversion graph contains a profitable cycle", map[string]any{"cycle": cycle})
}

// epsilon is Number.EPSILON.
const epsilon = 2.220446049250313e-16

// latestConversionRules keeps the newest version per source→target pair, in first-seen order.
func latestConversionRules(rules []map[string]any) []map[string]any {
	keys := []string{}
	latest := map[string]map[string]any{}
	for _, rule := range rules {
		key := conversionRuleKey(rule)
		current, seen := latest[key]
		if !seen {
			keys = append(keys, key)
		}
		if !seen || compareRuleVersion(rule, current) > 0 {
			latest[key] = rule
		}
	}
	result := make([]map[string]any, 0, len(keys))
	for _, key := range keys {
		result = append(result, latest[key])
	}
	return result
}

func currentConversionRule(rules []map[string]any, rule map[string]any) map[string]any {
	key := conversionRuleKey(rule)
	for _, candidate := range latestConversionRules(append(slices.Clone(rules), rule)) {
		if conversionRuleKey(candidate) == key {
			return candidate
		}
	}
	return nil
}

func conversionRuleKey(rule map[string]any) string {
	return relationKey(rule["sourceCreditTypeId"]) + ":" + relationKey(rule["targetCreditTypeId"])
}

// relationKey is conversionRuleVersions' relationId: an object's id, else String(value || "").
func relationKey(value any) string {
	if object, ok := value.(map[string]any); ok {
		id, _ := object["id"].(string)
		return id
	}
	if !jsx.Truthy(value) {
		return ""
	}
	return jsx.String(value)
}

func compareRuleVersion(left, right map[string]any) int {
	if diff := jsx.Number(or(left["version"], 0.0)) - jsx.Number(or(right["version"], 0.0)); diff != 0 {
		if diff > 0 {
			return 1
		}
		return -1
	}
	leftCreated, leftOK := millis(left["created"])
	rightCreated, rightOK := millis(right["created"])
	if leftOK && rightOK && leftCreated != rightCreated {
		if leftCreated > rightCreated {
			return 1
		}
		return -1
	}
	return strings.Compare(jsx.String(or(left["id"], "")), jsx.String(or(right["id"], "")))
}

// validateConversionPublication checks the graph as if the rule's next version were active.
func validateConversionPublication(app core.App, ruleID string) error {
	record, err := app.FindRecordById("conversion_rules", ruleID)
	if err != nil {
		return err
	}
	current := records.JSON(record)
	rules, err := list(app, "conversion_rules", "", "sourceCreditTypeId,targetCreditTypeId,-version")
	if err != nil {
		return err
	}
	creditTypes, err := list(app, "credit_types", "", "code")
	if err != nil {
		return err
	}
	candidate, err := normalizeResourceInput("conversionRules", Body{Values: map[string]any{"status": "active"}, Keys: []string{"status"}}, current)
	if err != nil {
		return err
	}
	candidate["id"] = ruleID + ":publication"
	candidate["version"] = float64(positiveVersion(current["version"]) + 1)
	active := []map[string]any{}
	for _, rule := range latestConversionRules(append(rules, candidate)) {
		if rule["status"] == "active" {
			active = append(active, rule)
		}
	}
	return assertNoProfitableConversionCycles(active, creditTypes)
}

// conversionRuleSuperseded rejects revising a version that is no longer the latest.
func conversionRuleSuperseded(app core.App, current map[string]any) error {
	filter := `sourceCreditTypeId="` + records.EscapeFilter(relationKey(current["sourceCreditTypeId"])) + `"` +
		` && targetCreditTypeId="` + records.EscapeFilter(relationKey(current["targetCreditTypeId"])) + `"`
	versions, err := list(app, "conversion_rules", filter, "-version")
	if err != nil {
		return err
	}
	if latest := currentConversionRule(versions, current); latest == nil || latest["id"] != current["id"] {
		return Fail("CONVERSION_RULE_SUPERSEDED", "兑换规则已有更新版本，请刷新后重试", nil)
	}
	return nil
}
