import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import PocketBase from 'pocketbase';
import { bootstrap } from '../src/schema';
import { Gateway } from '../src/gateway';
import { PocketBaseStore } from '../src/store';
import type { Payment } from '../src/types';
import { WechatGateway } from '../src/wechat/gateway';

const integration = process.env.PAY_PB_INTEGRATION === '1' ? describe : describe.skip;
integration('native PocketBase transactional contract', () => {
  let processHandle: ReturnType<typeof Bun.spawn>;
  let gateway: Gateway;
  let pb: PocketBase;
  let password: string;
  let launch: string[];
  beforeAll(async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kanyue-pay-contract-'));
    const executable = new URL('../../.local/bin/pocketbase', import.meta.url).pathname;
    // Bind an ephemeral port before selecting the isolated PB listener; failure never kills another process.
    const probe = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response() });
    const port = probe.port; probe.stop(true);
    password = crypto.randomUUID();
    const initialize = Bun.spawn([executable, 'superuser', 'upsert', 'test@local.com', password, `--dir=${directory}`],
      { stdout: 'ignore', stderr: 'ignore' });
    expect(await initialize.exited).toBe(0);
    launch = [executable, 'serve', `--http=127.0.0.1:${port}`, `--dir=${directory}`];
    processHandle = Bun.spawn(launch,
      { stdout: 'ignore', stderr: 'ignore' });
    pb = new PocketBase(`http://127.0.0.1:${port}`); pb.autoCancellation(false);
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await pb.health.check(); ready = true; break; } catch { await Bun.sleep(50); }
    }
    expect(ready).toBe(true);
    await pb.collection('_superusers').authWithPassword('test@local.com', password);
    await bootstrap(pb);
    gateway = new Gateway(new PocketBaseStore(pb), 'contract');
  }, 15000);
  afterAll(async () => { processHandle?.kill(); if (processHandle) await processHandle.exited; });

  test('data filters match booleans, strings and missing keys like the memory store', async () => {
    const store = new PocketBaseStore(pb);
    const row = (id: string, data: Record<string, unknown>) => ({ row: { id, kind: 'provider' as const, owner: 'filters', version: 1, data }, expected: 0 });
    await store.commit([row('filterunapplied', { status: 'succeeded' }), row('filterapplied00', { status: 'succeeded', applied: true }),
      row('filterpending00', { status: 'pending', applied: false })]);
    const open = await store.list('provider', 'filters', { applied: { not: true }, status: { not: 'pending' } });
    expect(open.map((item) => item.id)).toEqual(['filterunapplied']);
    expect((await store.list('provider', 'filters', { applied: false })).map((item) => item.id)).toEqual(['filterpending00']);
  });

  test('concurrent creation/refunds survive an actual PocketBase process restart', async () => {
    const input = { reference: 'persistent-order', amount: 10000, currency: 'CNY' };
    const attempts = await Promise.all([gateway.createPayment(input, 'one'), gateway.createPayment(input, 'one')]);
    expect(attempts[0].id).toBe(attempts[1].id);
    await gateway.observe(attempts[0].id, { status: 'succeeded' });
    await gateway.poll();
    const results = await Promise.allSettled([
      gateway.createRefund({ reference: 'refund-1', paymentId: attempts[0].id, amount: 7000 }, 'r1'),
      gateway.createRefund({ reference: 'refund-2', paymentId: attempts[0].id, amount: 7000 }, 'r2'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    processHandle.kill(); await processHandle.exited;
    processHandle = Bun.spawn(launch, { stdout: 'ignore', stderr: 'ignore' });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await pb.health.check(); ready = true; break; } catch { await Bun.sleep(50); }
    }
    expect(ready).toBe(true);
    const connection = new PocketBase(pb.baseURL);
    await connection.collection('_superusers').authWithPassword('test@local.com', password);
    const restarted = new Gateway(new PocketBaseStore(connection), 'contract');
    expect((await restarted.owned<Payment>(attempts[0].id, 'payment')).data.reserved).toBe(7000);
    expect((await restarted.events()).some((row) => row.data.type === 'payment.succeeded')).toBe(true);
    expect((await restarted.poll()).errors).toHaveLength(0);
    expect(await connection.collection('pay_entities').getFullList({ filter: 'kind="refund"' })).toHaveLength(1);
  });

  test('WeChat HTTP state survives PB restart and new signing keys without another refund', async () => {
    const wechat = new WechatGateway(new PocketBaseStore(pb), 'wechat-contract');
    const payment = await wechat.createPayment({ reference: 'wechat-order', amount: 10000, currency: 'CNY' }, 'wx');
    await wechat.observe(payment.id, { status: 'succeeded' }); await wechat.poll();
    wechat.mock.faultNext = 'timeout-after'; wechat.mock.faultPath = '/v3/refund/domestic/refunds';
    const input = { paymentId: payment.id, reference: 'wechat-refund', amount: 7000 };
    await expect(wechat.createRefund(input, 'wr')).rejects.toThrow('MOCK_RESPONSE_LOST');
    processHandle.kill(); await processHandle.exited;
    processHandle = Bun.spawn(launch, { stdout: 'ignore', stderr: 'ignore' });
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await pb.health.check(); break; } catch { await Bun.sleep(50); }
    }
    const connection = new PocketBase(pb.baseURL);
    await connection.collection('_superusers').authWithPassword('test@local.com', password);
    const recovered = new WechatGateway(new PocketBaseStore(connection), 'wechat-contract');
    const refund = await recovered.createRefund(input, 'wr');
    expect((await recovered.owned<Payment>(payment.id, 'payment')).data.reserved).toBe(7000);
    await recovered.observe(refund.id, { status: 'succeeded' });
    const notification = await recovered.mock.notification(refund.id);
    await recovered.notification(notification.headers, await notification.text());
    expect((await recovered.owned<Payment>(payment.id, 'payment')).data.refunded).toBe(7000);
    expect(await recovered.store.list('wechat_mock', 'wechat-contract')).toHaveLength(2);
    expect((await recovered.events()).filter((row) => row.data.type === 'refund.succeeded')).toHaveLength(1);
  });
});
