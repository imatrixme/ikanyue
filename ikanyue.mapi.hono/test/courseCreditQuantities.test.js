const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseCreditError,
    deriveBatchStatus,
    moveQuantity,
    validateBatchQuantities,
} = require('../src/services/courseCredits/domain');

test('quantity movements conserve a batch while freezing and consuming credits', () => {
    const original = batch(10);
    const frozen = moveQuantity(original, 'availableQuantity', 'frozenQuantity', 2);
    const consumed = moveQuantity(frozen, 'frozenQuantity', 'consumedQuantity', 1);

    assert.deepEqual(original, batch(10));
    assert.equal(consumed.availableQuantity, 8);
    assert.equal(consumed.frozenQuantity, 1);
    assert.equal(consumed.consumedQuantity, 1);
    assert.equal(validateBatchQuantities(consumed), consumed);
});

test('quantity validation rejects negative, fractional, and non-conserving states', () => {
    assertCode(() => validateBatchQuantities({ ...batch(2), originalQuantity: -1 }), 'INVALID_CREDIT_QUANTITY');
    assertCode(() => validateBatchQuantities({ ...batch(2), frozenQuantity: 0.5, availableQuantity: 1.5 }), 'INVALID_CREDIT_QUANTITY');
    assertCode(() => validateBatchQuantities({ ...batch(2), availableQuantity: 1 }), 'BATCH_QUANTITY_MISMATCH');
});

test('quantity movement rejects invalid buckets, zero, and insufficient source quantity', () => {
    const state = batch(2);
    assertCode(() => moveQuantity(state, 'missing', 'frozenQuantity', 1), 'INVALID_CREDIT_BUCKET');
    assertCode(() => moveQuantity(state, 'availableQuantity', 'missing', 1), 'INVALID_CREDIT_BUCKET');
    assertCode(() => moveQuantity(state, 'availableQuantity', 'availableQuantity', 1), 'INVALID_CREDIT_BUCKET');
    assertCode(() => moveQuantity(state, 'availableQuantity', 'frozenQuantity', 0), 'INVALID_CREDIT_QUANTITY');
    assertCode(() => moveQuantity(state, 'availableQuantity', 'frozenQuantity', 3), 'CREDIT_INSUFFICIENT');
});

test('batch status derives from terminal buckets and activation', () => {
    assert.equal(deriveBatchStatus({ ...batch(2), availableQuantity: 0, reversedQuantity: 2 }), 'cancelled');
    assert.equal(deriveBatchStatus({ ...batch(2), availableQuantity: 0, expiredQuantity: 2 }), 'expired');
    assert.equal(deriveBatchStatus({ ...batch(2), availableQuantity: 0, consumedQuantity: 2 }), 'depleted');
    assert.equal(deriveBatchStatus({ ...batch(2), activatedAt: '2026-01-01T00:00:00.000Z' }), 'active');
    assert.equal(deriveBatchStatus(batch(2)), 'unactivated');
});

test('generated operation sequences preserve non-negative integer conservation', () => {
    const buckets = ['availableQuantity', 'frozenQuantity', 'consumedQuantity', 'expiredQuantity', 'reversedQuantity'];
    for (let seed = 1; seed <= 150; seed += 1) {
        const random = lcg(seed);
        let state = batch(25);
        for (let step = 0; step < 80; step += 1) {
            const sources = buckets.filter((name) => state[name] > 0);
            const source = sources[Math.floor(random() * sources.length)];
            const targets = buckets.filter((name) => name !== source);
            const target = targets[Math.floor(random() * targets.length)];
            const quantity = 1 + Math.floor(random() * state[source]);
            state = moveQuantity(state, source, target, quantity);
            assert.equal(buckets.reduce((sum, name) => sum + state[name], 0), state.originalQuantity);
            assert.equal(buckets.every((name) => Number.isInteger(state[name]) && state[name] >= 0), true);
        }
    }
});

function batch(quantity) {
    return {
        originalQuantity: quantity,
        availableQuantity: quantity,
        frozenQuantity: 0,
        consumedQuantity: 0,
        expiredQuantity: 0,
        reversedQuantity: 0,
        activatedAt: null,
    };
}

function lcg(seed) {
    let value = seed >>> 0;
    return () => {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 0x100000000;
    };
}

function assertCode(action, code) {
    assert.throws(action, (error) => error instanceof CourseCreditError && error.code === code);
}
