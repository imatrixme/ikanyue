const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createOpsApp,
    createOpsSeed,
    createOpsTestRepository,
    createToken,
    jsonRequest,
} = require('./support/opsTestHarness');
const { StudentAdminService, projectStudent } = require('../src/services/ops/studentAdminService');

test('student management routes require an admin and return normalized lists', async () => {
    const seed = createOpsSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const adminToken = createToken(seed.teachers[1]);
    const teacherToken = createToken(seed.teachers[0]);

    assert.equal((await jsonRequest(app, '/ops/students', { token: teacherToken })).code, 403);
    const listed = await jsonRequest(app, '/ops/students?status=active&sort=name-asc', { token: adminToken });
    assert.equal(listed.code, 10000);
    assert.equal(listed.data.items.length, 2);
    assert.equal(listed.data.pagination.totalItems, 2);
    assert.deepEqual(Object.keys(listed.data.items[0]).sort(), [
        'avatar', 'blocked', 'cellphone', 'created', 'id', 'lastLoginAt', 'nickName', 'realName', 'updated',
    ]);
});

test('admin creates and edits students without replacing a blank password', async () => {
    const seed = createOpsSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const token = createToken(seed.teachers[1]);

    const created = await jsonRequest(app, '/ops/students', {
        method: 'POST',
        token,
        body: { cellphone: '13900139009', realName: '新学员', nickName: '小新', password: 'student-secret', blocked: false },
    });
    assert.equal(created.code, 10000);
    assert.equal(created.data.realName, '新学员');
    const stored = repository.data.students.find((student) => student.id === created.data.id);
    assert.notEqual(stored.password, 'student-secret');
    assert.ok(stored.sn);
    assert.ok(stored.tokenKey);
    const passwordHash = stored.password;

    const updated = await jsonRequest(app, `/ops/students/${created.data.id}`, {
        method: 'POST',
        token,
        body: { cellphone: '13900139009', realName: '新学员改', nickName: '', password: '', blocked: true },
    });
    assert.equal(updated.code, 10000);
    assert.equal(updated.data.blocked, true);
    assert.equal(repository.data.students.find((student) => student.id === created.data.id).password, passwordHash);
    assert.ok(repository.data.ops_audit_logs.some((event) => event.action === 'ops.students.create'));
    assert.ok(repository.data.ops_audit_logs.some((event) => event.action === 'ops.students.update'));

    const managed = await jsonRequest(app, '/ops/students?status=inactive', { token });
    assert.ok(managed.data.items.some((student) => student.id === created.data.id));
    const points = await jsonRequest(app, '/ops/points/students', { token });
    assert.equal(points.data.items.some((student) => student.id === created.data.id), false);
});

test('student management validates required fields, duplicate cellphones, and missing records', async () => {
    const seed = createOpsSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const token = createToken(seed.teachers[1]);

    assert.equal((await jsonRequest(app, '/ops/students', { method: 'POST', token, body: {} })).code, 400);
    assert.equal((await jsonRequest(app, '/ops/students', {
        method: 'POST',
        token,
        body: { cellphone: '13900139001', realName: '重复', password: 'secret' },
    })).code, 409);
    assert.equal((await jsonRequest(app, '/ops/students/missing', {
        method: 'POST',
        token,
        body: { cellphone: '13900139008', realName: '缺失', password: '' },
    })).code, 404);
    assert.equal((await jsonRequest(app, '/ops/students/student_2', {
        method: 'POST',
        token,
        body: { cellphone: '13900139001', realName: '李同学', password: '' },
    })).code, 409);
});

test('student admin service covers paging, sorting, password reset, and fallback projections', async () => {
    const seed = createOpsSeed();
    const repository = createOpsTestRepository(seed);
    const service = new StudentAdminService(repository);
    const admin = seed.teachers[1];

    await assert.rejects(() => service.list({}, {}), /需要管理员权限/);
    await assert.rejects(() => service.create(admin, { cellphone: '13900139991' }), /学员姓名不能为空/);
    await assert.rejects(() => service.create(admin, { cellphone: '13900139991', realName: '缺密码' }), /初始密码不能为空/);
    await assert.rejects(() => service.update(admin, '', {}), /学员不能为空/);

    assert.equal((await service.list(admin, { page: 'bad', limit: 999, keyword: '张"\\', sort: 'name-desc' })).pagination.perPage, 100);
    await service.list(admin, { sort: 'created-asc' });
    await service.list(admin, { sort: 'unknown' });
    const created = await service.create(admin, { cellphone: '13900139991', realName: '无审计学员', password: 'secret', blocked: '1' });
    assert.equal(created.blocked, true);
    const updated = await service.update(admin, created.id, { cellphone: '13900139992', realName: '密码已重置', password: 'new-secret', blocked: false });
    assert.equal(updated.cellphone, '13900139992');
    const passwordHash = repository.data.students.find((student) => student.id === created.id).password;
    assert.notEqual(passwordHash, 'new-secret');
    await service.update(admin, created.id, { cellphone: '13900139992', realName: '手机号不变', password: '', blocked: false });

    assert.deepEqual(projectStudent(), { avatar: '', blocked: false, cellphone: '', created: '', id: '', lastLoginAt: '', nickName: '', realName: '', updated: '' });
    const emptyResultService = new StudentAdminService({ list: async () => ({}) });
    assert.deepEqual((await emptyResultService.list(admin)).items, []);
});
