const test = require('node:test');
const assert = require('node:assert/strict');

const {
    REQUIRED_COLLECTIONS,
    assertLoopbackPocketBase,
    main,
    requiredEnv,
    verifyCourseCreditPocketBase,
} = require('../scripts/verify-course-credit-pocketbase');

test('PocketBase verifier accepts loopback hosts and rejects remote hosts', () => {
    for (const url of ['http://127.0.0.1:18091', 'http://localhost:8090', 'http://[::1]:8090']) {
        assert.doesNotThrow(() => assertLoopbackPocketBase(url));
    }
    assert.throws(() => assertLoopbackPocketBase('https://data.ikanyue.com'), /Refusing to mutate non-loopback/);
});

test('PocketBase verifier requires explicit environment values', () => {
    assert.throws(() => requiredEnv('MISSING', {}), /MISSING is required/);
    assert.equal(requiredEnv('VALUE', { VALUE: 'present' }), 'present');
});

test('PocketBase verifier authenticates and proves SDK batch commit and rollback', async () => {
    const state = mockPocketBase();
    const logs = [];
    const result = await main({
        env: { PB_URL: 'http://127.0.0.1:18091', PB_EMAIL: 'local@example.test', PB_PASSWORD: 'password' },
        pb: state.pb,
        now: () => 12345,
        log: (message) => logs.push(message),
    });
    assert.equal(state.authCalls, 1);
    assert.equal(result.collectionsVerified, REQUIRED_COLLECTIONS.length);
    assert.equal(result.sdkBatchRollback, true);
    assert.equal(result.sdkBatchCommit, true);
    assert.deepEqual(JSON.parse(logs[0]), result);
    assert.deepEqual(state.deleted, [['outbox_events', 'outbox'], ['reconciliation_runs', 'reconciliation']]);
});

test('PocketBase verifier can construct the SDK client through an injected loader', async () => {
    const state = mockPocketBase();
    class PocketBaseMock {
        constructor(url) {
            assert.equal(url, 'http://127.0.0.1:18091');
            return state.pb;
        }
    }
    const result = await main({
        env: { PB_EMAIL: 'local@example.test', PB_PASSWORD: 'password' },
        loadPocketBase: async () => ({ default: PocketBaseMock }),
        now: () => 12345,
        log: () => {},
    });
    assert.equal(result.sdkBatchRollback, true);
});

test('PocketBase verifier rejects migration and batch capability failures', async () => {
    await assert.rejects(verify({ missingCollection: 'orders' }), /Missing migrated collection orders/);
    await assert.rejects(verify({ defaultRelation: false }), /defaultCreditTypeId relation was not migrated/);
    await assert.rejects(verify({ batchEnabled: false }), (error) => error.code === 'POCKETBASE_BATCH_DISABLED');
    await assert.rejects(verify({ rollbackRejects: false }), /did not reject/);
    await assert.rejects(verify({ residue: 1 }), /left reconciliation records behind/);
    await assert.rejects(verify({ successBodies: [{}] }), /incomplete result/);
    await assert.rejects(verify({ rollbackStatus: 500 }), /batch failed/);
});

function verify(options = {}) {
    return verifyCourseCreditPocketBase({ pb: mockPocketBase(options).pb, now: () => 12345 });
}

function mockPocketBase(options = {}) {
    const state = { authCalls: 0, batchCount: 0, deleted: [] };
    const collections = REQUIRED_COLLECTIONS
        .filter((name) => name !== options.missingCollection)
        .map((name) => ({
            name,
            fields: name === 'course_specs' && options.defaultRelation !== false
                ? [{ name: 'defaultCreditTypeId', collectionId: 'credit-types' }]
                : [],
        }));
    const pb = {
        collections: { async getFullList() { return collections; } },
        settings: { async getAll() {
            return { batch: { enabled: options.batchEnabled !== false, maxRequests: 50, timeout: 5, maxBodySize: 0 } };
        } },
        createBatch() {
            state.batchCount += 1;
            const number = state.batchCount;
            return {
                collection() { return { create() {} }; },
                async send() {
                    if (number === 1) {
                        if (options.rollbackRejects === false) return [];
                        const error = new Error('batch failed');
                        error.status = options.rollbackStatus || 400;
                        throw error;
                    }
                    return options.successBodies || [
                        { body: { id: 'reconciliation' } },
                        { body: { id: 'outbox' } },
                    ];
                },
            };
        },
        collection(name) {
            if (name === '_superusers') return { async authWithPassword() { state.authCalls += 1; } };
            if (name === 'reconciliation_runs') {
                return {
                    async getList() { return { totalItems: options.residue || 0 }; },
                    async delete(id) { state.deleted.push([name, id]); },
                };
            }
            if (name === 'outbox_events') return { async delete(id) { state.deleted.push([name, id]); } };
            throw new Error(`Unexpected collection ${name}`);
        },
    };
    state.pb = pb;
    return state;
}
