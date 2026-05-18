const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');

const { opsAuthMiddleware } = require('../src/middleware/opsAuth');
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

    assert.equal((await jsonRequest(app, '/protected')).code, 403);
    assert.equal((await jsonRequest(app, '/protected', { token: 'bad-token' })).code, 403);

    const studentToken = require('../src/utils/jwtAuth').jwtAuth.sign({ headers: {} }, 'student_1', 's1', 'student', false);
    assert.equal((await jsonRequest(app, '/protected', { token: studentToken })).code, 403);

    const expiredToken = require('../src/utils/jwtAuth').jwtAuth.sign({ headers: { 'sec-fetch-mode': 'cors', 'sec-fetch-site': 'same-origin' } }, 'teacher_1', 'sn', 'teacher', false);
    const decoded = require('jsonwebtoken').decode(expiredToken);
    const forgedExpired = require('jsonwebtoken').sign({ ...decoded, expiredAt: 1 }, 'V_NY6*rF-j.P');
    assert.equal((await jsonRequest(app, '/protected', { token: forgedExpired })).code, 403);
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
    assert.equal(scopedReports.items.length, 1);
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
