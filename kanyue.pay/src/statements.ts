import { createHash } from 'node:crypto';
import { ensure, recordId, retry } from './domain';
import { insert, next, update } from './gateway';
import type { Gateway } from './gateway';
import type { Observation, Payment, Refund, Row } from './types';
import { csvExport, parseTradeBill, validDate, type TradeLine } from './wechat/statement';
export interface Statement { date: string; hash: string; source: 'channel' | 'manual'; mock: boolean; count: number;
  ready: boolean; importedAt: string; actorId: string; fees: number; captured: number; refundRequested: number }
export interface StatementLine extends TradeLine { statementId: string; difference: string; resolution?: { actorId: string; note: string; at: string } }
export class Statements {
  constructor(readonly gateway: Gateway, readonly identity: { merchantId: string; appId: string }) {}
  async import(input: { date: string; content: string; hash?: string; mock: boolean; source: 'channel' | 'manual'; actorId: string }) {
    const lines = parseTradeBill(input.content, input.date, this.identity.merchantId, this.identity.appId);
    const hash = createHash('sha256').update(input.content).digest('hex');
    const id = recordId('statement', this.gateway.owner, input.date);
    const store = this.gateway.store;
    await retry(async () => {
      const previous = await store.get<Statement>(id);
      ensure(!previous || previous.data.hash === hash, 'STATEMENT_DATE_CONFLICT', 409);
      if (!previous) await store.commit([insert({ id, kind: 'statement', owner: this.gateway.owner, version: 1,
        data: { date: input.date, hash, source: input.source, mock: input.mock, actorId: input.actorId,
          count: lines.length, ready: false, importedAt: this.gateway.clock(), fees: lines.reduce((sum, line) => sum + line.fees, 0),
          captured: lines.filter((line) => line.kind === 'payment').reduce((sum, line) => sum + line.amount, 0),
          refundRequested: lines.filter((line) => line.kind === 'refund').reduce((sum, line) => sum + line.amount, 0) } satisfies Statement })]);
    });
    for (const line of lines) await retry(async () => {
      const lineId = recordId('statement-line', id, line.kind, line.targetId);
      if (await store.get(lineId)) return;
      await store.commit([insert({ id: lineId, kind: 'statement_line', owner: this.gateway.owner, version: 1,
        data: { ...line, statementId: id, difference: await this.difference(line) } satisfies StatementLine })]);
    });
    await retry(async () => {
      const row = await this.gateway.owned<Statement>(id, 'statement');
      if (!row.data.ready) await store.commit([update(next(row, { ready: true }))]);
    });
    return this.detail(id);
  }
  async difference(line: TradeLine) {
    const entity = await this.gateway.store.get<Payment | Refund>(line.targetId);
    if (!entity || entity.owner !== this.gateway.owner || entity.kind !== line.kind) return 'MISSING_GATEWAY_RECORD';
    if (entity.data.amount !== line.amount) return 'AMOUNT_MISMATCH';
    if (line.kind === 'refund' && (entity.data as Refund).paymentId !== line.paymentId) return 'PAYMENT_REFERENCE_MISMATCH';
    const provider = await this.gateway.store.get<Observation>(recordId('provider', line.targetId));
    if (!provider?.data.receiptId || provider.data.receiptId !== line.receiptId) return 'RECEIPT_MISMATCH';
    if (line.status === 'SUCCESS' && entity.data.status !== 'succeeded') return 'UNAPPLIED_SUCCESS';
    if (line.kind === 'payment' && entity.data.status !== 'succeeded') return 'STATE_MISMATCH';
    // Refund bills snapshot acceptance day; PROCESSING is not proof of final success or failure.
    return '';
  }
  async detail(id: string) {
    const statement = await this.gateway.owned<Statement>(id, 'statement');
    const lines = (await this.gateway.store.list<StatementLine>('statement_line', this.gateway.owner)).filter((row) => row.data.statementId === id);
    const covered = new Set(lines.filter((row) => row.data.kind === 'payment').map((row) => row.data.targetId));
    const missing = (await this.gateway.store.list<Payment>('payment', this.gateway.owner)).filter((row) => row.data.channel === 'wechatpay'
      && row.data.status === 'succeeded' && chinaDate(row.data.paidAt || '') === statement.data.date && !covered.has(row.id)).map((row) => row.id);
    const settlements = (await this.gateway.store.list<{ statementId: string }>('settlement', this.gateway.owner)).filter((row) => row.data.statementId === id);
    const refundCoverage = new Set(lines.filter((row) => row.data.kind === 'refund').map((row) => row.data.targetId));
    const receipts = await this.gateway.store.list<Observation>('provider', this.gateway.owner);
    const missingRefunds = receipts.filter((row) => row.data.targetKind === 'refund'
      && chinaDate(row.data.acceptedAt || '') === statement.data.date && !refundCoverage.has(row.data.targetId)).map((row) => row.data.targetId);
    return { id, ...statement.data, lines: lines.map(({ id, data }) => ({ id, ...data })), missingPayments: missing,
      missingRefunds,
      settlements: settlements.map(({ id, data }) => ({ id, ...data })) };
  }
  async review(lineId: string, actorId: string, note: string) {
    ensure(actorId && note.trim().length >= 2 && note.length <= 500, 'REVIEW_REASON_REQUIRED');
    const row = await this.gateway.owned<StatementLine>(lineId, 'statement_line');
    ensure(!await this.difference(row.data), 'STATEMENT_DIFFERENCE_UNRESOLVED', 409);
    const at = this.gateway.clock();
    await this.gateway.store.commit([update(next(row, { resolution: { actorId, note, at } })),
      insert({ id: recordId('statement-review', row.id, row.version), kind: 'audit', owner: this.gateway.owner, version: 1,
        data: { targetId: row.id, statementId: row.data.statementId, actorId, note, at, action: 'statement_difference_resolved' } })]);
  }
  async settlement(statementId: string, input: Record<string, unknown>) {
    await this.gateway.owned<Statement>(statementId, 'statement');
    ensure(typeof input.reference === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(input.reference)
      && typeof input.evidenceHash === 'string' && /^[a-f0-9]{64}$/.test(input.evidenceHash)
      && Number.isSafeInteger(input.amount) && Number(input.amount) >= 0 && validDate(String(input.date))
      && typeof input.actorId === 'string' && input.actorId.length > 0, 'SETTLEMENT_EVIDENCE_REQUIRED');
    const data = { statementId, reference: input.reference, evidenceHash: input.evidenceHash, amount: input.amount,
      date: input.date, actorId: input.actorId, source: 'operator_bank_evidence', recordedAt: this.gateway.clock() };
    const id = recordId('settlement', this.gateway.owner, input.reference);
    await retry(async () => {
      const old = await this.gateway.store.get<typeof data>(id);
      if (old) ensure(old.data.statementId === statementId && old.data.amount === data.amount && old.data.evidenceHash === data.evidenceHash
        && old.data.date === data.date && old.data.actorId === data.actorId, 'SETTLEMENT_CONFLICT', 409);
      else await this.gateway.store.commit([insert({ id, kind: 'settlement', owner: this.gateway.owner, version: 1, data })]);
    });
    return { id };
  }
  async export(id: string) {
    const statement = await this.detail(id);
    return csvExport([['账单日期', '类别', '渠道单号', '金额(分)', '手续费(分)', '账单状态', '核对差异', '处理说明'],
      ...statement.lines.map((line) => [statement.date, line.kind === 'payment' ? '收款' : '退款', line.targetId,
        line.amount, line.fees, line.status, line.difference, line.resolution?.note || '']),
      ...statement.missingPayments.map((targetId) => [statement.date, '收款', targetId, '', '', '', '账单缺失', '']),
      ...statement.missingRefunds.map((targetId) => [statement.date, '退款', targetId, '', '', '', '账单缺失', ''])]);
  }
}
function chinaDate(at: string) { const ms = Date.parse(at); return Number.isFinite(ms) ? new Date(ms + 8 * 3600000).toISOString().slice(0, 10) : ''; }
