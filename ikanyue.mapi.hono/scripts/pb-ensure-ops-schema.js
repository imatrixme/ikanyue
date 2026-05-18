#!/usr/bin/env node

const dotenv = require('dotenv');
const { OPS_COLLECTION_SCHEMAS, validateOpsSchemas } = require('../src/services/ops/schema');

dotenv.config({ path: process.env.NODE_ENV === 'production' ? '.env.production' : '.env' });

async function main() {
    const check = validateOpsSchemas();
    if (!check.ok) {
        throw new Error(check.errors.join('\n'));
    }

    const url = process.env.PB_URL || 'http://127.0.0.1:8090';
    const email = process.env.PB_EMAIL;
    const password = process.env.PB_PASSWORD;
    if (!email || !password) {
        throw new Error('PB_EMAIL and PB_PASSWORD are required to apply ops schema');
    }

    const PocketBase = await import('pocketbase');
    const pb = new PocketBase.default(url);
    await pb.collection('_superusers').authWithPassword(email, password);

    const existing = await pb.collections.getFullList({ perPage: 500 });
    const byName = new Map(existing.map((item) => [item.name, item]));
    for (const schema of OPS_COLLECTION_SCHEMAS) {
        const current = byName.get(schema.name);
        const payload = normalizeCollectionPayload(schema);
        if (current) {
            await pb.collections.update(current.id, payload);
            console.log(`updated ${schema.name}`);
        } else {
            await pb.collections.create(payload);
            console.log(`created ${schema.name}`);
        }
    }
}

function normalizeCollectionPayload(schema) {
    return {
        ...schema,
        fields: schema.fields.map((field) => ({ ...field })),
        indexes: [...schema.indexes],
    };
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
