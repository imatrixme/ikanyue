const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');

const { responseMiddleware } = require('../src/middleware/response');
const courseCreditRoutes = require('../src/routes/courseCredits');
const { createCourseCreditHandlers } = require('../src/routes/courseCredits/handlers');
const { createCourseCreditFeatureGate } = require('../src/services/courseCredits/featureFlags');
const { createRouteBuilder } = require('../src/utils/routeBuilder');
const { jwtAuth } = require('../src/utils/jwtAuth');

test('migration inventory, preview, and apply require combined academic and finance scope', async () => {
    const calls = [];
    const app = createApp(calls, enabledGate());
    const operator = auth({
        id: 'operator', role: 'teacher',
        courseCreditCapabilities: ['course_credit.finance', 'course_credit.academic'],
    });
    assert.equal((await get(app, '/ops/course-credits/migration/inventory', operator)).code, 10000);
    assert.equal((await post(app, '/ops/course-credits/migration/preview', operator, { plan: {} })).code, 10000);
    const applied = await post(app, '/ops/course-credits/migration/apply', operator, {
        plan: {}, previewHash: 'hash',
    });
    assert.equal(applied.code, 10000);
    assert.deepEqual(calls.map((item) => item[0]), ['inventory', 'preview', 'apply']);
    assert.equal(calls[2][1].actorId, 'operator');
    assert.equal(calls[2][1].actorRole, 'teacher');
    assert.equal(calls[2][1].idempotencyKey, 'migration-key');

    const financeOnly = auth({
        id: 'finance', role: 'teacher', courseCreditCapabilities: ['course_credit.finance'],
    });
    const denied = await get(app, '/ops/course-credits/migration/inventory', financeOnly);
    assert.equal(denied.code, 403);
    assert.equal(denied.errorCode, 'COURSE_CREDIT_CAPABILITY_REQUIRED');
});

test('production migration apply stays closed until its dedicated flag is enabled', async () => {
    const calls = [];
    const app = createApp(calls, createCourseCreditFeatureGate({ NODE_ENV: 'production' }));
    const operator = auth({
        id: 'operator', role: 'teacher',
        courseCreditCapabilities: ['course_credit.finance', 'course_credit.academic'],
    });
    const inventory = await get(app, '/ops/course-credits/migration/inventory', operator);
    const applied = await post(app, '/ops/course-credits/migration/apply', operator, {
        plan: {}, previewHash: 'hash',
    });
    assert.equal(inventory.code, 10000);
    assert.equal(applied.errorCode, 'COURSE_CREDIT_FEATURE_DISABLED');
    assert.deepEqual(calls.map((item) => item[0]), ['inventory']);
});

function createApp(calls, featureGate) {
    const serviceSet = {
        migrationService: {
            async inventory() { calls.push(['inventory']); return { totals: {} }; },
            async preview(input) { calls.push(['preview', input]); return { previewHash: 'hash', ready: true }; },
            async apply(input) { calls.push(['apply', input]); return { operationId: 'operation' }; },
        },
    };
    const app = new Hono();
    app.use('*', responseMiddleware());
    const routes = createRouteBuilder(app);
    courseCreditRoutes(routes, createCourseCreditHandlers(
        async () => serviceSet, undefined, { async denied() {} }, featureGate
    ));
    routes.finalize();
    return app;
}

function enabledGate() {
    return createCourseCreditFeatureGate({
        NODE_ENV: 'production', COURSE_CREDIT_MIGRATION_ENABLED: 'true',
    });
}

async function get(app, path, token) {
    return (await app.request(path, { headers: { authorization: `Bearer ${token}` } })).json();
}

async function post(app, path, token, body) {
    return (await app.request(path, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            'idempotency-key': 'migration-key',
        },
        body: JSON.stringify(body),
    })).json();
}

function auth(user) {
    return jwtAuth.sign({ headers: {} }, user.id, user.id, user.role, Boolean(user.isAdmin), user);
}
