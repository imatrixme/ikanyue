const test = require('node:test');
const assert = require('node:assert/strict');
const { CommerceRefundService } = require('../src/services/commerce/refundService');

function fixture({ frozen = 0, available = 3, refunded = 0, origin = 'gateway' } = {}) {
    const batch = { id: 'batch', studentId: 'student', creditTypeId: 'course', sourceOperationId: 'grant',
        originalQuantity: 4, availableQuantity: available, frozenQuantity: frozen, consumedQuantity: 4 - available - frozen,
        expiredQuantity: 0, reversedQuantity: 0, status: 'active', version: 1 };
    const transaction = { id: 'order', studentId: 'student', status: 'completed', version: 1, data: {
        amount: 80001, refunded, refundPending: false, allocations: [{ creditTypeId: 'course', quantity: 4, paidMinor: 80001 }],
        grantResult: { operationId: 'grant', batches: [{ batchId: 'batch' }] },
    } };
    const repo = { get: async (collection) => collection === 'credit_batches' ? batch : { productSnapshot: { origin } },
        findFirst: async () => null, send: async () => { throw new Error('unexpected write'); } };
    const checkout = { repo, clock: () => Date.parse('2026-09-06T00:00:00Z'), owned: async () => transaction };
    return { service: new CommerceRefundService(checkout), batch };
}
test('discounted partial use refunds original paid allocation and clamps principal', async () => {
    assert.equal((await fixture().service.preview('student', 'order')).amount, 60000);
    assert.equal((await fixture({ refunded: 79999 }).service.preview('student', 'order')).amount, 2);
    assert.equal((await fixture({ refunded: 90000 }).service.preview('student', 'order')).amount, 0);
    assert.equal((await fixture({ available: 0 }).service.preview('student', 'order')).amount, 0);
});
test('offline provenance and reserved credits prevent cash refund execution', async () => {
    await assert.rejects(fixture({ origin: 'offline' }).service.preview('student', 'order'), { code: 'OFFLINE_REFUND_MANUAL_ONLY' });
    const { service } = fixture({ frozen: 1 });
    assert.equal((await service.preview('student', 'order')).blocked, true);
    await assert.rejects(service.request('student', 'order', 'key', 60000), { code: 'REFUND_HAS_RESERVATIONS' });
    await assert.rejects(fixture().service.request('student', 'order', 'key', 1), { code: 'REFUND_QUOTE_CHANGED' });
    await assert.rejects(fixture().service.request('student', 'order', 'key'), { code: 'REFUND_QUOTE_REQUIRED' });
});
test('withdrawal uses whole credits; definitive failure restores or expires them without reopening reservations', () => {
    const { service, batch } = fixture();
    const withdrawal = service.movement(batch, 'withdraw', '2026-09-06T00:00:00Z', 3, false);
    const update = withdrawal.find((entry) => entry.action === 'update').data;
    assert.equal(update.availableQuantity, 0); assert.equal(update.reversedQuantity, 3);
    const held = { ...batch, ...update, effectiveExpiresAt: '2026-09-07T00:00:00Z' };
    const restored = service.movement(held, 'restore', '2026-09-06T01:00:00Z', 3, true, 'active')
        .find((entry) => entry.action === 'update').data;
    assert.equal(restored.availableQuantity, 3); assert.equal(restored.reversedQuantity, 0);
    const expired = service.movement(held, 'expire', '2026-09-08T00:00:00Z', 3, true, 'active')
        .find((entry) => entry.action === 'update').data;
    assert.equal(expired.availableQuantity, 0); assert.equal(expired.expiredQuantity, 3);
    assert.equal(expired.status, 'expired');
});
