import type PocketBase from 'pocketbase';

export const collections = [
  { name: 'pay_entities', type: 'base', fields: [
    { name: 'kind', type: 'select', required: true, maxSelect: 1,
      values: ['payment', 'refund', 'event', 'provider', 'reconciliation', 'idempotency', 'wechat_mock', 'work', 'audit', 'statement', 'statement_line', 'settlement'] },
    { name: 'owner', type: 'text', required: true, max: 64 },
    { name: 'version', type: 'number', required: true, min: 1, onlyInt: true },
    { name: 'data', type: 'json', required: true, maxSize: 65536 },
    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
  ], indexes: ['CREATE INDEX idx_pay_entities_owner_kind ON pay_entities (owner, kind)'] },
  { name: 'pay_claims', type: 'base', fields: [
    { name: 'claimKey', type: 'text', required: true },
  ], indexes: ['CREATE UNIQUE INDEX idx_pay_claims_key ON pay_claims (claimKey)'] },
];

export async function bootstrap(pb: PocketBase) {
  const existing = await pb.collections.getFullList();
  for (const definition of collections) {
    const current = existing.find((collection) => collection.name === definition.name);
    if (!current) {
      await pb.collections.create({ ...definition, listRule: null, viewRule: null,
        createRule: null, updateRule: null, deleteRule: null });
    } else if (definition.name === 'pay_entities') {
      const kind = current.fields.find((field: { name: string }) => field.name === 'kind');
      if (!kind) throw new Error('PAY_SCHEMA_KIND_MISSING');
      const values = ['idempotency', 'wechat_mock', 'work', 'audit', 'statement', 'statement_line', 'settlement'];
      if (values.some((value) => !kind.values.includes(value))) {
        await pb.collections.update(current.id, { fields: current.fields.map((field: { name: string }) =>
          field.name === 'kind' ? { ...field, values: [...new Set([...kind.values, ...values])] } : field) });
      }
    }
  }
  await pb.settings.update({ batch: { enabled: true, maxRequests: 100, timeout: 10, maxBodySize: 1048576 } });
}

export async function verifySchema(pb: PocketBase, wechat = false) {
  const entities = await pb.collections.getOne('pay_entities');
  const kind = entities.fields.find((field: { name: string }) => field.name === 'kind');
  if (!kind?.values?.includes('idempotency')) throw new Error('PAY_SCHEMA_UPGRADE_REQUIRED');
  if (wechat && !kind.values.includes('wechat_mock')) throw new Error('PAY_WECHAT_SCHEMA_UPGRADE_REQUIRED');
  if (['work', 'audit', 'statement', 'statement_line', 'settlement'].some((value) => !kind.values.includes(value))) throw new Error('PAY_OPERATIONS_SCHEMA_UPGRADE_REQUIRED');
  await pb.collections.getOne('pay_claims');
  if (!(await pb.settings.getAll()).batch?.enabled) throw new Error('PAY_BATCH_REQUIRED');
}
