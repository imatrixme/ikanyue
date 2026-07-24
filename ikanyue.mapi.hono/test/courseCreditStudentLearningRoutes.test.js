const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');

const { jwtAuth } = require('../src/utils/jwtAuth');
const { responseMiddleware } = require('../src/middleware/response');
const { createRouteBuilder } = require('../src/utils/routeBuilder');
const courseCreditRoutes = require('../src/routes/courseCredits');
const { createCourseCreditHandlers } = require('../src/routes/courseCredits/handlers');
const { requireLearningStudent } = require('../src/routes/courseCredits/studentLearningHandlers');

test('student learning routes use authenticated identity and forward only supported query fields', async () => {
    const calls = [];
    const app = createApp(services(calls));
    const authorization = `Bearer ${token({ id: 'student-1', role: 'student' })}`;

    assert.equal((await get(app, '/v1/student/learning/overview', authorization)).data.screen, 'overview');
    assert.equal((await get(app, '/v1/student/learning/courses/course-1', authorization)).data.courseId, 'course-1');
    assert.equal((await get(app, '/v1/student/learning/lessons?page=2&perPage=5&scope=upcoming&courseId=course-1&ignored=x', authorization)).data.items.length, 0);
    assert.equal((await get(app, '/v1/student/learning/lessons/lesson-1', authorization)).data.lessonId, 'lesson-1');
    assert.equal((await get(app, '/v1/student/learning/records?page=3&courseId=course-1', authorization)).data.items.length, 0);

    assert.deepEqual(calls, [
        ['overview', 'student-1'],
        ['course', 'student-1', 'course-1'],
        ['lessons', 'student-1', { page: '2', perPage: '5', scope: 'upcoming', courseId: 'course-1' }],
        ['lesson', 'student-1', 'lesson-1'],
        ['records', 'student-1', { page: '3', courseId: 'course-1' }],
    ]);
});

test('student learning routes reject non-students before loading services', async () => {
    let loaded = false;
    const app = createApp(null, async () => {
        loaded = true;
        return null;
    });
    const payload = await get(app, '/v1/student/learning/overview',
        `Bearer ${token({ id: 'teacher-1', role: 'teacher' })}`);

    assert.equal(payload.code, 403);
    assert.equal(payload.errorCode, 'STUDENT_LEARNING_STUDENT_REQUIRED');
    assert.match(payload.message, /仅学员/);
    assert.equal(loaded, false);
});

test('student learning handler validation covers missing users', () => {
    assert.throws(() => requireLearningStudent(), hasCode('STUDENT_LEARNING_STUDENT_REQUIRED'));
    assert.deepEqual(requireLearningStudent({ id: 's', role: 'student' }), { id: 's', role: 'student' });
});

function services(calls) {
    return {
        studentLearningService: {
            async overview(studentId) { calls.push(['overview', studentId]); return { screen: 'overview' }; },
            async getCourse(studentId, courseId) { calls.push(['course', studentId, courseId]); return { courseId }; },
            async listLessons(studentId, query) { calls.push(['lessons', studentId, query]); return { items: [] }; },
            async getLesson(studentId, lessonId) { calls.push(['lesson', studentId, lessonId]); return { lessonId }; },
            async listRecords(studentId, query) { calls.push(['records', studentId, query]); return { items: [] }; },
        },
    };
}

function createApp(serviceSet, loadServices = async () => serviceSet) {
    const app = new Hono();
    app.use('*', responseMiddleware());
    const routes = createRouteBuilder(app);
    courseCreditRoutes(routes, createCourseCreditHandlers(loadServices, undefined, { async denied() {} }));
    routes.finalize();
    return app;
}

async function get(app, path, authorization) {
    const response = await app.request(path, { headers: { authorization } });
    return response.json();
}

function token(user) {
    return jwtAuth.sign({ headers: {} }, user.id, user.id, user.role, false, user);
}

function hasCode(code) {
    return (error) => error?.code === code;
}
