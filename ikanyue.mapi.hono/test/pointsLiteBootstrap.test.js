const test = require('node:test');
const assert = require('node:assert/strict');

const {
    LOCAL_CORE_COLLECTIONS,
    ensureBootstrapAdmin,
    ensureLocalCoreCollections,
} = require('../scripts/lib/points-lite-bootstrap');
const { assertLocalPocketBase, createLocalActivities } = require('../scripts/pb-seed-points-lite-local');

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

test('local core bootstrap creates the release collections only when enabled', async () => {
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
    assert.equal(collections.has('activities'), true);
    assert.deepEqual(collections.get('teachers').passwordAuth.identityFields, ['email']);
    const studentDefinition = LOCAL_CORE_COLLECTIONS.find((collection) => collection.name === 'students');
    assert.ok(studentDefinition.fields.some((field) => field.name === 'age'));
    assert.ok(studentDefinition.fields.some((field) => field.name === 'province'));
    const activityDefinition = LOCAL_CORE_COLLECTIONS.find((collection) => collection.name === 'activities');
    assert.equal(activityDefinition.fields.find((field) => field.name === 'images').maxSelect, 10);
});

test('local activity fixture remains visible in the restored seven-day activity window', () => {
    const baseDate = new Date('2026-07-13T12:00:00+08:00');
    const [activity] = createLocalActivities(baseDate);

    assert.equal(activity.status, 'active');
    assert.equal(activity.title, '声乐体验与声音评估');
    assert.equal(activity.tags, '声乐,体验');
    assert.equal(activity.startTime, '2026-07-14T02:00:00.000Z');
    assert.match(activity.description, /基础声音评估、呼吸与共鸣练习/);
    assert.doesNotMatch(activity.description, /本地|联调|样例/);
});

test('local seed guard rejects non-local PocketBase hosts', () => {
    assert.doesNotThrow(() => assertLocalPocketBase('http://127.0.0.1:8090'));
    assert.throws(() => assertLocalPocketBase('https://data.ikanyue.com'), /Refusing to seed non-local/);
});
