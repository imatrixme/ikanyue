const test = require('node:test');
const assert = require('node:assert/strict');
const { reservationQuote, cashCancellationPlan } = require('../src/services/commerce/reservationCancellation');
const { CommerceRefundService } = require('../src/services/commerce/refundService');

const at = '2026-09-06T00:00:00Z';
function fixture() {
    const batch = { id: 'batch', studentId: 's', creditTypeId: 'c', sourceOperationId: 'grant', grantSnapshot: { commerceOrderId: 'order' },
        originalQuantity: 4, availableQuantity: 3, frozenQuantity: 1, reversedQuantity: 0, consumedQuantity: 0, expiredQuantity: 0, version: 1 };
    const order = { id: 'order', studentId: 's', status: 'completed', version: 1, data: {
        amount: 80000, refunded: 0, paymentId: 'payment', refundPending: false,
        policy: { version: 2, packageRefund: 'unused_paid_value', reservationRefund: 'cash', cancellationTiers: [{ beforeMinutes: 60, feeBps: 0 }, { beforeMinutes: 0, feeBps: 5000 }] },
        grantResult: { operationId: 'grant', batches: [{ batchId: 'batch' }] }, allocations: [{ creditTypeId: 'c', quantity: 4, paidMinor: 80000 }],
    } };
    const allocation = { id: 'a', batchId: 'batch', quantity: 1 };
    const appointment = { id: 'appointment', studentId: 's', requestedStartAt: '2026-09-06T00:30:00Z' };
    const repo = { async get(collection) { if (collection === 'commerce_orders') return order; throw new Error('unexpected get'); } };
    return { batch, order, appointment, allocation, repo, quote: (institution = false) => reservationQuote(repo, appointment, [allocation], new Map([['batch', batch]]), at, institution) };
}
test('cash cancellation uses original discount allocation and inclusive server receipt thresholds', async () => {
    const f = fixture(); assert.equal((await f.quote()).refundable, 10000);
    assert.equal((await f.quote(true)).refundable, 20000);
    f.appointment.requestedStartAt = '2026-09-06T01:00:00Z'; assert.equal((await f.quote()).fee, 0);
    f.appointment.requestedStartAt = '2026-09-05T23:59:59Z'; assert.equal((await f.quote()).refundable, 0);
    f.batch.grantSnapshot = {}; assert.equal(await f.quote(), null);
});
test('cash cancellation atomically retires reserved credit and records refund liability, never releases it', async () => {
    const f = fixture(); const quote = await f.quote(); let sequence = 0;
    const context = { appointment: f.appointment, student: { id: 'roster', version: 1 }, command: { at, operationId: 'op' },
        idFactory: () => `id${++sequence}`, input: { actorId: 's', actorRole: 'student', reason: '课程取消', expectedRefundAmount: 10000, expectedFee: 10000 } };
    const plan = cashCancellationPlan(quote, context);
    const change = plan.requests.find((row) => row.collection === 'credit_batches');
    assert.equal(change.data.frozenQuantity, 0); assert.equal(change.data.reversedQuantity, 1);
    assert.equal(change.data.availableQuantity, undefined);
    assert.equal(plan.requests.find((row) => row.collection === 'commerce_refunds').data.data.kind, 'reservation');
    assert.equal(plan.refund.amount, 10000);
    assert.throws(() => cashCancellationPlan(quote, { ...context, input: { ...context.input, expectedFee: 0 } }), { code: 'CANCELLATION_QUOTE_CHANGED' });
});
test('source mismatch and concurrently reserved principal cannot create a refund', async () => {
    const f = fixture(); f.order.data.refundReservedAmount = 79999;
    await assert.rejects(f.quote(), { code: 'CASH_REFUND_PRINCIPAL_CONFLICT' });
    f.order.data.refundReservedAmount = 0; f.batch.sourceOperationId = 'other';
    await assert.rejects(f.quote(), { code: 'CASH_RESERVATION_SOURCE_MISMATCH' });
});
test('definitive reservation refund failure retains liability and does not restore credits', async () => {
    const f = fixture(); f.order.data.refundPending = true; f.order.data.pendingRefundCount = 1; f.order.data.refundReservedAmount = 10000;
    const refund = { id: 'refund', orderId: 'order', version: 1, status: 'processing', data: { amount: 10000, kind: 'reservation', gatewayId: 'r', held: [] } };
    let plan;
    const repo = { get: async (collection) => collection === 'commerce_refunds' ? refund : collection === 'commerce_orders' ? f.order : { id: 'order', studentId: 's' }, send: async (value) => { plan = value; } };
    const service = new CommerceRefundService({ repo, clock: () => Date.parse(at), gateway: { refundStatus: async () => ({ reference: 'refund', paymentId: 'payment', amount: 10000, status: 'failed' }) } });
    await service.sync('refund');
    assert.equal(plan.some((row) => row.collection === 'credit_batches'), false);
    const changed = plan.find((row) => row.collection === 'commerce_orders');
    assert.equal(changed.data.data.refundPending, true); assert.equal(changed.data.data.refundReservedAmount, 10000);
});
