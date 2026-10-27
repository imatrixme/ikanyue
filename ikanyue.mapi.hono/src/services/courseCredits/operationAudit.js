const SENSITIVE_KEY = /(cellphone|phone|email|name|address|token|password|secret|payload|metadata|openid|unionid)/i;
const MAX_STRING_LENGTH = 160;

function operationAudit(input = {}) {
    return {
        reason: normalizeReason(input.reason),
        outcome: input.outcome || 'committed',
        beforeSummary: privacySafeSummary(input.beforeSummary),
        afterSummary: privacySafeSummary(input.afterSummary),
    };
}

function privacySafeSummary(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 2) return {};
    const summary = {};
    for (const [key, nested] of Object.entries(value)) {
        if (SENSITIVE_KEY.test(key) || nested === undefined) continue;
        if (Array.isArray(nested)) {
            summary[`${key}Count`] = nested.length;
            continue;
        }
        if (nested && typeof nested === 'object') {
            const child = privacySafeSummary(nested, depth + 1);
            if (Object.keys(child).length > 0) summary[key] = child;
            continue;
        }
        summary[key] = safePrimitive(nested);
    }
    return summary;
}

function safePrimitive(value) {
    return typeof value === 'string' && value.length > MAX_STRING_LENGTH
        ? value.slice(0, MAX_STRING_LENGTH)
        : value;
}

function normalizeReason(value) {
    return typeof value === 'string' && value.trim()
        ? value.trim().slice(0, MAX_STRING_LENGTH)
        : 'business_command';
}

module.exports = {
    MAX_STRING_LENGTH,
    normalizeReason,
    operationAudit,
    privacySafeSummary,
    safePrimitive,
};
