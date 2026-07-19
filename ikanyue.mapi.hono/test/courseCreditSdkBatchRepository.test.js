const test = require('node:test');
const assert = require('node:assert/strict');

const { CourseCreditError } = require('../src/services/courseCredits/domain');
const {
    assertBatchSettings,
    assertPocketBaseBatchCapability,
} = require('../src/services/courseCredits/pocketBaseCapabilities');
const {
    PocketBaseBatchRepository,
    assertBatchPlanPolicy,
    queueRequest,
    requestOptions,
} = require('../src/services/courseCredits/repositories/sdkBatchRepository');

test('PocketBase capability check requires the SDK and an enabled Batch API', async () => {
    const client = {
        createBatch() {},
        settings: { async getAll(options) {
            assert.equal(options.requestKey, null);
            return { batch: { enabled: true, maxRequests: 50, timeout: 5, maxBodySize: 0 } };
        } },
    };
    assert.deepEqual(await assertPocketBaseBatchCapability(client), {
        enabled: true, maxBodySize: 0, maxRequests: 50, timeout: 5,
    });
    await assert.rejects(assertPocketBaseBatchCapability({}), hasCode('POCKETBASE_BATCH_UNSUPPORTED'));
    await assert.rejects(assertPocketBaseBatchCapability({ createBatch() {} }), hasCode('POCKETBASE_SETTINGS_UNAVAILABLE'));
});

test('Batch settings only require enabled state and expose configured diagnostics', () => {
    assertCode(() => assertBatchSettings({ enabled: false, maxRequests: 50, timeout: 5, maxBodySize: 0 }), 'POCKETBASE_BATCH_DISABLED');
    assert.deepEqual(assertBatchSettings({ enabled: true, maxRequests: 1, timeout: 1, maxBodySize: 1 }), {
        enabled: true, maxBodySize: 1, maxRequests: 1, timeout: 1,
    });
});

test('SDK batch repository queues all supported actions and returns response bodies', async () => {
    const state = mockClient();
    const repository = new PocketBaseBatchRepository(state.client);
    const result = await repository.send([
        { action: 'create', collection: 'one', data: { id: 'created' } },
        { action: 'upsert', collection: 'two', data: { id: 'upserted' }, options: { query: { expand: 'x' } } },
        { action: 'update', collection: 'three', id: 'record', data: { value: 1 } },
        { action: 'delete', collection: 'four', id: 'record' },
    ]);
    assert.deepEqual(state.calls, [
        ['create', 'one', { id: 'created' }, { requestKey: null }],
        ['upsert', 'two', { id: 'upserted' }, { query: { expand: 'x' }, requestKey: null }],
        ['update', 'three', 'record', { value: 1 }, { requestKey: null }],
        ['delete', 'four', 'record', { requestKey: null }],
        ['send', { requestKey: null }],
    ]);
    assert.deepEqual(result, [{ id: 'first' }, { status: 204 }]);
});

test('SDK batch repository exposes storage reads and preserves infrastructure failures', async () => {
    const state = mockClient();
    const repository = new PocketBaseBatchRepository(state.client);
    assert.deepEqual(await repository.get('records', 'id', { expand: 'x' }), { id: 'id' });
    assert.deepEqual(await repository.list('records', { filter: 'x=1' }), [{ id: 'list' }]);
    assert.deepEqual(await repository.page('records', 2, 5, { sort: '-created' }), {
        page: 2, perPage: 5, items: [{ id: 'page' }],
    });
    assert.equal(await repository.findFirst('records', 'missing=true'), null);
    await assert.rejects(repository.findFirst('records', 'broken=true'), /broken/);
    assert.deepEqual(state.readOptions, [
        { expand: 'x', requestKey: null },
        { filter: 'x=1', requestKey: null },
        { sort: '-created', requestKey: null },
        { requestKey: null },
        { requestKey: null },
    ]);
});

test('SDK batch repository rejects malformed plans before send', async () => {
    const state = mockClient();
    const repository = new PocketBaseBatchRepository(state.client);
    await assert.rejects(repository.send([]), hasCode('EMPTY_BATCH_PLAN'));
    assertCode(() => queueRequest(state.batch, { action: 'read', collection: 'x' }), 'INVALID_BATCH_ACTION');
    assertCode(() => queueRequest(state.batch, { action: 'create', collection: '' }), 'INVALID_BATCH_COLLECTION');
    assertCode(() => queueRequest(state.batch, { action: 'update', collection: 'x', id: '' }), 'INVALID_BATCH_RECORD_ID');
    queueRequest(state.batch, { action: 'create', collection: 'x' });
    queueRequest(state.batch, { action: 'update', collection: 'x', id: 'record' });
    assert.deepEqual(requestOptions(), { requestKey: null });
});

test('Hono batch policy keeps ledger records append-only and protects versioned entities', () => {
    assertCode(() => assertBatchPlanPolicy([
        { action: 'update', collection: 'credit_events', id: 'event', data: {} },
    ]), 'APPEND_ONLY_COLLECTION_MUTATION');
    assertCode(() => assertBatchPlanPolicy([
        { action: 'upsert', collection: 'credit_batches', data: { id: 'batch', version: 2 } },
    ]), 'VERSIONED_ENTITY_UPSERT_FORBIDDEN');
    assertCode(() => assertBatchPlanPolicy([
        { action: 'delete', collection: 'sessions', id: 'session' },
    ]), 'VERSIONED_ENTITY_DELETE_FORBIDDEN');
    assertCode(() => assertBatchPlanPolicy([
        { action: 'delete', collection: 'conversion_rules', id: 'rule' },
    ]), 'VERSIONED_RECORD_MUTATION_FORBIDDEN');
    assertCode(() => assertBatchPlanPolicy([
        { action: 'upsert', collection: 'teacher_credit_rules', data: { id: 'rule' } },
    ]), 'VERSIONED_RECORD_MUTATION_FORBIDDEN');
    assertCode(() => assertBatchPlanPolicy([
        { action: 'update', collection: 'price_versions', id: 'price', data: { status: 'inactive' } },
    ]), 'VERSIONED_RECORD_MUTATION_FORBIDDEN');
    assertCode(() => assertBatchPlanPolicy([
        { action: 'update', collection: 'orders', id: 'order', data: { version: 1 } },
    ]), 'VERSION_INCREMENT_REQUIRED');
    assertCode(() => assertBatchPlanPolicy([
        { action: 'update', collection: 'session_students', id: 'student', data: { version: 2 } },
    ]), 'VERSION_CLAIM_REQUIRED');
    assert.doesNotThrow(() => assertBatchPlanPolicy([
        { action: 'create', collection: 'credit_batches', data: { id: 'batch', version: 1 } },
        { action: 'create', collection: 'credit_version_claims', data: {
            entityType: 'session_student', entityId: 'student', expectedVersion: 1,
        } },
        { action: 'update', collection: 'session_students', id: 'student', data: { version: 2 } },
    ]));
});

function mockClient() {
    const calls = [];
    const readOptions = [];
    const collection = (name) => ({
        create(data, options) { calls.push(['create', name, data, options]); },
        upsert(data, options) { calls.push(['upsert', name, data, options]); },
        update(id, data, options) { calls.push(['update', name, id, data, options]); },
        delete(id, options) { calls.push(['delete', name, id, options]); },
    });
    const batch = {
        collection,
        async send(options) {
            calls.push(['send', options]);
            return [{ status: 200, body: { id: 'first' } }, { status: 204 }];
        },
    };
    const client = {
        createBatch() { return batch; },
        collection() {
            return {
                async getOne(id, options) { readOptions.push(options); return { id }; },
                async getFullList(options) { readOptions.push(options); return [{ id: 'list' }]; },
                async getList(page, perPage, options) {
                    readOptions.push(options);
                    return { page, perPage, items: [{ id: 'page' }] };
                },
                async getFirstListItem(filter, options) {
                    readOptions.push(options);
                    if (filter === 'missing=true') throw { status: 404 };
                    if (filter === 'broken=true') throw new Error('broken');
                    return { id: 'first' };
                },
            };
        },
    };
    return { batch, calls, client, readOptions };
}

function assertCode(action, code) {
    assert.throws(action, hasCode(code));
}

function hasCode(code) {
    return (error) => error instanceof CourseCreditError && error.code === code;
}
