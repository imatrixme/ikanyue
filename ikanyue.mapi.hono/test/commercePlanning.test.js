const test = require('node:test');
const assert = require('node:assert/strict');
const { amountMinor, cancellationQuote, validatePolicy, allocateMinor } = require('../src/services/commerce/planning');
const { GatewayClient } = require('../src/services/commerce/gatewayClient');

const policy = { version: 1, packageRefund: 'unused_paid_value', cancellationTiers: [
    { beforeMinutes: 1440, feeBps: 0 }, { beforeMinutes: 360, feeBps: 2000 }, { beforeMinutes: 0, feeBps: 10000 },
] };
test('deadline equality and institution cancellation use exact integer money', () => {
    const start = '2026-09-10T10:00:00+08:00';
    assert.equal(cancellationQuote(policy, start, '2026-09-09T10:00:00+08:00', 24000).refundable, 24000);
    assert.equal(cancellationQuote(policy, start, '2026-09-09T10:00:01+08:00', 24000).refundable, 19200);
    assert.equal(cancellationQuote(policy, start, '2026-09-10T04:00:00+08:00', 24000).refundable, 19200);
    assert.equal(cancellationQuote(policy, start, '2026-09-10T04:00:01+08:00', 24000).refundable, 0);
    assert.equal(cancellationQuote(policy, start, '2026-09-10T11:00:00+08:00', 24000, true).refundable, 24000);
    assert.throws(() => cancellationQuote(policy, 'invalid', start, 100));
});
test('invalid pricing and ambiguous tiers fail instead of changing consumer money', () => {
    assert.equal(amountMinor(2400), 240000);
    assert.equal(amountMinor(0.01), 1);
    for (const amount of [-1, 0, 1.001, NaN, Infinity]) assert.throws(() => amountMinor(amount));
    assert.throws(() => validatePolicy({ ...policy, cancellationTiers: [...policy.cancellationTiers].reverse() }));
    assert.throws(() => validatePolicy({ ...policy, cancellationTiers: [{ beforeMinutes: 0, feeBps: 10001 }] }));
    const lines = ['a', 'b', 'c'].map((creditTypeId) => ({ creditTypeId, quantity: 1 }));
    const allocation = allocateMinor(100, lines, new Map(lines.map((line) => [line.creditTypeId, { referenceUnitValue: 1 }])));
    assert.deepEqual(allocation.map((line) => line.paidMinor), [33, 33, 34]);
});
test('gateway client does not expose credentials or mistake transport failure for refund failure', async () => {
    const env = { NODE_ENV: 'test', PAY_MOCK_ENABLED: 'true', PAY_SERVICE_TOKEN: 'service'.repeat(6), PAY_MOCK_TOKEN: 'mock'.repeat(9) };
    let request;
    const client = new GatewayClient(env, async (url, options) => {
        request = { url, options }; return { ok: true, json: async () => ({ id: 'payment' }) };
    });
    assert.equal((await client.createPayment('order', 100)).id, 'payment');
    assert.equal(request.options.headers['Idempotency-Key'], 'order');
    assert.deepEqual(JSON.parse(request.options.body), { reference: 'order', amount: 100, currency: 'CNY' });
    const broken = new GatewayClient(env, async () => { throw new Error('secret upstream error'); });
    await assert.rejects(broken.payment('id'), { code: 'PAYMENT_RESULT_UNKNOWN' });
    await assert.rejects(new GatewayClient({ ...env, NODE_ENV: 'production' }).mockSuccess('id'), { code: 'MOCK_PAYMENT_DISABLED' });
    assert.throws(() => new GatewayClient({ PAY_GATEWAY_URL: 'http://remote.example' }), { code: 'PAYMENT_TLS_REQUIRED' });
});

test('gateway client reports non-JSON proxy failures as channel errors', async () => {
    const env = { NODE_ENV: 'test', PAY_SERVICE_TOKEN: 's'.repeat(32) };
    const client = new GatewayClient(env, async () => ({ ok: false, json: async () => { throw new SyntaxError('<html>'); } }));
    await assert.rejects(client.payment('id'), { code: 'PAYMENT_CHANNEL_ERROR' });
});

test('recovery acknowledges orphan events and cashier rejects closed payment windows', async () => {
    const { CheckoutService } = require('../src/services/commerce/checkoutService');
    const acknowledged = [];
    const order = { id: 'order', studentId: 'student', status: 'pending', version: 1, data: { paymentId: 'pay', payerId: '', amount: 100 } };
    const repo = {
        list: async () => [],
        get: async () => order,
        findFirst: async (collection, filter) => (filter.includes('"order"') ? order : null),
    };
    const gateway = {
        mockEnabled: true,
        request: async (path) => {
            if (path === '/v1/events') return { items: [{ id: 'orphan', data: { type: 'payment.closed', targetId: 'x', payload: { reference: 'unknown', status: 'closed' } } }] };
            acknowledged.push(path); return {};
        },
        refreshPayment: async () => ({ status: 'closed' }),
    };
    const checkout = new CheckoutService({ repository: repo }, gateway);
    await checkout.recover();
    assert.deepEqual(acknowledged, ['/v1/events/orphan/ack']);
    checkout.sync = async () => {};
    await assert.rejects(checkout.cashier('student', 'order'), { code: 'PAYMENT_WINDOW_CLOSED' });
});
