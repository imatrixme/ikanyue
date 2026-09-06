import { recordId, retry } from './domain';
import { insert } from './gateway';
import type { Finding, Observation, Payment, Refund, Store } from './types';

export async function reconcile(store: Store, owner: string, now = new Date().toISOString()) {
  const findings = [];
  for (const provider of await store.list<Observation>('provider', owner)) {
    const entity = await store.get<Payment | Refund>(provider.data.targetId);
    const reason = !entity ? 'MISSING_GATEWAY_RECORD'
      : entity.data.amount !== provider.data.amount ? 'AMOUNT_MISMATCH'
        : provider.data.status === 'succeeded' && entity.data.status !== 'succeeded' ? 'UNAPPLIED_SUCCESS'
          : entity.data.status === 'succeeded' && provider.data.status !== 'succeeded' ? 'MISSING_PROVIDER_SUCCESS' : '';
    if (!reason) continue;
    const id = recordId('finding', provider.id, provider.version, entity?.version, reason);
    await retry(async () => {
      if (await store.get(id)) return;
      await store.commit([insert({ id, kind: 'reconciliation', owner, version: 1,
        data: { targetId: provider.data.targetId, reason, occurredAt: now } satisfies Finding })]);
    });
    findings.push({ id, targetId: provider.data.targetId, reason });
  }
  return { checkedAt: now, findings };
}

export async function financialSummary(store: Store, owner: string) {
  const payments = await store.list<Payment>('payment', owner);
  const refunds = await store.list<Refund>('refund', owner);
  const captured = payments.filter((row) => row.data.status === 'succeeded');
  const statements = (await store.list<import('./statements').Statement>('statement', owner)).filter((row) => row.data.ready && row.data.source === 'channel');
  const settlements = await store.list<{ amount: number }>('settlement', owner);
  return { currency: 'CNY', unit: 'minor', provider: 'mock',
    captured: captured.reduce((sum, row) => sum + row.data.amount, 0),
    refunded: captured.reduce((sum, row) => sum + row.data.refunded, 0),
    refundReserved: captured.reduce((sum, row) => sum + row.data.reserved, 0),
    fees: statements.length ? statements.reduce((sum, row) => sum + row.data.fees, 0) : null,
    settled: settlements.length ? settlements.reduce((sum, row) => sum + row.data.amount, 0) : null,
    payments: payments.map(({ id, data }) => ({ id, reference: data.reference, amount: data.amount,
      status: data.status, refunded: data.refunded, reserved: data.reserved, createdAt: data.createdAt })),
    refunds: refunds.map(({ id, data }) => ({ id, ...data, fingerprint: undefined })),
    findings: await store.list<Finding>('reconciliation', owner) };
}
