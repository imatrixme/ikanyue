const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');

const { responseMiddleware } = require('../src/middleware/response');
const courseCreditRoutes = require('../src/routes/courseCredits');
const { createCourseCreditHandlers } = require('../src/routes/courseCredits/handlers');
const { resourceUser, teachingScope } = require('../src/routes/courseCredits/adminCourseOperationHandlers');
const { createRouteBuilder } = require('../src/utils/routeBuilder');
const { jwtAuth } = require('../src/utils/jwtAuth');

test('admin course operation routes expose every explicit resource and workflow command', async () => {
    const calls = [];
    const app = createApp(services(calls));
    const headers = authHeaders({ id: 'admin', role: 'teacher', isAdmin: true });
    const resources = [
        ['course-specs', 'courseSpecs', true],
        ['packages', 'packages', true],
        ['grant-lines', 'grantLines', false],
        ['price-versions', 'priceVersions', true],
        ['conversion-rules', 'conversionRules', true],
        ['classes', 'classes', true],
        ['lessons', 'lessons', true],
    ];
    for (const [path, resource, hasStatus] of resources) {
        await request(app, 'POST', `/ops/course-operations/${path}`, headers, { name: resource });
        await request(app, 'PATCH', `/ops/course-operations/${path}/resource-1`, headers, { name: `${resource}-updated` });
        if (hasStatus) {
            await request(app, 'POST', `/ops/course-operations/${path}/resource-1/status`, headers, {
                status: 'active', reason: 'reviewed',
            });
        }
    }
    await request(app, 'POST', '/ops/course-operations/enrollments', headers, {
        studentId: 'student', packageId: 'package', priceVersionId: 'price', classId: 'class', reason: 'paid',
    });
    await request(app, 'GET', '/ops/course-operations/enrollments/order/sync-preview', headers);
    await request(app, 'POST', '/ops/course-operations/enrollments/order/sync', headers, {
        previewHash: 'hash', lessonIds: ['lesson'],
    });
    await request(app, 'POST', '/ops/course-operations/lessons/session/students/row/attendance', headers, {
        attendanceStatus: 'present',
    });
    await request(app, 'POST', '/ops/course-operations/lessons/session/attendance/all-present', headers, {
        reason: 'started',
    });
    await request(app, 'POST', '/ops/course-operations/lessons/session/teachers/teacher-row/actual-status', headers, {
        actualStatus: 'confirmed',
    });
    await request(app, 'GET', '/ops/course-operations/lessons/session/settlement-preview', headers);

    assert.equal(calls.filter((call) => call[0] === 'createResource').length, 7);
    assert.equal(calls.filter((call) => call[0] === 'updateResource').length, 7);
    assert.equal(calls.filter((call) => call[0] === 'setStatus').length, 6);
    assert.ok(calls.some((call) => call[0] === 'enroll' && call[1].actorRole === 'admin'));
    assert.ok(calls.some((call) => call[0] === 'syncPreview' && call[1].orderId === 'order'));
    assert.ok(calls.some((call) => call[0] === 'attendance' && call[1].sessionStudentId === 'row'));
    assert.ok(calls.some((call) => call[0] === 'attendance' && call[1].actorTeachingScope === 'global'));
    assert.ok(calls.some((call) => call[0] === 'settlementPreview'));
});

test('class enrollment needs academic capability and assigned teachers retain teacher audit identity', async () => {
    const calls = [];
    const app = createApp(services(calls));
    const financeHeaders = authHeaders({
        id: 'finance', role: 'teacher', courseCreditCapabilities: ['course_credit.finance'],
    });
    const denied = await request(app, 'POST', '/ops/course-operations/enrollments', financeHeaders, {
        studentId: 'student', packageId: 'package', priceVersionId: 'price', classId: 'class',
    });
    assert.equal(denied.code, 403);
    assert.equal(calls.length, 0);

    const teacherHeaders = authHeaders({
        id: 'teacher-1', role: 'teacher', courseCreditCapabilities: ['course_credit.teacher'],
    });
    const allowed = await request(app, 'POST',
        '/ops/course-operations/lessons/session/students/row/attendance', teacherHeaders, { attendanceStatus: 'late' });
    assert.equal(allowed.code, 10000);
    assert.equal(calls[0][1].actorRole, 'teacher');
    assert.equal(calls[0][1].actorTeachingScope, 'assigned');

    const financeOnly = await request(app, 'POST', '/ops/course-operations/enrollments', financeHeaders, {
        studentId: 'student', packageId: 'package', priceVersionId: 'price',
    });
    assert.equal(financeOnly.code, 10000);
});

test('resource capability helper rejects unknown resource capabilities', () => {
    assert.throws(() => resourceUser({ get: () => ({}) }, 'unknown', {}, (_user, value) => {
        if (!value) throw new Error('missing capability');
    }), /missing capability/);
    assert.equal(teachingScope({ isAdmin: false, courseCreditCapabilities: ['course_credit.academic'] }, {
        ACADEMIC: 'course_credit.academic',
    }), 'global');
});

function services(calls) {
    return {
        adminResourceCommandService: {
            async createResource(resource, input) { calls.push(['createResource', resource, input]); return { id: 'created' }; },
            async updateResource(resource, id, input) { calls.push(['updateResource', resource, id, input]); return { id }; },
            async setStatus(resource, id, status, input) { calls.push(['setStatus', resource, id, status, input]); return { id, status }; },
        },
        automaticEnrollmentService: {
            async enroll(input) { calls.push(['enroll', input]); return { orderId: 'order' }; },
        },
        enrollmentRosterSyncService: {
            async preview(input) { calls.push(['syncPreview', input]); return { lessons: [] }; },
            async confirm(input) { calls.push(['syncConfirm', input]); return { status: 'completed' }; },
        },
        manualAttendanceService: {
            async setAttendance(input) { calls.push(['attendance', input]); return { attendanceStatus: input.attendanceStatus }; },
            async markAllPresent(input) { calls.push(['allPresent', input]); return { updatedCount: 1 }; },
            async setActualTeacher(input) { calls.push(['actualTeacher', input]); return { actualStatus: input.actualStatus }; },
            async previewSettlement(sessionId) { calls.push(['settlementPreview', sessionId]); return { canSettle: true }; },
        },
    };
}

function createApp(serviceSet) {
    const app = new Hono();
    app.use('*', responseMiddleware());
    const routes = createRouteBuilder(app);
    courseCreditRoutes(routes, createCourseCreditHandlers(async () => serviceSet, undefined, { async denied() {} }));
    routes.finalize();
    return app;
}

async function request(app, method, path, headers, body) {
    const requestHeaders = { ...headers };
    if (body !== undefined) requestHeaders['content-type'] = 'application/json';
    const response = await app.request(path, {
        method,
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
        'idempotency-key': 'admin-command-key',
        'x-trace-id': 'admin-trace',
    };
}
