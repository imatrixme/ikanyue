import { expect, test } from 'bun:test';
import { MemoryStore } from '../src/store';
import { Gateway } from '../src/gateway';
import { DurableWork, deliverEvents } from '../src/work';
import { WechatGateway } from '../src/wechat/gateway';
import { Statements } from '../src/statements';
import { csvExport, decimalMinor, parseTradeBill } from '../src/wechat/statement';
import { config } from '../src/config';
import { liveTransport } from '../src/wechat/live';

test('durable recovery leases survive restart, back off, stop, and require audited reset', async () => {
  const store = new MemoryStore(); let now = 1; let calls = 0;
  const work = new DurableWork(store, 'test', () => now, 2);
  const fail = async () => { calls++; throw new Error('network'); };
  await work.run('query', 'target', fail); await work.run('query', 'target', fail); expect(calls).toBe(1);
  now += 60000;
  await new DurableWork(store, 'test', () => now, 2).run('query', 'target', fail); expect(calls).toBe(2);
  now += 60000; await work.run('query', 'target', fail); expect(calls).toBe(2);
  const row = (await store.list<{ exhausted: boolean }>('work', 'test'))[0]; expect(row.data.exhausted).toBe(true);
  expect(await store.list('reconciliation', 'test')).toHaveLength(1);
  await expect(work.reset(row.id, 'admin', '')).rejects.toThrow('RETRY_REASON_REQUIRED');
  await work.reset(row.id, 'admin', '网络恢复');
  await work.run('query', 'target', async () => true); expect(await store.list('audit', 'test')).toHaveLength(1);
});
test('configured push requires explicit 204 and redacts sensitive event fields', async () => {
  const store = new MemoryStore(); const gateway = new Gateway(store, 'events'); let now = 0;
  const payment = await gateway.createPayment({ reference: 'order', amount: 100, currency: 'CNY' }, 'key');
  await gateway.observe(payment.id, { status: 'succeeded' }); await gateway.poll();
  const work = new DurableWork(store, 'events', () => now);
  const transport = async (_url: string, options: RequestInit) => { expect(String(options.body)).not.toContain('fingerprint'); return new Response(null, { status: 200 }); };
  await deliverEvents(gateway, work, { url: 'https://business.invalid/events', token: 'token' }, transport);
  expect(await gateway.events()).toHaveLength(1); now += 60000;
  await deliverEvents(gateway, work, { url: 'https://business.invalid/events', token: 'token' }, async () => new Response(null, { status: 204 }));
  expect(await gateway.events()).toHaveLength(0);
});
test('verified WeChat-format bills match payments, fees, duplicate imports, and safe exports', async () => {
  const gateway = new WechatGateway(new MemoryStore(), 'bills');
  const payment = await gateway.createPayment({ reference: 'order', amount: 80000, currency: 'CNY' }, 'key');
  await gateway.observe(payment.id, { status: 'succeeded' }); await gateway.poll();
  const date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const bill = await gateway.adapter.client.bill(date);
  const service = new Statements(gateway, gateway.adapter.client.credentials);
  const statement = await service.import({ ...bill, source: 'channel', actorId: 'admin' });
  expect(statement.count).toBe(1); expect(statement.fees).toBe(480); expect(statement.lines[0].difference).toBe('');
  expect(statement.missingPayments).toEqual([]);
  expect((await service.import({ ...bill, source: 'channel', actorId: 'admin' })).id).toBe(statement.id);
  await expect(service.import({ ...bill, content: bill.content.replace('800.00', '799.00'), source: 'manual', actorId: 'admin' })).rejects.toThrow();
  expect(csvExport([['=HYPERLINK("evil")']])).toContain("'=HYPERLINK");
  expect(() => parseTradeBill(bill.content.replace('1900000001', '1900000002'), date, '1900000001', 'wx0000000000000000')).toThrow('STATEMENT_IDENTITY_MISMATCH');
  expect(() => decimalMinor('0.001')).toThrow(); expect(decimalMinor('-0.01', true)).toBe(-1);
  expect(await service.export(statement.id)).toContain('80000');
  await service.settlement(statement.id, { actorId: 'admin', reference: 'bank-1', amount: 79520, date, evidenceHash: 'a'.repeat(64) });
  expect((await service.detail(statement.id)).settlements).toHaveLength(1);
  const refund = await gateway.createRefund({ reference: 'refund', paymentId: payment.id, amount: 10000 }, 'refund-key');
  expect((await service.detail(statement.id)).missingRefunds).toEqual([refund.id]);
  expect(await service.export(statement.id)).toContain('账单缺失');
  await expect(service.settlement(statement.id, { actorId: 'admin', reference: 'bank-1', amount: 79520,
    date: '2026-01-01', evidenceHash: 'a'.repeat(64) })).rejects.toThrow('SETTLEMENT_CONFLICT');
});
test('live mode cannot be activated by provider alone or carry mock secrets', () => {
  expect(() => config({ NODE_ENV: 'production', PAY_PROVIDER: 'wechatpay' })).toThrow('REAL_PROVIDER_NOT_QUALIFIED');
  expect(() => liveTransport(false)).toThrow('REAL_PROVIDER_NOT_QUALIFIED');
  const live = { NODE_ENV: 'production', PAY_PROVIDER: 'wechatpay', PAY_LIVE_ENABLED: 'true', PAY_RELEASE_APPROVAL: 'merchant-live-acceptance-approved', PAY_SERVICE_TOKEN: 's'.repeat(40), PAY_WECHAT_CREDENTIALS_FILE: '/secrets/wechat.json' };
  expect(config(live).live).toBe(true);
  expect(() => config({ ...live, PAY_MOCK_TOKEN: 'm'.repeat(40) })).toThrow('INVALID_SERVICE_SECRETS');
  expect(() => config({ ...live, PAY_EVENT_URL: 'http://business/events', PAY_EVENT_TOKEN: 'e'.repeat(40) })).toThrow('EVENT_URL_FORBIDDEN');
});
