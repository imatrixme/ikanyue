import PocketBase, { ClientResponseError } from 'pocketbase';
import { Conflict, ensure, recordId } from './domain';
import type { Kind, Mutation, Row, Store } from './types';

// Version claims and entity updates share one PB transaction; no read-then-write money updates.
export class PocketBaseStore implements Store {
  constructor(readonly pb: PocketBase) { pb.autoCancellation(false); }
  async get<T>(id: string): Promise<Row<T> | null> {
    try { return decode<T>(await this.pb.collection('pay_entities').getOne(id)); }
    catch (error) { if (error instanceof ClientResponseError && error.status === 404) return null; throw error; }
  }
  async list<T>(kind: Kind, owner: string): Promise<Row<T>[]> {
    const records = await this.pb.collection('pay_entities').getFullList({
      filter: this.pb.filter('kind={:kind} && owner={:owner}', { kind, owner }), sort: 'created,id',
    });
    return records.map((record) => decode<T>(record));
  }
  async commit(changes: Mutation[]) {
    const batch = this.pb.createBatch();
    for (const { row, expected } of changes) {
      ensure(row.version === expected + 1, 'INVALID_VERSION');
      if (expected === 0) batch.collection('pay_entities').create(row);
      else {
        batch.collection('pay_claims').create({
          id: recordId('claim', row.id, expected), claimKey: `${row.id}:${expected}`,
        });
        const { id, ...body } = row;
        batch.collection('pay_entities').update(id, body);
      }
    }
    try { await batch.send(); }
    catch (error) {
      if (error instanceof ClientResponseError && error.status === 400
        && /validation_(not_unique|invalid_id)/.test(JSON.stringify(error.response))) throw new Conflict();
      throw error;
    }
  }
}
function decode<T>(record: { id: string; [key: string]: unknown }): Row<T> {
  return { id: record.id, kind: record.kind as Kind, owner: String(record.owner),
    version: Number(record.version), data: record.data as T };
}

export class MemoryStore implements Store {
  private rows = new Map<string, Row>();
  async get<T>(id: string): Promise<Row<T> | null> {
    return structuredClone(this.rows.get(id) as Row<T> || null);
  }
  async list<T>(kind: Kind, owner: string): Promise<Row<T>[]> {
    return structuredClone([...this.rows.values()].filter((r) => r.kind === kind && r.owner === owner) as Row<T>[]);
  }
  async commit(changes: Mutation[]) {
    const seen = new Set<string>();
    for (const { row, expected } of changes) {
      if (seen.has(row.id) || (this.rows.get(row.id)?.version || 0) !== expected) throw new Conflict();
      ensure(row.version === expected + 1, 'INVALID_VERSION');
      seen.add(row.id);
    }
    for (const { row } of changes) this.rows.set(row.id, structuredClone(row));
  }
}
