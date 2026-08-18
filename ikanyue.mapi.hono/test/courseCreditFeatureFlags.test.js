const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');

const { responseMiddleware } = require('../src/middleware/response');
const courseCreditRoutes = require('../src/routes/courseCredits');
const { createCourseCreditHandlers } = require('../src/routes/courseCredits/handlers');
const {
    COURSE_CREDIT_FEATURES: FEATURE,
    createCourseCreditFeatureGate,
    readFeatureSwitch,
} = require('../src/services/courseCredits/featureFlags');
const { createRouteBuilder } = require('../src/utils/routeBuilder');
const { jwtAuth } = require('../src/utils/jwtAuth');

test('feature switches default on outside production and off in production', () => {
    assert.equal(createCourseCreditFeatureGate({ NODE_ENV: 'test' }).enabled.grants, true);
    const production = createCourseCreditFeatureGate({ NODE_ENV: 'production' });
    assert.deepEqual(production.enabled, {
        grants: false,
        reservation: false,
        settlement: false,
        explicitConversion: false,
        implicitConversion: false,
        migration: false,
    });
    assert.equal(readFeatureSwitch(' yes ', false), true);
    assert.equal(readFeatureSwitch('OFF', true), false);
    assert.equal(readFeatureSwitch('', true), true);
});

test('feature gate rejects disabled and unknown features with stable business codes', () => {
    const gate = createCourseCreditFeatureGate({ NODE_ENV: 'production' });
    assert.throws(() => gate.require(FEATURE.GRANTS), hasCode('COURSE_CREDIT_FEATURE_DISABLED'));
    assert.throws(() => gate.require('unknown'), hasCode('COURSE_CREDIT_FEATURE_UNKNOWN'));
});

test('disabled production features block write routes before services are loaded', async () => {
    let loaded = 0;
    const app = createApp(async () => {
        loaded += 1;
        return {};
    }, createCourseCreditFeatureGate({ NODE_ENV: 'production' }));
    const finance = auth({
        id: 'finance', role: 'teacher', courseCreditCapabilities: ['course_credit.finance'],
    });
    const settlement = auth({
        id: 'settlement', role: 'teacher', courseCreditCapabilities: ['course_credit.settlement'],
    });
    const student = auth({ id: 'student', role: 'student' });
    const requests = [
        ['/ops/course-credits/orders/order/grant', finance],
        ['/ops/course-credits/sessions/session/settle', settlement],
        ['/v1/course-credits/session-students/session-student/reserve', student],
        ['/v1/course-credits/conversions/preview', student, {}],
        ['/v1/course-credits/conversions', student, {}],
        ['/v1/course-credits/conversion-authorizations', student, {}],
        ['/v1/teacher/appointments/appointment/confirm', auth({
            id: 'teacher', role: 'teacher', courseCreditCapabilities: ['course_credit.teacher'],
        })],
        ['/ops/course-bookings/appointments/appointment/confirm', auth({
            id: 'operator', role: 'teacher', courseCreditCapabilities: ['course_credit.academic'],
        })],
    ];
    for (const [path, authorization, body] of requests) {
        const payload = await post(app, path, authorization, body);
        assert.equal(payload.errorCode, 'COURSE_CREDIT_FEATURE_DISABLED', path);
    }
    assert.equal(loaded, 0);
});

test('implicit conversion requires its own flag after reservation is enabled', async () => {
    let loaded = 0;
    const gate = createCourseCreditFeatureGate({
        NODE_ENV: 'production', COURSE_CREDIT_RESERVATION_ENABLED: 'true',
    });
    const app = createApp(async () => {
        loaded += 1;
        return {};
    }, gate);
    const payload = await post(
        app,
        '/v1/course-credits/session-students/session-student/reserve',
        auth({ id: 'student', role: 'student' }),
        { authorizationId: 'authorization' }
    );
    assert.equal(payload.errorCode, 'COURSE_CREDIT_FEATURE_DISABLED');
    assert.equal(payload.details.feature, FEATURE.IMPLICIT_CONVERSION);
    assert.equal(loaded, 0);
});

function createApp(loadServices, featureGate) {
    const app = new Hono();
    app.use('*', responseMiddleware());
    const routes = createRouteBuilder(app);
    courseCreditRoutes(routes, createCourseCreditHandlers(
        loadServices, undefined, { async denied() {} }, featureGate
    ));
    routes.finalize();
    return app;
}

async function post(app, path, authorization, body) {
    const response = await app.request(path, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${authorization}`,
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return response.json();
}

function auth(user) {
    return jwtAuth.sign({ headers: {} }, user.id, user.id, user.role, Boolean(user.isAdmin), user);
}

function hasCode(code) {
    return (error) => error.code === code;
}
