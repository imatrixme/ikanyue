import { describe, expect, test } from 'bun:test';
import { createCipheriv, randomBytes, sign, verify } from 'node:crypto';
import { createApp } from '../src/app';
import { config } from '../src/config';
import { recordId } from '../src/domain';
import { Gateway } from '../src/gateway';
import { MemoryStore } from '../src/store';
import type { Payment, Refund } from '../src/types';
import { WechatClient } from '../src/wechat/client';
import { seconds, verifyResponse } from '../src/wechat/crypto';
import { WechatGateway } from '../src/wechat/gateway';
import { mockCredentials } from '../src/wechat/mock';

const keys = mockCredentials();
const setup = () => new WechatGateway(new MemoryStore(), 'contract', keys);
const input = { reference: 'order-1', amount: 10000, currency: 'CNY', payerId: 'openid_test', description: '课程套餐' };
const create = (gateway: WechatGateway) => gateway.createPayment(input, 'purchase');
async function pay(gateway: WechatGateway) {
  const row = await create(gateway); await gateway.observe(row.id, { status: 'succeeded' });
  const callback = await gateway.mock.notification(row.id);
  await gateway.notification(callback.headers, await callback.text());
  return gateway.owned<Payment>(row.id, 'payment');
}
// Independent fixture encoder: sign exact wire bytes, including AES-GCM authentication tag.
function callback(gateway: WechatGateway, type: string, data: unknown, timestamp = seconds()) {
  const iv = randomBytes(6).toString('hex');
  const cipher = createCipheriv('aes-256-gcm', keys.credentials.apiV3Key, Buffer.from(iv));
  cipher.setAAD(Buffer.from('fixture'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final(), cipher.getAuthTag()]).toString('base64');
  const raw = JSON.stringify({ id: 'fixture-event', event_type: type, resource_type: 'encrypt-resource',
    resource: { algorithm: 'AEAD_AES_256_GCM', nonce: iv, associated_data: 'fixture', ciphertext } });
  const headers = new Headers({ 'Wechatpay-Timestamp': String(timestamp), 'Wechatpay-Nonce': 'fixture-nonce',
    'Wechatpay-Serial': 'PUB_KEY_ID_3000000001', 'Wechatpay-Signature': sign('RSA-SHA256',
      Buffer.from(`${timestamp}\nfixture-nonce\n${raw}\n`), gateway.mock.keys.platformPrivateKey).toString('base64') });
  return { headers, raw };
}

describe('WeChat API v3 against a signed persistent HTTP peer', () => {
  test('prepay is pending and launch signature uses the small-program canonical string', async () => {
    const gateway = setup(); const payment = await create(gateway);
    expect(payment.data.status).toBe('pending');
    expect(payment.data.prepayId).toBe(`wxmock${payment.id}`);
    const action = gateway.adapter.launch(payment.data.prepayId!);
    const p = action.parameters;
    expect(verify('RSA-SHA256', Buffer.from(`${p.appId}\n${p.timeStamp}\n${p.nonceStr}\n${p.package}\n`),
      keys.merchantPublicKey, Buffer.from(p.paySign, 'base64'))).toBe(true);
    expect(action.mock).toBe(true);
    expect((await create(gateway)).id).toBe(payment.id);
    await expect(gateway.createPayment({ ...input, payerId: 'another-payer' }, 'purchase')).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(await gateway.events()).toHaveLength(0);
    expect(await gateway.store.list('wechat_mock', 'contract')).toHaveLength(1);
  });

  test('lost prepay response is recovered using query after restart without another channel order', async () => {
    const gateway = setup(); gateway.mock.faultNext = 'timeout-after';
    await expect(create(gateway)).rejects.toThrow('MOCK_RESPONSE_LOST');
    const restarted = new WechatGateway(gateway.store, gateway.owner, keys);
    const payment = await create(restarted);
    expect(await gateway.store.list('wechat_mock', 'contract')).toHaveLength(1);
    await restarted.observe(payment.id, { status: 'succeeded' });
    expect((await restarted.poll()).errors).toEqual([]);
    expect((await restarted.owned<Payment>(payment.id, 'payment')).data.status).toBe('succeeded');
  });

  test('invalid signatures and server errors never create a trusted paid receipt', async () => {
    for (const fault of ['bad-signature', 'http500', 'timeout-before'] as const) {
      const gateway = setup(); gateway.mock.faultNext = fault;
      await expect(create(gateway)).rejects.toThrow();
      expect((await gateway.store.list<Payment>('payment', gateway.owner))[0].data.status).toBe('pending');
      expect(await gateway.events()).toHaveLength(0);
      expect((await gateway.poll()).errors).toEqual([]);
    }
  });

  test('duplicate encrypted notifications and subsequent queries grant one stable event', async () => {
    const gateway = setup(); const payment = await pay(gateway);
    const notification = await gateway.mock.notification(payment.id); const raw = await notification.text();
    await gateway.notification(notification.headers, raw); await gateway.notification(notification.headers, raw);
    await gateway.poll();
    expect((await gateway.events()).filter((row) => row.data.type === 'payment.succeeded')).toHaveLength(1);
    expect((await gateway.owned<Payment>(payment.id, 'payment')).data.amount).toBe(10000);
  });

  test('tampering, sign probes, unknown keys and stale notifications are rejected', async () => {
    const gateway = setup(); const payment = await create(gateway);
    await gateway.observe(payment.id, { status: 'succeeded' });
    const notification = await gateway.mock.notification(payment.id); const raw = await notification.text();
    await expect(gateway.notification(notification.headers, raw + ' ')).rejects.toThrow('WECHAT_SIGNATURE_INVALID');
    for (const [name, value, error] of [
      ['Wechatpay-Signature', 'WECHATPAY/SIGNTEST/fake', 'WECHAT_SIGNATURE_INVALID'],
      ['Wechatpay-Serial', '__proto__', 'WECHAT_UNKNOWN_SIGNING_KEY'],
      ['Wechatpay-Timestamp', String(seconds() - 301), 'WECHAT_STALE_SIGNATURE'],
    ]) {
      const headers = new Headers(notification.headers); headers.set(name, value);
      await expect(gateway.notification(headers, raw)).rejects.toThrow(error);
    }
    expect((await gateway.owned<Payment>(payment.id, 'payment')).data.status).toBe('pending');
  });

  test('valid signatures cannot bypass merchant, app, reference, payer or amount binding', async () => {
    const gateway = setup(); const payment = await create(gateway);
    await gateway.observe(payment.id, { status: 'succeeded' });
    const valid = gateway.mock.paymentWire(await gateway.mock.get(payment.id));
    for (const mutation of [{ mchid: 'wrong' }, { appid: 'wrong' }, { out_trade_no: recordId('unknown') },
      { payer: { openid: 'wrong' } }, { amount: { total: 9999, currency: 'CNY' } },
      { amount: { total: 10000, currency: 'USD' } }, { trade_type: 'NATIVE' }]) {
      const bad = callback(gateway, 'TRANSACTION.SUCCESS', { ...valid, ...mutation });
      await expect(gateway.notification(bad.headers, bad.raw)).rejects.toThrow();
    }
    expect((await gateway.owned<Payment>(payment.id, 'payment')).data.status).toBe('pending');
  });

  test('close verifies a signed empty response; late success remains visible', async () => {
    const gateway = setup(); const payment = await create(gateway);
    expect((await gateway.closePayment(payment.id)).data.status).toBe('closed');
    await gateway.observe(payment.id, { status: 'succeeded' }); await gateway.poll();
    expect((await gateway.owned<Payment>(payment.id, 'payment')).data.late).toBe(true);
    expect((await gateway.store.list<{ reason: string }>('reconciliation', gateway.owner))
      .some((row) => row.data.reason === 'LATE_PAYMENT_SUCCESS')).toBe(true);
    await expect(gateway.closePayment(payment.id)).rejects.toThrow('PAYMENT_NOT_CLOSABLE');
  });

  test('a valid RSA signature does not make an invalid AES authentication tag acceptable', async () => {
    const gateway = setup(); const payment = await create(gateway);
    await gateway.observe(payment.id, { status: 'succeeded' });
    const wire = gateway.mock.paymentWire(await gateway.mock.get(payment.id));
    const signed = callback(gateway, 'TRANSACTION.SUCCESS', wire);
    const envelope = JSON.parse(signed.raw); const bytes = Buffer.from(envelope.resource.ciphertext, 'base64');
    bytes[bytes.length - 1] ^= 1; envelope.resource.ciphertext = bytes.toString('base64');
    const raw = JSON.stringify(envelope); const timestamp = signed.headers.get('Wechatpay-Timestamp');
    signed.headers.set('Wechatpay-Signature', sign('RSA-SHA256', Buffer.from(`${timestamp}\nfixture-nonce\n${raw}\n`),
      keys.platformPrivateKey).toString('base64'));
    await expect(gateway.notification(signed.headers, raw)).rejects.toThrow('WECHAT_NOTIFICATION_DECRYPTION_FAILED');
    expect((await gateway.owned<Payment>(payment.id, 'payment')).data.status).toBe('pending');
  });

  test('refund notifications bind original transaction and amount without inventing a currency field', async () => {
    const gateway = setup(); const payment = await pay(gateway);
    const refund = await gateway.createRefund({ paymentId: payment.id, reference: 'r1', amount: 3000 }, 'r1');
    const valid = { mchid: keys.credentials.merchantId, out_trade_no: payment.id, out_refund_no: refund.id,
      transaction_id: `420000${payment.id}`, refund_id: `503000${refund.id}`, refund_status: 'SUCCESS',
      amount: { total: 10000, refund: 3000, payer_total: 10000, payer_refund: 3000 } };
    for (const mutation of [{ mchid: 'other' }, { transaction_id: 'other' }, { out_trade_no: recordId('other') },
      { amount: { ...valid.amount, refund: 3001 } }, { amount: { ...valid.amount, currency: 'USD' } }]) {
      const invalid = callback(gateway, 'REFUND.SUCCESS', { ...valid, ...mutation });
      await expect(gateway.notification(invalid.headers, invalid.raw)).rejects.toThrow();
    }
    const accepted = callback(gateway, 'REFUND.SUCCESS', valid);
    await gateway.notification(accepted.headers, accepted.raw);
    expect((await gateway.owned<Payment>(payment.id, 'payment')).data.refunded).toBe(3000);
  });

  test('concurrent WeChat refunds cannot overspend in either gateway or mock channel', async () => {
    const gateway = setup(); const payment = await pay(gateway);
    const results = await Promise.allSettled(['r1', 'r2'].map((reference) =>
      gateway.createRefund({ paymentId: payment.id, reference, amount: 7000 }, reference)));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await gateway.owned<Payment>(payment.id, 'payment')).data.reserved).toBe(7000);
    expect((await gateway.mock.get(payment.id)).data.reserved).toBe(7000);
  });

  test('lost refund response reserves principal; abnormal remains pending; query eventually settles once', async () => {
    const gateway = setup(); const payment = await pay(gateway);
    const request = { paymentId: payment.id, reference: 'refund-1', amount: 3000 };
    gateway.mock.faultNext = 'timeout-after'; gateway.mock.faultPath = '/v3/refund/domestic/refunds';
    await expect(gateway.createRefund(request, 'refund')).rejects.toThrow('MOCK_RESPONSE_LOST');
    expect((await gateway.owned<Payment>(payment.id, 'payment')).data.reserved).toBe(3000);
    const restarted = new WechatGateway(gateway.store, gateway.owner, keys);
    const refund = await restarted.createRefund(request, 'refund');
    expect(refund.data.status).toBe('processing');
    expect(await gateway.store.list('wechat_mock', gateway.owner)).toHaveLength(2);
    await restarted.observe(refund.id, { status: 'abnormal' });
    const abnormal = await restarted.mock.notification(refund.id);
    await restarted.notification(abnormal.headers, await abnormal.text());
    expect((await restarted.owned<Payment>(payment.id, 'payment')).data.reserved).toBe(3000);
    expect((await restarted.owned<Refund>(refund.id, 'refund')).data.status).toBe('processing');
    await restarted.observe(refund.id, { status: 'succeeded' }); await restarted.poll(); await restarted.poll();
    const result = (await restarted.owned<Payment>(payment.id, 'payment')).data;
    expect(result.refunded).toBe(3000); expect(result.reserved).toBe(0);
    expect((await restarted.events()).filter((row) => row.data.type === 'refund.succeeded')).toHaveLength(1);
  });

  test('closed refund releases funds and cannot later be retried with different content', async () => {
    const gateway = setup(); const payment = await pay(gateway);
    const refund = await gateway.createRefund({ paymentId: payment.id, reference: 'refund-1', amount: 4000 }, 'r1');
    await gateway.observe(refund.id, { status: 'failed' });
    const notification = await gateway.mock.notification(refund.id);
    await gateway.notification(notification.headers, await notification.text());
    expect((await gateway.owned<Payment>(payment.id, 'payment')).data.reserved).toBe(0);
    await expect(gateway.observe(refund.id, { status: 'succeeded' })).rejects.toThrow('REFUND_FAILURE_IS_FINAL');
    await expect(gateway.createRefund({ paymentId: payment.id, reference: 'refund-1', amount: 1 }, 'r1')).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });

  test('bill metadata is signed and download content is hash-checked without response signatures', async () => {
    const gateway = setup(); const payment = await pay(gateway);
    const date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const bill = await gateway.adapter.client.bill(date);
    expect(bill.content).toContain(payment.id); expect(bill.mock).toBe(true);
    const tampered = new WechatClient(keys.credentials, async (request) => {
      if (new URL(request.url).pathname === '/v3/billdownload/file') return new Response('tampered');
      return gateway.mock.transport(request);
    });
    await expect(tampered.bill(date)).rejects.toThrow('WECHAT_BILL_HASH_MISMATCH');
    const malicious = new WechatClient(keys.credentials, async () => gateway.mock.signed({
      hash_type: 'SHA1', hash_value: '0'.repeat(40), download_url: 'http://127.0.0.1:18190/private',
    }));
    await expect(malicious.bill(date)).rejects.toThrow('WECHAT_BILL_URL_FORBIDDEN');
  });

  test('legacy mock records are never submitted to the WeChat peer', async () => {
    const gateway = setup(); const legacy = new Gateway(gateway.store, gateway.owner);
    const old = await legacy.createPayment({ reference: 'old', amount: 100, currency: 'CNY' }, 'old');
    const retried = await gateway.createPayment({ reference: 'old', amount: 100, currency: 'CNY' }, 'old');
    expect(retried.id).toBe(old.id); expect(retried.data.channel).toBeUndefined();
    await gateway.observe(old.id, { status: 'succeeded' }); await gateway.poll();
    expect((await gateway.owned<Payment>(old.id, 'payment')).data.status).toBe('succeeded');
    expect(await gateway.store.list('wechat_mock', gateway.owner)).toHaveLength(0);
  });

  test('public callback has cryptographic auth; test controls and internal endpoints still require separate tokens', async () => {
    const gateway = setup(); const payment = await create(gateway);
    const settings = config({ NODE_ENV: 'test', PAY_PROVIDER: 'wechatpay-mock',
      PAY_SERVICE_TOKEN: 's'.repeat(40), PAY_MOCK_TOKEN: 'm'.repeat(40) });
    const app = createApp(gateway, settings);
    expect((await app.request('/callbacks/wechatpay', { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await app.request(`/_test/wechatpay/notify/${payment.id}`, { method: 'POST' })).status).toBe(401);
    expect((await app.request('/v1/providers/wechatpay/bills/2026-09-06')).status).toBe(401);
    const detail = await app.request(`/v1/payments/${payment.id}`, { headers: { Authorization: `Bearer ${settings.token}` } });
    const data = await detail.json();
    expect(data.action.type).toBe('wechatpay'); expect(data.action.mock).toBe(true);
    expect(data.payerId).toBeUndefined(); expect(data.fingerprint).toBeUndefined();
    await gateway.observe(payment.id, { status: 'succeeded' });
    const notification = await gateway.mock.notification(payment.id);
    const result = await app.request('/callbacks/wechatpay', { method: 'POST', headers: notification.headers, body: await notification.text() });
    expect(result.status).toBe(204);
    expect(() => config({ NODE_ENV: 'production', PAY_PROVIDER: 'wechatpay-mock' })).toThrow('MOCK_FORBIDDEN');
    expect(() => config({ NODE_ENV: 'development', PAY_PROVIDER: 'wechatpay' })).toThrow('REAL_PROVIDER_NOT_QUALIFIED');
  });

  test('canonical verification accepts empty 204 body and rejects changed bytes', () => {
    const response = setup().mock.signed(null, 204);
    expect(() => verifyResponse(response.headers, '', keys.credentials.publicKeys)).not.toThrow();
    expect(() => verifyResponse(response.headers, '{}', keys.credentials.publicKeys)).toThrow('WECHAT_SIGNATURE_INVALID');
  });
});
