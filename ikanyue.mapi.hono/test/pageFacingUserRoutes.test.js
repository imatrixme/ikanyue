const test = require('node:test');
const assert = require('node:assert/strict');

const { requestJson, withEnv, withMockedUserRouteModules } = require('./support/pageRouteTestHelpers');
const { createUserRouteApp, createUserRouteMocks } = require('./support/userRouteFixtures');

test('user routes cover miniapp profile login, refresh, and update flow', async () => {
    await withUserRoutes(async (app, { studentUpdateCalls }) => {
        const loginPayload = await formPost(app, '/v1/user/login', {
            cellphone: '13800138000',
            password: 'secret',
        });
        assert.equal(loginPayload.code, 10000);
        assert.equal(loginPayload.data.role, 'student');
        assert.equal(loginPayload.data.isAdmin, true);
        assert.equal(loginPayload.data.token, 'student:student_1:false');
        assert.equal(loginPayload.data.avatarUrl, 'https://pb.example.com/api/files/students/student_1/avatar.jpg');
        assert.equal(studentUpdateCalls[0].data.lastLoginMethod, 'password');

        const refreshPayload = await requestJson(app, '/v1/user/refresh/student/student_1', { method: 'POST' });
        assert.equal(refreshPayload.code, 10000);
        assert.equal(refreshPayload.data.token, 'student:student_1:false');
        assert.equal(studentUpdateCalls[1].data.lastLoginMethod, 'refresh');

        const updatePayload = await jsonPost(app, '/v1/user/update/student/student_1', {
            nickname: '新昵称',
            realname: '王同学',
            gender: 2,
            age: 12,
            province: '上海市',
            avatar: '',
            ignored: 'field',
        });
        assert.equal(updatePayload.code, 10000);
        assert.equal(updatePayload.data.nickName, '新昵称');
        assert.equal(updatePayload.data.nickname, '新昵称');
        assert.equal(updatePayload.data.realName, '王同学');
        assert.equal(updatePayload.data.realname, '王同学');
        assert.equal(updatePayload.data.gender, 2);
        assert.equal(updatePayload.data.ignored, undefined);
        assert.equal(updatePayload.data.avatar, '');
        assert.deepEqual(studentUpdateCalls[2].data, {
            nickName: '新昵称',
            nickname: '新昵称',
            realName: '王同学',
            realname: '王同学',
            gender: 2,
            age: 12,
            province: '上海市',
            avatar: '',
        });
    }, { DEFAULT_AVATAR: undefined });
});

test('user login route covers miniapp auth success and rejection paths', async () => {
    await withUserRoutes(async (app) => {
        assert.equal((await formPost(app, '/v1/user/login', { cellphone: '', password: '' })).code, 400);
        assert.equal((await formPost(app, '/v1/user/login', { cellphone: 'student_wrong', password: 'wrong' })).code, 401);
        assert.equal((await formPost(app, '/v1/user/login', { cellphone: 'blocked_student', password: 'secret' })).code, 403);

        const studentUpdateErrorPayload = await formPost(app, '/v1/user/login', {
            cellphone: 'student_update_error',
            password: 'secret',
        });
        assert.equal(studentUpdateErrorPayload.code, 10000);
        assert.equal(studentUpdateErrorPayload.data.isAdmin, false);

        assert.equal((await formPost(app, '/v1/user/login', { cellphone: 'teacher_wrong', password: 'wrong' })).code, 401);
        assert.equal((await formPost(app, '/v1/user/login', { cellphone: 'teacher_blocked', password: 'secret' })).code, 403);
        assert.equal((await formPost(app, '/v1/user/login', { cellphone: 'teacher_pending', password: 'secret' })).code, 403);

        const teacherPayload = await formPost(app, '/v1/user/login', { cellphone: 'teacher_ok', password: 'secret' });
        assert.equal(teacherPayload.code, 10000);
        assert.equal(teacherPayload.data.role, 'teacher');
        assert.equal(teacherPayload.data.token, 'teacher:teacher_ok:true');

        const teacherIdAdminPayload = await formPost(app, '/v1/user/login', {
            cellphone: 'teacher_idadmin',
            password: 'secret',
        });
        assert.equal(teacherIdAdminPayload.code, 10000);
        assert.equal(teacherIdAdminPayload.data.isAdmin, true);

        const teacherUpdateErrorPayload = await formPost(app, '/v1/user/login', {
            cellphone: 'teacher_update_error',
            password: 'secret',
        });
        assert.equal(teacherUpdateErrorPayload.code, 10000);
        assert.equal(teacherUpdateErrorPayload.data.isAdmin, false);

        const createdPayload = await formPost(app, '/v1/user/login', {
            cellphone: '13800000000',
            password: 'secret',
        });
        assert.equal(createdPayload.code, 10000);
        assert.equal(createdPayload.data.role, 'student');
        assert.equal(createdPayload.data.isAdmin, false);
        assert.equal(createdPayload.data.token, 'student:student_created:false');

        assert.equal((await formPost(app, '/v1/user/login', { cellphone: 'create_fail', password: 'secret' })).code, 500);
        assert.equal((await formPost(app, '/v1/user/login', { cellphone: 'throw_query', password: 'secret' })).code, 500);
    });
});

test('user refresh route covers unauthorized, student, teacher, and invalid-role paths', async () => {
    await withUserRoutes(async (app) => {
        assert.equal((await requestJson(app, '/v1/user/refresh/none', { method: 'POST' })).code, 403);
        assert.equal((await requestJson(app, '/v1/user/refresh/student/missing', { method: 'POST' })).code, 404);
        assert.equal((await requestJson(app, '/v1/user/refresh/student/blocked_student', { method: 'POST' })).code, 403);
        assert.equal((await requestJson(app, '/v1/user/refresh/student/student_refresh_update_throw', { method: 'POST' })).code, 500);

        const studentArrayAvatar = await requestJson(app, '/v1/user/refresh/student/student_avatar_array', { method: 'POST' });
        assert.equal(studentArrayAvatar.code, 10000);
        assert.equal(studentArrayAvatar.data.avatar, 'avatar-array.jpg');
        const studentLegacyAvatar = await requestJson(app, '/v1/user/refresh/student/student_avatar_legacy', { method: 'POST' });
        assert.equal(studentLegacyAvatar.data.avatar, 'legacy-avatar.jpg');

        const teacherPayload = await requestJson(app, '/v1/user/refresh/teacher/teacher_ok', { method: 'POST' });
        assert.equal(teacherPayload.code, 10000);
        assert.equal(teacherPayload.data.role, 'teacher');
        assert.equal(teacherPayload.data.isAdmin, true);
        assert.equal((await requestJson(app, '/v1/user/refresh/teacher/teacher_blocked', { method: 'POST' })).code, 403);
        assert.equal((await requestJson(app, '/v1/user/refresh/teacher/teacher_pending', { method: 'POST' })).code, 403);
        assert.equal((await requestJson(app, '/v1/user/refresh/teacher/teacher_missing', { method: 'POST' })).code, 404);

        const teacherArrayAvatar = await requestJson(app, '/v1/user/refresh/teacher/teacher_avatar_array', { method: 'POST' });
        assert.equal(teacherArrayAvatar.data.avatar, 'teacher-array.jpg');
        const teacherLegacyAvatar = await requestJson(app, '/v1/user/refresh/teacher/teacher_avatar_legacy', { method: 'POST' });
        assert.equal(teacherLegacyAvatar.data.avatar, 'teacher-legacy.jpg');
        assert.equal((await requestJson(app, '/v1/user/refresh/role/other', { method: 'POST' })).code, 400);
    });
});

test('user update route covers field filtering, role routing, and update failures', async () => {
    await withUserRoutes(async (app) => {
        assert.equal((await requestJson(app, '/v1/user/update/none', { method: 'POST' })).code, 403);
        assert.equal((await jsonPost(app, '/v1/user/update/student/student_sn', { ignored: 'field' })).code, 400);
        assert.equal((await jsonPost(app, '/v1/user/update/student/student_update_missing', { nickname: '新昵称' })).code, 404);
        assert.equal((await jsonPost(app, '/v1/user/update/student/student_update_throw', { nickname: '新昵称' })).code, 500);
        assert.equal((await jsonPost(app, '/v1/user/update/student/student_update_silent_ignore', { nickname: '新昵称' })).code, 500);
        assert.equal((await jsonPost(app, '/v1/user/update/student/student_avatar_number', { nickname: '新昵称' })).code, 500);

        const teacherPayload = await formPost(app, '/v1/user/update/teacher/teacher_ok', {
            nickname: '老师',
            avatar: 'https://example.com/avatar.jpg',
        });
        assert.equal(teacherPayload.code, 10000);
        assert.equal(teacherPayload.data.nickName, '老师');
        assert.equal(teacherPayload.data.nickname, '老师');

        assert.equal((await jsonPost(app, '/v1/user/update/teacher/teacher_update_missing', { nickname: '老师' })).code, 404);
        assert.equal((await jsonPost(app, '/v1/user/update/teacher/teacher_update_throw', { nickname: '老师' })).code, 500);
        assert.equal((await jsonPost(app, '/v1/user/update/role/other', { nickname: '角色' })).code, 400);
    });
});

async function withUserRoutes(fn, envOverrides = {}) {
    return withEnv(
        {
            DEFAULT_AVATAR: 'https://example.com/default.png',
            PB_URL: 'https://pb.example.com',
            S3_BUCKET: undefined,
            S3_URL: undefined,
            ...envOverrides,
        },
        async () => {
            const mocks = createUserRouteMocks();
            return withMockedUserRouteModules(mocks, async (handlers) => fn(createUserRouteApp(handlers), mocks));
        }
    );
}

function formPost(app, path, fields) {
    return requestJson(app, path, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields),
    });
}

function jsonPost(app, path, body) {
    return requestJson(app, path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
}
