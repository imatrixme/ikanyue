const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseCreditError,
    allocateFefo,
    compareFefo,
    evaluateBatchEligibility,
} = require('../src/services/courseCredits/domain');

const context = {
    requiredCreditTypeId: 'vocal',
    sessionStart: '2026-02-10T10:00:00Z',
    now: '2026-01-10T10:00:00Z',
};

test('eligibility rejects every non-consumable or unavailable batch state', () => {
    const cases = [
        [{ creditTypeId: 'other' }, 'CREDIT_TYPE_MISMATCH'],
        [{ creditKind: 'universal' }, 'UNIVERSAL_CREDIT_REQUIRES_CONVERSION'],
        [{ consumable: false }, 'UNIVERSAL_CREDIT_REQUIRES_CONVERSION'],
        [{ locked: true }, 'BATCH_LOCKED'],
        [{ status: 'expired' }, 'BATCH_UNAVAILABLE'],
        [{ availableQuantity: 0 }, 'CREDIT_INSUFFICIENT'],
        [{ availableQuantity: 0.5 }, 'CREDIT_INSUFFICIENT'],
        [{ effectiveExpiresAt: '2026-02-10T10:00:00Z' }, 'BATCH_EXPIRED'],
    ];
    for (const [changes, reason] of cases) {
        assert.deepEqual(evaluateBatchEligibility(activeBatch(changes), context), { eligible: false, reason });
    }
});

test('unactivated batches require both current time and service time before activation deadline', () => {
    const value = activeBatch({
        status: 'unactivated',
        activatedAt: null,
        activationMode: 'FIRST_CHECK_IN',
        activationDeadline: '2026-02-01T00:00:00Z',
        effectiveExpiresAt: null,
    });
    assert.deepEqual(evaluateBatchEligibility(value, context), { eligible: false, reason: 'ACTIVATION_DEADLINE_PASSED' });
    assert.equal(evaluateBatchEligibility(value, { ...context, sessionStart: '2026-01-20' }).eligible, true);
    assert.deepEqual(evaluateBatchEligibility(value, { ...context, sessionStart: '2026-01-20', now: '2026-02-01' }), {
        eligible: false,
        reason: 'ACTIVATION_DEADLINE_PASSED',
    });
});

test('FEFO allocation sorts expiry, priority, creation, and id deterministically', () => {
    const batches = [
        activeBatch({ id: 'z', effectiveExpiresAt: null, priority: 0, created: '2026-01-01', availableQuantity: 3 }),
        activeBatch({ id: 'c', effectiveExpiresAt: '2026-03-01', priority: 2, created: '2026-01-01', availableQuantity: 2 }),
        activeBatch({ id: 'b', effectiveExpiresAt: '2026-03-01', priority: 1, created: '2026-01-02', availableQuantity: 1 }),
        activeBatch({ id: 'a', effectiveExpiresAt: '2026-03-01', priority: 1, created: '2026-01-01', availableQuantity: 1 }),
        activeBatch({ id: 'aa', effectiveExpiresAt: '2026-03-01', priority: 1, created: '2026-01-01', availableQuantity: 1 }),
    ];
    assert.deepEqual([...batches].sort(compareFefo).map((item) => item.id), ['a', 'aa', 'b', 'c', 'z']);

    const result = allocateFefo(batches, 4, context);
    assert.deepEqual(result.allocations, [
        { batchId: 'a', quantity: 1 },
        { batchId: 'aa', quantity: 1 },
        { batchId: 'b', quantity: 1 },
        { batchId: 'c', quantity: 1 },
    ]);
    assert.equal(result.missingQuantity, 0);
});

test('FEFO reports missing quantity and rejected batch reasons without mutation', () => {
    const batches = [
        activeBatch({ id: 'one', availableQuantity: 1 }),
        activeBatch({ id: 'wrong', creditTypeId: 'other', availableQuantity: 9 }),
    ];
    const result = allocateFefo(batches, 3, context);
    assert.equal(result.allocatedQuantity, 1);
    assert.equal(result.missingQuantity, 2);
    assert.deepEqual(result.rejectedBatches, [{ batchId: 'wrong', reason: 'CREDIT_TYPE_MISMATCH' }]);
    assert.equal(batches[0].availableQuantity, 1);
    assertCode(() => allocateFefo(batches, 0, context), 'INVALID_CREDIT_QUANTITY');
});

function activeBatch(changes = {}) {
    return {
        id: 'batch',
        creditTypeId: 'vocal',
        creditKind: 'course',
        consumable: true,
        locked: false,
        status: 'active',
        availableQuantity: 2,
        activatedAt: '2026-01-01T00:00:00Z',
        activationMode: 'GRANT_TIME',
        activationDeadline: null,
        validityDurationDays: 90,
        validFrom: '2026-01-01T00:00:00Z',
        effectiveExpiresAt: '2026-04-01T00:00:00Z',
        priority: 0,
        created: '2026-01-01T00:00:00Z',
        ...changes,
    };
}

function assertCode(action, code) {
    assert.throws(action, (error) => error instanceof CourseCreditError && error.code === code);
}
