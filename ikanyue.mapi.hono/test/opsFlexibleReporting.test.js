const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createOpsApp,
    createOpsSeed,
    createOpsTestRepository,
    createToken,
    jsonRequest,
} = require('./support/opsTestHarness');

test('ops flexible reporting creates events, generates reports, and publishes student reports', async () => {
    const seed = createFlexibleSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const adminToken = createToken(seed.teachers[1]);

    const eventPayload = {
        title: '春季期中反馈',
        reportType: 'midterm_student',
        templateId: 'report_template_1',
        scopeType: 'program',
        scopeId: 'program_1',
        programId: 'program_1',
    };
    const createdEvent = await jsonRequest(app, '/ops/report-events', {
        method: 'POST',
        token: adminToken,
        body: eventPayload,
    });
    assert.equal(createdEvent.code, 10000);
    assert.equal(createdEvent.data.scopeType, 'program');

    const generated = await jsonRequest(app, `/ops/report-events/${createdEvent.data.id}/instances`, {
        method: 'POST',
        token: adminToken,
        body: {
            targets: [
                {
                    id: 'student_1',
                    type: 'student',
                    name: '张同学',
                    title: '张同学期中反馈',
                    summary: '音准稳定',
                    score: { totalScore: 93, grade: 'A' },
                    subject: { id: 'student_1', realName: '张同学', cellphone: 'secret' },
                    recipient: { id: 'student_1', realName: '张同学', openid: 'secret' },
                },
            ],
        },
    });
    assert.equal(generated.code, 10000);
    assert.equal(generated.data.items.length, 1);
    const reportId = generated.data.items[0].id;

    const published = await jsonRequest(app, `/ops/report-instances/${reportId}/publish`, {
        method: 'POST',
        token: adminToken,
    });
    assert.equal(published.code, 10000);
    assert.equal(published.data.status, 'published');

    const studentService = new (require('../src/services/reports').StudentReportService)(repository);
    const studentReports = await studentService.listReports({ id: 'student_1', role: 'student' });
    assert.ok(studentReports.items.some((item) => item.id === reportId));
    const detail = await studentService.getReport({ id: 'student_1', role: 'student' }, reportId);
    assert.equal(detail.ok, true);
    assert.equal(detail.data.reportType, 'midterm_student');
    assert.equal(detail.data.subject.cellphone, undefined);
    assert.equal(detail.data.recipient.openid, undefined);
});

test('assigned teacher can create session event and read published teacher feedback only', async () => {
    const seed = createFlexibleSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const teacherToken = createToken(seed.teachers[0]);
    const adminToken = createToken(seed.teachers[1]);

    const createdEvent = await jsonRequest(app, '/ops/report-events', {
        method: 'POST',
        token: teacherToken,
        body: {
            title: '体验课教师反馈',
            reportType: 'teacher_feedback',
            templateId: 'report_template_2',
            scopeType: 'session',
            scopeId: 'session_1',
            sessionId: 'session_1',
        },
    });
    assert.equal(createdEvent.code, 10000);

    const generated = await jsonRequest(app, `/ops/report-events/${createdEvent.data.id}/instances`, {
        method: 'POST',
        token: teacherToken,
        body: {
            targets: [
                {
                    subjectType: 'teacher',
                    subjectId: 'teacher_1',
                    recipientType: 'teacher',
                    recipientId: 'teacher_1',
                    title: '教师课后反馈',
                    summary: '课堂节奏良好',
                },
            ],
        },
    });
    assert.equal(generated.code, 10000);
    const reportId = generated.data.items[0].id;
    assert.equal((await jsonRequest(app, `/ops/report-instances/${reportId}/publish`, { method: 'POST', token: adminToken })).code, 10000);

    const teacherList = await jsonRequest(app, '/ops/report-instances', { token: teacherToken });
    assert.equal(teacherList.code, 10000);
    assert.deepEqual(teacherList.data.items.map((item) => item.id), [reportId]);

    const detail = await jsonRequest(app, `/ops/report-instances/${reportId}`, { token: teacherToken });
    assert.equal(detail.code, 10000);
    assert.equal(detail.data.recipient.type, 'teacher');
    assert.equal(detail.data.summary, '课堂节奏良好');

    const unassignedToken = createToken({ ...seed.teachers[2], id: 'blocked_1', blocked: false, verified: true, isAdmin: false });
    const denied = await jsonRequest(app, '/ops/report-events', {
        method: 'POST',
        token: unassignedToken,
        body: {
            title: '越权',
            reportType: 'teacher_feedback',
            templateId: 'report_template_2',
            scopeType: 'session',
            scopeId: 'session_1',
            sessionId: 'session_1',
        },
    });
    assert.equal(denied.code, 403);
});

test('flexible reporting validates required event and target fields', async () => {
    const seed = createFlexibleSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const adminToken = createToken(seed.teachers[1]);

    const missingEvent = await jsonRequest(app, '/ops/report-events', {
        method: 'POST',
        token: adminToken,
        body: { title: '缺字段' },
    });
    assert.equal(missingEvent.code, 400);

    const generated = await jsonRequest(app, '/ops/report-events/event_existing/instances', {
        method: 'POST',
        token: adminToken,
        body: { targets: [] },
    });
    assert.equal(generated.code, 400);

    const missingDetail = await jsonRequest(app, '/ops/report-instances/missing', { token: adminToken });
    assert.equal(missingDetail.code, 404);
});

test('flexible reporting lists, updates, revokes, and validates non-admin scope access', async () => {
    const seed = createFlexibleSeed();
    seed.report_instances.push({
        id: 'teacher_report_custom',
        eventId: '',
        templateId: 'report_template_2',
        reportType: 'teacher_feedback',
        scopeType: 'custom',
        scopeId: 'custom_1',
        subjectType: 'teacher',
        subjectId: 'teacher_1',
        recipientType: 'teacher',
        recipientId: 'teacher_1',
        status: 'published',
        reportJson: { title: '无事件教师反馈', reportType: 'teacher_feedback', recipient: { id: 'teacher_1', name: '王老师' } },
        publishedAt: '2026-06-01T08:00:00.000Z',
    });
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const teacherToken = createToken(seed.teachers[0]);
    const adminToken = createToken(seed.teachers[1]);

    const adminEvents = await jsonRequest(app, '/ops/report-events?status=open&scopeType=program&scopeId=program_1', { token: adminToken });
    assert.equal(adminEvents.code, 10000);
    assert.ok(adminEvents.data.items.some((item) => item.id === 'event_existing'));

    const teacherEvents = await jsonRequest(app, '/ops/report-events', { token: teacherToken });
    assert.equal(teacherEvents.code, 10000);
    assert.deepEqual(teacherEvents.data.items, []);

    const updated = await jsonRequest(app, '/ops/report-events/event_existing', {
        method: 'POST',
        token: adminToken,
        body: { status: 'closed', ignored: 'private' },
    });
    assert.equal(updated.code, 10000);
    assert.equal(updated.data.status, 'closed');
    assert.equal(updated.data.ignored, undefined);

    const detail = await jsonRequest(app, '/ops/report-instances/teacher_report_custom', { token: teacherToken });
    assert.equal(detail.code, 10000);
    assert.equal(detail.data.reportType, 'teacher_feedback');

    const revoked = await jsonRequest(app, '/ops/report-instances/teacher_report_custom/revoke', { method: 'POST', token: adminToken });
    assert.equal(revoked.code, 10000);
    assert.equal(revoked.data.status, 'revoked');

    const customDenied = await jsonRequest(app, '/ops/report-events', {
        method: 'POST',
        token: teacherToken,
        body: { title: '自定义', reportType: 'custom', templateId: 'report_template_1', scopeType: 'custom', scopeId: 'custom_1' },
    });
    assert.equal(customDenied.code, 403);
});

test('flexible reporting covers program-scoped teachers, filters, and non-recipient denials', async () => {
    const seed = createFlexibleSeed();
    seed.report_instances.push({
        id: 'unowned_report',
        eventId: '',
        templateId: 'report_template_2',
        reportType: 'teacher_feedback',
        scopeType: 'custom',
        scopeId: 'custom_2',
        subjectType: 'teacher',
        subjectId: 'teacher_3',
        recipientType: 'teacher',
        recipientId: 'teacher_3',
        status: 'published',
        reportJson: { title: '其他教师反馈' },
    });
    seed.report_instances.push({
        id: 'event_owned_report',
        eventId: 'event_existing',
        templateId: 'report_template_1',
        reportType: 'midterm_student',
        scopeType: 'program',
        scopeId: 'program_1',
        subjectType: 'student',
        subjectId: 'student_1',
        recipientType: 'student',
        recipientId: 'student_1',
        status: 'draft',
        reportJson: { title: '事件内学生报告' },
    });
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const teacherToken = createToken(seed.teachers[0]);
    const services = require('../src/services/ops').createOpsServices(repository);
    const teacher = { ...seed.teachers[0], role: 'teacher' };

    const created = await jsonRequest(app, '/ops/report-events', {
        method: 'POST',
        token: teacherToken,
        body: { title: '项目反馈', reportType: 'midterm_student', templateId: 'report_template_1', scopeType: 'program', scopeId: 'program_1', programId: 'program_1' },
    });
    assert.equal(created.code, 10000);

    const teacherEvents = await services.reportingService.listEvents(teacher, { status: 'open', perPage: 500 });
    assert.equal(teacherEvents.pagination.perPage, 100);
    assert.ok(teacherEvents.items.some((item) => item.id === created.data.id));

    const generated = await services.reportingService.generateInstances(teacher, created.data.id, {
        recipients: [{ id: 'student_1', type: 'student', status: 'draft', totalScore: 77, grade: 'C' }],
    });
    assert.equal(generated.ok, true);

    const filtered = await services.reportingService.listInstances({ ...seed.teachers[1], role: 'teacher', isAdmin: true }, {
        status: 'draft',
        eventId: created.data.id,
        perPage: 500,
    });
    assert.equal(filtered.pagination.perPage, 100);
    assert.ok(filtered.items.every((item) => item.status === 'draft' || !item.status));

    assert.equal((await services.reportingService.getInstance(teacher, '')).code, 400);
    assert.equal((await services.reportingService.getInstance(teacher, 'event_owned_report')).data.id, 'event_owned_report');
    await assert.rejects(() => services.reportingService.getInstance(teacher, 'unowned_report'), /需要管理员权限/);
});

test('flexible reporting helper builders cover fallback and invalid target branches', () => {
    const { buildEventPayload, buildInstancePayload } = require('../src/services/ops/reportingService');
    const event = buildEventPayload({
        title: '按课次',
        reportType: 'session_student',
        templateId: 'report_template_1',
        sessionId: 'session_1',
        subjectRulesJson: '{"ignored":true}',
    }, { id: 'teacher_1' });
    assert.equal(event.scopeType, 'session');
    assert.equal(event.scopeId, 'session_1');
    assert.equal(event.status, 'open');

    assert.throws(() => buildEventPayload({ title: '缺失' }, { id: 'teacher_1' }), /缺少报告事件/);
    assert.throws(() => buildInstancePayload(event, { reportJson: {} }, { subjectId: '', recipientId: '' }), /缺少报告对象/);

    const payload = buildInstancePayload(
        { id: 'event_1', templateId: 'report_template_1', reportType: 'student_assessment', scopeType: 'program', scopeId: 'program_1', title: '事件标题' },
        { id: 'report_template_1', reportJson: { title: '模板标题' } },
        { recipientId: 'student_1', subjectId: 'student_1', score: { totalScore: 88, grade: 'B' }, inputIds: ['input_1'] },
        { status: 'published' }
    );
    assert.equal(payload.title, undefined);
    assert.equal(payload.status, 'published');
    assert.equal(payload.reportJson.title, '模板标题');
    assert.deepEqual(payload.inputIdsJson, ['input_1']);
});

test('student report service merges generic and legacy reports with fallback and errors', async () => {
    const { StudentReportService } = require('../src/services/reports');
    const repository = createOpsTestRepository({
        assessment_report_snapshots: [
            { id: 'legacy_1', studentId: 'student_1', sourceType: 'assessment_snapshot', sourceId: 'snapshot_1', reportJson: { title: '旧报告' }, created: '2026-05-01T00:00:00.000Z' },
        ],
        report_instances: [
            { id: 'generic_1', recipientType: 'student', recipientId: 'student_1', status: 'published', sourceType: 'assessment_snapshot', sourceId: 'snapshot_1', reportType: 'student_assessment', reportJson: { title: '通用报告' }, publishedAt: '2026-05-02T00:00:00.000Z' },
            { id: 'generic_2', recipientType: 'student', recipientId: 'student_1', status: 'draft', reportType: 'student_assessment', reportJson: { title: '草稿' } },
        ],
    });
    const service = new StudentReportService(repository);
    const reports = await service.listReports({ id: 'student_1', role: 'student' }, { sort: 'created' });
    assert.equal(reports.items.length, 1);
    assert.equal(reports.items[0].id, 'generic_1');

    const equalDateReports = await new StudentReportService(createOpsTestRepository({
        assessment_report_snapshots: [
            { id: 'same_time_1', studentId: 'student_1', reportJson: { title: '同时间报告 A' }, created: '2026-05-01T00:00:00.000Z' },
            { id: 'same_time_2', studentId: 'student_1', reportJson: { title: '同时间报告 B' }, created: '2026-05-01T00:00:00.000Z' },
        ],
        report_instances: [],
    })).listReports({ id: 'student_1', role: 'student' }, { sort: 'created' });
    assert.equal(equalDateReports.items.length, 2);

    const legacyOnlyRepository = createOpsTestRepository({
        assessment_report_snapshots: [{ id: 'legacy_2', studentId: 'student_1', reportJson: { title: '旧报告' } }],
    });
    legacyOnlyRepository.list = async (collection, ...args) => {
        if (collection === 'report_instances') {
            throw new Error('Missing collection context.');
        }
        return createOpsTestRepository({ assessment_report_snapshots: legacyOnlyRepository.data.assessment_report_snapshots }).list(collection, ...args);
    };
    const fallback = await new StudentReportService(legacyOnlyRepository).listReports({ id: 'student_1', role: 'student' });
    assert.equal(fallback.items[0].id, 'legacy_2');

    const throwingRepository = createOpsTestRepository({ assessment_report_snapshots: [] });
    throwingRepository.get = async (collection) => {
        if (collection === 'report_instances') {
            throw new Error('boom');
        }
        return {};
    };
    await assert.rejects(() => new StudentReportService(throwingRepository).getReport({ id: 'student_1', role: 'student' }, 'x'), /boom/);
});

test('assessment generic report sync tolerates missing collection and logs other failures', async () => {
    const seed = createFlexibleSeed();
    const repository = createOpsTestRepository(seed);
    const services = require('../src/services/ops').createOpsServices(repository);
    const originalCreate = repository.create.bind(repository);
    repository.create = async (collection, data) => {
        if (collection === 'report_instances') {
            throw new Error('write failed');
        }
        return originalCreate(collection, data);
    };
    const originalError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args.join(' '));
    try {
        await services.assessmentService.createGenericReportInstance(
            { id: 'snapshot_1', assessmentRecordId: 'record_1', studentId: 'student_1', totalScore: 80, grade: 'B' },
            { id: 'template_1' },
            { title: '报告' }
        );
    } finally {
        console.error = originalError;
    }
    assert.ok(errors.some((line) => line.includes('同步通用报告实例失败')));

    repository.create = async (collection, data) => {
        if (collection === 'report_instances') {
            throw new Error('Missing collection context.');
        }
        return originalCreate(collection, data);
    };
    await services.assessmentService.createGenericReportInstance(
        { id: 'snapshot_2', assessmentRecordId: 'record_2', studentId: 'student_1', totalScore: 80, grade: 'B' },
        { id: 'template_1' },
        { title: '报告' }
    );
});

function createFlexibleSeed() {
    const seed = createOpsSeed();
    return {
        ...seed,
        teachers: [
            ...seed.teachers,
            { id: 'teacher_3', sn: 'teacher_3_sn', cellphone: '13800138005', password: 'x', nickName: '未分配', realName: '未分配', blocked: false, verified: true, isAdmin: false },
        ],
        learning_programs: [
            { id: 'program_1', title: '春季体验课', type: 'trial', status: 'active', plannedSessionCount: 0 },
        ],
        learning_sessions: [
            { id: 'session_1', programId: 'program_1', title: '第一堂体验课', theme: '音准', status: 'planned', sequence: 1 },
        ],
        program_students: [
            { id: 'program_student_1', programId: 'program_1', studentId: 'student_1', status: 'active' },
        ],
        program_teachers: [
            { id: 'program_teacher_1', programId: 'program_1', teacherId: 'teacher_1', role: 'lead', status: 'active' },
        ],
        session_students: [
            { id: 'session_student_1', sessionId: 'session_1', studentId: 'student_1', status: 'scheduled' },
        ],
        session_teachers: [
            { id: 'session_teacher_1', sessionId: 'session_1', teacherId: 'teacher_1', role: 'lead', status: 'active' },
        ],
        report_templates: [
            { id: 'report_template_1', name: '期中学生报告', version: 1, reportType: 'midterm_student', status: 'published', schemaJson: {}, reportJson: { title: '期中反馈' } },
            { id: 'report_template_2', name: '教师反馈报告', version: 1, reportType: 'teacher_feedback', status: 'published', schemaJson: {}, reportJson: { title: '教师反馈' } },
        ],
        report_events: [
            {
                id: 'event_existing',
                title: '已存在事件',
                reportType: 'midterm_student',
                templateId: 'report_template_1',
                scopeType: 'program',
                scopeId: 'program_1',
                programId: 'program_1',
                status: 'open',
                createdBy: 'admin_1',
            },
        ],
        report_instances: [],
        evaluation_inputs: [],
    };
}
