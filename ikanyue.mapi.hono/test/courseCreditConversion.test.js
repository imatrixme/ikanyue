const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseCreditError,
    assertNoProfitableConversionCycles,
    buildTargetBatchTerms,
    calculateTargetQuantity,
    resolveConversionExpiry,
    validateConversionRule,
    validateConversionRuleShape,
} = require('../src/services/courseCredits/domain');

test('conversion rules require directed positive integer ratios and explicit policies', () => {
    const validRule = rule();
    assert.equal(validateConversionRuleShape(validRule), validRule);
    assertCode(() => validateConversionRuleShape(rule({ targetCreditTypeId: 'A' })), 'CONVERSION_SELF_LOOP');
    assertCode(() => validateConversionRuleShape(rule({ sourceCreditTypeId: null })), 'CONVERSION_TYPE_REQUIRED');
    assertCode(() => validateConversionRuleShape(rule({ sourceQuantity: 0 })), 'INVALID_CONVERSION_RATIO');
    assertCode(() => validateConversionRuleShape(rule({ targetQuantity: 0.5 })), 'INVALID_CREDIT_QUANTITY');
    assertCode(() => validateConversionRuleShape(rule({ minSourceQuantity: 3 })), 'INVALID_CONVERSION_STEP');
    assertCode(() => validateConversionRuleShape(rule({ maxSourceQuantity: 1 })), 'INVALID_CONVERSION_MAX');
    assertCode(() => validateConversionRuleShape(rule({ expiryPolicy: 'UNKNOWN' })), 'INVALID_EXPIRY_POLICY');
    assertCode(() => validateConversionRuleShape(rule({ activationMode: 'UNKNOWN' })), 'INVALID_ACTIVATION_MODE');
    assertCode(() => validateConversionRuleShape(rule({ validityDurationDays: -1 })), 'INVALID_CREDIT_QUANTITY');
    assertCode(() => validateConversionRuleShape(rule({ expiryPolicy: 'RESET_ON_ACTIVATION', activationMode: 'GRANT_TIME' })), 'INVALID_ACTIVATION_MODE');
});

test('active conversion rules use a half-open effective period', () => {
    const activeRule = rule();
    assert.equal(validateConversionRule(activeRule, '2026-02-01'), activeRule);
    assertCode(() => validateConversionRule(rule({ status: 'inactive' }), '2026-02-01'), 'CONVERSION_RULE_INACTIVE');
    assertCode(() => validateConversionRule(rule(), '2026-01-01'), 'CONVERSION_RULE_INACTIVE');
    assertCode(() => validateConversionRule(rule(), '2027-01-01'), 'CONVERSION_RULE_INACTIVE');
});

test('target quantity rejects fractional, below-minimum, and above-maximum requests', () => {
    assert.equal(calculateTargetQuantity(rule(), 4), 2);
    assertCode(() => calculateTargetQuantity(rule(), 0), 'CONVERSION_BELOW_MINIMUM');
    assertCode(() => calculateTargetQuantity(rule(), 3), 'INVALID_CONVERSION_STEP');
    assertCode(() => calculateTargetQuantity(rule({ minSourceQuantity: 1 }), 1), 'INVALID_CONVERSION_STEP');
    assertCode(() => calculateTargetQuantity(rule({ maxSourceQuantity: 4 }), 6), 'CONVERSION_ABOVE_MAXIMUM');
});

test('all target expiry policies calculate explicit outcomes', () => {
    const context = {
        sourceExpiresAt: '2026-06-01T00:00:00Z',
        convertedAt: '2026-02-01T00:00:00Z',
        validityDurationDays: 60,
        targetTermEnd: '2026-08-01T00:00:00Z',
    };
    assert.equal(resolveConversionExpiry('INHERIT_SOURCE', context), '2026-06-01T00:00:00.000Z');
    assert.equal(resolveConversionExpiry('RESET_ON_CONVERSION', context), '2026-04-02T00:00:00.000Z');
    assert.equal(resolveConversionExpiry('RESET_ON_ACTIVATION', context), null);
    assert.equal(resolveConversionExpiry('MIN_SOURCE_AND_NEW', context), '2026-04-02T00:00:00.000Z');
    assert.equal(resolveConversionExpiry('MIN_SOURCE_AND_NEW', { ...context, sourceExpiresAt: null }), '2026-04-02T00:00:00.000Z');
    assert.equal(resolveConversionExpiry('TARGET_TERM_END', context), '2026-08-01T00:00:00.000Z');
    assertCode(() => resolveConversionExpiry('UNKNOWN', context), 'INVALID_EXPIRY_POLICY');
    assertCode(() => resolveConversionExpiry('TARGET_TERM_END', { ...context, targetTermEnd: null }), 'INVALID_DATE');
});

test('target batch terms distinguish immediate and deferred activation', () => {
    const source = { effectiveExpiresAt: '2026-06-01T00:00:00Z' };
    const immediate = buildTargetBatchTerms(rule({ expiryPolicy: 'RESET_ON_CONVERSION' }), source, '2026-02-01');
    assert.deepEqual(immediate, {
        activationMode: 'GRANT_TIME',
        activatedAt: '2026-02-01T00:00:00.000Z',
        activationDeadline: null,
        effectiveExpiresAt: '2026-04-02T00:00:00.000Z',
        validityDurationDays: 60,
        status: 'active',
    });
    const deferred = buildTargetBatchTerms(rule({
        expiryPolicy: 'RESET_ON_ACTIVATION',
        activationMode: 'FIRST_CHECK_IN',
        activationDeadlineDays: 30,
    }), source, '2026-02-01');
    assert.equal(deferred.status, 'unactivated');
    assert.equal(deferred.activationDeadline, '2026-03-03T00:00:00.000Z');
    assert.equal(deferred.effectiveExpiresAt, null);
});

test('conversion graph accepts lossy cycles and rejects value limits and profitable cycles', () => {
    const types = [
        { id: 'A', referenceUnitValue: 300 },
        { id: 'B', referenceUnitValue: 150 },
        { id: 'C', referenceUnitValue: 100 },
    ];
    assert.equal(assertNoProfitableConversionCycles([
        rule({ sourceCreditTypeId: 'A', targetCreditTypeId: 'B', sourceQuantity: 1, targetQuantity: 2, minSourceQuantity: 1 }),
        rule({ sourceCreditTypeId: 'B', targetCreditTypeId: 'A', sourceQuantity: 3, targetQuantity: 1, minSourceQuantity: 3 }),
    ], types), true);
    assert.equal(assertNoProfitableConversionCycles([
        rule({ sourceCreditTypeId: 'A', targetCreditTypeId: 'B', sourceQuantity: 1, targetQuantity: 1, minSourceQuantity: 1 }),
        rule({ sourceCreditTypeId: 'B', targetCreditTypeId: 'C', sourceQuantity: 1, targetQuantity: 1, minSourceQuantity: 1 }),
    ], types), true);
    assertCode(() => assertNoProfitableConversionCycles([
        rule({ sourceCreditTypeId: 'A', targetCreditTypeId: 'B', sourceQuantity: 1, targetQuantity: 2, minSourceQuantity: 1 }),
        rule({ sourceCreditTypeId: 'B', targetCreditTypeId: 'A', sourceQuantity: 1, targetQuantity: 1, minSourceQuantity: 1 }),
    ], types), 'CONVERSION_PROFITABLE_CYCLE');
    assertCode(() => assertNoProfitableConversionCycles([
        rule({ sourceCreditTypeId: 'A', targetCreditTypeId: 'B', sourceQuantity: 1, targetQuantity: 2, minSourceQuantity: 1, referenceValueLimit: 0.5 }),
    ], types), 'CONVERSION_REFERENCE_VALUE_EXCEEDED');
    assertCode(() => assertNoProfitableConversionCycles([rule()], types.slice(0, 1)), 'CONVERSION_TYPE_REQUIRED');
    assertCode(() => assertNoProfitableConversionCycles([rule()], [
        { id: 'A', referenceUnitValue: 0 },
        { id: 'B', referenceUnitValue: 150 },
    ]), 'INVALID_REFERENCE_VALUE');
});

function rule(changes = {}) {
    return {
        sourceCreditTypeId: 'A',
        targetCreditTypeId: 'B',
        sourceQuantity: 2,
        targetQuantity: 1,
        minSourceQuantity: 2,
        maxSourceQuantity: null,
        expiryPolicy: 'RESET_ON_CONVERSION',
        activationMode: 'GRANT_TIME',
        validityDurationDays: 60,
        activationDeadlineDays: 30,
        referenceValueLimit: null,
        validFrom: '2026-01-02T00:00:00Z',
        validTo: '2027-01-01T00:00:00Z',
        status: 'active',
        ...changes,
    };
}

function assertCode(action, code) {
    assert.throws(action, (error) => error instanceof CourseCreditError && error.code === code);
}
