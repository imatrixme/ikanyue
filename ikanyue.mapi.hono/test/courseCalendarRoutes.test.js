const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');

const { responseMiddleware } = require('../src/middleware/response');
const courseCreditRoutes = require('../src/routes/courseCredits');
const { createCourseCreditHandlers } = require('../src/routes/courseCredits/handlers');
const { requireScheduleUser } = require('../src/routes/courseCredits/scheduleHandlers');
const { createRouteBuilder } = require('../src/utils/routeBuilder');
const { jwtAuth } = require('../src/utils/jwtAuth');

const RANGE = 'from=2026-08-01T00%3A00%3A00.000Z&to=2026-08-31T00%3A00%3A00.000Z';

test('calendar routes enforce role ownership and keep the teacher alias compatible', async () => {
    const fixture = scheduleFixture();
    const app = createApp(fixture.services);
    const teacher = token({
        id: 'teacher-1', role: 'teacher', courseCreditCapabilities: ['course_credit.teacher'],
    });
    const student = token({ id: 'student-1', role: 'student' });

    for (const path of [`/v1/teacher/calendar?${RANGE}`, `/v1/teacher/schedule?${RANGE}&includeAvailability=true`]) {
        const payload = await request(app, path, teacher);
        assert.equal(payload.code, 10000, path);
    }
    assert.equal(fixture.calls.filter((call) => call.name === 'teacher').length, 2);
    assert.equal(fixture.calls[0].args[0], 'teacher-1');
    assert.equal(fixture.calls[1].args[1].includeAvailability, 'true');

    const upcoming = await request(app, '/v1/schedule/upcoming?limit=2', student);
    assert.equal(upcoming.code, 10000);
    assert.equal(fixture.calls.find((call) => call.name === 'upcoming').args[0].id, 'student-1');

    const denied = await request(app, `/v1/teacher/schedule?${RANGE}`, student);
    assert.equal(denied.code, 403);
    assert.equal(denied.errorCode, 'BOOKING_TEACHER_REQUIRED');
    const unsupported = await request(app, '/v1/schedule/upcoming', token({ id: 'operator', role: 'admin' }));
    assert.equal(unsupported.code, 403);
    assert.equal(unsupported.errorCode, 'CALENDAR_ROLE_UNSUPPORTED');
});

test('Ops calendar preserves academic filters and routes teacher-only users to their scope', async () => {
    const fixture = scheduleFixture();
    const app = createApp(fixture.services);
    const academic = token({
        id: 'operator', role: 'teacher', courseCreditCapabilities: ['course_credit.academic'],
    });
    const path = `/ops/course-calendar?${RANGE}`
        + '&teacherId=teacher-1&studentId=student-1&classId=class-1&courseSpecId=course-1'
        + '&status=scheduled&originType=class';
    const payload = await request(app, path, academic);
    assert.equal(payload.code, 10000);
    const query = fixture.calls.find((call) => call.name === 'institution').args[0];
    assert.equal(query.teacherId, 'teacher-1');
    assert.equal(query.originType, 'class');

    const teacher = await request(app, `/ops/course-calendar?${RANGE}`, token({
        id: 'teacher-1', role: 'teacher', courseCreditCapabilities: ['course_credit.teacher'],
    }));
    assert.equal(teacher.code, 10000);
    assert.equal(fixture.calls.find((call) => call.name === 'teacherOps').args[0], 'teacher-1');

    const denied = await request(app, `/ops/course-calendar?${RANGE}`, token({
        id: 'finance-1', role: 'teacher', courseCreditCapabilities: ['course_credit.finance'],
    }));
    assert.equal(denied.code, 403);
});

test('schedule handler identity helper rejects missing and unsupported users', () => {
    assert.equal(requireScheduleUser({ id: 'student', role: 'student' }).id, 'student');
    assert.throws(() => requireScheduleUser(null), hasCode('CALENDAR_ROLE_UNSUPPORTED'));
    assert.throws(() => requireScheduleUser({ id: 'x', role: 'admin' }), hasCode('CALENDAR_ROLE_UNSUPPORTED'));
});

function scheduleFixture() {
    const calls = [];
    const scheduleQueryService = {};
    for (const name of ['institution', 'teacher', 'teacherOps', 'upcoming']) {
        scheduleQueryService[name] = async (...args) => {
            calls.push({ name, args });
            return { name, args };
        };
    }
    return { calls, services: { scheduleQueryService } };
}

function createApp(services) {
    const app = new Hono();
    app.use('*', responseMiddleware());
    const routes = createRouteBuilder(app);
    courseCreditRoutes(routes, createCourseCreditHandlers(async () => services, undefined, { async denied() {} }));
    routes.finalize();
    return app;
}

async function request(app, path, auth) {
    const response = await app.request(path, { headers: { authorization: `Bearer ${auth}` } });
    return response.json();
}

function token(user) {
    return jwtAuth.sign({ headers: {} }, user.id, user.sn || user.id, user.role,
        Boolean(user.isAdmin), { scope: 'ops', ...user });
}

function hasCode(code) {
    return (error) => error?.code === code;
}
