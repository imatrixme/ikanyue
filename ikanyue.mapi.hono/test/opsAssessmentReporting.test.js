const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createOpsApp,
    createOpsSeed,
    createOpsTestRepository,
    createTemplateSchema,
    createToken,
    jsonRequest,
} = require('./support/opsTestHarness');

test('ops assessment workflow publishes template, submits record, snapshots report, and shares safely', async () => {
    const seed = createOpsSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const adminToken = createToken(seed.teachers[1]);
    const teacherToken = createToken(seed.teachers[0]);

    const createdTemplate = await jsonRequest(app, '/ops/assessment-templates', {
        method: 'POST',
        token: adminToken,
        body: {
            name: '音准节奏测评',
            schemaJson: createTemplateSchema(),
            scoringJson: createTemplateSchema().scoring,
            reportJson: { title: '音准节奏报告' },
        },
    });
    assert.equal(createdTemplate.code, 10000);
    assert.equal(createdTemplate.data.status, 'draft');

    const published = await jsonRequest(app, `/ops/assessment-templates/${createdTemplate.data.id}/publish`, {
        method: 'POST',
        token: adminToken,
    });
    assert.equal(published.code, 10000);
    assert.equal(published.data.status, 'published');

    const createdAssessment = await jsonRequest(app, '/ops/assessments', {
        method: 'POST',
        token: teacherToken,
        body: { templateId: published.data.id, studentId: 'student_1' },
    });
    assert.equal(createdAssessment.code, 10000);
    assert.equal(createdAssessment.data.status, 'draft');

    const saved = await jsonRequest(app, `/ops/assessments/${createdAssessment.data.id}/save`, {
        method: 'POST',
        token: teacherToken,
        body: {
            answers: {
                pitch_stability: 'good',
                pitch_comment: '稳定',
                rhythm_score: 80,
            },
        },
    });
    assert.equal(saved.code, 10000);

    const submitted = await jsonRequest(app, `/ops/assessments/${createdAssessment.data.id}/submit`, {
        method: 'POST',
        token: teacherToken,
    });
    assert.equal(submitted.code, 10000);
    assert.equal(submitted.data.record.status, 'submitted');
    assert.equal(submitted.data.record.totalScore, 86);
    assert.equal(submitted.data.record.grade, 'B');
    assert.equal(repository.data.assessment_report_snapshots.length, 1);

    const share = await jsonRequest(app, `/ops/reports/${submitted.data.report.id}/share-links`, {
        method: 'POST',
        token: teacherToken,
    });
    assert.equal(share.code, 10000);
    assert.equal(typeof share.data.token, 'string');
    assert.equal(repository.data.assessment_share_links[0].tokenHash.includes(share.data.token), false);

    const publicReport = await jsonRequest(app, `/ops/share/${share.data.token}`);
    assert.equal(publicReport.code, 10000);
    assert.equal(publicReport.data.score.totalScore, 86);
    assert.equal(publicReport.data.student.wechatId, undefined);
    assert.equal(publicReport.data.student.cellphone, undefined);
    assert.equal(repository.data.assessment_share_links[0].accessCount, 1);

    const revoked = await jsonRequest(app, `/ops/share-links/${share.data.id}/revoke`, {
        method: 'POST',
        token: teacherToken,
    });
    assert.equal(revoked.code, 10000);
    assert.equal((await jsonRequest(app, `/ops/share/${share.data.token}`)).code, 404);
});

test('ops assessment rejects invalid templates and unrelated student submissions', async () => {
    const seed = createOpsSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const adminToken = createToken(seed.teachers[1]);
    const teacherToken = createToken(seed.teachers[0]);

    const invalidTemplate = await jsonRequest(app, '/ops/assessment-templates', {
        method: 'POST',
        token: adminToken,
        body: {
            name: '坏模板',
            schemaJson: createTemplateSchema({ sections: [{ key: 'only', title: '单项', weight: 0.5, items: [] }] }),
        },
    });
    assert.equal(invalidTemplate.code, 400);
    assert.match(invalidTemplate.message, /至少需要一个评估项|权重/);

    const unrelated = await jsonRequest(app, '/ops/assessments', {
        method: 'POST',
        token: teacherToken,
        body: { templateId: 'template_1', studentId: 'student_2' },
    });
    assert.equal(unrelated.code, 403);

    const draftTemplate = await jsonRequest(app, '/ops/assessment-templates', {
        method: 'POST',
        token: adminToken,
        body: {
            name: '草稿模板',
            schemaJson: createTemplateSchema(),
            scoringJson: createTemplateSchema().scoring,
        },
    });
    const draftUse = await jsonRequest(app, '/ops/assessments', {
        method: 'POST',
        token: adminToken,
        body: { templateId: draftTemplate.data.id, studentId: 'student_1' },
    });
    assert.equal(draftUse.code, 400);
    assert.match(draftUse.message, /已发布/);
});
