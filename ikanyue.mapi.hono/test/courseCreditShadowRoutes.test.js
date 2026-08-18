const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');

const { responseMiddleware } = require('../src/middleware/response');
const courseCreditRoutes = require('../src/routes/courseCredits');
const { createCourseCreditHandlers } = require('../src/routes/courseCredits/handlers');
const { createRouteBuilder } = require('../src/utils/routeBuilder');
const { jwtAuth } = require('../src/utils/jwtAuth');

test('shadow preview requires combined academic and settlement scope', async () => {
    const calls = [];
    const app = createApp(calls);
    const operator = auth({
        id: 'operator', role: 'teacher',
        courseCreditCapabilities: ['course_credit.academic', 'course_credit.settlement'],
    });
    const allowed = await post(app, operator, { sessionIds: ['session'], expectations: [] });
    assert.equal(allowed.code, 10000);
    assert.deepEqual(calls[0], { sessionIds: ['session'], expectations: [] });

    const academicOnly = auth({
        id: 'academic', role: 'teacher', courseCreditCapabilities: ['course_credit.academic'],
    });
    const denied = await post(app, academicOnly, { sessionIds: ['session'], expectations: [] });
    assert.equal(denied.code, 403);
    assert.equal(denied.errorCode, 'COURSE_CREDIT_CAPABILITY_REQUIRED');
});

function createApp(calls) {
    const app = new Hono();
    app.use('*', responseMiddleware());
    const routes = createRouteBuilder(app);
    courseCreditRoutes(routes, createCourseCreditHandlers(async () => ({
        shadowService: { async run(input) { calls.push(input); return { status: 'passed', writeCount: 0 }; } },
    }), undefined, { async denied() {} }));
    routes.finalize();
    return app;
}

async function post(app, token, body) {
    return (await app.request('/ops/course-credits/shadow/preview', {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })).json();
}

function auth(user) { return jwtAuth.sign({ headers: {} }, user.id, user.id, user.role, false, user); }
