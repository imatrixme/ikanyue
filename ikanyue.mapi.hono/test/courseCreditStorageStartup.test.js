const test = require('node:test');
const assert = require('node:assert/strict');

const { CourseCreditError } = require('../src/services/courseCredits/domain');
const { verifyCourseCreditStorageAtStartup } = require('../src/services/courseCredits/storageStartup');

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
                        return { batch: { enabled: true, maxRequests: 3, timeout: 1, maxBodySize: 64 } };
                    },
                },
            };
        },
    };

    const settings = await verifyCourseCreditStorageAtStartup(client);

    assert.deepEqual(settings, { enabled: true, maxRequests: 3, timeout: 1, maxBodySize: 64 });
    assert.deepEqual(calls, ['ready', 'auth', 'client', ['settings', { requestKey: null }]]);
});

test('course-credit startup fails instead of serving with disabled or unavailable storage', async () => {
    const disabled = startupClient({ enabled: false });
    await assert.rejects(verifyCourseCreditStorageAtStartup(disabled), hasCode('POCKETBASE_BATCH_DISABLED'));

    const initializationError = new Error('PocketBase initialization failed');
    await assert.rejects(verifyCourseCreditStorageAtStartup({ ready: Promise.reject(initializationError) }), initializationError);
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
