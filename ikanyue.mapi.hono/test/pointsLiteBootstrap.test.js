const test = require('node:test');
const assert = require('node:assert/strict');

const {
    ensureBootstrapAdmin,
    ensureLocalCoreCollections,
} = require('../scripts/lib/points-lite-bootstrap');
const { assertLocalPocketBase } = require('../scripts/pb-seed-points-lite-local');

test('bootstrap admin is explicit, create-only, and never resets existing credentials', async () => {
    const calls = [];
    const existing = { id: 'existing_admin', username: 'admin' };
    const pb = {
        collection(name) {
            assert.equal(name, 'teachers');
            return {
                async getList() {
                    return { items: [existing] };
                },
                async create(payload) {
                    calls.push(payload);
                    return payload;
                },
            };
        },
    };

    const result = await ensureBootstrapAdmin(pb, {
        enabled: true,
        username: 'admin',
        email: 'local-admin@example.test',
        password: 'local-admin-password',
        cellphone: '13900000000',
    });

    assert.equal(result, existing);
    assert.equal(calls.length, 0);
});

test('bootstrap admin requires explicit credentials and creates a new local admin', async () => {
    const calls = [];
    const pb = {
        collection() {
            return {
                async getList() {
                    return { items: [] };
                },
                async create(payload) {
                    calls.push(payload);
                    return payload;
                },
            };
        },
    };

    await assert.rejects(
        ensureBootstrapAdmin(pb, { enabled: true }),
        /OPS_BOOTSTRAP_ADMIN_USERNAME/
    );
    await ensureBootstrapAdmin(pb, {
        enabled: true,
        username: 'admin',
        email: 'local-admin@example.test',
        password: 'local-admin-password',
        cellphone: '13900000000',
        passwordChangeRequired: false,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].password, 'local-admin-password');
    assert.equal(calls[0].isAdmin, true);
    assert.equal(calls[0].opsPasswordChangeRequired, false);
});

test('local core bootstrap creates missing student and teacher collections only when enabled', async () => {
    const records = [];
    const pb = {
        collections: {
            async getFullList() {
                return records;
            },
            async getScaffolds() {
                return {
                    base: { type: 'base', fields: [], indexes: [] },
                    auth: { type: 'auth', fields: [], indexes: [], passwordAuth: { enabled: false, identityFields: [] } },
                };
            },
            async create(payload) {
                const record = { ...payload, id: `collection_${records.length + 1}` };
                records.push(record);
                return record;
            },
        },
    };

    assert.equal((await ensureLocalCoreCollections(pb, false)).size, 0);
    const collections = await ensureLocalCoreCollections(pb, true);

    assert.equal(collections.has('students'), true);
    assert.equal(collections.has('teachers'), true);
    assert.deepEqual(collections.get('teachers').passwordAuth.identityFields, ['email']);
});

test('local seed guard rejects non-local PocketBase hosts', () => {
    assert.doesNotThrow(() => assertLocalPocketBase('http://127.0.0.1:8090'));
    assert.throws(() => assertLocalPocketBase('https://data.ikanyue.com'), /Refusing to seed non-local/);
});
