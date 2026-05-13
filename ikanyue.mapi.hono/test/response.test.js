const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');

const { responseMiddleware } = require('../src/middleware/response');

test('response middleware formats data, success, and error payloads', async () => {
    const app = new Hono();
    app.use('*', responseMiddleware());
    app.get('/data', (c) => c.data({ id: 'record_1' }, 'ok'));
    app.get('/success', (c) => c.success());
    app.get('/error', (c) => c.error('403', 'forbidden'));
    app.get('/default-error', (c) => c.error(null));

    const dataPayload = await (await app.request('/data')).json();
    assert.deepEqual(dataPayload, {
        code: 10000,
        message: 'ok',
        data: { id: 'record_1' },
    });

    const successPayload = await (await app.request('/success')).json();
    assert.deepEqual(successPayload, {
        code: 10000,
        message: null,
        data: null,
    });

    const errorResponse = await app.request('/error');
    assert.equal(errorResponse.status, 200);
    assert.deepEqual(await errorResponse.json(), {
        code: 403,
        message: 'forbidden',
        data: null,
    });

    assert.deepEqual(await (await app.request('/default-error')).json(), {
        code: 400,
        message: '',
        data: null,
    });
});
