import { ensure } from '../domain';
import type { Observation, Payment, Refund, Row } from '../types';
import { WechatClient } from './client';
import { decodeNotification, launchParameters } from './crypto';

export class WechatAdapter {
  constructor(readonly client: WechatClient) {}
  async prepay(payment: Row<Payment>) {
    const { appId, merchantId, notifyUrl } = this.client.credentials;
    const result = await this.client.request<{ prepay_id: string }>('/v3/pay/transactions/jsapi', 'POST', {
      appid: appId, mchid: merchantId, out_trade_no: payment.id,
      description: payment.data.description, notify_url: notifyUrl,
      amount: { total: payment.data.amount, currency: 'CNY' }, payer: { openid: payment.data.payerId },
    });
    launchParameters(result.prepay_id, this.client.credentials);
    return result.prepay_id;
  }
  launch(prepayId: string) {
    return { type: 'wechatpay' as const, mock: this.client.mock, parameters: launchParameters(prepayId, this.client.credentials) };
  }
  async payment(payment: Row<Payment>) {
    const data = await this.client.request(`/v3/pay/transactions/out-trade-no/${payment.id}?mchid=${this.client.credentials.merchantId}`);
    return this.paymentResult(data, payment);
  }
  async close(payment: Row<Payment>) {
    await this.client.request(`/v3/pay/transactions/out-trade-no/${payment.id}/close`, 'POST', {
      mchid: this.client.credentials.merchantId,
    });
  }
  async refund(refund: Row<Refund>, payment: Row<Payment>, transactionId: string) {
    const data = await this.client.request('/v3/refund/domestic/refunds', 'POST', {
      out_trade_no: payment.id, out_refund_no: refund.id, notify_url: this.client.credentials.notifyUrl,
      amount: { total: payment.data.amount, refund: refund.data.amount, currency: 'CNY' },
    });
    return this.refundResult(data, refund, payment, transactionId);
  }
  async queryRefund(refund: Row<Refund>, payment: Row<Payment>, transactionId: string) {
    const data = await this.client.request(`/v3/refund/domestic/refunds/${refund.id}`);
    return this.refundResult(data, refund, payment, transactionId);
  }
  notification(headers: Headers, raw: string) { return decodeNotification(headers, raw, this.client.credentials); }

  paymentResult(value: unknown, payment: Row<Payment>): Observation {
    const data = object(value); const amount = object(data.amount);
    const { merchantId, appId } = this.client.credentials;
    ensure(data.mchid === merchantId && data.appid === appId && data.out_trade_no === payment.id,
      'WECHAT_PAYMENT_IDENTITY_MISMATCH', 409);
    ensure(amount.total === payment.data.amount && (amount.currency === undefined || amount.currency === 'CNY'), 'WECHAT_AMOUNT_MISMATCH', 409);
    const states: Record<string, Observation['status']> = { SUCCESS: 'succeeded', REFUND: 'succeeded',
      NOTPAY: 'pending', USERPAYING: 'pending', CLOSED: 'closed', REVOKED: 'closed', PAYERROR: 'failed' };
    ensure(typeof data.trade_state === 'string' && Object.hasOwn(states, data.trade_state), 'WECHAT_UNKNOWN_PAYMENT_STATE', 502);
    const status = states[data.trade_state];
    let receiptId: string | undefined;
    if (status === 'succeeded') {
      ensure(data.trade_type === 'JSAPI' && object(data.payer).openid === payment.data.payerId,
        'WECHAT_PAYER_MISMATCH', 409);
      receiptId = identifier(data.transaction_id);
      ensure(typeof data.success_time === 'string' && Number.isFinite(Date.parse(data.success_time)),
        'WECHAT_INVALID_SUCCESS_TIME', 502);
    }
    return { targetId: payment.id, targetKind: 'payment', amount: payment.data.amount, status,
      observedAt: status === 'succeeded' ? String(data.success_time) : new Date().toISOString(), receiptId };
  }
  refundResult(value: unknown, refund: Row<Refund>, payment: Row<Payment>, transactionId: string, notification = false): Observation {
    const data = object(value); const amount = object(data.amount);
    // Refund query/create omit mchid; authenticated client binds them. Notifications include it.
    ensure((data.mchid === undefined || data.mchid === this.client.credentials.merchantId)
      && data.out_trade_no === payment.id && data.out_refund_no === refund.id
      && data.transaction_id === transactionId, 'WECHAT_REFUND_IDENTITY_MISMATCH', 409);
    // Refund notifications omit currency; their signed merchant/order binding fixes it to the original CNY payment.
    ensure(amount.total === payment.data.amount && amount.refund === refund.data.amount
      && (amount.currency === 'CNY' || (notification && amount.currency === undefined)),
      'WECHAT_AMOUNT_MISMATCH', 409);
    const state = data.status ?? data.refund_status;
    ensure(['SUCCESS', 'CLOSED', 'PROCESSING', 'ABNORMAL'].includes(String(state)), 'WECHAT_UNKNOWN_REFUND_STATE', 502);
    ensure(notification || (typeof data.create_time === 'string' && Number.isFinite(Date.parse(data.create_time))),
      'WECHAT_INVALID_REFUND_TIME', 502);
    return { targetId: refund.id, targetKind: 'refund', amount: refund.data.amount,
      status: state === 'SUCCESS' ? 'succeeded' : state === 'CLOSED' ? 'failed' : 'pending',
      observedAt: new Date().toISOString(), receiptId: identifier(data.refund_id),
      ...(!notification ? { acceptedAt: String(data.create_time) } : {}),
      ...(state === 'ABNORMAL' ? { exception: 'WECHAT_REFUND_ABNORMAL' } : {}) };
  }
}
export function object(value: unknown): Record<string, unknown> {
  ensure(value && typeof value === 'object' && !Array.isArray(value), 'WECHAT_INVALID_RESPONSE', 502);
  return value as Record<string, unknown>;
}
function identifier(value: unknown) {
  ensure(typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value), 'WECHAT_INVALID_CHANNEL_ID', 502);
  return value;
}
