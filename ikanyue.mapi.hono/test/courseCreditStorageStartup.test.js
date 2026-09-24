const test = require('node:test');
const assert = require('node:assert/strict');

const { CourseCreditError } = require('../src/services/courseCredits/domain');
const {
    REQUIRED_STORAGE_COLLECTIONS,
    assertRequiredStorageCollections,
    verifyCourseCreditStorageAtStartup,
} = require('../src/services/courseCredits/storageStartup');

test('course-credit startup waits for PocketBase auth and requires enabled Batch API', async () => {
    const calls = [];
    const client = {
        ready: Promise.resolve().then(() => calls.push('ready')),
        async ensureAuth() { calls.push('auth'); },
        getClient() {
            calls.push('client');
            return {
                createBatch() {},
                settings: {
                    async getAll(options) {
                        calls.push(['settings', options]);
                        return { batch: { enabled: true, maxRequests: 1000, timeout: 1, maxBodySize: 64 } };
                    },
                },
                collections: {
                    async getFullList(options) {
                        calls.push(['collections', options]);
                        return REQUIRED_STORAGE_COLLECTIONS.map((name) => ({ name }));
                    },
                },
            };
        },
    };

    const settings = await verifyCourseCreditStorageAtStartup(client);

    assert.deepEqual(settings, { enabled: true, maxRequests: 1000, timeout: 1, maxBodySize: 64 });
    assert.deepEqual(calls, [
        'ready',
        'auth',
        'client',
        ['settings', { requestKey: null }],
        ['collections', { requestKey: null }],
    ]);
});

test('course-credit startup fails instead of serving with disabled or unavailable storage', async () => {
    const disabled = startupClient({ enabled: false });
    await assert.rejects(verifyCourseCreditStorageAtStartup(disabled), hasCode('POCKETBASE_BATCH_DISABLED'));
    const small = startupClient({ enabled: true, maxRequests: 100, timeout: 10, maxBodySize: 0 });
    await assert.rejects(verifyCourseCreditStorageAtStartup(small), hasCode('POCKETBASE_BATCH_CAPACITY_LOW'));

    const initializationError = new Error('PocketBase initialization failed');
    await assert.rejects(verifyCourseCreditStorageAtStartup({ ready: Promise.reject(initializationError) }), initializationError);
});

test('course-credit startup reports every missing business collection', async () => {
    const existing = REQUIRED_STORAGE_COLLECTIONS.filter((name) => !['reward_items', 'student_points'].includes(name));

    await assert.rejects(
        assertRequiredStorageCollections({
            collections: { async getFullList() { return existing.map((name) => ({ name })); } },
        }),
        (error) => error instanceof CourseCreditError
            && error.code === 'POCKETBASE_COLLECTIONS_MISSING'
            && error.details.missing.join(',') === 'reward_items,student_points'
    );
});

test('course-credit startup rejects a client without the collection administration API', async () => {
    await assert.rejects(
        assertRequiredStorageCollections({}),
        hasCode('POCKETBASE_COLLECTIONS_UNAVAILABLE')
    );
});

function startupClient(batch) {
    return {
        ready: Promise.resolve(),
        async ensureAuth() {},
        getClient() {
            return {
                createBatch() {},
                settings: { async getAll() { return { batch }; } },
            };
        },
    };
}

function hasCode(code) {
    return (error) => error instanceof CourseCreditError && error.code === code;
}
