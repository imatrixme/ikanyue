const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');

test('Node server starts only after the course-credit storage check succeeds', async () => {
    const calls = [];
    const server = { close() {} };
    const result = await app.startServer({
        async verifyStorage() { calls.push('storage'); },
        serve(options, callback) {
            calls.push(['serve', options.hostname, options.port, typeof options.fetch]);
            callback({ port: options.port });
            return server;
        },
        bunRuntime: null,
    });
    assert.equal(result, server);
    assert.deepEqual(calls, [
        'storage',
        ['serve', process.env.HOST || '127.0.0.1', process.env.PORT || 1337, 'function'],
    ]);
});

test('storage failure prevents both Node and Bun server startup', async () => {
    const failure = new Error('Batch API disabled');
    let started = false;
    await assert.rejects(app.startServer({
        async verifyStorage() { throw failure; },
        serve() { started = true; },
        bunRuntime: null,
    }), failure);
    assert.equal(started, false);
});

test('Bun runtime uses the same preflight before creating its server', async () => {
    const calls = [];
    const server = { port: 1444 };
    const result = await app.startServer({
        async verifyStorage() { calls.push('storage'); },
        bunRuntime: {
            serve(options) {
                calls.push(['serve', typeof options.fetch]);
                return server;
            },
        },
    });
    assert.equal(result, server);
    assert.deepEqual(calls, ['storage', ['serve', 'function']]);
});
