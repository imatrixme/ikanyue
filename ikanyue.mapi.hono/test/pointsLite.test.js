const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createOpsApp,
    createOpsSeed,
    createOpsTestRepository,
    createStudentToken,
    createToken,
    jsonRequest,
} = require('./support/opsTestHarness');

test('student points endpoint returns balance and event history for the logged-in learner', async () => {
    const seed = createPointsSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const studentToken = createStudentToken(seed.students[0]);

    const response = await jsonRequest(app, '/v1/points/me', { token: studentToken });

    assert.equal(response.code, 10000);
    assert.equal(response.data.studentId, 'student_1');
    assert.equal(response.data.balance, 120);
    assert.deepEqual(response.data.events.map((event) => event.id), ['event_2', 'event_1']);
    assert.equal(response.data.pagination.totalItems, 2);
});

test('student reward list separates redeemable and locked active items', async () => {
    const seed = createPointsSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const studentToken = createStudentToken(seed.students[0]);

    const response = await jsonRequest(app, '/v1/reward-items', { token: studentToken });

    assert.equal(response.code, 10000);
    assert.equal(response.data.currentPoints, 120);
    assert.deepEqual(response.data.redeemableItems.map((item) => item.id), ['reward_sticker']);
    assert.deepEqual(response.data.lockedItems.map((item) => item.id), ['reward_book']);
    assert.equal(response.data.redeemableItems[0].operatorId, undefined);
    assert.equal(response.data.redeemableItems.some((item) => item.id === 'reward_hidden'), false);
});

test('admin can add points while teacher and invalid inputs are rejected', async () => {
    const seed = createPointsSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const teacherToken = createToken(seed.teachers[0]);
    const adminToken = createToken(seed.teachers[1]);

    const students = await jsonRequest(app, '/ops/points/students?q=张', { token: adminToken });
    assert.equal(students.code, 10000);
    assert.deepEqual(students.data.items.map((item) => item.id), ['student_1']);
    assert.equal(students.data.items[0].balance, 120);
    assert.equal(students.data.items[0].wechatId, undefined);

    const allStudents = await jsonRequest(app, '/ops/points/students?perPage=2', { token: adminToken });
    assert.equal(allStudents.code, 10000);
    assert.equal(allStudents.data.items.find((item) => item.id === 'student_2').balance, 0);

    const keywordStudents = await jsonRequest(app, '/ops/points/students?keyword=李&limit=1', { token: adminToken });
    assert.equal(keywordStudents.code, 10000);
    assert.deepEqual(keywordStudents.data.items.map((item) => item.id), ['student_2']);

    const summary = await jsonRequest(app, '/ops/points/students/student_1', { token: adminToken });
    assert.equal(summary.code, 10000);
    assert.equal(summary.data.balance, 120);

    const denied = await jsonRequest(app, '/ops/points/students/student_1/earn', {
        method: 'POST',
        token: teacherToken,
        body: { amount: 30 },
    });
    assert.equal(denied.code, 403);
    assert.equal(repository.data.student_points[0].balance, 120);

    const invalid = await jsonRequest(app, '/ops/points/students/student_1/earn', {
        method: 'POST',
        token: adminToken,
        body: { amount: 0 },
    });
    assert.equal(invalid.code, 400);

    const added = await jsonRequest(app, '/ops/points/students/student_1/earn', {
        method: 'POST',
        token: adminToken,
        body: { amount: 35, reason: '课堂奖励', remark: '节奏稳定' },
    });

    assert.equal(added.code, 10000);
    assert.equal(added.data.balance, 155);
    assert.equal(repository.data.student_points[0].balance, 155);
    assert.equal(repository.data.point_events.at(-1).type, 'earn');
    assert.equal(repository.data.point_events.at(-1).delta, 35);
    assert.ok(repository.data.ops_audit_logs.some((event) => event.action === 'ops.points.add'));
});

test('admin manages reward item catalog for the light branch', async () => {
    const seed = createPointsSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const adminToken = createToken(seed.teachers[1]);

    const list = await jsonRequest(app, '/ops/reward-items', { token: adminToken });
    assert.equal(list.code, 10000);
    assert.deepEqual(list.data.items.map((item) => item.id), ['reward_sticker', 'reward_book', 'reward_hidden']);

    const invalid = await jsonRequest(app, '/ops/reward-items', {
        method: 'POST',
        token: adminToken,
        body: { name: '无效实物', pointsPrice: -1 },
    });
    assert.equal(invalid.code, 400);

    const created = await jsonRequest(app, '/ops/reward-items', {
        method: 'POST',
        token: adminToken,
        body: { name: '帆布袋', pointsPrice: 90, description: '线下领取', imageUrl: 'https://example.com/bag.png' },
    });
    assert.equal(created.code, 10000);
    assert.equal(created.data.status, 'active');
    assert.equal(created.data.image, 'https://example.com/bag.png');

    const updated = await jsonRequest(app, `/ops/reward-items/${created.data.id}`, {
        method: 'POST',
        token: adminToken,
        body: { status: 'inactive', pointsPrice: 100 },
    });
    assert.equal(updated.code, 10000);
    assert.equal(updated.data.status, 'inactive');
    assert.equal(updated.data.pointsPrice, 100);

    const teacherToken = createToken(seed.teachers[0]);
    const denied = await jsonRequest(app, '/ops/reward-items', {
        method: 'POST',
        token: teacherToken,
        body: { name: '越权实物', pointsPrice: 10 },
    });
    assert.equal(denied.code, 403);
    assert.equal(denied.message, '需要管理员权限');
});

test('admin uploads reward images and receives the public object-storage URL', async () => {
    const previousBase = process.env.PUBLIC_ASSET_BASE_URL;
    process.env.PUBLIC_ASSET_BASE_URL = 'https://assets.example.test/rewards';
    try {
        const seed = createPointsSeed();
        const repository = createOpsTestRepository(seed);
        const app = createOpsApp(repository);
        const adminToken = createToken(seed.teachers[1]);
        const form = new FormData();
        form.set('imageFile', new File(['image-bytes'], 'sticker.png', { type: 'image/png' }));

        const response = await app.request('/ops/reward-items/reward_sticker/image', {
            method: 'POST',
            headers: { authorization: `Bearer ${adminToken}` },
            body: form,
        });
        const payload = await response.json();

        assert.equal(payload.code, 10000);
        assert.equal(payload.data.image, 'https://assets.example.test/rewards/reward_items/reward_sticker/sticker.png');
        assert.equal(repository.data.reward_items[0].imageFile, 'sticker.png');

        const legacyImageField = new FormData();
        legacyImageField.set('image', new File(['image'], 'legacy.png', { type: 'image/png' }));
        const legacyImageResponse = await app.request('/ops/reward-items/reward_sticker/image', {
            method: 'POST',
            headers: { authorization: `Bearer ${adminToken}` },
            body: legacyImageField,
        });
        assert.equal((await legacyImageResponse.json()).data.image, 'https://assets.example.test/rewards/reward_items/reward_sticker/legacy.png');

        const fallbackFileField = new FormData();
        fallbackFileField.set('file', new File(['image'], 'fallback.png', { type: 'image/png' }));
        const fallbackFileResponse = await app.request('/ops/reward-items/reward_sticker/image', {
            method: 'POST',
            headers: { authorization: `Bearer ${adminToken}` },
            body: fallbackFileField,
        });
        assert.equal((await fallbackFileResponse.json()).data.image, 'https://assets.example.test/rewards/reward_items/reward_sticker/fallback.png');

        const missingFileResponse = await app.request('/ops/reward-items/reward_sticker/image', {
            method: 'POST',
            headers: { authorization: `Bearer ${adminToken}` },
            body: new FormData(),
        });
        assert.equal((await missingFileResponse.json()).message, '请选择实物图片');

        const invalid = new FormData();
        invalid.set('imageFile', new File(['text'], 'notes.txt', { type: 'text/plain' }));
        const invalidResponse = await app.request('/ops/reward-items/reward_sticker/image', {
            method: 'POST',
            headers: { authorization: `Bearer ${adminToken}` },
            body: invalid,
        });
        assert.equal((await invalidResponse.json()).code, 400);

        const teacherForm = new FormData();
        teacherForm.set('imageFile', new File(['image'], 'teacher.png', { type: 'image/png' }));
        const teacherResponse = await app.request('/ops/reward-items/reward_sticker/image', {
            method: 'POST',
            headers: { authorization: `Bearer ${createToken(seed.teachers[0])}` },
            body: teacherForm,
        });
        assert.equal((await teacherResponse.json()).code, 403);
    } finally {
        if (previousBase === undefined) {
            delete process.env.PUBLIC_ASSET_BASE_URL;
        } else {
            process.env.PUBLIC_ASSET_BASE_URL = previousBase;
        }
    }
});

test('lite admin point routes return business errors for missing resource params', async () => {
    const seed = createPointsSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const adminToken = createToken(seed.teachers[1]);

    const missingStudent = await jsonRequest(app, '/ops/points/students/%20/earn', {
        method: 'POST',
        token: adminToken,
        body: { amount: 10 },
    });
    assert.equal(missingStudent.code, 400);
    assert.equal(missingStudent.message, '学员不能为空');

    const missingReward = await jsonRequest(app, '/ops/reward-items/%20', {
        method: 'POST',
        token: adminToken,
        body: { name: '空', pointsPrice: 1 },
    });
    assert.equal(missingReward.code, 400);
    assert.equal(missingReward.message, '实物不能为空');
});

test('offline redemption deducts stored item price and rejects unavailable exchanges', async () => {
    const seed = createPointsSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const adminToken = createToken(seed.teachers[1]);

    const events = await jsonRequest(app, '/ops/points/students/student_1/events', { token: adminToken });
    assert.equal(events.code, 10000);
    assert.equal(events.data.events.length, 2);

    const redeemed = await jsonRequest(app, '/ops/points/offline-redeem', {
        method: 'POST',
        token: adminToken,
        body: { studentId: 'student_1', itemId: 'reward_sticker', amount: 1, remark: '已线下领取' },
    });
    assert.equal(redeemed.code, 10000);
    assert.equal(redeemed.data.balance, 70);
    assert.equal(redeemed.data.reward.pointsPrice, 50);
    assert.equal(repository.data.student_points[0].balance, 70);
    assert.equal(repository.data.point_events.at(-1).delta, -50);
    assert.deepEqual(repository.data.point_events.at(-1).rewardSnapshot, {
        id: 'reward_sticker',
        name: '贴纸',
        pointsPrice: 50,
    });

    const insufficient = await jsonRequest(app, '/ops/points/offline-redeem', {
        method: 'POST',
        token: adminToken,
        body: { studentId: 'student_1', itemId: 'reward_book' },
    });
    assert.equal(insufficient.code, 400);

    const inactive = await jsonRequest(app, '/ops/points/offline-redeem', {
        method: 'POST',
        token: adminToken,
        body: { studentId: 'student_1', itemId: 'reward_hidden' },
    });
    assert.equal(inactive.code, 400);
    assert.ok(repository.data.ops_audit_logs.some((event) => event.action === 'ops.points.offline_redeem'));
});

test('light branch does not expose removed full-admin operation routes', async () => {
    const seed = createPointsSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const adminToken = createToken(seed.teachers[1]);

    const headers = { authorization: `Bearer ${adminToken}` };
    assert.equal((await app.request('/ops/dashboard', { headers })).status, 404);
    assert.equal((await app.request('/ops/assessment-templates', { headers })).status, 404);
});

test('biz route registry exposes only login, points, and light ops routes', async () => {
    const { Hono } = require('hono');
    const { responseMiddleware } = require('../src/middleware/response');
    const { registerBizRoutes } = require('../src/config/router');
    const { createRouteBuilder } = require('../src/utils/routeBuilder');

    const app = new Hono();
    app.use('*', responseMiddleware());
    const routes = createRouteBuilder(app);
    registerBizRoutes(routes);
    routes.finalize();

    assert.equal((await app.request('/v1/activity/find')).status, 404);
    assert.equal((await app.request('/v1/student/reports')).status, 404);
    assert.equal((await app.request('/ops/dashboard')).status, 404);
});

function createPointsSeed() {
    const seed = createOpsSeed();
    seed.reward_items = [
        reward('reward_sticker', { name: '贴纸', pointsPrice: 50, sortOrder: 1 }),
        reward('reward_book', { name: '乐理书', pointsPrice: 200, sortOrder: 2 }),
        reward('reward_hidden', { name: '隐藏实物', pointsPrice: 10, sortOrder: 3, status: 'inactive' }),
    ];
    seed.student_points = [{ id: 'points_1', studentId: 'student_1', balance: 120 }];
    seed.point_events = [
        {
            id: 'event_1',
            balanceAfter: 80,
            created: '2026-06-01T08:00:00.000Z',
            delta: 80,
            reason: 'seed',
            studentId: 'student_1',
            type: 'earn',
        },
        {
            id: 'event_2',
            balanceAfter: 120,
            created: '2026-06-02T08:00:00.000Z',
            delta: 40,
            reason: '课堂奖励',
            studentId: 'student_1',
            type: 'earn',
        },
    ];
    return seed;
}

function reward(id, overrides) {
    return {
        collection: 'reward_items',
        collectionId: 'reward_items',
        description: '',
        id,
        image: '',
        status: 'active',
        ...overrides,
    };
}
