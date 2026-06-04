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
        body: { account: 'admin', password: '1loveU_shaoyi' },
    });
    assert.equal(adminLogin.code, 10000);
    assert.equal(adminLogin.data.profile.role, 'admin');
    assert.equal(adminLogin.data.profile.passwordChangeRequired, false);

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

test('ops default admin login requires first password change before admin access', async () => {
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

    const me = await jsonRequest(app, '/ops/auth/me', { token: login.data.token });
    assert.equal(me.code, 10000);
    assert.equal(me.data.profile.passwordChangeRequired, true);

    const blocked = await jsonRequest(app, '/ops/dashboard', { token: login.data.token });
    assert.equal(blocked.code, 403);
    assert.equal(blocked.message, '首次登录必须先修改默认密码');

    const samePassword = await jsonRequest(app, '/ops/auth/change-password', {
        method: 'POST',
        token: login.data.token,
        body: { currentPassword: '1loveU_shaoyi', newPassword: '1loveU_shaoyi', confirmPassword: '1loveU_shaoyi' },
    });
    assert.equal(samePassword.code, 400);

    const changed = await jsonRequest(app, '/ops/auth/change-password', {
        method: 'POST',
        token: login.data.token,
        body: { currentPassword: '1loveU_shaoyi', newPassword: 'newAdmin1234', confirmPassword: 'newAdmin1234' },
    });
    assert.equal(changed.code, 10000);
    assert.equal(changed.data.profile.passwordChangeRequired, false);
    assert.equal(repository.data.teachers.find((teacher) => teacher.id === 'admin_1').opsPasswordChangeRequired, false);
    assert.equal(repository.data.teachers.find((teacher) => teacher.id === 'admin_1').passwordConfirm, 'newAdmin1234');

    const dashboard = await jsonRequest(app, '/ops/dashboard', { token: changed.data.token });
    assert.equal(dashboard.code, 10000);
    assert.ok(repository.data.ops_audit_logs.some((event) => event.action === 'ops.auth.change_password'));
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
        assert.equal(repository.data.teachers.some((teacher) => teacher.cellphone === '13800138009'), false);

        process.env.OPS_REGISTRATION_ENABLED = 'true';
        const registered = await jsonRequest(app, '/ops/auth/register', {
            method: 'POST',
            body: { cellphone: '13800138009', password: 'secret123', realName: '待审老师' },
        });
        assert.equal(registered.code, 10000);
        assert.equal(registered.data.status, 'pending_activation');
        assert.equal(registered.data.profile.verified, false);
        assert.equal(registered.data.profile.blocked, true);

        const pendingTeacher = repository.data.teachers.find((teacher) => teacher.cellphone === '13800138009');
        assert.equal(pendingTeacher.blocked, true);
        assert.equal(pendingTeacher.verified, false);
        assert.equal(pendingTeacher.idAdmin, false);
        assert.equal(pendingTeacher.idcard, 'ops_13800138009');
        assert.equal(pendingTeacher.passwordConfirm, 'secret123');
        assert.equal((await jsonRequest(app, '/ops/auth/register', {
            method: 'POST',
            body: { cellphone: '13800138009', password: 'secret123', realName: '重复老师' },
        })).code, 409);

    assert.equal((await jsonRequest(app, '/ops/auth/login', {
        method: 'POST',
        body: { cellphone: '13800138009', password: 'secret123' },
        })).code, 403);

        await repository.update('teachers', pendingTeacher.id, { blocked: false, verified: true });
        const activatedLogin = await jsonRequest(app, '/ops/auth/login', {
            method: 'POST',
            body: { cellphone: '13800138009', password: 'secret123' },
        });
        assert.equal(activatedLogin.code, 10000);
        assert.equal(activatedLogin.data.profile.role, 'teacher');
        assert.equal(activatedLogin.data.profile.isAdmin, false);
    } finally {
        if (originalFlag === undefined) {
            delete process.env.OPS_REGISTRATION_ENABLED;
        } else {
            process.env.OPS_REGISTRATION_ENABLED = originalFlag;
        }
    }
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

    const createdStudent = await jsonRequest(app, '/ops/students', {
        method: 'POST',
        token: adminToken,
        body: { realName: '运营录入学生', nickName: '录入学生', cellphone: '13900139999', gender: 0, blocked: false },
    });
    assert.equal(createdStudent.code, 10000);
    assert.equal(createdStudent.data.realName, '运营录入学生');
    assert.equal(createdStudent.data.nickName, '录入学生');
    const storedStudent = repository.data.students.find((student) => student.id === createdStudent.data.id);
    assert.equal(storedStudent.realname, '运营录入学生');
    assert.equal(storedStudent.nickname, '录入学生');
    assert.ok(storedStudent.sn);
    assert.equal(storedStudent.password, undefined);

    const createdTeacher = await jsonRequest(app, '/ops/teachers', {
        method: 'POST',
        token: adminToken,
        body: { realName: '运营录入老师', nickName: '录入老师', cellphone: '13800139999', verified: false, blocked: true, isAdmin: false },
    });
    assert.equal(createdTeacher.code, 10000);
    assert.equal(createdTeacher.data.realName, '运营录入老师');
    const storedTeacher = repository.data.teachers.find((teacher) => teacher.id === createdTeacher.data.id);
    assert.ok(storedTeacher.sn);
    assert.ok(storedTeacher.password);
    assert.ok(storedTeacher.tokenKey);
    assert.equal(storedTeacher.opsPasswordChangeRequired, true);
    assert.equal(storedTeacher.idAdmin, false);

    const activatedTeacher = await jsonRequest(app, '/ops/teachers/pending_1', {
        method: 'POST',
        token: adminToken,
        body: { realName: '已激活老师', verified: true, blocked: false, isAdmin: true, passwordConfirm: 'blocked' },
    });
    assert.equal(activatedTeacher.code, 10000);
    assert.equal(activatedTeacher.data.realName, '已激活老师');
    assert.equal(activatedTeacher.data.isAdmin, true);
    assert.equal(repository.data.teachers.find((teacher) => teacher.id === 'pending_1').realname, '已激活老师');
    assert.equal(repository.data.teachers.find((teacher) => teacher.id === 'pending_1').idAdmin, true);
    assert.equal(repository.data.teachers.find((teacher) => teacher.id === 'pending_1').passwordConfirm, undefined);

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

    const signupList = await jsonRequest(app, '/ops/activitySignups', { token: adminToken });
    assert.equal(signupList.code, 10000);
    assert.equal(signupList.data.items.length, 2);

    const teacherSignupList = await jsonRequest(app, '/ops/activitySignups', { token: teacherToken });
    assert.equal(teacherSignupList.code, 10000);
    assert.deepEqual(teacherSignupList.data.items.map((item) => item.id), ['signup_1']);
    assert.equal((await jsonRequest(app, '/ops/activitySignups/signup_2', { token: teacherToken })).code, 403);

    const updatedSignup = await jsonRequest(app, '/ops/activitySignups/signup_1', {
        method: 'POST',
        token: adminToken,
        body: { status: 'attended', token: 'blocked' },
    });
    assert.equal(updatedSignup.code, 10000);
    assert.equal(updatedSignup.data.status, 'attended');
    assert.equal(repository.data.activity_signups[0].token, undefined);
    assert.ok(repository.data.ops_audit_logs.some((event) => event.action === 'ops.activity_signup.update'));

    const deniedSignupUpdate = await jsonRequest(app, '/ops/activitySignups/signup_1', {
        method: 'POST',
        token: teacherToken,
        body: { status: 'cancelled' },
    });
    assert.equal(deniedSignupUpdate.code, 403);
    assert.ok(repository.data.ops_audit_logs.some((event) => event.action === 'ops.activity_signup.write' && event.outcome === 'denied'));
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

test('public operation slots degrade to an empty list when local ops schema is missing', async () => {
    const seed = createOpsSeed();
    const repository = createOpsTestRepository(seed);
    repository.list = async (name, page, perPage, options) => {
        if (name === 'operation_slots') {
            throw new Error('Missing collection context.');
        }
        return Object.getPrototypeOf(repository).list.call(repository, name, page, perPage, options);
    };
    const app = createOpsApp(repository);

    const publicSlots = await jsonRequest(app, '/ops/public/operation-slots?channel=wechat-mini&placement=home-banner');

    assert.equal(publicSlots.code, 10000);
    assert.deepEqual(publicSlots.data.items, []);
    assert.deepEqual(publicSlots.data.pagination, { page: 1, perPage: 100, totalItems: 0, totalPages: 0 });
});

test('ops report detail returns privacy-safe report content with scoped authorization', async () => {
    const seed = createOpsSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const teacherToken = createToken(seed.teachers[0]);
    const adminToken = createToken(seed.teachers[1]);

    const teacherReport = await jsonRequest(app, '/ops/reports/report_1', { token: teacherToken });
    assert.equal(teacherReport.code, 10000);
    assert.equal(teacherReport.data.title, '声乐阶段报告');
    assert.equal(teacherReport.data.score.totalScore, 91);
    assert.equal(teacherReport.data.sections[0].title, '音准');
    assert.equal(teacherReport.data.student.cellphone, undefined);
    assert.equal(teacherReport.data.student.wechatId, undefined);
    assert.equal(teacherReport.data.teacher.token, undefined);

    assert.equal((await jsonRequest(app, '/ops/reports/report_2', { token: teacherToken })).code, 403);
    const adminReport = await jsonRequest(app, '/ops/reports/report_2', { token: adminToken });
    assert.equal(adminReport.code, 10000);
    assert.equal(adminReport.data.title, '其他学员报告');
});
