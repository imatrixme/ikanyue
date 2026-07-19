const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');

const { responseMiddleware } = require('../src/middleware/response');
const courseCreditRoutes = require('../src/routes/courseCredits');
const { createCourseCreditHandlers } = require('../src/routes/courseCredits/handlers');
const { CourseCreditMetrics } = require('../src/services/courseCredits/metricsService');
const { createRouteBuilder } = require('../src/utils/routeBuilder');
const { jwtAuth } = require('../src/utils/jwtAuth');

test('student query routes derive ownership from auth and forward bounded filters', async () => {
    const calls = [];
    const app = createApp(services(calls));
    const authorization = `Bearer ${token({ id: 'student-1', role: 'student' })}`;

    await get(app, '/v1/course-credits/summary', authorization);
    await get(app, '/v1/course-credits/batches?page=2&perPage=10&status=active&creditTypeId=course', authorization);
    await get(app, '/v1/course-credits/batches/batch-1', authorization);
    await get(app, '/v1/course-credits/events?page=3&eventType=CONSUME', authorization);
    await get(app, '/v1/course-credits/conversion-rules', authorization);
    await get(app, '/v1/course-credits/sessions?perPage=5', authorization);

    assert.deepEqual(calls.slice(0, 6), [
        ['summary', 'student-1'],
        ['batches', 'student-1', { page: '2', perPage: '10', status: 'active', creditTypeId: 'course' }],
        ['batch', 'student-1', 'batch-1'],
        ['events', 'student-1', { page: '3', eventType: 'CONSUME' }],
        ['rules'],
        ['sessions', 'student-1', { perPage: '5' }],
    ]);
});

test('student conversion preview and command ignore submitted student identity', async () => {
    const calls = [];
    const metrics = new CourseCreditMetrics();
    const app = createApp(services(calls), metrics);
    const headers = {
        authorization: `Bearer ${token({ id: 'student-1', role: 'student' })}`,
        'content-type': 'application/json',
        'x-trace-id': 'trace-conversion',
    };
    const body = {
        studentId: 'student-2', ruleId: 'rule', sourceQuantity: 300,
        previewAt: '2026-07-17T10:00:00Z', previewHash: 'hash', targetTermEnd: '2026-12-31T00:00:00Z',
    };

    const preview = await post(app, '/v1/course-credits/conversions/preview', headers, body);
    const converted = await post(app, '/v1/course-credits/conversions', {
        ...headers, 'idempotency-key': 'convert-key',
    }, body);
    const authorization = await post(app, '/v1/course-credits/conversion-authorizations', {
        ...headers, 'idempotency-key': 'authorization-key',
    }, { ...body, validTo: '2026-07-20T10:00:00Z' });

    assert.equal(preview.code, 10000);
    assert.equal(converted.data.operationId, 'conversion-operation');
    assert.equal(converted.data.traceId, 'trace-conversion');
    assert.equal(authorization.data.authorizationId, 'authorization');
    assert.deepEqual(calls[0][1], {
        actorId: 'student-1', actorRole: 'student', authorizationId: undefined,
        previewAt: body.previewAt, previewHash: body.previewHash, ruleId: 'rule', sourceQuantity: 300,
        studentId: 'student-1', targetTermEnd: body.targetTermEnd, traceId: 'trace-conversion',
    });
    assert.equal(calls[1][1].studentId, 'student-1');
    assert.equal(calls[1][1].idempotencyKey, 'convert-key');
    assert.deepEqual(calls[2][1], {
        consentSource: 'explicit_preview',
        idempotencyKey: 'authorization-key',
        previewAt: body.previewAt,
        previewHash: body.previewHash,
        ruleId: 'rule',
        sourceQuantity: 300,
        studentId: 'student-1',
        targetTermEnd: body.targetTermEnd,
        validTo: '2026-07-20T10:00:00Z',
    });
    assert.equal(metrics.snapshot().commands.convertCredits.success, 1);
    assert.equal(metrics.snapshot().commands.authorizeAutomaticConversion.success, 1);
});

test('student query routes reject teachers before loading services', async () => {
    let loaded = false;
    const app = createApp(null, new CourseCreditMetrics(), async () => {
        loaded = true;
        return null;
    });
    const payload = await get(
        app,
        '/v1/course-credits/summary',
        `Bearer ${token({ id: 'teacher-1', role: 'teacher' })}`
    );

    assert.equal(payload.code, 403);
    assert.equal(payload.errorCode, 'COURSE_CREDIT_STUDENT_REQUIRED');
    assert.equal(loaded, false);
});

function services(calls) {
    return {
        queryService: {
            async summary(studentId) { calls.push(['summary', studentId]); return { items: [] }; },
            async listBatches(studentId, query) { calls.push(['batches', studentId, query]); return { items: [] }; },
            async getBatch(studentId, batchId) { calls.push(['batch', studentId, batchId]); return { id: batchId }; },
            async listEvents(studentId, query) { calls.push(['events', studentId, query]); return { items: [] }; },
            async listConversionRules() { calls.push(['rules']); return []; },
            async listSessions(studentId, query) { calls.push(['sessions', studentId, query]); return { items: [] }; },
        },
        conversionService: {
            async previewConversion(input) { calls.push(['preview', input]); return { previewHash: 'hash' }; },
            async convertCredits(input) { calls.push(['convert', input]); return { operationId: 'conversion-operation' }; },
            async authorizeAutomaticConversion(input) {
                calls.push(['authorize', input]);
                return { authorizationId: 'authorization' };
            },
        },
    };
}

function createApp(serviceSet, metrics = new CourseCreditMetrics(), loadServices = async () => serviceSet) {
    const app = new Hono();
    app.use('*', responseMiddleware());
    const routes = createRouteBuilder(app);
    courseCreditRoutes(routes, createCourseCreditHandlers(loadServices, metrics, { async denied() {} }));
    routes.finalize();
    return app;
}

async function get(app, path, authorization) {
    const response = await app.request(path, { headers: { authorization } });
    return response.json();
}

async function post(app, path, headers, body) {
    const response = await app.request(path, {
        method: 'POST', headers, body: JSON.stringify(body),
    });
    return response.json();
}

function token(user) {
    return jwtAuth.sign(
        { headers: {} }, user.id, user.id, user.role, Boolean(user.isAdmin), user
    );
}
