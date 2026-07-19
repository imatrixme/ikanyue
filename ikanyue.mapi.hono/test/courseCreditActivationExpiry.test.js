const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseCreditError,
    activateBatch,
    activationDeadlinePassed,
    addDays,
    asDate,
    canConsumeProtectedReservation,
    canReserveUnactivatedBatch,
    earlierDate,
    expireAvailableQuantity,
    isServiceTimeValid,
    isWithinHalfOpen,
    optionalDate,
    releaseFrozenQuantity,
    toIso,
    validateActivationPolicy,
} = require('../src/services/courseCredits/domain');

test('time helpers enforce valid dates and half-open intervals', () => {
    assert.equal(addDays('2026-01-01T00:00:00Z', 2).toISOString(), '2026-01-03T00:00:00.000Z');
    assertCode(() => addDays('2026-01-01', -1), 'INVALID_DURATION_DAYS');
    assertCode(() => asDate('not-a-date'), 'INVALID_DATE');
    assert.equal(optionalDate(null), null);
    assert.equal(optionalDate(''), null);
    assert.equal(earlierDate(null, '2026-01-03').toISOString(), '2026-01-03T00:00:00.000Z');
    assert.equal(earlierDate('2026-01-02', null).toISOString(), '2026-01-02T00:00:00.000Z');
    assert.equal(earlierDate('2026-01-02', '2026-01-03').toISOString(), '2026-01-02T00:00:00.000Z');
    assert.equal(earlierDate('2026-01-04', '2026-01-03').toISOString(), '2026-01-03T00:00:00.000Z');
    assert.equal(isWithinHalfOpen('2026-01-01', '2026-01-01', '2026-01-02'), true);
    assert.equal(isWithinHalfOpen('2026-01-02', '2026-01-01', '2026-01-02'), false);
    assert.equal(isWithinHalfOpen('2026-01-02', null, null), true);
    assert.equal(toIso(null), null);
});

test('activation policy validation requires explicit modes, deadlines, and duration', () => {
    const grantTime = policy('GRANT_TIME');
    assert.equal(validateActivationPolicy(grantTime), grantTime);
    assertCode(() => validateActivationPolicy(policy('UNKNOWN')), 'INVALID_ACTIVATION_MODE');
    assertCode(() => validateActivationPolicy({ ...policy('FIRST_CHECK_IN'), activationDeadline: null }), 'ACTIVATION_DEADLINE_REQUIRED');
    assertCode(() => validateActivationPolicy({ ...policy('FIRST_CHECK_IN'), validityDurationDays: -1 }), 'INVALID_DURATION_DAYS');
});

test('all activation modes use only their explicit trigger and activate exactly once', () => {
    const cases = [
        ['GRANT_TIME', 'GRANT', {}],
        ['FIRST_RESERVATION', 'RESERVATION_SUCCEEDED', {}],
        ['FIRST_CHECK_IN', 'VALID_CHECK_IN', {}],
        ['FIRST_COMPLETED_SESSION', 'SESSION_COMPLETED', {}],
        ['TERM_START', 'TERM_STARTED', { termStart: '2026-02-01T00:00:00Z' }],
    ];
    for (const [mode, trigger, options] of cases) {
        const value = mode === 'TERM_START'
            ? { ...policy(mode), activationDeadline: '2026-03-01T00:00:00Z' }
            : policy(mode);
        const result = activateBatch(value, trigger, '2026-01-10T00:00:00Z', options);
        assert.equal(result.activated, true);
        assert.equal(result.batch.status, 'active');
        const expectedActivation = mode === 'TERM_START' ? '2026-02-01T00:00:00.000Z' : '2026-01-10T00:00:00.000Z';
        assert.equal(result.batch.activatedAt, expectedActivation);
        assert.equal(activateBatch(result.batch, trigger, '2026-01-11', options).activated, false);
    }
    assertCode(() => activateBatch(policy('FIRST_CHECK_IN'), 'RESERVATION_SUCCEEDED', '2026-01-10'), 'ACTIVATION_TRIGGER_MISMATCH');
});

test('activation deadline is exclusive and fixed expiry can be retained', () => {
    const value = policy('FIRST_CHECK_IN');
    assert.equal(activationDeadlinePassed(value, '2026-02-01T00:00:00Z'), true);
    assertCode(() => activateBatch(value, 'VALID_CHECK_IN', '2026-02-01T00:00:00Z'), 'ACTIVATION_DEADLINE_PASSED');
    const fixed = activateBatch({ ...policy('GRANT_TIME'), validityDurationDays: null }, 'GRANT', '2026-01-01', {
        fixedExpiresAt: '2026-12-31T00:00:00Z',
    });
    assert.equal(fixed.batch.effectiveExpiresAt, '2026-12-31T00:00:00.000Z');
});

test('unactivated reservations stop at the deadline while active batches remain reservable', () => {
    const value = policy('FIRST_CHECK_IN');
    assert.equal(canReserveUnactivatedBatch(value, '2026-01-20', '2026-01-10'), true);
    assert.equal(canReserveUnactivatedBatch(value, '2026-02-01', '2026-01-10'), false);
    assert.equal(canReserveUnactivatedBatch(value, '2026-01-20', '2026-02-01'), false);
    assert.equal(canReserveUnactivatedBatch({ ...value, activatedAt: '2026-01-01' }, '2030-01-01', '2030-01-01'), true);
});

test('service-time expiry protects valid reservations and expires released quantity correctly', () => {
    const value = quantityBatch();
    assert.equal(isServiceTimeValid(value, '2026-01-01T00:00:00Z'), true);
    assert.equal(isServiceTimeValid(value, '2026-02-01T00:00:00Z'), false);
    assert.equal(canConsumeProtectedReservation(value, '2026-01-31T23:59:59Z'), true);
    assertCode(() => canConsumeProtectedReservation(value), 'RESERVATION_START_REQUIRED');

    const before = releaseFrozenQuantity(value, 1, '2026-01-20');
    assert.equal(before.targetBucket, 'availableQuantity');
    const after = releaseFrozenQuantity(value, 1, '2026-02-01');
    assert.equal(after.targetBucket, 'expiredQuantity');
});

test('expiry moves only available quantity and preserves frozen reservations', () => {
    const value = quantityBatch();
    assert.equal(expireAvailableQuantity(value, '2026-01-20').expiredQuantity, 0);
    const expired = expireAvailableQuantity(value, '2026-02-01');
    assert.equal(expired.expiredQuantity, 3);
    assert.equal(expired.batch.expiredQuantity, 3);
    assert.equal(expired.batch.frozenQuantity, 2);
    assert.equal(expireAvailableQuantity({ ...value, availableQuantity: 0, consumedQuantity: 3 }, '2026-02-01').expiredQuantity, 0);

    const unactivated = { ...value, activatedAt: null, effectiveExpiresAt: null, activationDeadline: '2026-01-15' };
    assert.equal(expireAvailableQuantity(unactivated, '2026-01-15').expiredQuantity, 3);
});

function policy(activationMode) {
    return {
        activationMode,
        activationDeadline: activationMode === 'GRANT_TIME' ? null : '2026-02-01T00:00:00Z',
        validityDurationDays: 30,
        activatedAt: null,
        effectiveExpiresAt: null,
        status: 'unactivated',
    };
}

function quantityBatch() {
    return {
        originalQuantity: 5,
        availableQuantity: 3,
        frozenQuantity: 2,
        consumedQuantity: 0,
        expiredQuantity: 0,
        reversedQuantity: 0,
        activatedAt: '2026-01-01T00:00:00Z',
        activationMode: 'GRANT_TIME',
        activationDeadline: null,
        validityDurationDays: 31,
        validFrom: '2026-01-01T00:00:00Z',
        effectiveExpiresAt: '2026-02-01T00:00:00Z',
    };
}

function assertCode(action, code) {
    assert.throws(action, (error) => error instanceof CourseCreditError && error.code === code);
}
