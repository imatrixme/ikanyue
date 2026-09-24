const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');

const { responseMiddleware } = require('../src/middleware/response');
const courseCreditRoutes = require('../src/routes/courseCredits');
const {
    createCourseCreditHandlers,
    responseStatus,
    withCommandTrace,
} = require('../src/routes/courseCredits/handlers');
const {
    createCourseCreditServices,
    createDefaultCourseCreditServices,
} = require('../src/services/courseCredits');
const { CourseCreditError } = require('../src/services/courseCredits/domain');
const { createRouteBuilder } = require('../src/utils/routeBuilder');
const { jwtAuth } = require('../src/utils/jwtAuth');

test('admin order grant route forwards authenticated actor, idempotency key, and trace id', async () => {
    const calls = [];
    const app = createApp({
        grantService: {
            async grantOrderCredits(command) {
                calls.push(command);
                return { operationId: 'grant-operation', replayed: false };
            },
        },
        reservationService: unusedService(),
    });

    const payload = await request(app, '/ops/course-credits/orders/order-1/grant', {
        token: token({ id: 'admin-1', role: 'teacher', isAdmin: true }),
        headers: { 'idempotency-key': 'grant-key', 'x-trace-id': 'trace-1' },
    });

    assert.equal(payload.code, 10000);
    assert.equal(payload.data.operationId, 'grant-operation');
    assert.equal(payload.data.traceId, 'trace-1');
    assert.deepEqual(calls, [{
        actorId: 'admin-1', actorRole: 'admin', idempotencyKey: 'grant-key',
        orderId: 'order-1', traceId: 'trace-1',
    }]);
});

test('grant route rejects non-admin operators before loading course-credit services', async () => {
    let loaded = false;
    const denied = [];
    const app = createApp(null, async () => {
        loaded = true;
        return null;
    }, { async denied(...args) { denied.push(args); } });
    const payload = await request(app, '/ops/course-credits/orders/order-1/grant', {
        token: token({ id: 'teacher-1', role: 'teacher', isAdmin: false }),
    });

    assert.equal(payload.code, 403);
    assert.equal(payload.errorCode, 'COURSE_CREDIT_CAPABILITY_REQUIRED');
    assert.equal(loaded, false);
    assert.equal(denied.length, 1);
    assert.equal(denied[0][1], 'course_credit.post');
    assert.equal(denied[0][4].capability, 'course_credit.finance');
});

test('authorization remains denied when the audit sink is unavailable', async () => {
    const app = createApp(null, async () => null, {
        async denied() { throw new Error('audit unavailable'); },
    });
    const payload = await request(app, '/ops/course-credits/orders/order/grant', {
        token: token({ id: 'teacher', role: 'teacher', isAdmin: false }),
    });

    assert.equal(payload.code, 403);
    assert.equal(payload.errorCode, 'COURSE_CREDIT_CAPABILITY_REQUIRED');
});

test('scoped academic operators can manage classes but cannot grant financial credits', async () => {
    const calls = [];
    const app = createApp({
        grantService: { async grantOrderCredits() { calls.push('grant'); return {}; } },
        classMembershipService: {
            async setStudentMembership(command) { calls.push(command); return { operationId: 'membership' }; },
        },
    });
    const operator = token({
        id: 'teacher-1', role: 'teacher', isAdmin: false,
        courseCreditCapabilities: ['course_credit.academic'],
    });
    const membership = await request(app, '/ops/course-credits/classes/class/students/student/membership', {
        token: operator,
        headers: { 'idempotency-key': 'membership' },
        body: { status: 'active', effectiveFrom: '2026-07-17T10:00:00Z' },
    });
    const grant = await request(app, '/ops/course-credits/orders/order/grant', { token: operator });

    assert.equal(membership.code, 10000);
    assert.equal(calls.length, 1);
    assert.equal(grant.code, 403);
    assert.equal(grant.errorCode, 'COURSE_CREDIT_CAPABILITY_REQUIRED');
});

test('student reservation route derives student identity only from the authenticated token', async () => {
    const calls = [];
    const app = createApp({
        grantService: unusedService(),
        reservationService: {
            async reserveSessionCredit(command) {
                calls.push(command);
                return { operationId: 'reserve-operation', creditStatus: 'reserved' };
            },
        },
    });
    const payload = await request(app, '/v1/course-credits/session-students/roster-1/reserve', {
        token: token({ id: 'student-1', role: 'student' }),
        headers: { 'idempotency-key': 'reserve-key', 'x-trace-id': 'trace-2' },
        body: { authorizationId: 'authorization-1', targetTermEnd: '2026-12-31T00:00:00Z' },
    });

    assert.equal(payload.code, 10000);
    assert.deepEqual(calls, [{
        actorId: 'student-1', actorRole: 'student', authorizationId: 'authorization-1', idempotencyKey: 'reserve-key',
        sessionStudentId: 'roster-1', studentId: 'student-1', traceId: 'trace-2',
        targetTermEnd: '2026-12-31T00:00:00Z',
    }]);
});

test('admin teaching routes forward authenticated metadata and JSON command fields', async () => {
    const calls = [];
    const app = createApp({
        grantService: unusedService(),
        reservationService: unusedService(),
        classMembershipService: {
            async setStudentMembership(command) { calls.push(['membership', command]); return command; },
            async transferStudent(command) { calls.push(['transfer', command]); return command; },
            async setTeacherAssignment(command) { calls.push(['teacher', command]); return command; },
        },
        sessionPublicationService: {
            async publishSession(command) { calls.push(['publish', command]); return command; },
        },
        teacherCreditService: {
            async confirmTeacherCredit(command) { calls.push(['confirm', command]); return command; },
        },
    });
    const options = {
        token: token({ id: 'admin-1', role: 'teacher', isAdmin: true }),
        headers: { 'idempotency-key': 'teaching-key', 'x-trace-id': 'trace-teaching' },
    };

    await request(app, '/ops/course-credits/classes/class-a/students/student-1/membership', {
        ...options,
        body: { status: 'active', effectiveFrom: '2026-08-01T00:00:00Z', sourceOrderId: 'order-1' },
    });
    await request(app, '/ops/course-credits/classes/class-a/students/student-1/transfer', {
        ...options,
        body: { toClassId: 'class-b', effectiveAt: '2026-09-01T00:00:00Z' },
    });
    await request(app, '/ops/course-credits/classes/class-a/teachers/teacher-1/assignment', {
        ...options,
        body: { role: 'lead', status: 'active', effectiveFrom: '2026-08-01T00:00:00Z' },
    });
    await request(app, '/ops/course-credits/sessions/session-1/publish', {
        ...options,
        body: { classIds: ['class-a', 'class-b'], teacherOverrides: [{
            teacherId: 'teacher-2', role: 'lead', assignmentSource: 'substitute',
        }] },
    });
    await request(app, '/ops/course-credits/teacher-events/earning-1/confirm', {
        ...options,
        body: { reason: 'finance approved' },
    });

    const metadata = {
        actorId: 'admin-1', actorRole: 'admin', idempotencyKey: 'teaching-key', traceId: 'trace-teaching',
    };
    assert.deepEqual(calls, [
        ['membership', {
            ...metadata, classId: 'class-a', studentId: 'student-1', status: 'active',
            effectiveFrom: '2026-08-01T00:00:00Z', effectiveTo: undefined, sourceOrderId: 'order-1',
        }],
        ['transfer', {
            ...metadata, fromClassId: 'class-a', toClassId: 'class-b', studentId: 'student-1',
            effectiveAt: '2026-09-01T00:00:00Z', sourceOrderId: undefined,
        }],
        ['teacher', {
            ...metadata, classId: 'class-a', teacherId: 'teacher-1', role: 'lead', status: 'active',
            effectiveFrom: '2026-08-01T00:00:00Z', effectiveTo: undefined,
        }],
        ['publish', {
            ...metadata, sessionId: 'session-1', classIds: ['class-a', 'class-b'],
            teacherOverrides: [{ teacherId: 'teacher-2', role: 'lead', assignmentSource: 'substitute' }],
        }],
        ['confirm', {
            ...metadata, teacherCreditEventId: 'earning-1', reason: 'finance approved',
        }],
    ]);
});

test('admin teaching routes reject malformed JSON before loading services', async () => {
    let loaded = false;
    const app = createApp(null, async () => {
        loaded = true;
        return null;
    });
    const response = await app.request('/ops/course-credits/sessions/session-1/publish', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token({ id: 'admin-1', role: 'teacher', isAdmin: true })}`,
            'content-type': 'application/json',
        },
        body: '{',
    });
    const payload = await response.json();
    assert.equal(payload.code, 400);
    assert.equal(payload.errorCode, 'INVALID_JSON_BODY');
    assert.equal(loaded, false);
});

test('course-credit routes preserve business codes and normalize storage failures', async () => {
    const businessError = new CourseCreditError('IDEMPOTENCY_KEY_REQUIRED', 'idempotency key is required', { field: 'Idempotency-Key' });
    const app = createApp({
        grantService: { async grantOrderCredits() { throw businessError; } },
        reservationService: { async reserveSessionCredit() { throw Object.assign(new Error('PocketBase unavailable'), { status: 503 }); } },
    });

    const grant = await request(app, '/ops/course-credits/orders/order-1/grant', {
        token: token({ id: 'admin-1', role: 'teacher', isAdmin: true }),
    });
    assert.equal(grant.code, 400);
    assert.equal(grant.errorCode, 'IDEMPOTENCY_KEY_REQUIRED');
    assert.deepEqual(grant.details, { field: 'Idempotency-Key' });
    assert.equal(grant.operationId, null);
    assert.match(grant.traceId, /^[0-9a-f-]{36}$/);

    const reserve = await request(app, '/v1/course-credits/session-students/roster-1/reserve', {
        token: token({ id: 'student-1', role: 'student' }),
    });
    assert.equal(reserve.code, 503);
    assert.equal(reserve.errorCode, 'COURSE_CREDIT_INTERNAL_ERROR');
});

test('course-credit handler helpers cover authorization and unknown failures', async () => {
    assert.equal(responseStatus(new CourseCreditError('SESSION_STUDENT_FORBIDDEN', 'forbidden')), 403);
    assert.equal(responseStatus(new Error('unknown')), 500);

    const app = createApp({
        grantService: unusedService(),
        reservationService: unusedService(),
    });
    const teacher = await request(app, '/v1/course-credits/session-students/roster-1/reserve', {
        token: token({ id: 'teacher-1', role: 'teacher' }),
    });
    assert.equal(teacher.code, 403);
    assert.equal(teacher.errorCode, 'COURSE_CREDIT_STUDENT_REQUIRED');
    assert.deepEqual(withCommandTrace(null, 'trace'), {
        result: null, operationId: null, traceId: 'trace',
    });
    assert.deepEqual(withCommandTrace(['value'], 'trace'), {
        result: ['value'], operationId: null, traceId: 'trace',
    });
});

test('admin can list privacy-safe outbox dead letters', async () => {
    const calls = [];
    const app = createApp({
        outboxService: {
            async listDeadLetters(query) {
                calls.push(query);
                return { items: [{ id: 'dead-letter' }], totalItems: 1 };
            },
        },
    });
    const response = await app.request('/ops/course-credits/outbox/dead-letters?page=2&perPage=10', {
        headers: { authorization: `Bearer ${token({ id: 'admin-1', role: 'teacher', isAdmin: true })}` },
    });
    const payload = await response.json();

    assert.equal(payload.code, 10000);
    assert.deepEqual(payload.data.items, [{ id: 'dead-letter' }]);
    assert.deepEqual(calls, [{ page: '2', perPage: '10' }]);
});

test('admin can read course-credit operational metrics without recording a command', async () => {
    const app = createApp({
        metricsService: {
            async snapshot() {
                return {
                    counters: { commandSuccessTotal: 3 },
                    gauges: { outboxBacklog: 1, reconciliationDrift: 0 },
                };
            },
        },
    });
    const response = await app.request('/ops/course-credits/metrics', {
        headers: { authorization: `Bearer ${token({ id: 'admin-1', role: 'teacher', isAdmin: true })}` },
    });
    const payload = await response.json();

    assert.equal(payload.code, 10000);
    assert.equal(payload.data.counters.commandSuccessTotal, 3);
    assert.equal(payload.data.gauges.outboxBacklog, 1);
});

test('course-credit service factories wire every Hono service to the SDK repository', async () => {
    const repository = { get() {}, list() {}, findFirst() {}, send() {} };
    const services = createCourseCreditServices(repository);
    assert.equal(services.repository, repository);
    assert.equal(services.grantService.repository, repository);
    assert.equal(services.metricsService.repository, repository);
    assert.equal(services.metricsService.metrics, services.metrics);
    assert.equal(services.outboxService.repository, repository);
    assert.equal(services.opsQueryService.repository, repository);
    assert.equal(services.reconciliationService.repository, repository);
    assert.equal(services.reservationService.repository, repository);
    assert.equal(services.conversionService.repository, repository);
    assert.equal(services.expiryService.repository, repository);
    assert.equal(services.batchLifecycleService.repository, repository);
    assert.equal(services.classMembershipService.repository, repository);
    assert.equal(services.sessionPublicationService.repository, repository);
    assert.equal(services.teacherCreditService.repository, repository);

    const client = fakePocketBaseClient();
    const defaults = await createDefaultCourseCreditServices(client);
    assert.equal(defaults.repository.client, client.pb);
    assert.deepEqual(client.calls, ['ready', 'auth', 'client']);
});

function createApp(services, loadServices = async () => services, auditService = noopAudit()) {
    const app = new Hono();
    app.use('*', responseMiddleware());
    const routes = createRouteBuilder(app);
    courseCreditRoutes(routes, createCourseCreditHandlers(loadServices, undefined, auditService));
    routes.finalize();
    return app;
}

function noopAudit() {
    return { async denied() {} };
}

async function request(app, path, options = {}) {
    const headers = {
        authorization: `Bearer ${options.token}`,
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(options.headers || {}),
    };
    const response = await app.request(path, {
        method: 'POST',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    return response.json();
}

function token(user) {
    return jwtAuth.sign(
        { headers: {} },
        user.id,
        user.sn || user.id,
        user.role,
        Boolean(user.isAdmin),
        { scope: 'ops', ...user }
    );
}

function unusedService() {
    return new Proxy({}, {
        get() {
            return async () => {
                throw new Error('Unexpected service call');
            };
        },
    });
}

function fakePocketBaseClient() {
    const calls = [];
    const pb = {
        collection() {},
        createBatch() {},
    };
    return {
        calls,
        pb,
        ready: Promise.resolve().then(() => calls.push('ready')),
        async ensureAuth() { calls.push('auth'); },
        getClient() {
            calls.push('client');
            return pb;
        },
    };
}
