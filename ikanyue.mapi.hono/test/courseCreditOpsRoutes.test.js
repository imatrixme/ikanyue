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
    await get(app, '/ops/course-credits/enrollments?studentId=student&sourceId=order', authorization);
    await get(app, '/ops/course-credits/accounts?page=1&perPage=10', authorization);
    await get(app, '/ops/course-credits/accounts/student', authorization);
    await get(app, '/ops/course-credits/classes', authorization);
    await get(app, '/ops/course-credits/session-classes?classId=class', authorization);
    await get(app, '/ops/course-credits/class-students?classId=class&studentId=student', authorization);
    await get(app, '/ops/course-credits/session-teachers?sessionId=session&actualStatus=confirmed', authorization);
    await get(app, '/ops/course-credits/package-grant-lines?creditTypeId=type', authorization);
    await get(app, '/ops/course-credits/audit-logs?resourceType=session&resourceId=session', authorization);
    await get(app, '/ops/course-credits/settlement-exceptions?kind=duplicate&status=open', authorization);
    await get(app, '/ops/course-credits/teacher-events', authorization);
    await get(app, '/ops/course-credits/teacher-events/event', authorization);
    await get(app, '/ops/course-credits/reconciliation/runs', authorization);
    await get(app, '/ops/course-credits/assigned-students?status=active', authorization);
    await get(app, '/ops/course-credits/assigned-classes?classId=class', authorization);
    await get(app, '/ops/course-credits/assigned-lessons?status=scheduled', authorization);

    assert.deepEqual(calls, [
        ['list', 'courseSpecs', { page: '2', status: 'active' }],
        ['get', 'packages', 'package'],
        ['list', 'enrollments', { studentId: 'student', sourceId: 'order' }],
        ['accounts', { page: '1', perPage: '10' }],
        ['account', 'student'],
        ['list', 'classes', {}],
        ['list', 'sessionClasses', { classId: 'class' }],
        ['list', 'classStudents', { studentId: 'student', classId: 'class' }],
        ['list', 'sessionTeachers', { sessionId: 'session', actualStatus: 'confirmed' }],
        ['list', 'grantLines', { creditTypeId: 'type' }],
        ['list', 'auditLogs', { resourceType: 'session', resourceId: 'session' }],
        ['settlementExceptions', { kind: 'duplicate', status: 'open' }],
        ['teacherEvents', { teacherId: 'operator' }],
        ['assignedTeacherEvent', 'operator', 'event'],
        ['list', 'reconciliationRuns', {}],
        ['assignedStudents', 'operator', { status: 'active' }],
        ['assignedClasses', 'operator', { classId: 'class' }],
        ['assignedLessons', 'operator', { status: 'scheduled' }],
    ]);
});

test('teacher-only routes expose assigned teaching data and reject global operations data', async () => {
    const calls = [];
    const app = createApp(calls);
    const teacher = auth({
        id: 'teacher', role: 'teacher', courseCreditCapabilities: ['course_credit.teacher'],
    });

    assert.equal((await get(app, '/ops/course-credits/assigned-students?studentId=student', teacher)).code, 10000);
    assert.equal((await get(app, '/ops/course-credits/assigned-classes?classId=class', teacher)).code, 10000);
    assert.equal((await get(app, '/ops/course-credits/assigned-lessons?sessionId=session', teacher)).code, 10000);
    assert.equal((await get(app, '/ops/course-credits/teacher-events?teacherId=other', teacher)).code, 10000);
    for (const path of [
        '/ops/course-credits/classes', '/ops/course-credits/packages', '/ops/course-credits/accounts',
        '/ops/course-credits/audit-logs',
    ]) assert.equal((await get(app, path, teacher)).code, 403, path);

    assert.deepEqual(calls, [
        ['assignedStudents', 'teacher', { studentId: 'student' }],
        ['assignedClasses', 'teacher', { classId: 'class' }],
        ['assignedLessons', 'teacher', { sessionId: 'session' }],
        ['teacherEvents', { teacherId: 'teacher' }],
    ]);
});

test('settlement-only routes expose global lesson evidence without academic resources', async () => {
    const calls = [];
    const app = createApp(calls);
    const settlement = auth({
        id: 'settlement', role: 'teacher', courseCreditCapabilities: ['course_credit.settlement'],
    });

    assert.equal((await get(app, '/ops/course-credits/sessions?status=completed', settlement)).code, 10000);
    assert.equal((await get(app, '/ops/course-credits/session-students?sessionId=session', settlement)).code, 10000);
    assert.equal((await get(app, '/ops/course-credits/session-teachers?sessionId=session', settlement)).code, 10000);
    assert.equal((await get(app, '/ops/course-credits/classes', settlement)).code, 403);

    assert.deepEqual(calls, [
        ['list', 'sessions', { status: 'completed' }],
        ['list', 'sessionStudents', { sessionId: 'session' }],
        ['list', 'sessionTeachers', { sessionId: 'session' }],
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

test('finance operators read student overviews and record renewal follow-ups', async () => {
    const calls = [];
    const app = createApp(calls);
    const finance = auth({ id: 'finance', role: 'teacher', courseCreditCapabilities: ['course_credit.finance'] });

    assert.equal((await get(app, '/ops/course-credits/student-overview?studentIds=a,b', finance)).code, 10000);
    assert.equal((await get(app, '/ops/course-credits/accounts?renewalThreshold=2&studentIds=a', finance)).code, 10000);
    assert.equal((await get(app, '/ops/course-credits/students/a/follow-ups', finance)).code, 10000);
    const response = await app.request('/ops/course-credits/students/a/follow-ups', {
        method: 'POST',
        headers: { authorization: finance, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'contacted', note: '已联系', snoozeUntil: '2026-10-25T00:00:00Z', actorId: 'spoofed', studentId: 'b' }),
    });
    assert.equal((await response.json()).code, 10000);
    const recorded = calls.find(([name]) => name === 'recordFollowUp')[1];
    assert.equal(recorded.studentId, 'a');
    assert.equal(recorded.actorId, 'finance');
    assert.equal(recorded.status, 'contacted');
    assert.deepEqual(calls.slice(0, 3), [
        ['overview', { studentIds: 'a,b' }],
        ['accounts', { studentIds: 'a', renewalThreshold: '2' }],
        ['followUps', ['a']],
    ]);

    const academic = auth({ id: 'academic', role: 'teacher', courseCreditCapabilities: ['course_credit.academic'] });
    assert.equal((await get(app, '/ops/course-credits/student-overview?studentIds=a', academic)).code, 403);
    await get(app, '/ops/course-credits/sessions?from=2026-10-18&to=2026-10-19', academic);
    assert.deepEqual(calls.at(-1), ['list', 'sessions', { from: '2026-10-18', to: '2026-10-19' }]);
});

function createApp(calls) {
    const serviceSet = {
        opsQueryService: {
            async listResource(resource, query) { calls.push(['list', resource, query]); return { items: [] }; },
            async getResource(resource, id) { calls.push(['get', resource, id]); return { id }; },
            async listAccounts(query) { calls.push(['accounts', query]); return { items: [] }; },
            async getAccount(studentId) { calls.push(['account', studentId]); return { studentId }; },
            async listTeacherEvents(query) { calls.push(['teacherEvents', query]); return { items: [] }; },
            async listSettlementExceptions(query) { calls.push(['settlementExceptions', query]); return { items: [] }; },
            async getAssignedTeacherEvent(user, id) { calls.push(['assignedTeacherEvent', user.id, id]); return { id, teacherId: user.id }; },
            async listAssignedStudents(user, query) { calls.push(['assignedStudents', user.id, query]); return { items: [] }; },
            async listAssignedClasses(user, query) { calls.push(['assignedClasses', user.id, query]); return { items: [] }; },
            async listAssignedLessons(user, query) { calls.push(['assignedLessons', user.id, query]); return { items: [] }; },
            async studentOverview(query) { calls.push(['overview', query]); return { items: [] }; },
            async listFollowUps(ids) { calls.push(['followUps', ids]); return []; },
        },
        studentFollowUpService: {
            async record(input) { calls.push(['recordFollowUp', input]); return { id: 'follow-up' }; },
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
        { headers: {} }, user.id, user.id, user.role, Boolean(user.isAdmin), { scope: 'ops', ...user }
    )}`;
}
