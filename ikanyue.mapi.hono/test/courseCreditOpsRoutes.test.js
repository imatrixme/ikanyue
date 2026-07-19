const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');

const { responseMiddleware } = require('../src/middleware/response');
const courseCreditRoutes = require('../src/routes/courseCredits');
const { createCourseCreditHandlers } = require('../src/routes/courseCredits/handlers');
const { CourseCreditMetrics } = require('../src/services/courseCredits/metricsService');
const { createRouteBuilder } = require('../src/utils/routeBuilder');
const { jwtAuth } = require('../src/utils/jwtAuth');

test('scoped operators can read every Admin workspace through structured APIs', async () => {
    const calls = [];
    const app = createApp(calls);
    const authorization = auth({
        id: 'operator', role: 'teacher', courseCreditCapabilities: [
            'course_credit.finance', 'course_credit.academic', 'course_credit.settlement',
            'course_credit.teacher', 'course_credit.audit',
        ],
    });

    await get(app, '/ops/course-credits/catalog/course-specs?page=2&status=active', authorization);
    await get(app, '/ops/course-credits/packages/package', authorization);
    await get(app, '/ops/course-credits/accounts?page=1&perPage=10', authorization);
    await get(app, '/ops/course-credits/accounts/student', authorization);
    await get(app, '/ops/course-credits/classes', authorization);
    await get(app, '/ops/course-credits/settlement-exceptions', authorization);
    await get(app, '/ops/course-credits/teacher-events', authorization);
    await get(app, '/ops/course-credits/reconciliation/runs', authorization);

    assert.deepEqual(calls, [
        ['list', 'courseSpecs', { page: '2', status: 'active' }],
        ['get', 'packages', 'package'],
        ['accounts', { page: '1', perPage: '10' }],
        ['account', 'student'],
        ['list', 'classes', {}],
        ['list', 'settlementExceptions', {}],
        ['list', 'teacherEvents', {}],
        ['list', 'reconciliationRuns', {}],
    ]);
});

test('Admin workspace capabilities prevent cross-scope financial and teacher access', async () => {
    const calls = [];
    const app = createApp(calls);
    const academic = auth({
        id: 'academic', role: 'teacher', courseCreditCapabilities: ['course_credit.academic'],
    });

    assert.equal((await get(app, '/ops/course-credits/classes', academic)).code, 10000);
    const order = await get(app, '/ops/course-credits/orders', academic);
    const teacherEvent = await get(app, '/ops/course-credits/teacher-events', academic);

    assert.equal(order.code, 403);
    assert.equal(order.errorCode, 'COURSE_CREDIT_CAPABILITY_REQUIRED');
    assert.equal(teacherEvent.code, 403);
    assert.deepEqual(calls, [['list', 'classes', {}]]);
});

function createApp(calls) {
    const serviceSet = {
        opsQueryService: {
            async listResource(resource, query) { calls.push(['list', resource, query]); return { items: [] }; },
            async getResource(resource, id) { calls.push(['get', resource, id]); return { id }; },
            async listAccounts(query) { calls.push(['accounts', query]); return { items: [] }; },
            async getAccount(studentId) { calls.push(['account', studentId]); return { studentId }; },
        },
    };
    const app = new Hono();
    app.use('*', responseMiddleware());
    const routes = createRouteBuilder(app);
    courseCreditRoutes(routes, createCourseCreditHandlers(
        async () => serviceSet,
        new CourseCreditMetrics(),
        { async denied() {} }
    ));
    routes.finalize();
    return app;
}

async function get(app, path, authorization) {
    const response = await app.request(path, { headers: { authorization } });
    return response.json();
}

function auth(user) {
    return `Bearer ${jwtAuth.sign(
        { headers: {} }, user.id, user.id, user.role, Boolean(user.isAdmin), user
    )}`;
}
