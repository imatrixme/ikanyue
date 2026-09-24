import { digest, ensure, minorUnits, recordId, retry, text } from './domain';
import type { Finding, GatewayEvent, Mutation, Observation, Payment, Refund, Row, Store } from './types';

// Unpaid payments close after this window; the channel receives the same deadline.
export const PAYMENT_TTL_MS = 30 * 60_000;
export function paymentExpired(payment: Row<Payment>, now = Date.now()) {
  return payment.data.status === 'pending' && now - Date.parse(payment.data.createdAt) >= PAYMENT_TTL_MS;
}

export class Gateway {
  constructor(readonly store: Store, readonly owner: string, readonly clock = () => new Date().toISOString(),
    readonly channel?: 'wechatpay') {}

  async owned<T>(id: string, kind: Row['kind']) {
    ensure(/^[a-z0-9]{15}$/.test(id), 'INVALID_ID');
    const row = await this.store.get<T>(id);
    ensure(row && row.kind === kind && row.owner === this.owner, 'NOT_FOUND', 404);
    return row;
  }

  async createPayment(input: Record<string, unknown>, key: string) {
    const reference = text(input.reference, 'REFERENCE');
    const amount = minorUnits(input.amount);
    text(key, 'IDEMPOTENCY_KEY');
    ensure(input.currency === 'CNY', 'UNSUPPORTED_CURRENCY');
    const id = recordId('payment', this.owner, reference);
    if (this.channel) ensure(typeof input.description === 'string' && input.description.trim().length > 0
      && Buffer.byteLength(input.description) <= 127, 'INVALID_DESCRIPTION');
    const channelData = this.channel ? { channel: this.channel, payerId: text(input.payerId, 'PAYER_ID'),
      description: input.description as string } : {};
    const fingerprint = digest({ reference, amount, currency: 'CNY', key, ...channelData });
    return retry(async () => {
      const keyClaim = await this.keyClaim('payment', key, id, fingerprint);
      const previous = await this.store.get<Payment>(id);
      if (previous) {
        ensure(previous.data.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT', 409);
        if (keyClaim) await this.store.commit([insert(keyClaim)]);
        return previous;
      }
      const payment = this.fresh<Payment>(id, 'payment', { reference, amount, currency: 'CNY',
        status: 'pending', refunded: 0, reserved: 0, fingerprint, createdAt: this.clock(), ...channelData });
      const provider = this.provider(payment, 'payment', amount);
      await this.store.commit([insert(payment), insert(provider), ...(keyClaim ? [insert(keyClaim)] : [])]);
      return payment;
    });
  }

  async closePayment(id: string) {
    return retry(async () => {
      const payment = await this.owned<Payment>(id, 'payment');
      if (payment.data.status === 'closed') return payment;
      ensure(payment.data.status === 'pending', 'PAYMENT_NOT_CLOSABLE', 409);
      const provider = await this.owned<Observation>(recordId('provider', id), 'provider');
      ensure(provider.data.status !== 'succeeded', 'PAYMENT_ALREADY_CAPTURED', 409);
      const changed = next(payment, { status: 'closed' });
      await this.store.commit([update(changed), update(next(provider, { status: 'closed', observedAt: this.clock(), applied: true })),
        insert(this.event(changed, 'payment.closed'))]);
      return changed;
    });
  }

  async createRefund(input: Record<string, unknown>, key: string) {
    const paymentId = text(input.paymentId, 'PAYMENT_ID');
    const reference = text(input.reference, 'REFERENCE');
    const amount = minorUnits(input.amount);
    text(key, 'IDEMPOTENCY_KEY');
    const id = recordId('refund', this.owner, reference);
    const fingerprint = digest({ paymentId, reference, amount, key });
    return retry(async () => {
      const keyClaim = await this.keyClaim('refund', key, id, fingerprint);
      const previous = await this.store.get<Refund>(id);
      if (previous) {
        ensure(previous.data.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT', 409);
        if (keyClaim) await this.store.commit([insert(keyClaim)]);
        return previous;
      }
      const payment = await this.owned<Payment>(paymentId, 'payment');
      ensure(payment.data.status === 'succeeded', 'PAYMENT_NOT_CAPTURED', 409);
      ensure(payment.data.amount - payment.data.refunded - payment.data.reserved >= amount,
        'REFUND_EXCEEDS_AVAILABLE', 409);
      const refund = this.fresh<Refund>(id, 'refund', { paymentId, reference, amount,
        status: 'processing', fingerprint, createdAt: this.clock() });
      await this.store.commit([insert(refund), insert(this.provider(refund, 'refund', amount)),
        ...(keyClaim ? [insert(keyClaim)] : []),
        update(next(payment, { reserved: payment.data.reserved + amount })),
        insert(this.event(refund, 'refund.processing'))]);
      return refund;
    });
  }

  async observe(targetId: string, input: Record<string, unknown>) {
    ensure(input.status === 'succeeded' || input.status === 'failed', 'INVALID_PROVIDER_STATUS');
    const status = input.status;
    return retry(async () => {
      const row = await this.owned<Observation>(recordId('provider', targetId), 'provider');
      ensure(!(row.data.targetKind === 'refund' && row.data.status === 'failed' && status !== 'failed'),
        'REFUND_FAILURE_IS_FINAL', 409);
      ensure(row.data.status !== 'succeeded' || status === 'succeeded', 'CAPTURE_IS_IMMUTABLE', 409);
      const amount = input.amount === undefined ? row.data.amount : minorUnits(input.amount);
      if (row.data.status === status && row.data.amount === amount) return row;
      ensure(row.data.status !== 'succeeded', 'CAPTURE_IS_IMMUTABLE', 409);
      const changed = next(row, { status, amount, observedAt: this.clock(), applied: false });
      await this.store.commit([update(changed)]);
      return changed;
    });
  }

  // Pending work is derived from durable provider/entity state, not an in-memory callback queue.
  // Only open work is read: expired pending payments and provider results not yet applied.
  async poll() {
    const errors: { id: string; code: string }[] = [];
    for (const payment of await this.store.list<Payment>('payment', this.owner, { status: 'pending' })) {
      if (payment.data.channel || !paymentExpired(payment)) continue;
      try { await this.closePayment(payment.id); }
      catch (error) { errors.push({ id: payment.id, code: error instanceof Error && 'code' in error ? String(error.code) : 'PAYMENT_CLOSE_FAILED' }); }
    }
    const observations = await this.store.list<Observation>('provider', this.owner, { applied: { not: true }, status: { not: 'pending' } });
    for (const observation of observations) {
      if (!['succeeded', 'failed'].includes(observation.data.status)) continue;
      try { await retry(() => this.accept(observation.id)); }
      catch (error) {
        errors.push({ id: observation.data.targetId,
          code: error instanceof Error && 'code' in error ? String(error.code) : 'PROVIDER_SYNC_FAILED' });
      }
    }
    return { inspected: observations.length, errors };
  }

  protected async accept(providerId: string) {
    const observation = await this.owned<Observation>(providerId, 'provider');
    const { targetId, targetKind, status, amount } = observation.data;
    // Marking the observation applied in the same commit keeps polling bounded to unapplied results.
    const applied = update(next(observation, { applied: true }));
    if (targetKind === 'payment') {
      const row = await this.owned<Payment>(targetId, 'payment');
      if (row.data.status === 'succeeded' || row.data.status === status) return this.store.commit([applied]);
      ensure(amount === row.data.amount, 'PROVIDER_AMOUNT_MISMATCH', 409);
      const succeeded = status === 'succeeded';
      const changed = next(row, succeeded ? { status: 'succeeded', paidAt: observation.data.observedAt,
        late: row.data.status !== 'pending' } : { status: status === 'closed' ? 'closed' : 'failed' });
      await this.store.commit([applied, update(changed), insert(this.event(changed, `payment.${changed.data.status}`)),
        ...(succeeded && changed.data.late ? [insert(this.fresh<Finding>(recordId('late', row.id), 'reconciliation', {
          targetId: row.id, reason: 'LATE_PAYMENT_SUCCESS', occurredAt: this.clock(),
        }))] : [])]);
    } else {
      const row = await this.owned<Refund>(targetId, 'refund');
      if (row.data.status !== 'processing') return this.store.commit([applied]);
      ensure(amount === row.data.amount, 'PROVIDER_AMOUNT_MISMATCH', 409);
      const payment = await this.owned<Payment>(row.data.paymentId, 'payment');
      ensure(payment.data.reserved >= amount, 'REFUND_RESERVATION_MISMATCH', 409);
      const changed = next(row, { status: status === 'succeeded' ? 'succeeded' : 'failed' });
      await this.store.commit([applied, update(changed), update(next(payment, {
        reserved: payment.data.reserved - amount,
        refunded: payment.data.refunded + (status === 'succeeded' ? amount : 0),
      })), insert(this.event(changed, `refund.${changed.data.status}`))]);
    }
  }

  async events() {
    return (await this.store.list<GatewayEvent>('event', this.owner, { acknowledged: false })).slice(0, 100);
  }

  async acknowledge(id: string) {
    return retry(async () => {
      const row = await this.owned<GatewayEvent>(id, 'event');
      if (row.data.acknowledged) return;
      await this.store.commit([update(next(row, { acknowledged: true }))]);
    });
  }

  private fresh<T>(id: string, kind: Row['kind'], data: T): Row<T> {
    return { id, kind, owner: this.owner, version: 1, data };
  }
  private async keyClaim(kind: 'payment' | 'refund', key: string, targetId: string, fingerprint: string) {
    const id = recordId('idempotency', this.owner, kind, key);
    const previous = await this.store.get<{ fingerprint: string }>(id);
    if (previous) {
      ensure(previous.data.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT', 409);
      return null;
    }
    return this.fresh(id, 'idempotency', { targetId, fingerprint });
  }
  private provider(row: Row, targetKind: Observation['targetKind'], amount: number) {
    return this.fresh<Observation>(recordId('provider', row.id), 'provider', {
      targetId: row.id, targetKind, amount, status: 'pending', observedAt: this.clock(),
    });
  }
  private event(row: Row<Payment | Refund>, type: string) {
    return this.fresh<GatewayEvent>(recordId('event', row.id, row.version, type), 'event', {
      type, targetId: row.id, payload: row.data, occurredAt: this.clock(), acknowledged: false,
    });
  }
}

export function next<T>(row: Row<T>, data: Partial<T>): Row<T> {
  return { ...row, version: row.version + 1, data: { ...row.data, ...data } };
}
export function insert(row: Row): Mutation { return { row, expected: 0 }; }
export function update(row: Row): Mutation { return { row, expected: row.version - 1 }; }
