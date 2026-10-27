#!/usr/bin/env node

const { OPS_COLLECTION_SCHEMAS, validateOpsSchemas } = require('../src/services/ops/schema');

const result = validateOpsSchemas(OPS_COLLECTION_SCHEMAS);
if (!result.ok) {
    console.error(result.errors.join('\n'));
    process.exit(1);
}

console.log(`Ops schema ok: ${OPS_COLLECTION_SCHEMAS.length} collections`);
