const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');
const { responseMiddleware } = require('../src/middleware/response');
const { createRouteBuilder } = require('../src/utils/routeBuilder');
const { jwtAuth } = require('../src/utils/jwtAuth');
const { registerCommerceRoutes } = require('../src/routes/commerce');
const { CourseCreditError } = require('../src/services/courseCredits/domain');

function app(env = {}, checkout = {}) {
    const instance = new Hono(); instance.use('*', responseMiddleware());
    const routes = createRouteBuilder(instance);
    registerCommerceRoutes(routes, async () => ({ checkout: {
        catalog: async () => [], recover: async () => ({}), gateway: { request: async () => ({ findings: [] }) },
        ...checkout,
    }, refunds: { recover: async () => ({}) } }), {
        COURSE_COMMERCE_ENABLED: 'true', NODE_ENV: 'test', PAY_MOCK_ENABLED: 'true', ...env,
    });
    routes.finalize(); return instance;
}
async function call(instance, path, user, body) {
    const token = user ? jwtAuth.sign({ headers: {} }, user.id, user.id, user.role, !!user.isAdmin, user) : '';
    const response = await instance.request(path, { method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (response.status === 404) return { code: 404 };
    return response.json();
}
const student = { id: 'student', role: 'student' };
test('commerce requires student authentication and forwards ownership from token', async () => {
    assert.equal((await call(app(), '/v1/student/commerce/catalog')).code, 403);
    assert.equal((await call(app(), '/v1/student/commerce/catalog', { id: 'teacher', role: 'teacher' })).code, 403);
    let received;
    const instance = app({}, { checkout: async (owner, input) => { received = { owner, input }; return { id: 'order' }; } });
    assert.equal((await call(instance, '/v1/student/commerce/orders', student, { studentId: 'other', key: 'key' })).code, 10000);
    assert.equal(received.owner, 'student');
    assert.equal((await call(instance, '/v1/student/commerce/orders', student, null)).code, 400);
});
test('finance and recovery reject ordinary teacher, student and forced-password-change accounts', async () => {
    const path = '/ops/commerce/recover';
    for (const user of [student, { id: 'teacher', role: 'teacher' }, { id: 'admin', role: 'teacher', isAdmin: true, passwordChangeRequired: true }]) {
        assert.equal((await call(app(), path, user, {})).code, 403);
    }
    for (const user of [{ id: 'admin', role: 'teacher', isAdmin: true },
        { id: 'finance', role: 'teacher', courseCreditCapabilities: ['course_credit.finance'] }]) {
        assert.equal((await call(app(), path, user, {})).code, 10000);
    }
});
test('feature-off and production remove routes; cross-student access is denied before mutation', async () => {
    assert.equal((await call(app({ COURSE_COMMERCE_ENABLED: 'false' }), '/v1/student/commerce/catalog', student)).code, 404);
    assert.equal((await call(app({ NODE_ENV: 'production' }), '/v1/student/commerce/orders/id/mock-pay', student, {})).code, 404);
    assert.equal((await call(app({ NODE_ENV: 'production' }), '/ops/commerce/refunds/id/mock-success', { id: 'admin', role: 'teacher', isAdmin: true }, {})).code, 404);
    let sync = false;
    const instance = app({}, { owned: async () => { throw new CourseCreditError('COMMERCE_ORDER_FORBIDDEN', '无权访问'); },
        sync: async () => { sync = true; } });
    assert.equal((await call(instance, '/v1/student/commerce/orders/other/refresh', student, {})).code, 403);
    assert.equal(sync, false);
});
