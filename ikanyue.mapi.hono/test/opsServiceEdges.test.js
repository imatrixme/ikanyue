const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');

const { opsAuthMiddleware, opsPasswordChangeGuard } = require('../src/middleware/opsAuth');
const { responseMiddleware } = require('../src/middleware/response');
const { createOpsServices } = require('../src/services/ops');
const { scoreAssessment, validateAssessmentTemplate } = require('../src/services/ops/scoringService');
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
    createTemplateSchema,
    createToken,
    jsonRequest,
} = require('./support/opsTestHarness');

test('ops auth middleware rejects missing, invalid, non-teacher, and expired tokens', async () => {
    const app = new Hono();
    app.use('*', responseMiddleware());
    app.get('/protected', opsAuthMiddleware(), (c) => c.data({ user: c.get('user').id }));
    app.get('/ops/auth/me', opsAuthMiddleware(), opsPasswordChangeGuard(), (c) => c.data({ allowed: true }));
    app.post('/ops/auth/change-password', opsAuthMiddleware(), opsPasswordChangeGuard(), (c) => c.data({ allowed: true }));
    app.get('/ops/dashboard', opsAuthMiddleware(), opsPasswordChangeGuard(), (c) => c.data({ allowed: true }));

    assert.equal((await jsonRequest(app, '/protected')).code, 403);
    assert.equal((await jsonRequest(app, '/protected', { token: 'bad-token' })).code, 403);

    const studentToken = require('../src/utils/jwtAuth').jwtAuth.sign({ headers: {} }, 'student_1', 's1', 'student', false);
    assert.equal((await jsonRequest(app, '/protected', { token: studentToken })).code, 403);

    const expiredToken = require('../src/utils/jwtAuth').jwtAuth.sign({ headers: { 'sec-fetch-mode': 'cors', 'sec-fetch-site': 'same-origin' } }, 'teacher_1', 'sn', 'teacher', false);
    const decoded = require('jsonwebtoken').decode(expiredToken);
    const forgedExpired = require('jsonwebtoken').sign({ ...decoded, expiredAt: 1 }, 'V_NY6*rF-j.P');
    assert.equal((await jsonRequest(app, '/protected', { token: forgedExpired })).code, 403);

    const tokenWithClaim = require('../src/utils/jwtAuth').jwtAuth.sign({ headers: {} }, 'teacher_1', 'sn', 'teacher', true, { passwordChangeRequired: true });
    const decodedClaim = require('../src/utils/jwtAuth').jwtAuth.check(tokenWithClaim);
    assert.equal(decodedClaim.passwordChangeRequired, true);
    assert.equal((await jsonRequest(app, '/ops/auth/me', { token: tokenWithClaim })).code, 10000);
    assert.equal((await jsonRequest(app, '/ops/auth/change-password', { method: 'POST', token: tokenWithClaim })).code, 10000);
    assert.equal((await jsonRequest(app, '/ops/dashboard', { token: tokenWithClaim })).message, '首次登录必须先修改默认密码');
});

test('ops utility helpers cover json parsing, bearer variants, projections, and sanitizing', async () => {
    assert.deepEqual(parseJsonField(undefined, { fallback: true }), { fallback: true });
    assert.deepEqual(parseJsonField({ ok: true }), { ok: true });
    assert.equal(parseJsonField('bad', 'fallback'), 'fallback');
    assert.deepEqual(parseJsonField('{"ok":true}'), { ok: true });

    assert.deepEqual(mapRecord(null, ['id']), null);
    assert.deepEqual(mapRecord({ id: '1', name: 'n' }), { id: '1', name: 'n' });
    assert.deepEqual(mapRecord({ id: '1', secret: 'x' }, ['id']), { id: '1' });
    assert.deepEqual(buildPagination({}, 2, 10), { page: 2, perPage: 10, totalItems: 0, totalPages: 0 });

    const sanitized = sanitizePrivateFields([{ phone: '1', nested: { token: 'secret', name: 'safe' } }, 'raw']);
    assert.deepEqual(sanitized, [{ nested: { name: 'safe' } }, 'raw']);

    assert.equal(getBearerToken(fakeContext({ authorization: 'Bearer token-1' })), 'token-1');
    assert.equal(getBearerToken(fakeContext({ token: ' token-2 ' })), 'token-2');
    assert.equal(getBearerToken(fakeContext({ authorization: 'raw-token' })), 'raw-token');

    assert.deepEqual(await readRequestBody(fakeBodyContext('application/json', async () => ({ ok: true }))), { ok: true });
    assert.deepEqual(await readRequestBody(fakeBodyContext('application/json', async () => { throw new Error('bad json'); })), {});
    assert.deepEqual(await readRequestBody(fakeBodyContext('application/x-www-form-urlencoded', null, async () => ({ form: true }))), { form: true });
});

test('scoring service validates template edge cases and scores all first-phase item types', () => {
    const invalid = validateAssessmentTemplate({
        name: '',
        schemaJson: {
            sections: [
                {
                    key: '',
                    title: '',
                    weight: 0.5,
                    items: [
                        { key: '', type: 'unknown' },
                        { key: 'choice', type: 'single_choice' },
                        { key: 'choice', type: 'multi_choice', options: [] },
                    ],
                },
            ],
        },
        scoringJson: { type: 'script' },
    });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.length >= 6);

    assert.equal(validateAssessmentTemplate({ name: '空', schemaJson: { sections: [] } }).valid, false);

    const schema = {
        sections: [
            {
                key: 'mixed',
                title: '综合',
                weight: 1,
                items: [
                    { key: 'multi', type: 'multi_choice', options: [{ value: 'a', score: 20 }, { value: 'b', score: 30 }] },
                    { key: 'slider', type: 'score_slider' },
                    { key: 'single', type: 'single_choice', options: [{ value: 'x', score: 80 }] },
                    { key: 'comment', type: 'rich_comment' },
                    { key: 'legacy', type: 'legacy_score' },
                ],
            },
        ],
        scoring: { type: 'rubric_sum', maxScore: 100, gradeBands: [{ min: 70, label: 'OK' }] },
    };
    const score = scoreAssessment({ schemaJson: schema, scoringJson: schema.scoring }, {
        multi: ['a', 'b'],
        slider: 90,
        single: 'missing',
        comment: 'nice',
    });
    assert.equal(score.totalScore, 46.67);
    assert.equal(score.grade, '');
    assert.equal(score.sectionScores[0].itemScores.find((item) => item.key === 'comment').scoreable, false);
    assert.equal(score.sectionScores[0].itemScores.find((item) => item.key === 'legacy').scoreable, false);

    const emptyScore = scoreAssessment({ schemaJson: { sections: [{ key: 'text', title: '文字', weight: 1, items: [{ key: 't', type: 'textarea' }] }] } }, {});
    assert.equal(emptyScore.totalScore, 0);

    const validDefault = validateAssessmentTemplate({
        name: '默认加权',
        schemaJson: {
            sections: [
                { key: 'score', title: '评分', weight: 1, items: [{ key: 'number', type: 'number_score' }] },
            ],
        },
    });
    assert.equal(validDefault.valid, true);

    const duplicateKeys = validateAssessmentTemplate({
        name: '重复字段',
        schemaJson: {
            sections: [
                { key: 'dup', title: '重复', weight: 1, items: [{ key: 'dup', type: 'number_score' }] },
            ],
        },
    });
    assert.ok(duplicateKeys.errors.some((message) => message.includes('字段 key 重复')));

    const weightedScore = scoreAssessment({
        schemaJson: {
            sections: [
                { key: 'choices', title: '选择', weight: 1, items: [{ key: 'single', type: 'single_choice' }] },
            ],
            scoring: { type: 'weighted_sum', gradeBands: [{ min: 0, label: '基础' }] },
        },
    }, { single: 'missing' });
    assert.equal(weightedScore.grade, '基础');
});

test('ops auth registration and profile helpers cover validation and duplicate branches', async () => {
    const originalFlag = process.env.OPS_REGISTRATION_ENABLED;
    process.env.OPS_REGISTRATION_ENABLED = 'true';
    try {
        const seed = createOpsSeed();
        const repository = createOpsTestRepository(seed);
        const services = createOpsServices(repository);

        assert.equal((await services.authService.register({ cellphone: '', password: 'secret123', realName: '王老师' })).message, '手机号不能为空');
        assert.equal((await services.authService.register({ cellphone: '123', password: 'secret123', realName: '王老师' })).message, '手机号格式不正确');
        assert.equal((await services.authService.register({ cellphone: '13800138009', password: '', realName: '王老师' })).message, '密码不能为空');
        assert.equal((await services.authService.register({ cellphone: '13800138009', password: 'short', realName: '王老师' })).message, '密码至少需要 8 位');
        assert.equal((await services.authService.register({ cellphone: '13800138009', password: 'secret123' })).message, '姓名不能为空');

        const originalCreate = repository.create.bind(repository);
        repository.create = async (collection, data) => {
            if (collection === 'teachers') {
                const error = new Error('cellphone already exists unique constraint');
                error.status = 400;
                throw error;
            }
            return originalCreate(collection, data);
        };
        assert.equal((await services.authService.register({ cellphone: '13800138009', password: 'secret123', realName: '王老师' })).code, 409);

        assert.equal(await services.authService.matchesPassword({ id: 'teacher_without_identity' }, 'secret', ''), false);

        const { projectOpsProfile } = require('../src/services/ops/authService');
        const profile = projectOpsProfile({ id: 'admin_2', sn: 's2', nickname: '昵称', realname: '实名', verified: 'true', blocked: 'false', idAdmin: '1' });
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

test('ops auth password change covers validation and authentication failures', async () => {
    const seed = createOpsSeed();
    seed.teachers[0].blocked = true;
    const blockedServices = createOpsServices(createOpsTestRepository(seed));
    assert.equal((await blockedServices.authService.changePassword({ id: 'teacher_1', role: 'teacher' }, {
        currentPassword: 'secret',
        newPassword: 'newSecret123',
        confirmPassword: 'newSecret123',
    })).message, '教师账号不可用');

    const repository = createOpsTestRepository(createOpsSeed());
    const services = createOpsServices(repository);
    const user = { id: 'teacher_1', role: 'teacher', sn: 't1' };

    assert.equal((await services.authService.changePassword(null, {})).message, '后台仅允许教师或管理员访问');
    assert.equal((await services.authService.changePassword(user, {})).message, '当前密码和新密码不能为空');
    assert.equal((await services.authService.changePassword(user, {
        currentPassword: 'secret',
        newPassword: 'short',
        confirmPassword: 'short',
    })).message, '新密码至少需要 8 位');
    assert.equal((await services.authService.changePassword(user, {
        currentPassword: 'secret',
        newPassword: 'newSecret123',
        confirmPassword: 'different123',
    })).message, '两次输入的新密码不一致');
    assert.equal((await services.authService.changePassword(user, {
        currentPassword: 'wrongSecret',
        newPassword: 'newSecret123',
        confirmPassword: 'newSecret123',
    })).message, '当前密码不正确');
    assert.ok(repository.data.ops_audit_logs.some((event) => event.action === 'ops.auth.change_password' && event.outcome === 'denied'));
});

test('assessment and auth services cover list, me, submitted, and share expiry branches', async () => {
    const seed = createOpsSeed();
    seed.assessment_records.push({
        id: 'submitted_1',
        templateId: 'template_1',
        templateVersion: 1,
        studentId: 'student_1',
        teacherId: 'teacher_1',
        status: 'submitted',
        answersJson: {},
    });
    seed.assessment_report_snapshots.push({
        id: 'report_1',
        assessmentRecordId: 'submitted_1',
        studentId: 'student_1',
        teacherId: 'teacher_1',
        templateId: 'template_1',
        totalScore: 80,
        grade: 'B',
        reportJson: { score: { totalScore: 80 }, student: { cellphone: 'hidden', name: 'visible' } },
    });
    seed.assessment_share_links.push({
        id: 'expired_1',
        reportId: 'report_1',
        tokenHash: require('../src/services/ops/opsUtils').hashToken('expired'),
        expiresAt: '2000-01-01T00:00:00.000Z',
        revokedAt: '',
    });
    seed.assessment_templates.push({
        id: 'bad_template',
        name: '坏模板',
        version: 1,
        status: 'draft',
        schemaJson: { sections: [] },
        scoringJson: { type: 'weighted_sum' },
        reportJson: {},
        createdBy: 'admin_1',
    });

    const repository = createOpsTestRepository(seed);
    const services = createOpsServices(repository);
    const teacher = { ...seed.teachers[0], role: 'teacher' };
    const admin = { ...seed.teachers[1], role: 'teacher' };

    assert.equal((await services.authService.login({ cellphone: '', password: '' })).code, 400);
    assert.equal((await services.authService.me(null)).code, 403);
    assert.equal((await services.authService.me({ id: 'student_1', role: 'student' })).code, 403);
    assert.equal((await services.authService.me({ id: 'blocked_1', role: 'teacher' })).code, 403);
    assert.equal((await services.authService.me({ id: admin.id, role: 'teacher', isAdmin: true })).data.profile.role, 'admin');

    const templates = await services.assessmentService.listTemplates(admin, { status: 'published', perPage: 1 });
    assert.equal(templates.items.length, 1);
    assert.equal((await services.assessmentService.publishTemplate(admin, 'bad_template')).code, 400);

    assert.equal((await services.assessmentService.createRecord(teacher, {})).code, 400);
    assert.equal((await services.assessmentService.saveRecord(teacher, 'submitted_1', { answers: {} })).code, 400);
    assert.equal((await services.assessmentService.submitRecord(teacher, 'submitted_1')).code, 400);

    const scopedReports = await services.assessmentService.listReports(teacher, {});
    assert.ok(scopedReports.items.some((item) => item.id === 'report_1'));
    assert.ok(scopedReports.items.every((item) => item.teacherId === teacher.id));
    const studentReports = await services.assessmentService.listReports(admin, { studentId: 'student_1' });
    assert.equal(studentReports.items[0].id, 'report_1');
    assert.equal((await services.assessmentService.viewSharedReport('expired')).code, 404);
    assert.equal((await services.assessmentService.viewSharedReport('missing')).code, 404);

    const app = createOpsApp(repository);
    const adminToken = createToken(admin);
    const routeProfile = await jsonRequest(app, '/ops/auth/me', { token: adminToken });
    assert.equal(routeProfile.data.profile.role, 'admin');
    assert.equal((await jsonRequest(app, '/ops/assessment-templates?status=published', { token: adminToken })).code, 10000);
    assert.equal((await jsonRequest(app, '/ops/reports?studentId=student_1', { token: adminToken })).code, 10000);
});

test('management service covers unsupported resources, teacher writes, and count fallbacks', async () => {
    const seed = createOpsSeed();
    const repository = createOpsTestRepository(seed);
    const services = createOpsServices(repository);
    const teacher = { ...seed.teachers[0], role: 'teacher' };
    const admin = { ...seed.teachers[1], role: 'teacher' };

    await assert.rejects(() => services.managementService.list('missing', teacher), /不支持/);
    await assert.rejects(() => services.managementService.create('activities', teacher, { title: 'no' }), /需要管理员权限/);
    const filteredAudio = await services.managementService.list('audioMaterials', admin, { search: '气息', status: 'published' });
    assert.equal(filteredAudio.items[0].id, 'audio_1');
    assert.equal((await services.managementService.list('teachers', admin)).items.length, 4);

    repository.list = async (collection, ...args) => {
        if (collection === 'activities') {
            throw new Error('count failed');
        }
        return createOpsTestRepository(seed).list(collection, ...args);
    };
    const dashboard = await services.managementService.dashboard(teacher);
    assert.equal(dashboard.cards.find((card) => card.key === 'activities').value, 0);
});

test('rich text asset service stores image files and returns public urls', async () => {
    const seed = createOpsSeed();
    const repository = createOpsTestRepository(seed);
    const services = createOpsServices(repository);
    const teacher = { ...seed.teachers[0], role: 'teacher' };
    const image = new File([Buffer.from('fake-image')], 'brief.png', { type: 'image/png' });

    const uploaded = await services.richTextAssetService.uploadImage(teacher, {
        file: image,
        title: '图文简介',
        source: 'ops-test',
    });

    assert.equal(uploaded.filename, 'brief.png');
    assert.equal(uploaded.mimeType, 'image/png');
    assert.match(uploaded.url, /brief\.png$/);
    assert.equal(repository.data.ops_rich_text_assets.length, 1);
    assert.equal(repository.data.ops_rich_text_assets[0].createdBy, teacher.id);
    assert.equal(repository.data.ops_rich_text_assets[0].source, 'ops-test');
    await assert.rejects(
        () => services.richTextAssetService.uploadImage(teacher, { file: new File(['bad'], 'bad.txt', { type: 'text/plain' }) }),
        /仅支持/,
    );
});

test('ops services cover default construction, repository wrapper, and share detail branches', async () => {
    const { createShareToken, hashToken } = require('../src/services/ops/opsUtils');
    const { OpsRepository } = require('../src/services/ops/opsRepository');

    assert.ok(createOpsServices().repository);

    const calls = [];
    const repositoryWrapper = new OpsRepository({
        collection(name) {
            calls.push(name);
            return {
                getList: async () => ({ items: [] }),
                getOne: async (id) => ({ id }),
                create: async (data) => ({ id: 'created', ...data }),
                update: async (id, data) => ({ id, ...data }),
                delete: async (id) => ({ id, deleted: true }),
            };
        },
    });
    assert.deepEqual(await repositoryWrapper.list('x'), { items: [] });
    assert.deepEqual(await repositoryWrapper.get('x', 'id_1'), { id: 'id_1' });
    assert.equal((await repositoryWrapper.create('x', { ok: true })).ok, true);
    assert.equal((await repositoryWrapper.update('x', 'id_1', { ok: true })).id, 'id_1');
    assert.equal((await repositoryWrapper.delete('x', 'id_1')).deleted, true);
    assert.deepEqual(calls, ['x', 'x', 'x', 'x', 'x']);

    const seed = createOpsSeed();
    const token = createShareToken('report_1');
    seed.assessment_share_links.push({
        id: 'share_live',
        reportId: 'report_1',
        tokenHash: hashToken(token),
        expiresAt: '2099-01-01T00:00:00.000Z',
        revokedAt: '',
        accessCount: 0,
    });
    const repository = createOpsTestRepository(seed);
    const services = createOpsServices(repository);
    const teacher = { ...seed.teachers[0], role: 'teacher' };

    assert.equal((await services.assessmentService.getReportDetail(teacher, '')).code, 400);
    const detail = await services.assessmentService.getReportDetail(teacher, 'report_1');
    assert.equal(detail.data.score.totalScore, 91);
    const share = await services.assessmentService.createShareLink(teacher, 'report_1', { expiresAt: '2099-01-01T00:00:00.000Z' });
    assert.equal(share.data.expiresAt, '2099-01-01T00:00:00.000Z');
    const revoked = await services.assessmentService.revokeShareLink(teacher, share.data.id);
    assert.ok(revoked.data.revokedAt);
    assert.equal((await services.assessmentService.viewSharedReport(token)).data.reportId, 'report_1');
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
