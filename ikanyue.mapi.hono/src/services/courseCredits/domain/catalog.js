const { invariant } = require('./errors');
const { assertNonNegativeInteger } = require('./quantities');

const COURSE_ENTITLEMENT_FIELDS = [
    'code',
    'name',
    'deliveryMode',
    'durationMinutes',
    'teacherTier',
];

const PACKAGE_ENTITLEMENT_FIELDS = [
    'activationMode',
    'activationDeadlineDays',
    'validityDurationDays',
    'expiryPolicy',
];

function validateCreditType(creditType) {
    invariant(['universal', 'course'].includes(creditType.kind), 'INVALID_CREDIT_TYPE_KIND', 'credit type kind is invalid');
    if (creditType.kind === 'universal') {
        invariant(!creditType.courseSpecId, 'UNIVERSAL_CREDIT_HAS_COURSE_SPEC', 'universal credits cannot reference a course specification');
        invariant(creditType.consumable === false, 'UNIVERSAL_CREDIT_CONSUMABLE', 'universal credits cannot be consumed by lessons');
    } else {
        invariant(Boolean(creditType.courseSpecId), 'COURSE_SPEC_REQUIRED', 'course credits require an exact course specification');
        invariant(creditType.consumable === true, 'COURSE_CREDIT_NOT_CONSUMABLE', 'course credits must be lesson consumable');
    }
    return creditType;
}

function validatePackageGrantLines(lines) {
    invariant(Array.isArray(lines) && lines.length > 0, 'PACKAGE_GRANTS_REQUIRED', 'package must grant at least one credit type');
    const seen = new Set();
    for (const line of lines) {
        invariant(line.creditTypeId, 'CREDIT_TYPE_REQUIRED', 'package grant line requires a credit type');
        assertNonNegativeInteger(line.quantity, 'quantity');
        invariant(line.quantity > 0, 'INVALID_CREDIT_QUANTITY', 'package grant quantity must be greater than zero');
        invariant(!seen.has(line.creditTypeId), 'DUPLICATE_PACKAGE_GRANT', 'package cannot repeat the same credit type');
        seen.add(line.creditTypeId);
    }
    return lines;
}

function classifyCourseSpecChange(previous, next) {
    const changedFields = COURSE_ENTITLEMENT_FIELDS.filter((field) => !same(previous[field], next[field]));
    return {
        changedFields,
        requiresNewCreditType: changedFields.length > 0,
        kind: changedFields.length > 0 ? 'entitlement_change' : 'no_entitlement_change',
    };
}

function classifyProductChange(previous, next) {
    const courseChange = classifyCourseSpecChange(previous.courseSpec, next.courseSpec);
    const packageChanges = PACKAGE_ENTITLEMENT_FIELDS.filter((field) => !same(previous.package[field], next.package[field]));
    const grantsChanged = stableJson(normalizeGrantLines(previous.grantLines)) !== stableJson(normalizeGrantLines(next.grantLines));
    const priceChanged = stableJson(previous.price) !== stableJson(next.price);
    const entitlementChanged = courseChange.requiresNewCreditType || packageChanges.length > 0 || grantsChanged;
    return {
        courseChange,
        packageChanges,
        grantsChanged,
        priceChanged,
        entitlementChanged,
        priceOnly: priceChanged && !entitlementChanged,
    };
}

function validatePriceVersion(price) {
    invariant(typeof price.currency === 'string' && /^[A-Z]{3}$/.test(price.currency),
        'INVALID_CURRENCY', 'currency must be a three-letter uppercase code');
    for (const name of ['listAmount', 'saleAmount', 'version']) {
        assertNonNegativeInteger(price[name], name);
    }
    invariant(price.version > 0, 'INVALID_PRICE_VERSION', 'price version must be greater than zero');
    return price;
}

function normalizeGrantLines(lines) {
    return [...lines]
        .map((line) => ({ creditTypeId: line.creditTypeId, quantity: line.quantity }))
        .sort((left, right) => left.creditTypeId.localeCompare(right.creditTypeId));
}

function same(left, right) {
    return stableJson(left ?? null) === stableJson(right ?? null);
}

function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

module.exports = {
    COURSE_ENTITLEMENT_FIELDS,
    PACKAGE_ENTITLEMENT_FIELDS,
    classifyCourseSpecChange,
    classifyProductChange,
    stableJson,
    validateCreditType,
    validatePackageGrantLines,
    validatePriceVersion,
};
