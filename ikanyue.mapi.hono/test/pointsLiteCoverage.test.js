const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');
const jwt = require('jsonwebtoken');

const { authMiddleware } = require('../src/middleware/auth');
const { responseMiddleware } = require('../src/middleware/response');
const opsRoutes = require('../src/routes/ops');
const { createOpsHandlers } = require('../src/routes/ops/handlers');
const pointsRoutes = require('../src/routes/points');
const { createPointHandlers } = require('../src/routes/points/handlers');
const { AuditService } = require('../src/services/ops/auditService');
const { OpsAuthService, projectOpsProfile } = require('../src/services/ops/authService');
const { hashToken, createShareToken } = require('../src/services/ops/opsUtils');
const { validateOpsSchemas } = require('../src/services/ops/schema');
const { PointService } = require('../src/services/points/pointService');
const { RewardService, publicReward } = require('../src/services/points/rewardService');
const { jwtAuth } = require('../src/utils/jwtAuth');
const { createRouteBuilder } = require('../src/utils/routeBuilder');
const {
    createOpsApp,
    createOpsSeed,
    createOpsTestRepository,
    createStudentToken,
    createToken,
    jsonRequest,
} = require('./support/opsTestHarness');

test('student auth middleware covers token header, raw bearer, invalid, and expired paths', async () => {
    const app = new Hono();
    app.use('*', responseMiddleware());
    app.get('/protected', authMiddleware(), (c) => c.data({ id: c.get('user').id, isWeb: c.get('isWeb') }));

    assert.equal((await jsonRequest(app, '/protected')).message, '未授权，请登录后操作');
    assert.equal((await jsonRequest(app, '/protected', { token: 'bad-token' })).message, '非法授权，请正确登录');

    const expired = jwt.sign({ id: 'student_1', role: 'student', expiredAt: 1 }, 'V_NY6*rF-j.P');
    assert.equal((await jsonRequest(app, '/protected', { token: expired })).message, '令牌过期，请重新登录');

    const token = jwtAuth.sign({ headers: {} }, 'student_1', 'student_sn', 'student', false);
    const tokenHeaderResponse = await app.request('/protected', { headers: { token, 'sec-fetch-mode': 'cors', 'sec-fetch-site': 'same-origin' } });
    const tokenHeaderPayload = await tokenHeaderResponse.json();
    assert.equal(tokenHeaderPayload.code, 10000);
    assert.equal(tokenHeaderPayload.data.isWeb, true);

    const rawBearerResponse = await app.request('/protected', { headers: { authorization: token } });
    assert.equal((await rawBearerResponse.json()).code, 10000);
});

test('ops auth middleware covers expired teacher tokens', async () => {
    const app = new Hono();
    app.use('*', responseMiddleware());
    app.get('/ops/protected', require('../src/middleware/opsAuth').opsAuthMiddleware(), (c) => c.data({ ok: true }));
    app.post('/ops/auth/change-password', require('../src/middleware/opsAuth').opsAuthMiddleware(), require('../src/middleware/opsAuth').opsPasswordChangeGuard(), (c) => c.data({ ok: true }));

    const expired = jwt.sign({ id: 'teacher_1', role: 'teacher', expiredAt: 1 }, 'V_NY6*rF-j.P');
    const response = await jsonRequest(app, '/ops/protected', { token: expired });
    assert.equal(response.code, 403);
    assert.equal(response.message, '后台登录已过期');

    const guardedToken = jwtAuth.sign({ headers: {} }, 'teacher_1', 'sn', 'teacher', true, { passwordChangeRequired: true });
    const allowed = await jsonRequest(app, '/ops/auth/change-password', { method: 'POST', token: guardedToken });
    assert.equal(allowed.code, 10000);
});

test('points handlers reject non-students and convert service failures to standard errors', async () => {
    const seed = createOpsSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const teacherToken = createToken(seed.teachers[0]);

    const denied = await jsonRequest(app, '/v1/points/me', { token: teacherToken });
    assert.equal(denied.code, 403);
    assert.equal(denied.message, '仅学员可访问积分');

    const throwingApp = new Hono();
    throwingApp.use('*', responseMiddleware());
    const routes = createRouteBuilder(throwingApp);
    pointsRoutes(routes, createPointHandlers({
        pointService: {
            async getStudentSummary() {
                throw new Error('points unavailable');
            },
        },
        rewardService: {
            async availability() {
                return {};
            },
        },
    }));
    routes.finalize();

    const studentToken = createStudentToken(seed.students[0]);
    const failed = await jsonRequest(throwingApp, '/v1/points/me', { token: studentToken });
    assert.equal(failed.code, 500);
    assert.equal(failed.message, 'points unavailable');

    const missingMessageApp = new Hono();
    missingMessageApp.use('*', responseMiddleware());
    const missingRoutes = createRouteBuilder(missingMessageApp);
    pointsRoutes(missingRoutes, createPointHandlers({
        pointService: {
            async getStudentSummary() {
                const error = new Error('');
                error.code = 400;
                throw error;
            },
        },
        rewardService: {
            async availability() {
                return {};
            },
        },
    }));
    missingRoutes.finalize();
    assert.equal((await jsonRequest(missingMessageApp, '/v1/points/me', { token: studentToken })).message, '服务器内部错误');
});

test('point service covers missing accounts, defaults, direct negative delta, and no-audit mode', async () => {
    const seed = createOpsSeed();
    const repository = createOpsTestRepository(seed);
    const service = new PointService(repository);

    const summary = await service.getStudentSummary('student_1', { page: 'bad', perPage: 'bad' });
    assert.equal(summary.balance, 0);
    assert.equal(summary.pagination.page, 1);
    assert.equal(repository.data.student_points.length, 1);

    assert.equal(await service.audit('noop', null, 'student_1'), null);
    await assert.rejects(() => service.getStudentSummary('', {}), /学员不能为空/);
    await assert.rejects(() => service.applyDelta({ studentId: 'student_1', delta: -1, type: 'manual_adjust', reason: 'test' }), /积分不足/);

    const zeroRepository = createOpsTestRepository(createOpsSeed());
    zeroRepository.update = async (collection, id, data) => ({ id, ...data, balance: '' });
    const zeroService = new PointService(zeroRepository);
    const zeroResult = await zeroService.applyDelta({ studentId: 'student_1', delta: 0, operator: null, reason: 'zero', type: 'manual_adjust' });
    assert.equal(zeroResult.balance, 0);
    assert.equal(zeroRepository.data.point_events[0].operatorId, '');
    assert.equal(zeroRepository.data.point_events[0].rewardSnapshot, null);
});

test('reward service covers invalid ids, inactive and invalid active rewards, and public defaults', async () => {
    const seed = createOpsSeed();
    seed.reward_items = [
        { id: 'inactive_reward', name: '下线', pointsPrice: 10, status: 'inactive' },
        { id: 'free_reward', name: '无效', pointsPrice: 0, status: 'active' },
    ];
    const repository = createOpsTestRepository(seed);
    const service = new RewardService(repository);

    await assert.rejects(() => service.create({ name: '', pointsPrice: 1 }), /实物名称不能为空/);
    await assert.rejects(() => service.update('', { name: 'x', pointsPrice: 1 }), /实物不能为空/);
    await assert.rejects(() => service.getActiveReward(''), /实物不能为空/);
    await assert.rejects(() => service.getActiveReward('inactive_reward'), /实物已下线/);
    await assert.rejects(() => service.getActiveReward('free_reward'), /实物积分价格无效/);

    const created = await service.create({ title: '徽章', pointsPrice: 20, status: 'inactive' });
    assert.equal(created.name, '徽章');
    assert.equal(created.status, 'inactive');
    assert.deepEqual(publicReward({}), { description: '', id: undefined, image: '', name: '', pointsPrice: 0 });
});

test('ops auth direct service branches cover registration validation, duplicate create, blocked password changes, and profile fallbacks', async () => {
    const originalFlag = process.env.OPS_REGISTRATION_ENABLED;
    process.env.OPS_REGISTRATION_ENABLED = 'true';
    try {
        const seed = createOpsSeed();
        const repository = createOpsTestRepository(seed);
        const service = new OpsAuthService(repository, new AuditService(repository));

        assert.equal((await service.register({ cellphone: '', password: 'secret123', realName: '王老师' })).message, '手机号不能为空');
        assert.equal((await service.register({ cellphone: '123', password: 'secret123', realName: '王老师' })).message, '手机号格式不正确');
        assert.equal((await service.register({ cellphone: '13800138009', password: '', realName: '王老师' })).message, '密码不能为空');
        assert.equal((await service.register({ cellphone: '13800138009', password: 'short', realName: '王老师' })).message, '密码至少需要 8 位');
        assert.equal((await service.register({ cellphone: '13800138009', password: 'secret123' })).message, '姓名不能为空');

        const nickOnly = await service.register(
            { cellphone: '13800138011', password: 'secret123', nickName: '昵称老师' },
            { header: (name) => (name === 'x-real-ip' ? '127.0.0.1' : '') }
        );
        assert.equal(nickOnly.code, undefined);
        assert.equal(nickOnly.ok, true);

        const originalCreate = repository.create.bind(repository);
        repository.create = async (collection, data) => {
            if (collection === 'teachers') {
                const error = new Error('cellphone already exists unique constraint');
                error.status = 400;
                throw error;
            }
            return originalCreate(collection, data);
        };
        assert.equal((await service.register({ cellphone: '13800138009', password: 'secret123', realName: '王老师' })).code, 409);

        repository.create = async (collection, data) => {
            if (collection === 'teachers') {
                const error = new Error('write failed');
                error.status = 500;
                throw error;
            }
            return originalCreate(collection, data);
        };
        await assert.rejects(() => service.register({ cellphone: '13800138010', password: 'secret123', realName: '王老师' }), /write failed/);

        assert.equal((await service.changePassword({ id: 'blocked_1', role: 'teacher' }, {
            currentPassword: 'secret',
            newPassword: 'newSecret123',
            confirmPassword: 'newSecret123',
        })).message, '教师账号不可用');
        assert.equal((await service.changePassword({ id: 'teacher_1', role: 'teacher' }, {
            currentPassword: 'secret',
            newPassword: '1loveU_shaoyi',
            confirmPassword: '1loveU_shaoyi',
        })).message, '新密码不能继续使用默认密码');
        seed.teachers[0].cellphone = '';
        seed.teachers[0].username = 'teacher_username';
        assert.equal((await service.changePassword({ id: 'teacher_1', role: 'teacher' }, {
            currentPassword: 'secret',
            newPassword: 'newSecret123',
            confirmPassword: 'newSecret123',
        })).code, undefined);
        assert.equal(await service.matchesPassword({ id: 'teacher_without_identity', password: 'secret' }, 'secret', ''), true);
        const authenticatedService = new OpsAuthService(repository, new AuditService(repository), async () => true);
        assert.equal(await authenticatedService.matchesPassword({ id: 'teacher_remote', password: 'not-local' }, 'secret', ''), true);

        const profile = projectOpsProfile({ id: 'teacher_fallback', nickname: '昵称', realname: '实名', verified: '1', blocked: '0', idAdmin: '1' });
        assert.equal(profile.nickName, '昵称');
        assert.equal(profile.realName, '实名');
        assert.equal(profile.role, 'admin');
    } finally {
        if (originalFlag === undefined) {
            delete process.env.OPS_REGISTRATION_ENABLED;
        } else {
            process.env.OPS_REGISTRATION_ENABLED = originalFlag;
        }
    }
});

test('ops handlers cover status-only service errors and sendResult fallbacks', async () => {
    const app = new Hono();
    app.use('*', responseMiddleware());
    const routes = createRouteBuilder(app);
    opsRoutes(routes, createOpsHandlers({
        authService: {
            async login() {
                return { ok: false };
            },
            async register() {
                return { ok: false, code: 409 };
            },
            async me() {
                return { ok: true, data: { ok: true } };
            },
            async changePassword() {
                return { ok: true, data: { ok: true } };
            },
        },
        pointService: {
            async getStudentSummary() {
                const error = new Error('');
                error.status = 418;
                throw error;
            },
            async addPoints() {
                return {};
            },
            async offlineRedeem() {
                return {};
            },
        },
        rewardService: {
            async listForAdmin() {
                return {};
            },
            async create() {
                return {};
            },
            async update() {
                return {};
            },
        },
    }));
    routes.finalize();

    assert.equal((await jsonRequest(app, '/ops/auth/login', { method: 'POST', body: {} })).message, '操作失败');
    assert.equal((await jsonRequest(app, '/ops/auth/register', { method: 'POST', body: {} })).code, 409);
    const token = jwtAuth.sign({ headers: {} }, 'admin_1', 'sn', 'teacher', true);
    const failed = await jsonRequest(app, '/ops/points/students/student_1', { token });
    assert.equal(failed.code, 418);
    assert.equal(failed.message, '服务器内部错误');
});

test('audit, token utilities, and schema validation cover fallback paths', async () => {
    const originalError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args.join(' '));
    try {
        const service = new AuditService({
            async create() {
                throw new Error('audit unavailable');
            },
        });
        const payload = await service.record({ actor: null, action: 'x', resourceType: 'points' });
        assert.equal(payload.actorRole, 'anonymous');
        assert.ok(errors.some((line) => line.includes('记录运营审计日志失败')));
    } finally {
        console.error = originalError;
    }

    assert.equal(hashToken('abc').length, 64);
    assert.equal(createShareToken('abc').length, 32);
    const invalidSchema = validateOpsSchemas([{ fields: [] }, { name: 'broken' }]);
    assert.equal(invalidSchema.ok, false);
    assert.ok(invalidSchema.errors.some((error) => error.includes('unknown')));
});
