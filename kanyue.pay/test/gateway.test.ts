import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/app';
import { config } from '../src/config';
import { Conflict, minorUnits, recordId } from '../src/domain';
import { financialSummary, reconcile } from '../src/finance';
import { Gateway } from '../src/gateway';
import { MemoryStore } from '../src/store';
import type { Payment } from '../src/types';

const token = 'service-test-'.repeat(4);
const mockToken = 'mock-test-'.repeat(5);
const settings = () => config({ NODE_ENV: 'test', PAY_SERVICE_TOKEN: token, PAY_MOCK_TOKEN: mockToken });
const setup = () => { const store = new MemoryStore(); return { store, gateway: new Gateway(store, 'kanyue') }; };
async function paid(gateway: Gateway, reference = 'order-1', amount = 240000) {
  const payment = await gateway.createPayment({ reference, amount, currency: 'CNY' }, 'purchase-1');
  await gateway.observe(payment.id, { status: 'succeeded' });
  await gateway.poll();
  return gateway.owned<Payment>(payment.id, 'payment');
}

describe('gateway money lifecycle', () => {
  test('payment replay, payload conflict and amount validation', async () => {
    const { gateway } = setup();
    const input = { reference: 'order-1', amount: 240000, currency: 'CNY' };
    const results = await Promise.all([gateway.createPayment(input, 'a'), gateway.createPayment(input, 'a')]);
    expect(results[0].id).toBe(results[1].id);
    expect(results[0].data.status).toBe('pending');
    await expect(gateway.createPayment({ ...input, amount: 1 }, 'a')).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    await expect(gateway.createPayment({ ...input, reference: 'different-order' }, 'a')).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    await expect(gateway.createPayment({ ...input, currency: 'USD' }, 'b')).rejects.toThrow('UNSUPPORTED_CURRENCY');
    for (const value of [0, -1, 0.1, NaN, Infinity, '100', Number.MAX_SAFE_INTEGER]) {
      expect(() => minorUnits(value)).toThrow('INVALID_AMOUNT');
    }
  });

  test('duplicate observations and restart retain exactly one paid event', async () => {
    const { gateway, store } = setup();
    const payment = await paid(gateway);
    await gateway.observe(payment.id, { status: 'succeeded' });
    const restarted = new Gateway(store, 'kanyue');
    await restarted.poll();
    expect((await restarted.events()).length).toBe(1);
    const event = (await restarted.events())[0];
    expect(event.data.type).toBe('payment.succeeded');
    await restarted.acknowledge(event.id);
    await restarted.acknowledge(event.id);
    expect(await restarted.events()).toHaveLength(0);
  });

  test('concurrent refunds reserve funds atomically', async () => {
    const { gateway } = setup();
    const payment = await paid(gateway, 'order-1', 10000);
    const results = await Promise.allSettled([
      gateway.createRefund({ reference: 'refund-1', paymentId: payment.id, amount: 7000 }, 'r1'),
      gateway.createRefund({ reference: 'refund-2', paymentId: payment.id, amount: 7000 }, 'r2'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await gateway.owned<Payment>(payment.id, 'payment')).data.reserved).toBe(7000);
  });

  test('partial refund replay, failed refund release and cumulative cap', async () => {
    const { gateway, store } = setup();
    const payment = await paid(gateway, 'order-1', 10000);
    const input = { reference: 'refund-1', paymentId: payment.id, amount: 3000 };
    const refund = await gateway.createRefund(input, 'r1');
    expect((await gateway.createRefund(input, 'r1')).id).toBe(refund.id);
    await expect(gateway.createRefund({ ...input, reference: 'other-refund' }, 'r1')).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    await expect(gateway.createRefund({ ...input, amount: 2000 }, 'r1')).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    await gateway.observe(refund.id, { status: 'succeeded' });
    await gateway.poll(); await gateway.poll();
    const second = await gateway.createRefund({ ...input, reference: 'r2', amount: 7000 }, 'r2');
    await gateway.observe(second.id, { status: 'failed' });
    await gateway.poll();
    await expect(gateway.observe(second.id, { status: 'succeeded' })).rejects.toThrow('REFUND_FAILURE_IS_FINAL');
    const state = (await gateway.owned<Payment>(payment.id, 'payment')).data;
    expect(state.refunded).toBe(3000); expect(state.reserved).toBe(0);
    await expect(gateway.createRefund({ ...input, reference: 'r3', amount: 7001 }, 'r3')).rejects.toThrow('REFUND_EXCEEDS_AVAILABLE');
    const finance = await financialSummary(store, 'kanyue');
    expect(finance.captured).toBe(10000); expect(finance.refunded).toBe(3000);
    expect(finance.fees).toBeNull(); expect(finance.settled).toBeNull();
  });

  test('closed payment accepts a late receipt instead of losing money', async () => {
    const { gateway } = setup();
    const p = await gateway.createPayment({ reference: 'late', amount: 100, currency: 'CNY' }, 'a');
    await gateway.closePayment(p.id); await gateway.closePayment(p.id);
    await gateway.observe(p.id, { status: 'succeeded' }); await gateway.poll();
    expect((await gateway.owned<Payment>(p.id, 'payment')).data.late).toBe(true);
    expect((await gateway.store.list<{ reason: string }>('reconciliation', 'kanyue'))[0].data.reason).toBe('LATE_PAYMENT_SUCCESS');
    await expect(gateway.closePayment(p.id)).rejects.toThrow('PAYMENT_NOT_CLOSABLE');
    await expect(gateway.observe(p.id, { status: 'failed' })).rejects.toThrow('CAPTURE_IS_IMMUTABLE');
  });

  test('mismatched provider amount is quarantined and reconciliation is durable', async () => {
    const { gateway, store } = setup();
    const p = await gateway.createPayment({ reference: 'mismatch', amount: 100, currency: 'CNY' }, 'a');
    await gateway.observe(p.id, { status: 'succeeded', amount: 99 });
    expect((await gateway.poll()).errors[0].code).toBe('PROVIDER_AMOUNT_MISMATCH');
    expect((await gateway.owned<Payment>(p.id, 'payment')).data.status).toBe('pending');
    expect((await reconcile(store, 'kanyue')).findings[0].reason).toBe('AMOUNT_MISMATCH');
    await reconcile(store, 'kanyue');
    expect(await store.list('reconciliation', 'kanyue')).toHaveLength(1);
  });

  test('capture before close is not overwritten and ownership is enforced', async () => {
    const { gateway, store } = setup();
    const p = await gateway.createPayment({ reference: 'race', amount: 100, currency: 'CNY' }, 'a');
    await gateway.observe(p.id, { status: 'succeeded' });
    await expect(gateway.closePayment(p.id)).rejects.toThrow('PAYMENT_ALREADY_CAPTURED');
    await expect(new Gateway(store, 'other').owned(p.id, 'payment')).rejects.toThrow('NOT_FOUND');
    await expect(gateway.createRefund({ reference: 'r', paymentId: p.id, amount: 1 }, 'r')).rejects.toThrow('PAYMENT_NOT_CAPTURED');
  });

  test('memory store simulates all-or-nothing optimistic transactions', async () => {
    const { store } = setup();
    const row = { id: recordId('one'), kind: 'payment' as const, owner: 'kanyue', version: 1, data: {} };
    await expect(store.commit([{ row, expected: 0 }, { row, expected: 0 }])).rejects.toBeInstanceOf(Conflict);
    expect(await store.get(row.id)).toBeNull();
  });
});

describe('HTTP and startup security', () => {
  test('requires independent credentials for service and mock controls', async () => {
    const { gateway } = setup(); const app = createApp(gateway, settings());
    expect((await app.request('/health')).status).toBe(200);
    expect((await app.request('/v1/finance')).status).toBe(401);
    expect((await app.request('/_test/poll', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).status).toBe(401);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'a' };
    const result = await app.request('/v1/payments', { method: 'POST', headers,
      body: JSON.stringify({ reference: 'api', amount: 100, currency: 'CNY' }) });
    expect(result.status).toBe(201);
    const payment = await result.json(); expect(payment.fingerprint).toBeUndefined(); expect(payment.action.type).toBe('mock');
    const control = { method: 'POST', headers: { Authorization: `Bearer ${mockToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'succeeded' }) };
    expect((await app.request(`/_test/observations/${payment.id}`, control)).status).toBe(200);
    expect((await app.request('/_test/poll', { method: 'POST', headers: { Authorization: `Bearer ${mockToken}` } })).status).toBe(200);
    expect((await app.request('/v1/payments', { method: 'POST', headers, body: 'null' })).status).toBe(400);
    expect((await app.request('/v1/payments', { method: 'POST', headers, body: '{' })).status).toBe(400);
    expect((await app.request('/v1/payments', { method: 'POST', headers, body: 'x'.repeat(20000) })).status).toBe(413);
  });

  test('mock and unqualified live adapters fail closed', () => {
    expect(() => config({ NODE_ENV: 'production' })).toThrow('MOCK_FORBIDDEN_IN_PRODUCTION');
    expect(() => config({ PAY_PROVIDER: 'wechat' })).toThrow('REAL_PROVIDER_NOT_QUALIFIED');
    expect(() => config({ PAY_SERVICE_TOKEN: 'short', PAY_MOCK_TOKEN: mockToken })).toThrow('INVALID_SERVICE_SECRETS');
    expect(() => config({ PAY_SERVICE_TOKEN: token, PAY_MOCK_TOKEN: token })).toThrow('INVALID_SERVICE_SECRETS');
    expect(() => config({ PAY_SERVICE_TOKEN: token, PAY_MOCK_TOKEN: mockToken, PAY_PB_URL: 'http://remote.example' })).toThrow('PB_TLS_REQUIRED');
  });
});
