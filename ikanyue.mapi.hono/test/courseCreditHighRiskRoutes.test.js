const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');

const { responseMiddleware } = require('../src/middleware/response');
const courseCreditRoutes = require('../src/routes/courseCredits');
const { createCourseCreditHandlers } = require('../src/routes/courseCredits/handlers');
const { CourseCreditMetrics } = require('../src/services/courseCredits/metricsService');
const { createRouteBuilder } = require('../src/utils/routeBuilder');
const { jwtAuth } = require('../src/utils/jwtAuth');

test('settlement operators invoke every explicit high-risk route with authenticated metadata', async () => {
    const calls = [];
    const app = createApp(services(calls));
    const headers = authHeaders({
        id: 'operator', role: 'teacher',
        courseCreditCapabilities: ['course_credit.settlement', 'course_credit.audit'],
    });

    await post(app, '/ops/course-credits/batches/batch/extend', headers, {
        newExpiresAt: '2026-12-31T00:00:00Z', reason: 'approved extension', approvedBy: 'forged',
    });
    await post(app, '/ops/course-credits/batches/batch/restore-expired', headers, {
        quantity: 2, validityDurationDays: 30, reason: 'service recovery',
    });
    await post(app, '/ops/course-credits/sessions/session/reschedule', headers, {
        newStartAt: '2026-08-01T10:00:00Z', newEndAt: '2026-08-01T11:00:00Z', reason: 'teacher unavailable',
    });
    await post(app, '/ops/course-credits/sessions/session/settle', headers, { reason: 'lesson completed' });
    await post(app, '/ops/course-credits/sessions/session/reverse-settlement', headers, { reason: 'attendance correction' });
    await post(app, '/ops/course-credits/reconciliation/runs', headers, {
        scope: 'incremental', since: '2026-07-17T00:00:00Z',
    });
    await post(app, '/ops/course-credits/workers/expiry/run', headers, { limit: 25, now: 'forged' });
    await post(app, '/ops/course-credits/workers/outbox/deliver', headers, { limit: 10 });

    const metadata = {
        actorId: 'operator', actorRole: 'admin', idempotencyKey: 'high-risk-key', traceId: 'trace-high-risk',
    };
    assert.deepEqual(calls, [
        ['extend', {
            ...metadata, approvedBy: 'operator', batchId: 'batch',
            newExpiresAt: '2026-12-31T00:00:00Z', reason: 'approved extension',
        }],
        ['restore', {
            ...metadata, approvedBy: 'operator', batchId: 'batch', quantity: 2,
            reason: 'service recovery', validityDurationDays: 30,
        }],
        ['reschedule', {
            ...metadata, newEndAt: '2026-08-01T11:00:00Z', newStartAt: '2026-08-01T10:00:00Z',
            reason: 'teacher unavailable', sessionId: 'session',
        }],
        ['settle', { ...metadata, reason: 'lesson completed', sessionId: 'session' }],
        ['reverse', { ...metadata, reason: 'attendance correction', sessionId: 'session' }],
        ['reconcile', { scope: 'incremental', since: '2026-07-17T00:00:00Z' }],
        ['expiry', { ...metadata, limit: 25 }],
        ['outbox', { limit: 10 }],
    ]);
});

test('financial-only operators cannot invoke settlement or audit actions', async () => {
    const calls = [];
    const app = createApp(services(calls));
    const headers = authHeaders({
        id: 'finance', role: 'teacher', courseCreditCapabilities: ['course_credit.finance'],
    });
    const settlement = await post(app, '/ops/course-credits/sessions/session/settle', headers);
    const reconciliation = await post(app, '/ops/course-credits/reconciliation/runs', headers, { scope: 'full' });
    const expiry = await post(app, '/ops/course-credits/workers/expiry/run', headers);
    const outbox = await post(app, '/ops/course-credits/workers/outbox/deliver', headers);

    assert.equal(settlement.code, 403);
    assert.equal(settlement.errorCode, 'COURSE_CREDIT_CAPABILITY_REQUIRED');
    assert.equal(reconciliation.code, 403);
    assert.equal(expiry.code, 403);
    assert.equal(outbox.code, 403);
    assert.equal(calls.length, 0);
});

function services(calls) {
    return {
        batchLifecycleService: {
            async extendBatchExpiry(input) { calls.push(['extend', input]); return { operationId: 'extend' }; },
            async restoreExpiredQuantity(input) { calls.push(['restore', input]); return { operationId: 'restore' }; },
        },
        sessionRescheduleService: {
            async rescheduleSession(input) { calls.push(['reschedule', input]); return { operationId: 'reschedule' }; },
        },
        sessionSettlementService: {
            async settleSession(input) { calls.push(['settle', input]); return { operationId: 'settle' }; },
        },
        sessionSettlementReversalService: {
            async reverseSessionSettlement(input) { calls.push(['reverse', input]); return { operationId: 'reverse' }; },
        },
        reconciliationService: {
            async run(input) { calls.push(['reconcile', input]); return { runId: 'run' }; },
        },
        expiryService: {
            async expireDue(input) { calls.push(['expiry', input]); return { expiredBatches: 1 }; },
        },
        outboxService: {
            async deliverDue(input) { calls.push(['outbox', input]); return { sent: 1 }; },
        },
    };
}

function createApp(serviceSet) {
    const app = new Hono();
    app.use('*', responseMiddleware());
    const routes = createRouteBuilder(app);
    courseCreditRoutes(routes, createCourseCreditHandlers(
        async () => serviceSet, new CourseCreditMetrics(), { async denied() {} }
    ));
    routes.finalize();
    return app;
}

async function post(app, path, headers, body) {
    const requestHeaders = { ...headers };
    if (body !== undefined) requestHeaders['content-type'] = 'application/json';
    const response = await app.request(path, {
        method: 'POST',
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return response.json();
}

function authHeaders(user) {
    return {
        authorization: `Bearer ${jwtAuth.sign(
            { headers: {} }, user.id, user.id, user.role, Boolean(user.isAdmin), user
        )}`,
        'idempotency-key': 'high-risk-key',
        'x-trace-id': 'trace-high-risk',
    };
}
