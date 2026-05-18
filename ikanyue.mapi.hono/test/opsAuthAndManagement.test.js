const test = require('node:test');
const assert = require('node:assert/strict');

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
        body: { cellphone: '13800138002', password: 'secret' },
    });
    assert.equal(adminLogin.code, 10000);
    assert.equal(adminLogin.data.profile.role, 'admin');

    assert.equal(
        (await jsonRequest(app, '/ops/auth/login', { method: 'POST', body: { cellphone: '13900139001', password: 'secret' } })).code,
        401
    );
    assert.equal(
        (await jsonRequest(app, '/ops/auth/login', { method: 'POST', body: { cellphone: '13800138003', password: 'secret' } })).code,
        403
    );
    assert.equal(
        (await jsonRequest(app, '/ops/auth/login', { method: 'POST', body: { cellphone: '13800138004', password: 'secret' } })).code,
        403
    );
    assert.equal(repository.data.students.length, 2);
    assert.ok(repository.data.ops_audit_logs.some((event) => event.action === 'ops.auth.login'));
});

test('ops management enforces teacher ownership and admin global access', async () => {
    const seed = createOpsSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const teacherToken = createToken(seed.teachers[0]);
    const adminToken = createToken(seed.teachers[1]);

    const teacherStudents = await jsonRequest(app, '/ops/students', { token: teacherToken });
    assert.equal(teacherStudents.code, 10000);
    assert.deepEqual(teacherStudents.data.items.map((item) => item.id), ['student_1']);

    assert.equal((await jsonRequest(app, '/ops/students/student_1', { token: teacherToken })).code, 10000);
    assert.equal((await jsonRequest(app, '/ops/students/student_2', { token: teacherToken })).code, 403);
    assert.equal((await jsonRequest(app, '/ops/teachers', { token: teacherToken })).code, 403);
    assert.equal((await jsonRequest(app, '/ops/auditLogs', { token: teacherToken })).code, 403);

    const adminTeachers = await jsonRequest(app, '/ops/teachers', { token: adminToken });
    assert.equal(adminTeachers.code, 10000);
    assert.equal(adminTeachers.data.items.length, 4);

    const updatedActivity = await jsonRequest(app, '/ops/activities/activity_1', {
        method: 'POST',
        token: adminToken,
        body: { status: 'inactive', password: 'blocked' },
    });
    assert.equal(updatedActivity.code, 10000);
    assert.equal(updatedActivity.data.status, 'inactive');
    assert.equal(repository.data.activities[0].password, undefined);
    assert.ok(repository.data.ops_audit_logs.some((event) => event.action === 'ops.activity.update'));
    assert.ok(repository.data.ops_audit_logs.some((event) => event.outcome === 'denied'));

    const auditLogs = await jsonRequest(app, '/ops/auditLogs?search=activity', { token: adminToken });
    assert.equal(auditLogs.code, 10000);
    assert.ok(auditLogs.data.items.some((event) => event.action === 'ops.activity.update'));
    assert.equal((await jsonRequest(app, '/ops/auditLogs', { method: 'POST', token: adminToken, body: { action: 'blocked' } })).code, 405);
});

test('ops dashboard and operation slots provide first-phase management data', async () => {
    const seed = createOpsSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const adminToken = createToken(seed.teachers[1]);

    const dashboard = await jsonRequest(app, '/ops/dashboard', { token: adminToken });
    assert.equal(dashboard.code, 10000);
    assert.ok(dashboard.data.cards.find((card) => card.key === 'students').value >= 2);

    const slot = await jsonRequest(app, '/ops/operationSlots', { token: adminToken });
    assert.equal(slot.code, 10000);
    assert.equal(slot.data.items[0].placement, 'home-banner');
    assert.equal(slot.data.items[0].targetUrl, '/pages/assessmentReport/index?token=demo');

    const createdSlot = await jsonRequest(app, '/ops/operationSlots', {
        method: 'POST',
        token: adminToken,
        body: {
            channel: 'wechat-mini',
            placement: 'home-entry',
            title: '测评入口',
            status: 'active',
            targetType: 'assessment',
        },
    });
    assert.equal(createdSlot.code, 10000);
    assert.equal(createdSlot.data.title, '测评入口');
    assert.equal(createdSlot.data.targetType, 'assessment');

    const publicSlots = await jsonRequest(app, '/ops/public/operation-slots?channel=wechat-mini&placement=home-banner&now=2026-05-18T00:00:00.000Z');
    assert.equal(publicSlots.code, 10000);
    assert.deepEqual(publicSlots.data.items.map((item) => item.id), ['slot_1']);
    assert.equal(publicSlots.data.items[0].imageUrl, 'https://example.com/banner.png');
    assert.equal(publicSlots.data.items[0].targetUrl, '/pages/assessmentReport/index?token=demo');
});
