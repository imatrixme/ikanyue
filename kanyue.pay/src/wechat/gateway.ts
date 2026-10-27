import { ensure, recordId, retry } from '../domain';
import { Gateway, insert, next, paymentExpired, update } from '../gateway';
import type { Finding, Observation, Payment, Refund, Row, Store } from '../types';
import { object, WechatAdapter } from './adapter';
import { WechatApiError, WechatClient } from './client';
import { mockCredentials, WechatMock, type MockKeys } from './mock';
import type { DurableWork } from '../work';

export class WechatGateway extends Gateway {
  readonly adapter: WechatAdapter;
  private readonly mockPeer?: WechatMock;
  get mock(): WechatMock { ensure(this.mockPeer, 'MOCK_PAYMENT_DISABLED', 403); return this.mockPeer; }
  constructor(store: Store, owner: string, keys: MockKeys | WechatAdapter = mockCredentials(), readonly work?: DurableWork) {
    super(store, owner, undefined, 'wechatpay');
    if (keys instanceof WechatAdapter) this.adapter = keys;
    else {
      this.mockPeer = new WechatMock(store, owner, keys);
      this.adapter = new WechatAdapter(new WechatClient(keys.credentials, this.mock.transport));
    }
  }
  override async createPayment(input: Record<string, unknown>, key: string) {
    const previous = await this.store.get<Payment>(recordId('payment', this.owner, input.reference));
    if (previous?.kind === 'payment' && previous.owner === this.owner && previous.data.channel !== 'wechatpay') {
      return new Gateway(this.store, this.owner, this.clock).createPayment(input, key);
    }
    const payment = await super.createPayment({ ...input,
      payerId: input.payerId ?? (this.mockPeer ? `mock_${recordId(this.owner, input.reference)}` : undefined),
      description: input.description ?? 'Kanyue-course-order' }, key);
    await this.prepare(payment);
    return this.owned<Payment>(payment.id, 'payment');
  }
  action(payment: Row<Payment>) {
    if (payment.data.channel !== 'wechatpay') return { type: 'mock', paymentId: payment.id };
    return payment.data.prepayId ? this.adapter.launch(payment.data.prepayId) : { type: 'pending' };
  }
  // A prepay id stays valid longer than the payment window, so it is requested once.
  private async prepare(payment: Row<Payment>) {
    if (payment.data.status !== 'pending' || payment.data.prepayId || paymentExpired(payment)) return;
    const prepayId = await this.adapter.prepay(payment);
    await retry(async () => {
      const current = await this.owned<Payment>(payment.id, 'payment');
      if (current.data.prepayId || current.data.status !== 'pending') return;
      await this.store.commit([update(next(current, { prepayId, prepayAt: this.clock() }))]);
    });
  }
  override async createRefund(input: Record<string, unknown>, key: string) {
    const refund = await super.createRefund(input, key);
    const payment = await this.owned<Payment>(refund.data.paymentId, 'payment');
    if (payment.data.channel === 'wechatpay' && refund.data.status === 'processing') await this.syncRefund(refund, payment);
    return this.owned<Refund>(refund.id, 'refund');
  }
  override async closePayment(id: string) {
    const payment = await this.owned<Payment>(id, 'payment');
    if (payment.data.channel !== 'wechatpay') return super.closePayment(id);
    if (payment.data.status === 'closed') return payment;
    ensure(payment.data.status === 'pending', 'PAYMENT_NOT_CLOSABLE', 409);
    await this.adapter.close(payment);
    await this.receive(await this.adapter.payment(payment));
    return this.owned<Payment>(id, 'payment');
  }
  override async observe(id: string, input: Record<string, unknown>) {
    const observation = await this.owned<Observation>(recordId('provider', id), 'provider');
    const payment = observation.data.targetKind === 'payment' ? await this.owned<Payment>(id, 'payment')
      : await this.owned<Payment>((await this.owned<Refund>(id, 'refund')).data.paymentId, 'payment');
    if (payment.data.channel !== 'wechatpay') return super.observe(id, input);
    if (observation.data.targetKind === 'payment') await this.prepare(payment);
    else await this.syncRefund(await this.owned<Refund>(id, 'refund'), payment);
    await this.mock.observe(id, input);
    // Return state already known to the gateway, not an unverified mock receipt.
    return observation;
  }
  override async poll() {
    const errors: { id: string; code: string }[] = [];
    const payments = await this.store.list<Payment>('payment', this.owner, { status: 'pending' });
    for (const payment of payments.filter((row) => row.data.channel === 'wechatpay')) {
      if (this.work) {
        const result = await this.work.run('payment-query', payment.id, () => this.recoverTarget(payment.id, 'payment'));
        if (result.error) errors.push({ id: payment.id, code: result.error });
        continue;
      }
      try {
        let receipt: Observation;
        try { receipt = await this.adapter.payment(payment); }
        catch (error) {
          if (!missing(error)) throw error;
          await this.prepare(payment);
          receipt = await this.adapter.payment(payment);
        }
        await this.receive(receipt);
        await this.closeIfExpired(payment.id);
      } catch (error) { errors.push(await this.issue(payment.id, error)); }
    }
    for (const refund of await this.store.list<Refund>('refund', this.owner, { status: 'processing' })) {
      const payment = await this.owned<Payment>(refund.data.paymentId, 'payment');
      if (payment.data.channel !== 'wechatpay') continue;
      if (this.work) {
        const result = await this.work.run('refund-query', refund.id, () => this.recoverTarget(refund.id, 'refund'));
        if (result.error) errors.push({ id: refund.id, code: result.error });
        continue;
      }
      try { await this.syncRefund(refund, payment); }
      catch (error) { errors.push(await this.issue(refund.id, error)); }
    }
    const legacy = await super.poll();
    return { inspected: legacy.inspected, errors: [...errors, ...legacy.errors] };
  }
  async recoverTarget(id: string, kind: 'payment' | 'refund') {
    if (kind === 'refund') {
      const refund = await this.owned<Refund>(id, 'refund');
      if (refund.data.status !== 'processing') return true;
      await this.syncRefund(refund, await this.owned<Payment>(refund.data.paymentId, 'payment'));
      return (await this.owned<Refund>(id, 'refund')).data.status !== 'processing';
    }
    const payment = await this.owned<Payment>(id, 'payment');
    if (payment.data.channel !== 'wechatpay') return true;
    try { await this.receive(await this.adapter.payment(payment)); }
    catch (error) { if (!missing(error)) throw error; await this.prepare(payment); }
    await this.closeIfExpired(id);
    return (await this.owned<Payment>(id, 'payment')).data.status !== 'pending';
  }
  // Closing with the channel prevents later payment; a capture that raced the close is picked up on the next query.
  private async closeIfExpired(id: string) {
    const current = await this.owned<Payment>(id, 'payment');
    if (current.data.status !== 'pending') return;
    if (paymentExpired(current)) await this.closePayment(id);
    else await this.prepare(current);
  }
  private async syncRefund(refund: Row<Refund>, payment: Row<Payment>) {
    const source = await this.owned<Observation>(recordId('provider', payment.id), 'provider');
    ensure(source.data.receiptId, 'WECHAT_PAYMENT_RECEIPT_REQUIRED', 409);
    let receipt: Observation;
    try { receipt = await this.adapter.queryRefund(refund, payment, source.data.receiptId); }
    catch (error) {
      if (!missing(error)) throw error;
      receipt = await this.adapter.refund(refund, payment, source.data.receiptId);
    }
    await this.receive(receipt);
  }
  async notification(headers: Headers, raw: string) {
    const notification = this.adapter.notification(headers, raw);
    const data = object(notification.data);
    let receipt: Observation;
    if (notification.type === 'TRANSACTION.SUCCESS') {
      ensure(data.trade_state === 'SUCCESS', 'WECHAT_NOTIFICATION_STATE_MISMATCH');
      const payment = await this.owned<Payment>(String(data.out_trade_no), 'payment');
      ensure(payment.data.channel === 'wechatpay', 'WECHAT_CHANNEL_MISMATCH', 409);
      receipt = this.adapter.paymentResult(data, payment);
    } else {
      ensure(['REFUND.SUCCESS', 'REFUND.CLOSED', 'REFUND.ABNORMAL'].includes(notification.type)
        && notification.type === `REFUND.${data.refund_status}` && data.status === undefined,
      'WECHAT_NOTIFICATION_STATE_MISMATCH');
      ensure(data.mchid === this.adapter.client.credentials.merchantId, 'WECHAT_REFUND_IDENTITY_MISMATCH', 409);
      const refund = await this.owned<Refund>(String(data.out_refund_no), 'refund');
      const payment = await this.owned<Payment>(refund.data.paymentId, 'payment');
      ensure(payment.data.channel === 'wechatpay', 'WECHAT_CHANNEL_MISMATCH', 409);
      const source = await this.owned<Observation>(recordId('provider', payment.id), 'provider');
      ensure(source.data.receiptId, 'WECHAT_PAYMENT_RECEIPT_REQUIRED', 409);
      receipt = this.adapter.refundResult(data, refund, payment, source.data.receiptId, true);
    }
    await this.receive(receipt);
  }
  private async receive(receipt: Observation) {
    const id = recordId('provider', receipt.targetId);
    await retry(async () => {
      const previous = await this.owned<Observation>(id, 'provider');
      ensure(!previous.data.receiptId || !receipt.receiptId || previous.data.receiptId === receipt.receiptId,
        'WECHAT_RECEIPT_ID_CHANGED', 409);
      if (previous.data.status === 'succeeded' && receipt.status !== 'succeeded') return;
      if (receipt.status === 'pending' && previous.data.status !== 'pending') return;
      ensure(!(receipt.targetKind === 'refund' && previous.data.status === 'failed' && receipt.status !== 'failed'),
        'WECHAT_REFUND_CLOSED_IS_FINAL', 409);
      if (previous.data.status === receipt.status && previous.data.receiptId === receipt.receiptId
        && previous.data.exception === receipt.exception && (!receipt.acceptedAt || previous.data.acceptedAt === receipt.acceptedAt)) return;
      await this.store.commit([update(next(previous, { ...receipt, exception: receipt.exception, applied: false }))]);
    });
    if (receipt.exception) await this.issue(receipt.targetId, new Error(receipt.exception));
    // No remote calls in the notification acknowledgement path; only durable local transitions.
    const current = await this.owned<Observation>(id, 'provider');
    if (current.data.status !== 'pending') await retry(() => this.accept(id));
  }
  private async issue(targetId: string, error: unknown) {
    const code = error instanceof Error && 'code' in error ? String(error.code)
      : error instanceof Error && error.message === 'WECHAT_REFUND_ABNORMAL' ? error.message : 'WECHAT_SYNC_UNRESOLVED';
    const id = recordId('wechat-issue', targetId, code);
    await retry(async () => {
      if (await this.store.get(id)) return;
      await this.store.commit([insert({ id, kind: 'reconciliation', owner: this.owner, version: 1,
        data: { targetId, reason: code, occurredAt: this.clock() } satisfies Finding })]);
    });
    return { id: targetId, code };
  }
}
function missing(error: unknown) {
  return error instanceof WechatApiError && error.httpStatus === 404
    && ['ORDER_NOT_EXIST', 'RESOURCE_NOT_EXISTS'].includes(error.channelCode);
}
