const { Hono } = require('hono');
const md5 = require('licia/md5');

const { responseMiddleware } = require('../../src/middleware/response');
const { createCollectionMock } = require('./pageRouteTestHelpers');

function createJwtAuthMock() {
    return {
        jwtAuth: {
            sign(_request, id, _sn, role, isAdmin) {
                return `${role}:${id}:${isAdmin}`;
            },
        },
    };
}

function createUserRouteApp({ userLoginHandler, userRefreshHandler, userUpdateHandler }) {
    const app = new Hono();
    app.use('*', responseMiddleware());
    app.post('/v1/user/login', userLoginHandler);
    app.post('/v1/user/refresh/student/:id', async (c) => {
        c.set('user', { id: c.req.param('id'), sn: 'student_sn', role: 'student' });
        return userRefreshHandler(c);
    });
    app.post('/v1/user/refresh/teacher/:id', async (c) => {
        c.set('user', { id: c.req.param('id'), sn: 'teacher_sn', role: 'teacher' });
        return userRefreshHandler(c);
    });
    app.post('/v1/user/refresh/none', userRefreshHandler);
    app.post('/v1/user/refresh/role/:role', async (c) => {
        c.set('user', { id: 'role_user', sn: 'role_sn', role: c.req.param('role') });
        return userRefreshHandler(c);
    });
    app.post('/v1/user/update/student/:id', async (c) => {
        c.set('user', { id: c.req.param('id'), sn: 'student_sn', role: 'student' });
        return userUpdateHandler(c);
    });
    app.post('/v1/user/update/teacher/:id', async (c) => {
        c.set('user', { id: c.req.param('id'), sn: 'teacher_sn', role: 'teacher' });
        return userUpdateHandler(c);
    });
    app.post('/v1/user/update/none', userUpdateHandler);
    app.post('/v1/user/update/role/:role', async (c) => {
        c.set('user', { id: 'role_user', sn: 'role_sn', role: c.req.param('role') });
        return userUpdateHandler(c);
    });
    return app;
}

function createUserRouteMocks() {
    const studentUpdateCalls = [];
    const pocketbaseMock = createCollectionMock({
        students: createStudentsCollection(studentUpdateCalls),
        teachers: createTeachersCollection(),
    });

    return {
        jwtAuthMock: createJwtAuthMock(),
        pocketbaseMock,
        studentUpdateCalls,
    };
}

function createStudentsCollection(studentUpdateCalls) {
    return {
        async getList(_page, _perPage, options = {}) {
            const filter = options.filter || '';
            if (filter.includes('throw_query')) {
                throw new Error('student query failed');
            }
            if (filter.includes('13800138000')) {
                return { items: [studentLoginRecord('student_1', { avatarFile: 'avatar.jpg', idAdmin: true })] };
            }
            if (filter.includes('student_wrong')) {
                return { items: [studentLoginRecord('student_wrong')] };
            }
            if (filter.includes('student_update_error')) {
                return { items: [studentLoginRecord('student_update_error')] };
            }
            if (filter.includes('blocked_student')) {
                return { items: [studentLoginRecord('blocked_student', { blocked: true })] };
            }
            return { items: [] };
        },
        async getOne(id) {
            if (id === 'missing' || id === 'student_update_missing') {
                throw new Error('missing student');
            }
            if (id === 'blocked_student') {
                return studentRecord(id, { blocked: true });
            }
            if (id === 'student_avatar_array') {
                return studentRecord(id, { avatarFile: ['avatar-array.jpg'] });
            }
            if (id === 'student_avatar_legacy') {
                return studentRecord(id, { avatar: 'legacy-avatar.jpg' });
            }
            return studentRecord(id);
        },
        async update(id, data) {
            studentUpdateCalls.push({ id, data });
            if (['student_update_error', 'student_refresh_update_throw', 'student_update_throw'].includes(id)) {
                throw new Error('student update failed');
            }
            if (id === 'student_avatar_number') {
                return studentRecord(id, { avatar: 7, ...data });
            }
            if (id === 'student_1') {
                return studentRecord(id, {
                    avatar: data.avatar || '',
                    avatarFile: 'avatar.jpg',
                    idAdmin: true,
                    nickname: data.nickname || '小王',
                    ...data,
                });
            }
            return studentRecord(id, {
                avatar: data.avatar || '',
                avatarFile: id === 'student_1' ? 'avatar.jpg' : data.avatarFile,
                nickname: data.nickname || '小王',
                ...data,
            });
        },
        async create(data) {
            if (data.cellphone === 'create_fail') {
                throw new Error('create failed');
            }
            return { id: 'student_created', collectionId: 'students', ...data };
        },
    };
}

function createTeachersCollection() {
    return {
        async getList(_page, _perPage, options = {}) {
            const filter = options.filter || '';
            if (filter.includes('teacher_wrong')) {
                return { items: [teacherLoginRecord('teacher_wrong')] };
            }
            if (filter.includes('teacher_blocked')) {
                return { items: [teacherLoginRecord('teacher_blocked', { blocked: true })] };
            }
            if (filter.includes('teacher_pending')) {
                return { items: [teacherLoginRecord('teacher_pending', { verified: false })] };
            }
            if (filter.includes('teacher_ok')) {
                return { items: [teacherLoginRecord('teacher_ok', { isAdmin: true })] };
            }
            if (filter.includes('teacher_idadmin')) {
                return { items: [teacherLoginRecord('teacher_idadmin', { idAdmin: true })] };
            }
            if (filter.includes('teacher_update_error')) {
                return { items: [teacherLoginRecord('teacher_update_error')] };
            }
            return { items: [] };
        },
        async getOne(id) {
            if (id === 'teacher_missing' || id === 'teacher_update_missing') {
                throw new Error('missing teacher');
            }
            if (id === 'teacher_blocked') {
                return teacherRecord(id, { blocked: true });
            }
            if (id === 'teacher_pending') {
                return teacherRecord(id, { verified: false });
            }
            if (id === 'teacher_avatar_array') {
                return teacherRecord(id, { avatarFile: ['teacher-array.jpg'], isAdmin: false });
            }
            if (id === 'teacher_avatar_legacy') {
                return teacherRecord(id, { avatar: 'teacher-legacy.jpg', isAdmin: false });
            }
            return teacherRecord(id, { isAdmin: true });
        },
        async update(id, data) {
            if (id === 'teacher_update_error') {
                throw new Error('teacher login update failed');
            }
            if (id === 'teacher_update_throw') {
                throw new Error('teacher update failed');
            }
            if (id === 'teacher_idadmin') {
                return teacherRecord(id, { idAdmin: true, avatar: data.avatar || '', ...data });
            }
            return teacherRecord(id, { isAdmin: true, avatar: data.avatar || '', ...data });
        },
    };
}

function studentLoginRecord(id, overrides = {}) {
    return studentRecord(id, {
        cellphone: id === 'student_1' ? '13800138000' : id,
        password: md5('secret'),
        ...overrides,
    });
}

function teacherLoginRecord(id, overrides = {}) {
    return teacherRecord(id, {
        cellphone: id,
        password: md5('secret'),
        ...overrides,
    });
}

function studentRecord(id, overrides = {}) {
    return {
        id,
        sn: `${id}_sn`,
        collectionId: 'students',
        avatar: '',
        blocked: false,
        ...overrides,
    };
}

function teacherRecord(id, overrides = {}) {
    return {
        id,
        sn: `${id}_sn`,
        collectionId: 'teachers',
        avatar: '',
        blocked: false,
        verified: true,
        ...overrides,
    };
}

module.exports = {
    createUserRouteApp,
    createUserRouteMocks,
};
