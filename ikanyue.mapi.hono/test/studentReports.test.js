const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');

const { responseMiddleware } = require('../src/middleware/response');
const { createStudentReportHandlers } = require('../src/routes/student/reports');
const {
    StudentReportService,
    createStudentReportService,
    normalizeRecommendations,
    normalizeSections,
    projectPublicReport,
    projectReportSummary,
} = require('../src/services/reports');
const { createOpsTestRepository } = require('./support/opsTestHarness');

test('student report routes list and open only the authenticated student reports', async () => {
    const repository = createStudentReportRepository();
    const app = createStudentReportApp(repository);

    const listPayload = await requestJson(app, '/v1/student/reports/as/student_1');
    assert.equal(listPayload.code, 10000);
    assert.deepEqual(
        listPayload.data.items.map((item) => item.id),
        ['report_new', 'report_old']
    );
    assert.equal(listPayload.data.items[0].title, '近期测评报告');
    assert.equal(listPayload.data.items[0].totalScore, 92);

    const detailPayload = await requestJson(app, '/v1/student/reports/report_new/as/student_1');
    assert.equal(detailPayload.code, 10000);
    assert.equal(detailPayload.data.title, '近期测评报告');
    assert.equal(detailPayload.data.score.totalScore, 92);
    assert.equal(detailPayload.data.sections[0].title, '音准');
    assert.deepEqual(detailPayload.data.recommendations, ['每天练习慢速音阶']);
    assert.equal(detailPayload.data.student.cellphone, undefined);
    assert.equal(detailPayload.data.student.wechatId, undefined);
});

test('student report routes reject anonymous and cross-student access', async () => {
    const repository = createStudentReportRepository();
    const app = createStudentReportApp(repository);

    assert.equal((await requestJson(app, '/v1/student/reports')).code, 403);
    assert.equal((await requestJson(app, '/v1/student/reports/report_new')).code, 403);

    const crossStudent = await requestJson(app, '/v1/student/reports/report_other/as/student_1');
    assert.equal(crossStudent.code, 403);
    assert.match(crossStudent.message, /无权查看/);

    const ownSparse = await requestJson(app, '/v1/student/reports/report_sparse/as/student_2');
    assert.equal(ownSparse.code, 10000);
    assert.equal(ownSparse.data.title, '评估报告');
    assert.equal(ownSparse.data.score.grade, '-');
});

test('student report routes cover validation and repository failure branches', async () => {
    const repository = createStudentReportRepository();
    const app = createStudentReportApp(repository);

    const service = new StudentReportService(repository);
    const missingId = await service.getReport({ id: 'student_1', role: 'student' }, '');
    assert.equal(missingId.code, 400);

    const detailMissing = await requestJson(app, '/v1/student/reports/missing/as/student_1');
    assert.equal(detailMissing.code, 404);
    assert.match(detailMissing.message, /查询报告失败/);

    const throwingService = {
        async listReports() {
            throw new Error('list failed');
        },
        async getReport() {
            throw new Error('detail failed');
        },
    };
    const throwingApp = createStudentReportApp(null, throwingService);
    assert.equal((await requestJson(throwingApp, '/v1/student/reports/as/student_1')).code, 500);
    assert.equal((await requestJson(throwingApp, '/v1/student/reports/report_new/as/student_1')).code, 500);
});

test('report projection handles fallback fields and recommendation variants', () => {
    const projected = projectPublicReport({
        id: 'report_fallback',
        studentId: 'student_1',
        totalScore: 76,
        grade: 'C',
        updated: '2026-05-02T08:00:00.000Z',
        studentSnapshotJson: { realName: '学生', phone: 'secret' },
        teacherSnapshotJson: JSON.stringify({ realName: '老师', token: 'secret' }),
        scoreSnapshotJson: {
            summary: '继续保持',
            sections: [
                { id: 'tone', label: '音色', weightedScore: 33, fullScore: 40, description: '明亮', suggestions: [{ title: '练气息' }] },
            ],
            recommendations: [{ content: '复盘录音' }, '慢练'],
        },
        reportJson: '{bad json',
    });

    assert.equal(projected.title, '评估报告');
    assert.equal(projected.score.totalScore, 76);
    assert.equal(projected.score.grade, 'C');
    assert.equal(projected.summary, '继续保持');
    assert.equal(projected.generatedAt, '2026-05-02T08:00:00.000Z');
    assert.equal(projected.student.phone, undefined);
    assert.equal(projected.teacher.token, undefined);
    assert.deepEqual(projected.recommendations, ['复盘录音', '慢练']);
    assert.deepEqual(projected.sections[0], {
        key: 'tone',
        title: '音色',
        score: 33,
        maxScore: 40,
        comment: '明亮',
        recommendations: ['练气息'],
    });

    assert.deepEqual(normalizeSections('not-array'), []);
    assert.deepEqual(normalizeRecommendations(' 单项建议 '), ['单项建议']);
    assert.deepEqual(normalizeRecommendations([null, { text: '文本' }, { title: '标题' }, { content: '内容' }, '  ']), ['文本', '标题', '内容']);
    assert.deepEqual(normalizeRecommendations({ bad: true }), []);
    assert.deepEqual(normalizeSections([{ title: '标题兜底', totalScore: 12 }])[0], {
        key: '标题兜底',
        title: '标题兜底',
        score: 12,
        maxScore: '',
        comment: '',
        recommendations: [],
    });
    assert.deepEqual(projectReportSummary({ reportJson: { title: '摘要', score: { totalScore: 88, grade: 'B' } } }), {
        id: '',
        title: '摘要',
        totalScore: 88,
        grade: 'B',
        generatedAt: '',
        summary: '',
    });
});

test('report projection covers reportJson fallback variants', () => {
    const projected = projectPublicReport({
        created: '2026-05-03T08:00:00.000Z',
        reportJson: {
            reportId: 'json_report_id',
            title: 'JSON 报告',
            totalScore: 66,
            grade: 'D',
            overallComment: '需要加强',
            suggestions: [{ text: '先稳定节拍' }],
            sections: [
                { title: '节拍', score: 20, comment: '不稳定' },
                { score: 10 },
            ],
        },
    });

    assert.equal(projected.id, 'json_report_id');
    assert.equal(projected.reportId, 'json_report_id');
    assert.equal(projected.score.totalScore, 66);
    assert.equal(projected.score.grade, 'D');
    assert.equal(projected.summary, '需要加强');
    assert.equal(projected.generatedAt, '2026-05-03T08:00:00.000Z');
    assert.deepEqual(projected.recommendations, ['先稳定节拍']);
    assert.equal(projected.sections[0].key, '节拍');
    assert.equal(projected.sections[1].key, 'section_1');
    assert.equal(projectPublicReport().title, '评估报告');
});

test('student report service factory creates a repository-backed service when repository is supplied', async () => {
    const repository = createStudentReportRepository();
    const service = createStudentReportService(repository);
    const payload = await service.listReports({ id: 'student_1', role: 'student' }, { page: '0', perPage: '500' });
    assert.equal(payload.pagination.page, 1);
    assert.equal(payload.pagination.perPage, 100);
    assert.equal(payload.items.length, 2);
});

function createStudentReportApp(repository, serviceOverride = null) {
    const app = new Hono();
    app.use('*', responseMiddleware());
    const handlers = createStudentReportHandlers(serviceOverride || new StudentReportService(repository));
    app.get('/v1/student/reports', handlers.list);
    app.get('/v1/student/reports/:id', handlers.detail);
    app.get('/v1/student/reports/as/:studentId', setStudentUser, handlers.list);
    app.get('/v1/student/reports/:id/as/:studentId', setStudentUser, handlers.detail);
    return app;
}

function setStudentUser(c, next) {
    c.set('user', { id: c.req.param('studentId'), role: 'student', sn: `${c.req.param('studentId')}_sn` });
    return next();
}

async function requestJson(app, path) {
    const response = await app.request(path);
    return response.json();
}

function createStudentReportRepository() {
    return createOpsTestRepository({
        assessment_report_snapshots: [
            report('report_old', 'student_1', '旧测评报告', 80, 'B', '2026-05-01T08:00:00.000Z'),
            report('report_new', 'student_1', '近期测评报告', 92, 'A', '2026-05-20T08:00:00.000Z'),
            report('report_other', 'student_2', '其他学员报告', 70, 'C', '2026-05-19T08:00:00.000Z'),
            { id: 'report_sparse', studentId: 'student_2', teacherId: 'teacher_2', reportJson: {}, created: '2026-05-18T08:00:00.000Z' },
        ],
    });
}

function report(id, studentId, title, totalScore, grade, created) {
    return {
        id,
        studentId,
        teacherId: 'teacher_1',
        totalScore,
        grade,
        created,
        reportJson: {
            id,
            title,
            student: { id: studentId, nickName: '小张', cellphone: '139-secret', wechatId: 'openid-secret' },
            teacher: { id: 'teacher_1', nickName: '王老师', cellphone: '138-secret' },
            score: {
                totalScore,
                grade,
                sections: [{ key: 'pitch', title: '音准', score: 94, comment: '稳定' }],
            },
            summary: '整体稳定',
            recommendations: ['每天练习慢速音阶'],
            generatedAt: created,
        },
    };
}
