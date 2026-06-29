const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');

const { opsAuthMiddleware, opsPasswordChangeGuard } = require('../src/middleware/opsAuth');
const { responseMiddleware } = require('../src/middleware/response');
const { createOpsServices } = require('../src/services/ops');
const {
    buildPagination,
    getBearerToken,
    mapRecord,
    parseJsonField,
    readRequestBody,
    sanitizePrivateFields,
} = require('../src/services/ops/opsUtils');
const {
    createOpsApp,
    createOpsSeed,
    createOpsTestRepository,
    createToken,
    jsonRequest,
} = require('./support/opsTestHarness');

test('ops auth accepts only verified teacher/admin accounts and never creates students', async () => {
    const repository = createOpsTestRepository(createOpsSeed());
    const app = createOpsApp(repository);

    const teacherLogin = await jsonRequest(app, '/ops/auth/login', {
        method: 'POST',
        body: { cellphone: '13800138001', password: 'secret' },
    });
    assert.equal(teacherLogin.code, 10000);
    assert.equal(teacherLogin.data.profile.role, 'teacher');
    assert.equal(teacherLogin.data.profile.isAdmin, false);

    const adminLogin = await jsonRequest(app, '/ops/auth/login', {
        method: 'POST',
        body: { account: 'admin', password: '1loveU_shaoyi' },
    });
    assert.equal(adminLogin.code, 10000);
    assert.equal(adminLogin.data.profile.role, 'admin');

    assert.equal((await jsonRequest(app, '/ops/auth/login', {
        method: 'POST',
        body: { cellphone: '13900139001', password: 'secret' },
    })).code, 401);
    assert.equal((await jsonRequest(app, '/ops/auth/login', {
        method: 'POST',
        body: { cellphone: '13800138003', password: 'secret' },
    })).code, 403);
    assert.equal((await jsonRequest(app, '/ops/auth/login', {
        method: 'POST',
        body: { cellphone: '13800138004', password: 'secret' },
    })).code, 403);
    assert.equal(repository.data.students.length, 2);
    assert.ok(repository.data.ops_audit_logs.some((event) => event.action === 'ops.auth.login'));
});

test('default admin login can be forced through password change before ops access', async () => {
    const seed = createOpsSeed();
    seed.teachers[1].opsPasswordChangeRequired = true;
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);

    const login = await jsonRequest(app, '/ops/auth/login', {
        method: 'POST',
        body: { username: 'admin', password: '1loveU_shaoyi' },
    });
    assert.equal(login.code, 10000);
    assert.equal(login.data.profile.passwordChangeRequired, true);

    assert.equal((await jsonRequest(app, '/ops/auth/me', { token: login.data.token })).code, 10000);
    assert.equal((await jsonRequest(app, '/ops/reward-items', { token: login.data.token })).message, '首次登录必须先修改默认密码');

    const changed = await jsonRequest(app, '/ops/auth/change-password', {
        method: 'POST',
        token: login.data.token,
        body: { currentPassword: '1loveU_shaoyi', newPassword: 'newAdmin1234', confirmPassword: 'newAdmin1234' },
    });
    assert.equal(changed.code, 10000);
    assert.equal(changed.data.profile.passwordChangeRequired, false);
    assert.equal(repository.data.teachers.find((teacher) => teacher.id === 'admin_1').opsPasswordChangeRequired, false);
});

test('ops teacher registration is gated and creates pending inactive accounts', async () => {
    const originalFlag = process.env.OPS_REGISTRATION_ENABLED;
    try {
        delete process.env.OPS_REGISTRATION_ENABLED;
        const repository = createOpsTestRepository(createOpsSeed());
        const app = createOpsApp(repository);

        const disabled = await jsonRequest(app, '/ops/auth/register', {
            method: 'POST',
            body: { cellphone: '13800138009', password: 'secret123', realName: '待审老师' },
        });
        assert.equal(disabled.code, 403);

        process.env.OPS_REGISTRATION_ENABLED = 'true';
        const registered = await jsonRequest(app, '/ops/auth/register', {
            method: 'POST',
            body: { cellphone: '13800138009', password: 'secret123', realName: '待审老师' },
        });
        assert.equal(registered.code, 10000);
        assert.equal(registered.data.status, 'pending_activation');
        assert.equal(registered.data.profile.verified, false);
        assert.equal(registered.data.profile.blocked, true);
        assert.equal((await jsonRequest(app, '/ops/auth/register', {
            method: 'POST',
            body: { cellphone: '13800138009', password: 'secret123', realName: '重复老师' },
        })).code, 409);
    } finally {
        if (originalFlag === undefined) {
            delete process.env.OPS_REGISTRATION_ENABLED;
        } else {
            process.env.OPS_REGISTRATION_ENABLED = originalFlag;
        }
    }
});

test('ops auth service and middleware cover validation, profile, token, and failure branches', async () => {
    const seed = createOpsSeed();
    const repository = createOpsTestRepository(seed);
    const services = createOpsServices(repository);

    assert.equal((await services.authService.login({ cellphone: '', password: '' })).code, 400);
    assert.equal((await services.authService.me(null)).code, 403);
    assert.equal((await services.authService.me({ id: 'student_1', role: 'student' })).code, 403);
    assert.equal((await services.authService.me({ id: 'blocked_1', role: 'teacher' })).code, 403);
    assert.equal((await services.authService.changePassword(null, {})).message, '后台仅允许教师或管理员访问');
    assert.equal((await services.authService.changePassword({ id: 'teacher_1', role: 'teacher' }, {})).message, '当前密码和新密码不能为空');
    assert.equal((await services.authService.changePassword({ id: 'teacher_1', role: 'teacher' }, {
        currentPassword: 'secret',
        newPassword: 'short',
        confirmPassword: 'short',
    })).message, '新密码至少需要 8 位');
    assert.equal((await services.authService.changePassword({ id: 'teacher_1', role: 'teacher' }, {
        currentPassword: 'secret',
        newPassword: 'newSecret123',
        confirmPassword: 'different123',
    })).message, '两次输入的新密码不一致');
    assert.equal((await services.authService.changePassword({ id: 'teacher_1', role: 'teacher' }, {
        currentPassword: 'wrongSecret',
        newPassword: 'newSecret123',
        confirmPassword: 'newSecret123',
    })).message, '当前密码不正确');

    const app = new Hono();
    app.use('*', responseMiddleware());
    app.get('/protected', opsAuthMiddleware(), (c) => c.data({ user: c.get('user').id }));
    app.get('/ops/reward-items', opsAuthMiddleware(), opsPasswordChangeGuard(), (c) => c.data({ allowed: true }));
    app.get('/ops/auth/me', opsAuthMiddleware(), opsPasswordChangeGuard(), (c) => c.data({ allowed: true }));

    assert.equal((await jsonRequest(app, '/protected')).code, 403);
    assert.equal((await jsonRequest(app, '/protected', { token: 'bad-token' })).code, 403);
    assert.equal((await jsonRequest(app, '/protected', {
        token: require('../src/utils/jwtAuth').jwtAuth.sign({ headers: {} }, 'student_1', 's1', 'student', false),
    })).code, 403);
    const guardedToken = require('../src/utils/jwtAuth').jwtAuth.sign({ headers: {} }, 'teacher_1', 'sn', 'teacher', true, { passwordChangeRequired: true });
    assert.equal((await jsonRequest(app, '/ops/auth/me', { token: guardedToken })).code, 10000);
    assert.equal((await jsonRequest(app, '/ops/reward-items', { token: guardedToken })).message, '首次登录必须先修改默认密码');
});

test('ops utility helpers keep light branch request and projection behavior stable', async () => {
    assert.deepEqual(parseJsonField(undefined, { fallback: true }), { fallback: true });
    assert.deepEqual(parseJsonField({ ok: true }), { ok: true });
    assert.equal(parseJsonField('bad', 'fallback'), 'fallback');
    assert.deepEqual(parseJsonField('{"ok":true}'), { ok: true });
    assert.deepEqual(mapRecord(null, ['id']), null);
    assert.deepEqual(mapRecord({ id: '1', name: 'n' }, ['id']), { id: '1' });
    assert.deepEqual(buildPagination({}, 2, 10), { page: 2, perPage: 10, totalItems: 0, totalPages: 0 });
    assert.deepEqual(sanitizePrivateFields([{ phone: '1', nested: { token: 'secret', name: 'safe' } }, 'raw']), [{ nested: { name: 'safe' } }, 'raw']);
    assert.equal(getBearerToken(fakeContext({ authorization: 'Bearer token-1' })), 'token-1');
    assert.equal(getBearerToken(fakeContext({ token: ' token-2 ' })), 'token-2');
    assert.deepEqual(await readRequestBody(fakeBodyContext('application/json', async () => ({ ok: true }))), { ok: true });
    assert.deepEqual(await readRequestBody(fakeBodyContext('application/json', async () => { throw new Error('bad json'); })), {});
    assert.deepEqual(await readRequestBody(fakeBodyContext('application/x-www-form-urlencoded', null, async () => ({ form: true }))), { form: true });
});

test('ops service factory exposes only light branch services', () => {
    const services = createOpsServices(createOpsTestRepository(createOpsSeed()));
    assert.ok(services.authService);
    assert.ok(services.auditService);
    assert.ok(services.pointService);
    assert.ok(services.rewardService);
    assert.equal(services.assessmentService, undefined);
    assert.equal(services.managementService, undefined);
    assert.equal(services.reportingService, undefined);
});

function fakeContext(headers) {
    return {
        req: {
            header(name) {
                return headers[name.toLowerCase()];
            },
        },
    };
}

function fakeBodyContext(contentType, json, parseBody) {
    return {
        req: {
            header() {
                return contentType;
            },
            json,
            parseBody: parseBody || (async () => ({})),
        },
    };
}
