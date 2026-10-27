import { createCipheriv, createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { ensure, GatewayError, recordId, retry } from '../domain';
import { insert, next, update } from '../gateway';
import type { Row, Store } from '../types';
import { object } from './adapter';
import { origin, type HttpTransport } from './client';
import { nonce, rsaSign, seconds, verifyMessage, type WechatCredentials } from './crypto';

interface ChannelRecord {
  kind: 'payment' | 'refund'; targetId: string; request: Record<string, unknown>;
  state: string; createdAt: string; succeededAt?: string; reserved: number; refunded: number;
}
export function mockCredentials() {
  const keyPair = () => generateKeyPairSync('rsa', { modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const merchant = keyPair(); const platform = keyPair();
  return { credentials: { appId: 'wx0000000000000000', merchantId: '1900000001', serial: 'AABBCCDDEEFF0011',
    privateKey: merchant.privateKey, publicKeys: { PUB_KEY_ID_3000000001: platform.publicKey },
    apiV3Key: randomBytes(32), notifyUrl: 'https://kanyue-pay-mock.invalid/callbacks/wechatpay' } satisfies WechatCredentials,
  merchantPublicKey: merchant.publicKey, platformPrivateKey: platform.privateKey };
}
export type MockKeys = ReturnType<typeof mockCredentials>;

// This peer owns channel state only. It never reads or mutates payment/refund ledger rows.
export class WechatMock {
  faultNext?: 'timeout-before' | 'timeout-after' | 'bad-signature' | 'http500';
  faultPath?: string;
  constructor(readonly store: Store, readonly owner: string, readonly keys: MockKeys) {}

  transport: HttpTransport = async (request) => {
    const fault = !this.faultPath || new URL(request.url).pathname === this.faultPath ? this.faultNext : undefined;
    if (fault) { this.faultNext = undefined; this.faultPath = undefined; }
    if (fault === 'timeout-before') throw new Error('MOCK_NETWORK_TIMEOUT');
    const raw = await request.text(); const url = new URL(request.url);
    ensure(url.origin === origin, 'MOCK_NETWORK_EGRESS_FORBIDDEN');
    let response: Response;
    try {
      this.verifyRequest(request, raw);
      response = fault === 'http500' ? this.signed({ code: 'SYSTEM_ERROR' }, 500)
        : await this.route(url, request.method, raw ? object(JSON.parse(raw)) : {});
    } catch (error) {
      if (!(error instanceof GatewayError)) throw error;
      response = this.signed({ code: error.code }, error.status);
    }
    if (fault === 'timeout-after') throw new Error('MOCK_RESPONSE_LOST_AFTER_ACCEPTANCE');
    if (fault === 'bad-signature') response.headers.set('Wechatpay-Signature', 'WECHATPAY/SIGNTEST/invalid');
    return response;
  };

  private verifyRequest(request: Request, body: string) {
    const header = request.headers.get('Authorization') || '';
    ensure(header.startsWith('WECHATPAY2-SHA256-RSA2048 '), 'SIGN_ERROR', 401);
    const fields = Object.fromEntries([...header.matchAll(/(\w+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
    ensure(fields.mchid === this.keys.credentials.merchantId && fields.serial_no === this.keys.credentials.serial
      && /^\d{10}$/.test(fields.timestamp) && Math.abs(seconds() - Number(fields.timestamp)) <= 300,
    'SIGN_ERROR', 401);
    const url = new URL(request.url);
    verifyMessage(`${request.method}\n${url.pathname}${url.search}\n${fields.timestamp}\n${fields.nonce_str}\n${body}\n`,
      fields.signature || '', this.keys.merchantPublicKey);
  }
  signed(value: unknown, status = 200) {
    const raw = status === 204 ? '' : JSON.stringify(value);
    const timestamp = seconds().toString(); const random = nonce();
    return new Response(status === 204 ? null : raw, { status, headers: { 'Content-Type': 'application/json',
      'Wechatpay-Timestamp': timestamp, 'Wechatpay-Nonce': random, 'Wechatpay-Serial': 'PUB_KEY_ID_3000000001',
      'Wechatpay-Signature': rsaSign(`${timestamp}\n${random}\n${raw}\n`, this.keys.platformPrivateKey) } });
  }
  private async route(url: URL, method: string, body: Record<string, unknown>): Promise<Response> {
    const path = url.pathname;
    if (method === 'POST' && path === '/v3/pay/transactions/jsapi') {
      ensure(body.mchid === this.keys.credentials.merchantId && body.appid === this.keys.credentials.appId
        && typeof object(body.payer).openid === 'string' && body.notify_url === this.keys.credentials.notifyUrl,
      'PARAM_ERROR');
      const amount = object(body.amount);
      ensure(Number.isSafeInteger(amount.total) && Number(amount.total) > 0 && amount.currency === 'CNY', 'PARAM_ERROR');
      const row = await this.create('payment', String(body.out_trade_no), body);
      ensure(row.data.state === 'NOTPAY', 'ORDERPAID');
      return this.signed({ prepay_id: `wxmock${row.data.targetId}` });
    }
    const trade = path.match(/^\/v3\/pay\/transactions\/out-trade-no\/([a-z0-9]{15})(\/close)?$/);
    if (trade) {
      ensure((method === 'GET' ? url.searchParams.get('mchid') : body.mchid) === this.keys.credentials.merchantId, 'PARAM_ERROR');
      const row = await this.get(trade[1]); ensure(row.data.kind === 'payment', 'ORDER_NOT_EXIST', 404);
      if (method === 'GET' && !trade[2]) return this.signed(this.paymentWire(row));
      if (method === 'POST' && trade[2]) {
        await retry(async () => {
          const current = await this.get(trade[1]);
          ensure(!['SUCCESS', 'REFUND'].includes(current.data.state), 'ORDERPAID');
          if (current.data.state !== 'CLOSED') await this.store.commit([update(next(current, { state: 'CLOSED' }))]);
        });
        return this.signed(null, 204);
      }
    }
    if (method === 'POST' && path === '/v3/refund/domestic/refunds') {
      const row = await this.create('refund', String(body.out_refund_no), body);
      return this.signed(await this.refundWire(row));
    }
    const refund = path.match(/^\/v3\/refund\/domestic\/refunds\/([a-z0-9]{15})$/);
    if (method === 'GET' && refund) {
      const row = await this.get(refund[1]); ensure(row.data.kind === 'refund', 'RESOURCE_NOT_EXISTS', 404);
      return this.signed(await this.refundWire(row));
    }
    if (method === 'GET' && path === '/v3/bill/tradebill') {
      const date = url.searchParams.get('bill_date') || '';
      ensure(/^\d{4}-\d{2}-\d{2}$/.test(date), 'PARAM_ERROR');
      const content = await this.bill(date);
      return this.signed({ hash_type: 'SHA1', hash_value: createHash('sha1').update(content).digest('hex'),
        download_url: `${origin}/v3/billdownload/file?token=${date}` });
    }
    if (method === 'GET' && path === '/v3/billdownload/file') {
      return new Response(await this.bill(url.searchParams.get('token') || ''), { headers: { 'Content-Type': 'text/csv' } });
    }
    return this.signed({ code: 'RESOURCE_NOT_EXISTS' }, 404);
  }
  private async create(kind: ChannelRecord['kind'], targetId: string, request: Record<string, unknown>) {
    ensure(/^[a-z0-9]{15}$/.test(targetId), 'PARAM_ERROR');
    return retry(async () => {
      const id = recordId('wechat-mock', this.owner, targetId);
      const previous = await this.store.get<ChannelRecord>(id);
      if (previous) {
        ensure(previous.data.kind === kind && JSON.stringify(previous.data.request) === JSON.stringify(request), 'OUT_TRADE_NO_USED', 409);
        return previous;
      }
      const row: Row<ChannelRecord> = { id, kind: 'wechat_mock', owner: this.owner, version: 1,
        data: { kind, targetId, request, state: kind === 'payment' ? 'NOTPAY' : 'PROCESSING',
          createdAt: new Date().toISOString(), reserved: 0, refunded: 0 } };
      const changes = [insert(row)];
      if (kind === 'refund') {
        const payment = await this.get(String(request.out_trade_no)); const amount = object(request.amount);
        const total = object(payment.data.request.amount).total;
        ensure(payment.data.kind === 'payment' && payment.data.state === 'SUCCESS' && amount.total === total
          && amount.currency === 'CNY' && Number.isSafeInteger(amount.refund) && Number(amount.refund) > 0
          && Number(amount.refund) <= Number(total) - payment.data.reserved - payment.data.refunded, 'NOT_ENOUGH');
        changes.push(update(next(payment, { reserved: payment.data.reserved + Number(amount.refund) })));
      }
      await this.store.commit(changes); return row;
    });
  }
  async get(targetId: string) {
    const row = await this.store.get<ChannelRecord>(recordId('wechat-mock', this.owner, targetId));
    ensure(row && row.owner === this.owner && row.kind === 'wechat_mock', 'ORDER_NOT_EXIST', 404); return row;
  }
  async observe(targetId: string, input: Record<string, unknown>) {
    ensure(['succeeded', 'failed', 'abnormal', 'processing'].includes(String(input.status)), 'INVALID_PROVIDER_STATUS');
    return retry(async () => {
      const row = await this.get(targetId); const refund = row.data.kind === 'refund';
      const state = input.status === 'succeeded' ? 'SUCCESS' : input.status === 'failed' ? (refund ? 'CLOSED' : 'PAYERROR')
        : input.status === 'abnormal' ? 'ABNORMAL' : 'PROCESSING';
      ensure(refund || ['SUCCESS', 'PAYERROR'].includes(state), 'INVALID_PROVIDER_STATUS');
      ensure(row.data.state !== 'SUCCESS' || state === 'SUCCESS', 'CAPTURE_IS_IMMUTABLE', 409);
      ensure(!refund || row.data.state !== 'CLOSED' || state === 'CLOSED', 'REFUND_FAILURE_IS_FINAL', 409);
      if (row.data.state === state) return;
      const changes = [update(next(row, { state, ...(state === 'SUCCESS' ? { succeededAt: new Date().toISOString() } : {}) }))];
      if (refund && ['SUCCESS', 'CLOSED'].includes(state)) {
        const payment = await this.get(String(row.data.request.out_trade_no)); const amount = Number(object(row.data.request.amount).refund);
        ensure(payment.data.reserved >= amount, 'MOCK_REFUND_RESERVATION_MISMATCH');
        changes.push(update(next(payment, { reserved: payment.data.reserved - amount,
          refunded: payment.data.refunded + (state === 'SUCCESS' ? amount : 0) })));
      }
      await this.store.commit(changes);
    });
  }
  paymentWire(row: Row<ChannelRecord>) {
    const data = row.data;
    return { ...data.request, trade_state: data.state, trade_type: 'JSAPI',
      ...(data.state === 'SUCCESS' ? { transaction_id: `420000${data.targetId}`, success_time: data.succeededAt } : {}) };
  }
  async refundWire(row: Row<ChannelRecord>) {
    const payment = await this.get(String(row.data.request.out_trade_no));
    return { ...row.data.request, refund_id: `503000${row.data.targetId}`, transaction_id: `420000${payment.data.targetId}`,
      status: row.data.state, create_time: row.data.createdAt };
  }
  async notification(targetId: string) {
    const row = await this.get(targetId); const refund = row.data.kind === 'refund';
    ensure(refund ? ['SUCCESS', 'CLOSED', 'ABNORMAL'].includes(row.data.state) : row.data.state === 'SUCCESS', 'MOCK_NOTIFICATION_NOT_TERMINAL');
    const amount = object(row.data.request.amount);
    const data = refund ? { mchid: this.keys.credentials.merchantId, out_refund_no: row.data.targetId,
      out_trade_no: row.data.request.out_trade_no, transaction_id: `420000${row.data.request.out_trade_no}`,
      refund_id: `503000${row.data.targetId}`, refund_status: row.data.state,
      amount: { total: amount.total, refund: amount.refund, payer_total: amount.total, payer_refund: amount.refund },
      ...(row.data.succeededAt ? { success_time: row.data.succeededAt } : {}) } : this.paymentWire(row);
    const random = randomBytes(6).toString('hex'); const associated = refund ? 'refund' : 'transaction';
    const cipher = createCipheriv('aes-256-gcm', this.keys.credentials.apiV3Key, Buffer.from(random));
    cipher.setAAD(Buffer.from(associated));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final(), cipher.getAuthTag()]).toString('base64');
    return this.signed({ id: recordId('notification', row.id, row.version), create_time: new Date().toISOString(),
      event_type: refund ? `REFUND.${row.data.state}` : 'TRANSACTION.SUCCESS', resource_type: 'encrypt-resource',
      resource: { algorithm: 'AEAD_AES_256_GCM', ciphertext, nonce: random, associated_data: associated,
        original_type: refund ? 'refund' : 'transaction' } });
  }
  private async bill(date: string) {
    const { mockBill } = await import('./mockBill');
    return mockBill(date, await this.store.list<ChannelRecord>('wechat_mock', this.owner), this.keys.credentials);
  }
}
