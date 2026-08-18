function latestConversionRules(rules = []) {
    const latest = new Map();
    for (const rule of rules) {
        const key = conversionRuleKey(rule);
        const current = latest.get(key);
        if (!current || compareVersion(rule, current) > 0) latest.set(key, rule);
    }
    return [...latest.values()];
}

function activeConversionRulesAt(rules, at) {
    const timestamp = Number(at instanceof Date ? at : new Date(at));
    return latestConversionRules(rules).filter((rule) => {
        const from = Date.parse(rule.validFrom || '');
        const to = rule.validTo ? Date.parse(rule.validTo) : Number.POSITIVE_INFINITY;
        return rule.status === 'active' && Number.isFinite(from) && from <= timestamp && timestamp < to;
    });
}

function currentConversionRule(rules, rule) {
    return latestConversionRules([...rules, rule]).find((candidate) => (
        conversionRuleKey(candidate) === conversionRuleKey(rule)
    ));
}

function conversionRuleKey(rule) {
    return `${relationId(rule.sourceCreditTypeId)}:${relationId(rule.targetCreditTypeId)}`;
}

function compareVersion(left, right) {
    const version = Number(left.version || 0) - Number(right.version || 0);
    if (version !== 0) return version;
    const created = Date.parse(left.created || '') - Date.parse(right.created || '');
    if (Number.isFinite(created) && created !== 0) return created;
    return String(left.id || '').localeCompare(String(right.id || ''));
}

function relationId(value) {
    return value && typeof value === 'object' ? value.id || '' : String(value || '');
}

module.exports = {
    activeConversionRulesAt,
    conversionRuleKey,
    currentConversionRule,
    latestConversionRules,
};
