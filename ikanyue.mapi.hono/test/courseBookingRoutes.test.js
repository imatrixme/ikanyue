const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');

const { responseMiddleware } = require('../src/middleware/response');
const courseCreditRoutes = require('../src/routes/courseCredits');
const { createCourseCreditHandlers } = require('../src/routes/courseCredits/handlers');
const { createRouteBuilder } = require('../src/utils/routeBuilder');
const { jwtAuth } = require('../src/utils/jwtAuth');

test('student booking routes expose only the signed-in student workflow', async () => {
    const fixture = bookingFixture();
    const app = createApp(fixture.services);
    const auth = token({ id: 'student', role: 'student' });
    const routes = [
        ['GET', '/v1/student/booking-options?courseId=course'],
        ['GET', '/v1/student/booking-slots?offeringId=offering&from=2026-08-01&to=2026-08-31'],
        ['GET', '/v1/student/appointments?page=1&status=pending'],
        ['GET', '/v1/student/appointments/appointment'],
        ['POST', '/v1/student/appointments', { offeringId: 'offering' }],
        ['POST', '/v1/student/appointments/appointment/withdraw', { reason: '时间有变' }],
        ['POST', '/v1/student/appointments/appointment/cancel', { reason: '临时有事' }],
    ];
    for (const [method, path, body] of routes) {
        const payload = await request(app, method, path, auth, body);
        assert.equal(payload.code, 10000, `${method} ${path}`);
    }
    const create = fixture.calls.find((call) => call.name === 'appointmentRequestService.createRequest');
    assert.equal(create.input.studentId, 'student');
    assert.equal(create.input.actorId, 'student');
    assert.equal(fixture.calls.find((call) => call.name === 'bookingQueryService.studentOptions').args[0], 'student');
});

test('teacher booking routes require teacher capability and forward teacher ownership', async () => {
    const fixture = bookingFixture();
    const app = createApp(fixture.services);
    const auth = token({
        id: 'teacher', role: 'teacher', courseCreditCapabilities: ['course_credit.teacher'],
    });
    const routes = [
        ['GET', '/v1/teacher/booking/dashboard'],
        ['GET', '/v1/teacher/appointments?page=1&status=pending'],
        ['GET', '/v1/teacher/appointments/appointment'],
        ['GET', '/v1/teacher/calendar?from=2026-08-01&to=2026-08-31'],
        ['GET', '/v1/teacher/offerings/offering/availability'],
        ['POST', '/v1/teacher/appointments/appointment/confirm'],
        ['POST', '/v1/teacher/appointments/appointment/decline', { reason: '时间冲突' }],
        ['POST', '/v1/teacher/appointments/appointment/cancel', { reason: '临时停课' }],
        ['POST', '/v1/teacher/appointments/appointment/reschedule', {
            newStartAt: '2026-08-04T01:00:00Z',
            newEndAt: '2026-08-04T02:00:00Z',
        }],
        ['PUT', '/v1/teacher/offerings/offering/availability', { mode: 'custom', rules: [] }],
        ['POST', '/v1/teacher/offerings/offering/availability-overrides', { type: 'unavailable' }],
        ['POST', '/v1/teacher/availability-overrides/override/cancel'],
    ];
    for (const [method, path, body] of routes) {
        const payload = await request(app, method, path, auth, body);
        assert.equal(payload.code, 10000, `${method} ${path}`);
    }
    const confirm = fixture.calls.find((call) => call.name === 'appointmentDecisionService.confirm');
    assert.equal(confirm.input.teacherId, 'teacher');
    assert.equal(confirm.input.actorRole, 'teacher');

    const denied = await request(app, 'GET', '/v1/teacher/booking/dashboard',
        token({ id: 'teacher', role: 'teacher' }));
    assert.equal(denied.code, 403);
    assert.equal(denied.errorCode, 'COURSE_CREDIT_CAPABILITY_REQUIRED');
});

test('Admin booking routes expose configuration, conflict, backfill, and lifecycle operations', async () => {
    const fixture = bookingFixture();
    const app = createApp(fixture.services);
    const auth = token({
        id: 'operator', role: 'teacher', courseCreditCapabilities: ['course_credit.academic'],
    });
    const routes = [
        ['GET', '/ops/course-bookings/dashboard'],
        ['GET', '/ops/course-bookings/reference-data'],
        ['GET', '/ops/course-bookings/appointments?status=pending'],
        ['GET', '/ops/course-bookings/appointments/appointment'],
        ['GET', '/ops/course-bookings/policies?status=active'],
        ['GET', '/ops/course-bookings/offerings?teacherId=teacher'],
        ['GET', '/ops/course-bookings/availability?offeringId=offering'],
        ['GET', '/ops/course-bookings/conflicts?status=open'],
        ['GET', '/ops/course-bookings/backfill/preview?from=2026-08-01'],
        ['POST', '/ops/course-bookings/policies', { code: 'default' }],
        ['POST', '/ops/course-bookings/offerings', { teacherId: 'teacher' }],
        ['PATCH', '/ops/course-bookings/offerings/offering', { status: 'inactive' }],
        ['PUT', '/ops/course-bookings/offerings/offering/availability', { rules: [] }],
        ['POST', '/ops/course-bookings/offerings/offering/availability-overrides', { type: 'unavailable' }],
        ['POST', '/ops/course-bookings/availability-overrides/override/cancel'],
        ['POST', '/ops/course-bookings/appointments/appointment/confirm'],
        ['POST', '/ops/course-bookings/appointments/appointment/decline', { reason: '教师临时无空档' }],
        ['POST', '/ops/course-bookings/appointments/appointment/cancel', { reason: '教务取消' }],
        ['POST', '/ops/course-bookings/appointments/appointment/reschedule', { reason: '教务改期' }],
        ['POST', '/ops/course-bookings/conflicts/conflict/resolve', { resolution: '已处理' }],
        ['POST', '/ops/course-bookings/backfill', { from: '2026-08-01' }],
        ['POST', '/ops/course-bookings/workers/expire'],
        ['POST', '/ops/course-bookings/workers/fulfill'],
        ['POST', '/ops/course-credits/sessions/session/cancel', { reason: '课程取消' }],
    ];
    for (const [method, path, body] of routes) {
        const payload = await request(app, method, path, auth, body);
        assert.equal(payload.code, 10000, `${method} ${path}`);
    }
    const update = fixture.calls.find((call) => call.name === 'bookingAdminService.saveOffering'
        && call.input.offeringId === 'offering');
    assert.equal(update.input.actorRole, 'admin');
    assert.equal(update.input.actorId, 'operator');
    const confirm = fixture.calls.find((call) => call.name === 'appointmentDecisionService.confirm');
    assert.equal(confirm.input.actorRole, 'admin');
    assert.equal(confirm.input.actorId, 'operator');
    assert.equal(confirm.input.teacherId, undefined);
    const decline = fixture.calls.find((call) => call.name === 'pendingAppointmentService.decline'
        && call.input.actorRole === 'admin');
    assert.equal(decline.input.appointmentId, 'appointment');

    const denied = await request(app, 'GET', '/ops/course-bookings/dashboard', token({
        id: 'teacher', role: 'teacher', courseCreditCapabilities: ['course_credit.teacher'],
    }));
    assert.equal(denied.code, 403);
});

function bookingFixture() {
    const calls = [];
    const methods = {
        bookingQueryService: [
            'studentOptions', 'availableSlots', 'listStudentAppointments', 'getStudentAppointment',
            'teacherDashboard', 'listTeacherAppointments', 'getTeacherAppointment',
            'teacherAvailability',
        ],
        scheduleQueryService: ['teacher'],
        appointmentRequestService: ['createRequest'],
        pendingAppointmentService: ['withdraw', 'decline'],
        appointmentCancellationService: ['cancel'],
        appointmentDecisionService: ['confirm'],
        appointmentRescheduleService: ['reschedule'],
        bookingOpsQueryService: [
            'dashboard', 'referenceData', 'listAppointments', 'getAppointment', 'listPolicies', 'listOfferings',
            'listAvailability', 'listConflicts',
        ],
        teacherAvailabilityService: [
            'saveWeekly', 'createOverride', 'cancelOverride', 'saveWeeklyForOperator',
            'createOverrideForOperator', 'cancelOverrideForOperator',
        ],
        bookingAdminService: ['createPolicyRevision', 'saveOffering', 'resolveConflict'],
        scheduleClaimBackfillService: ['preview', 'apply'],
        appointmentWorkerService: ['expirePending', 'fulfillCompleted'],
        sessionCancellationService: ['cancelSession'],
    };
    const services = {};
    for (const [serviceName, names] of Object.entries(methods)) {
        services[serviceName] = {};
        for (const name of names) {
            services[serviceName][name] = async (...args) => {
                const input = args[0];
                calls.push({ name: `${serviceName}.${name}`, input, args });
                return { service: serviceName, method: name, input };
            };
        }
    }
    return { calls, services };
}

function createApp(services) {
    const app = new Hono();
    app.use('*', responseMiddleware());
    const routes = createRouteBuilder(app);
    courseCreditRoutes(routes, createCourseCreditHandlers(async () => services, undefined, { async denied() {} }));
    routes.finalize();
    return app;
}

async function request(app, method, path, auth, body) {
    const response = await app.request(path, {
        method,
        headers: {
            authorization: `Bearer ${auth}`,
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            ...(method === 'GET' ? {} : { 'idempotency-key': `key-${method}-${path}` }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return response.json();
}

function token(user) {
    return jwtAuth.sign(
        { headers: {} }, user.id, user.sn || user.id, user.role, Boolean(user.isAdmin), { scope: 'ops', ...user }
    );
}
