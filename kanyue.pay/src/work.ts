import { ensure, recordId, retry } from './domain';
import { insert, next, update } from './gateway';
import type { Row, Store } from './types';

export interface WorkState { targetId: string; task: string; attempts: number; nextAt: number; exhausted: boolean; done: boolean; lastError?: string }
export class DurableWork {
  constructor(readonly store: Store, readonly owner: string, readonly clock = Date.now, readonly maxAttempts = 12) {}
  async run(task: string, targetId: string, action: () => Promise<boolean>) {
    const id = recordId('work', this.owner, task, targetId);
    const claimed = await retry(async () => {
      let row = await this.store.get<WorkState>(id);
      if (!row) {
        row = { id, kind: 'work', owner: this.owner, version: 1,
          data: { task, targetId, attempts: 0, nextAt: 0, exhausted: false, done: false } };
        await this.store.commit([insert(row)]);
      }
      if (row.data.done || row.data.exhausted || row.data.nextAt > this.clock()) return null;
      if (row.data.attempts >= this.maxAttempts) {
        await this.store.commit([update(next(row, { exhausted: true })),
          insert({ id: recordId('work-exhausted', id, row.version), kind: 'reconciliation', owner: this.owner, version: 1,
            data: { targetId, reason: 'RETRY_EXHAUSTED', occurredAt: new Date(this.clock()).toISOString() } })]);
        return null;
      }
      // Lease survives process loss; only this version can complete the attempt.
      const claimed = next(row, { nextAt: this.clock() + 60000, attempts: row.data.attempts + 1 });
      await this.store.commit([update(claimed)]);
      return claimed;
    });
    if (!claimed) return { skipped: true };
    try {
      const done = await action();
      await this.store.commit([update(next(claimed, { done, attempts: 0, nextAt: this.clock() + 5000, lastError: undefined }))]);
      return { done };
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'WORK_UNRESOLVED';
      const exhausted = claimed.data.attempts >= this.maxAttempts;
      const changes = [update(next(claimed, { exhausted, lastError: code,
        nextAt: this.clock() + Math.min(300000, 1000 * 2 ** Math.min(claimed.data.attempts, 8)) }))];
      if (exhausted) changes.push(insert({ id: recordId('work-exhausted', id, claimed.version), kind: 'reconciliation',
        owner: this.owner, version: 1, data: { targetId, reason: 'RETRY_EXHAUSTED', occurredAt: new Date(this.clock()).toISOString() } }));
      await this.store.commit(changes);
      return { error: code };
    }
  }
  async reset(id: string, actorId: string, reason: string) {
    ensure(actorId.length > 0 && reason.trim().length >= 2 && reason.length <= 500, 'RETRY_REASON_REQUIRED');
    await retry(async () => {
      const row = await this.store.get<WorkState>(id);
      ensure(row && row.kind === 'work' && row.owner === this.owner, 'NOT_FOUND', 404);
      ensure(row.data.exhausted, 'WORK_NOT_EXHAUSTED', 409);
      await this.store.commit([update(next(row, { attempts: 0, exhausted: false, nextAt: 0 })),
        insert({ id: recordId('retry-audit', id, row.version), kind: 'audit', owner: this.owner, version: 1,
          data: { action: 'retry_resumed', targetId: row.data.targetId, actorId, reason, at: this.clock() } })]);
    });
  }
}

export async function deliverEvents(gateway: import('./gateway').Gateway, work: DurableWork,
  config: { url: string; token: string } | null, transport: (url: string, init: RequestInit) => Promise<Response> = fetch) {
  if (!config) return;
  for (const row of await gateway.events()) await work.run('event-delivery', row.id, async () => {
    // Do not push payer identifiers or provider launch credentials to business consumers.
    const { reference, amount, status } = row.data.payload;
    const response = await transport(config.url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, type: row.data.type, targetId: row.data.targetId, reference, amount, status }) });
    ensure(response.status === 204, 'EVENT_NOT_ACKNOWLEDGED', 503);
    await gateway.acknowledge(row.id);
    return true;
  });
}
