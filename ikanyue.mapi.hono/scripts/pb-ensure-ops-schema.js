#!/usr/bin/env node

const dotenv = require('dotenv');
const { OPS_COLLECTION_SCHEMAS, validateOpsSchemas } = require('../src/services/ops/schema');

dotenv.config({ path: process.env.NODE_ENV === 'production' ? '.env.production' : '.env' });

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_EMAIL = 'ops-admin@ikanyue.local';
const DEFAULT_ADMIN_PASSWORD = 'admin1234';
const DEFAULT_ADMIN_CELLPHONE = '13900000000';
const DEFAULT_ADMIN_ID = 'opsadmin0000000';
const DEFAULT_ADMIN_TOKEN_KEY = 'ops_default_admin_token_key_000001';
const TEACHER_OPS_FIELDS = [
    { name: 'opsPasswordChangeRequired', type: 'bool', required: false },
    { name: 'lastPasswordChangedAt', type: 'date', required: false },
];

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

    let existing = await pb.collections.getFullList({ perPage: 500 });
    let byName = new Map(existing.map((item) => [item.name, item]));
    for (const schema of OPS_COLLECTION_SCHEMAS) {
        const current = byName.get(schema.name);
        const payload = normalizeCollectionPayload(schema, byName);
        if (current) {
            await pb.collections.update(current.id, payload);
            console.log(`updated ${schema.name}`);
        } else {
            const created = await pb.collections.create(payload);
            byName.set(schema.name, created);
            console.log(`created ${schema.name}`);
        }
        existing = await pb.collections.getFullList({ perPage: 500 });
        byName = new Map(existing.map((item) => [item.name, item]));
    }

    await ensureTeacherOpsFields(pb, byName);
    await ensureDefaultAdmin(pb);
}

function normalizeCollectionPayload(schema, byName) {
    return {
        ...schema,
        fields: schema.fields.map((field) => normalizeFieldPayload(field, byName)),
        indexes: [...schema.indexes],
    };
}

function normalizeFieldPayload(field, byName) {
    const payload = { ...field };
    if (payload.type === 'relation' && payload.collectionName && !payload.collectionId) {
        const collection = byName.get(payload.collectionName);
        if (!collection?.id) {
            throw new Error(`Missing related collection "${payload.collectionName}" for field "${payload.name}"`);
        }
        payload.collectionId = collection.id;
        delete payload.collectionName;
    }
    return payload;
}

async function ensureTeacherOpsFields(pb, byName) {
    const teachers = byName.get('teachers');
    if (!teachers?.id) {
        throw new Error('Missing teachers collection for default ops admin setup');
    }
    const fields = Array.isArray(teachers.fields) ? teachers.fields : [];
    let changed = false;
    for (const field of TEACHER_OPS_FIELDS) {
        if (!fields.some((item) => item.name === field.name)) {
            fields.push(field);
            changed = true;
        }
    }
    if (changed) {
        await pb.collections.update(teachers.id, { fields });
        console.log('updated teachers ops fields');
    }
}

async function ensureDefaultAdmin(pb) {
    const list = await pb.collection('teachers').getList(1, 1, {
        filter: `username="${DEFAULT_ADMIN_USERNAME}"`,
    });
    const payload = {
        username: DEFAULT_ADMIN_USERNAME,
        email: DEFAULT_ADMIN_EMAIL,
        emailVisibility: false,
        cellphone: DEFAULT_ADMIN_CELLPHONE,
        password: DEFAULT_ADMIN_PASSWORD,
        passwordConfirm: DEFAULT_ADMIN_PASSWORD,
        tokenKey: DEFAULT_ADMIN_TOKEN_KEY,
        nickName: '系统管理员',
        realname: '系统管理员',
        blocked: false,
        verified: true,
        idAdmin: true,
        isAdmin: true,
        opsPasswordChangeRequired: true,
    };
    if (list.items?.[0]) {
        const existing = list.items[0];
        const update = {
            username: DEFAULT_ADMIN_USERNAME,
            email: DEFAULT_ADMIN_EMAIL,
            emailVisibility: false,
            cellphone: DEFAULT_ADMIN_CELLPHONE,
            password: DEFAULT_ADMIN_PASSWORD,
            passwordConfirm: DEFAULT_ADMIN_PASSWORD,
            tokenKey: DEFAULT_ADMIN_TOKEN_KEY,
            nickName: '系统管理员',
            realname: '系统管理员',
            blocked: false,
            verified: true,
            idAdmin: true,
            isAdmin: true,
            opsPasswordChangeRequired: true,
        };
        await pb.collection('teachers').update(existing.id, update);
        console.log(`reset default admin ${DEFAULT_ADMIN_USERNAME}/${DEFAULT_ADMIN_PASSWORD}`);
        return;
    }
    await pb.collection('teachers').create({
        id: DEFAULT_ADMIN_ID,
        sn: DEFAULT_ADMIN_ID,
        idcard: DEFAULT_ADMIN_ID,
        ...payload,
    });
    console.log(`created default admin ${DEFAULT_ADMIN_USERNAME}`);
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
