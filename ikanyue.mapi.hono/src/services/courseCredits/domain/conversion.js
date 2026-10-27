const { ACTIVATION_MODES } = require('./activation');
const { fail, invariant } = require('./errors');
const { assertNonNegativeInteger } = require('./quantities');
const { addDays, asDate, earlierDate, isWithinHalfOpen, optionalDate, toIso } = require('./time');

const EXPIRY_POLICIES = [
    'INHERIT_SOURCE',
    'RESET_ON_CONVERSION',
    'RESET_ON_ACTIVATION',
    'MIN_SOURCE_AND_NEW',
    'TARGET_TERM_END',
];

function validateConversionRuleShape(rule) {
    invariant(rule.sourceCreditTypeId && rule.targetCreditTypeId, 'CONVERSION_TYPE_REQUIRED', 'source and target credit types are required');
    invariant(rule.sourceCreditTypeId !== rule.targetCreditTypeId, 'CONVERSION_SELF_LOOP', 'source and target credit types must differ');
    for (const name of ['sourceQuantity', 'targetQuantity', 'minSourceQuantity']) {
        assertNonNegativeInteger(rule[name], name);
        invariant(rule[name] > 0, 'INVALID_CONVERSION_RATIO', `${name} must be greater than zero`);
    }
    invariant(rule.minSourceQuantity % rule.sourceQuantity === 0, 'INVALID_CONVERSION_STEP', 'minimum source quantity must align with source ratio');
    if (rule.maxSourceQuantity !== null && rule.maxSourceQuantity !== undefined) {
        assertNonNegativeInteger(rule.maxSourceQuantity, 'maxSourceQuantity');
        invariant(rule.maxSourceQuantity >= rule.minSourceQuantity, 'INVALID_CONVERSION_MAX', 'maximum source quantity must not be below minimum');
    }
    invariant(EXPIRY_POLICIES.includes(rule.expiryPolicy), 'INVALID_EXPIRY_POLICY', 'conversion expiry policy is not supported');
    invariant(ACTIVATION_MODES.includes(rule.activationMode), 'INVALID_ACTIVATION_MODE', 'conversion activation mode is not supported');
    if (rule.activationMode !== 'GRANT_TIME') {
        assertNonNegativeInteger(rule.activationDeadlineDays, 'activationDeadlineDays');
    }
    if (['RESET_ON_CONVERSION', 'RESET_ON_ACTIVATION', 'MIN_SOURCE_AND_NEW'].includes(rule.expiryPolicy)) {
        assertNonNegativeInteger(rule.validityDurationDays, 'validityDurationDays');
    }
    if (rule.expiryPolicy === 'RESET_ON_ACTIVATION') {
        invariant(rule.activationMode !== 'GRANT_TIME', 'INVALID_ACTIVATION_MODE', 'RESET_ON_ACTIVATION requires a deferred activation mode');
        assertNonNegativeInteger(rule.activationDeadlineDays, 'activationDeadlineDays');
    }
    return rule;
}

function validateConversionRule(rule, at) {
    validateConversionRuleShape(rule);
    invariant(rule.status === 'active', 'CONVERSION_RULE_INACTIVE', 'conversion rule is not active');
    invariant(isWithinHalfOpen(at, rule.validFrom, rule.validTo), 'CONVERSION_RULE_INACTIVE', 'conversion rule is outside its effective period');
    return rule;
}

function calculateTargetQuantity(rule, sourceQuantity) {
    validateConversionRuleShape(rule);
    assertNonNegativeInteger(sourceQuantity, 'sourceQuantity');
    invariant(sourceQuantity >= rule.minSourceQuantity, 'CONVERSION_BELOW_MINIMUM', 'source quantity is below the rule minimum');
    invariant(sourceQuantity % rule.minSourceQuantity === 0, 'INVALID_CONVERSION_STEP', 'source quantity must be a multiple of the minimum step');
    if (rule.maxSourceQuantity !== null && rule.maxSourceQuantity !== undefined) {
        invariant(sourceQuantity <= rule.maxSourceQuantity, 'CONVERSION_ABOVE_MAXIMUM', 'source quantity exceeds the rule maximum');
    }
    return (sourceQuantity / rule.sourceQuantity) * rule.targetQuantity;
}

function resolveConversionExpiry(policy, context) {
    invariant(EXPIRY_POLICIES.includes(policy), 'INVALID_EXPIRY_POLICY', 'conversion expiry policy is not supported');
    const sourceExpiry = optionalDate(context.sourceExpiresAt, 'sourceExpiresAt');
    if (policy === 'INHERIT_SOURCE') return toIso(sourceExpiry);
    if (policy === 'RESET_ON_ACTIVATION') return null;
    if (policy === 'TARGET_TERM_END') {
        return toIso(asDate(context.targetTermEnd, 'targetTermEnd'));
    }
    assertNonNegativeInteger(context.validityDurationDays, 'validityDurationDays');
    const resetExpiry = addDays(context.convertedAt, context.validityDurationDays);
    if (policy === 'RESET_ON_CONVERSION') return resetExpiry.toISOString();
    return toIso(earlierDate(sourceExpiry, resetExpiry));
}

function buildTargetBatchTerms(rule, sourceBatch, convertedAt, options = {}) {
    validateConversionRuleShape(rule);
    const effectiveExpiresAt = resolveConversionExpiry(rule.expiryPolicy, {
        sourceExpiresAt: sourceBatch.effectiveExpiresAt,
        convertedAt,
        validityDurationDays: rule.validityDurationDays,
        targetTermEnd: options.targetTermEnd,
    });
    const deferred = rule.expiryPolicy === 'RESET_ON_ACTIVATION' || rule.activationMode !== 'GRANT_TIME';
    return {
        activationMode: rule.activationMode,
        activatedAt: deferred ? null : asDate(convertedAt, 'convertedAt').toISOString(),
        activationDeadline: deferred
            ? addDays(convertedAt, rule.activationDeadlineDays).toISOString()
            : null,
        effectiveExpiresAt,
        validityDurationDays: rule.validityDurationDays ?? null,
        status: deferred ? 'unactivated' : 'active',
    };
}

function assertNoProfitableConversionCycles(rules, creditTypes) {
    const typeMap = creditTypes instanceof Map
        ? creditTypes
        : new Map(creditTypes.map((type) => [type.id, type]));
    const nodes = new Set();
    const edges = rules.map((rule) => {
        validateConversionRuleShape(rule);
        const source = typeMap.get(rule.sourceCreditTypeId);
        const target = typeMap.get(rule.targetCreditTypeId);
        invariant(source && target, 'CONVERSION_TYPE_REQUIRED', 'conversion rule references an unknown credit type');
        const sourceValue = rule.sourceQuantity * source.referenceUnitValue;
        const targetValue = rule.targetQuantity * target.referenceUnitValue;
        invariant(sourceValue > 0 && targetValue > 0, 'INVALID_REFERENCE_VALUE', 'credit type reference values must be positive');
        const valueRatio = targetValue / sourceValue;
        if (rule.referenceValueLimit !== null && rule.referenceValueLimit !== undefined) {
            invariant(valueRatio <= rule.referenceValueLimit + Number.EPSILON,
                'CONVERSION_REFERENCE_VALUE_EXCEEDED', 'conversion exceeds its reference value limit', { valueRatio });
        }
        nodes.add(rule.sourceCreditTypeId);
        nodes.add(rule.targetCreditTypeId);
        return { source: rule.sourceCreditTypeId, target: rule.targetCreditTypeId, weight: Math.log(rule.targetQuantity / rule.sourceQuantity) };
    });

    const distance = new Map([...nodes].map((node) => [node, 0]));
    const predecessor = new Map();
    let updated = null;
    for (let iteration = 0; iteration < nodes.size; iteration += 1) {
        updated = null;
        for (const edge of edges) {
            const candidate = distance.get(edge.source) + edge.weight;
            if (candidate > distance.get(edge.target) + 1e-12) {
                distance.set(edge.target, candidate);
                predecessor.set(edge.target, edge.source);
                updated = edge.target;
            }
        }
        if (!updated) return true;
    }

    let cycleNode = updated;
    for (let index = 0; index < nodes.size; index += 1) cycleNode = predecessor.get(cycleNode);
    const cycle = [cycleNode];
    let current = predecessor.get(cycleNode);
    while (current && current !== cycleNode && cycle.length <= nodes.size) {
        cycle.push(current);
        current = predecessor.get(current);
    }
    cycle.push(cycleNode);
    fail('CONVERSION_PROFITABLE_CYCLE', 'conversion graph contains a profitable cycle', { cycle: cycle.reverse() });
}

module.exports = {
    EXPIRY_POLICIES,
    assertNoProfitableConversionCycles,
    buildTargetBatchTerms,
    calculateTargetQuantity,
    resolveConversionExpiry,
    validateConversionRule,
    validateConversionRuleShape,
};
