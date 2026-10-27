const test = require('node:test');
const assert = require('node:assert/strict');

const {
    activitySignupCreateModulePath,
    activitySignupDetailModulePath,
    activitySignupFindModulePath,
    createCollectionMock,
    createRouteApp,
    requestJson,
    withMockedRouteModules,
} = require('./support/pageRouteTestHelpers');

test('activity signup route creates, deduplicates, lists, and opens current user records', async () => {
    const state = createSignupState();
    const pocketbaseMock = createSignupPocketBaseMock(state);

    await withSignupHandlers(pocketbaseMock, async ({ createHandler, findHandler, detailHandler }) => {
        const app = createSignupApp(createHandler, findHandler, detailHandler);

        const created = await requestJson(app, '/v1/activity-signup/as/student_1', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ activityId: 'activity_1', realName: '张同学', age: 12 }),
        });
        assert.equal(created.code, 10000);
        assert.equal(created.message, '报名成功');
        assert.equal(created.data.activity.id, 'activity_1');
        assert.equal(state.activity_signups.length, 2);

        const duplicate = await requestJson(app, '/v1/activity-signup/as/student_1', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ activityId: 'activity_1', realName: '张同学', age: 12 }),
        });
        assert.equal(duplicate.code, 10000);
        assert.equal(duplicate.message, '已报名');
        assert.equal(state.activity_signups.length, 2);

        const list = await requestJson(app, '/v1/activity-signup/find/as/student_1');
        assert.equal(list.code, 10000);
        assert.equal(list.data.list.length, 1);
        assert.equal(list.data.list[0].activity.title, '公开课');

        const detail = await requestJson(app, `/v1/activity-signup/${created.data.id}/as/student_1`);
        assert.equal(detail.code, 10000);
        assert.equal(detail.data.id, created.data.id);
    });
});

test('activity signup route rejects anonymous, invalid, full, ended, cross-user, and missing collection cases', async () => {
    const state = createSignupState();
    state.activity_signups.push(signup('signup_existing', 'student_2', 'activity_full'));
    const pocketbaseMock = createSignupPocketBaseMock(state);

    await withSignupHandlers(pocketbaseMock, async ({ createHandler, findHandler, detailHandler }) => {
        const app = createSignupApp(createHandler, findHandler, detailHandler);

        assert.equal((await requestJson(app, '/v1/activity-signup', { method: 'POST' })).code, 403);
        assert.equal((await requestJson(app, '/v1/activity-signup/find')).code, 403);
        assert.equal((await requestJson(app, '/v1/activity-signup/signup_1')).code, 403);
        assert.equal(
            (await requestJson(app, '/v1/activity-signup/as/student_1', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: 'not-json',
            })).code,
            400
        );
        assert.equal(
            (await requestJson(app, '/v1/activity-signup/as/student_1', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ activityId: 'activity_1', realName: '', age: 12 }),
            })).code,
            400
        );
        assert.equal(
            (await requestJson(app, '/v1/activity-signup/as/student_1', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ activityId: 'activity_1', realName: '张同学', age: 'bad' }),
            })).code,
            400
        );
        assert.equal(
            (await requestJson(app, '/v1/activity-signup/as/student_1', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ activityId: '', realName: '', age: 0 }),
            })).code,
            400
        );
        assert.equal(
            (await requestJson(app, '/v1/activity-signup/as/student_1', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ activityId: 'missing', realName: '张同学', age: 12 }),
            })).code,
            404
        );
        assert.equal(
            (await requestJson(app, '/v1/activity-signup/as/student_1', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ activityId: 'activity_ended', realName: '张同学', age: 12 }),
            })).code,
            400
        );
        assert.equal(
            (await requestJson(app, '/v1/activity-signup/as/student_1', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ activityId: 'activity_full', realName: '张同学', age: 12 }),
            })).code,
            400
        );

        assert.equal((await requestJson(app, '/v1/activity-signup/signup_existing/as/student_1')).code, 403);
        assert.equal((await requestJson(app, '/v1/activity-signup/missing/as/student_1')).code, 404);
        assert.equal((await requestJson(app, '/v1/activity-signup/find/as/student_1?page=-1')).code, 400);
        assert.equal((await requestJson(app, '/v1/activity-signup/find/as/student_1?status=registered')).code, 10000);

        const missingCollection = createSignupPocketBaseMock(createSignupState(), { missingSignupCollection: true });
        await withSignupHandlers(missingCollection, async ({ createHandler: createMissing, findHandler: findMissing }) => {
            const missingApp = createSignupApp(createMissing, findMissing, detailHandler);
            assert.equal(
                (await requestJson(missingApp, '/v1/activity-signup/as/student_1', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ activityId: 'activity_1', realName: '张同学', age: 12 }),
                })).code,
                500
            );
            assert.equal((await requestJson(missingApp, '/v1/activity-signup/find/as/student_1')).code, 500);
        });

        const createMissingCollection = createSignupPocketBaseMock(createSignupState(), { createMissingCollection: true });
        await withSignupHandlers(createMissingCollection, async ({ createHandler: createMissing, findHandler: findMissing }) => {
            const missingApp = createSignupApp(createMissing, findMissing, detailHandler);
            assert.equal(
                (await requestJson(missingApp, '/v1/activity-signup/as/student_1', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ activityId: 'activity_1', realName: '张同学', age: 12 }),
                })).code,
                500
            );
        });
    });
});

test('activity signup route covers backend failures, duplicate recovery, and query variants', async () => {
    const state = createSignupState();
    const pocketbaseMock = createSignupPocketBaseMock(state, {
        createDuplicateOnce: true,
        hydrateFails: true,
        countFails: true,
    });

    await withSignupHandlers(pocketbaseMock, async ({ createHandler, findHandler, detailHandler }) => {
        const app = createSignupApp(createHandler, findHandler, detailHandler);

        const recovered = await requestJson(app, '/v1/activity-signup/as/student_1', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: 'activity_1', realName: '  很长很长很长很长很长很长很长很长很长很长很长很长的姓名  ', age: '12.8' }),
        });
        assert.equal(recovered.code, 10000);
        assert.equal(recovered.message, '已报名');

        const countIgnored = await requestJson(app, '/v1/activity-signup/as/student_3', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ activityId: 'activity_1', realName: '王同学', age: 9 }),
        });
        assert.equal(countIgnored.code, 10000);
        assert.equal(countIgnored.data.activityId, 'activity_1');

        const statusList = await requestJson(app, '/v1/activity-signup/find/as/student_1?status=all&activityId=activity_1&perPage=200');
        assert.equal(statusList.code, 10000);
        assert.equal(statusList.data.pagination.perPage, 50);

        const queryDetail = await requestJson(app, `/v1/activity-signup/detail/as/student_1?id=${recovered.data.id}`);
        assert.equal(queryDetail.code, 10000);
        assert.equal((await requestJson(app, '/v1/activity-signup/detail/as/student_1')).code, 400);
    });

    const activityFails = createSignupPocketBaseMock(createSignupState(), { activityLookupFails: true });
    await withSignupHandlers(activityFails, async ({ createHandler, findHandler, detailHandler }) => {
        const app = createSignupApp(createHandler, findHandler, detailHandler);
        assert.equal(
            (await requestJson(app, '/v1/activity-signup/as/student_1', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ activityId: 'activity_1', realName: '张同学', age: 12 }),
            })).code,
            500
        );
    });

    const signupFails = createSignupPocketBaseMock(createSignupState(), { signupListFails: true });
    await withSignupHandlers(signupFails, async ({ createHandler, findHandler, detailHandler }) => {
        const app = createSignupApp(createHandler, findHandler, detailHandler);
        assert.equal(
            (await requestJson(app, '/v1/activity-signup/as/student_1', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ activityId: 'activity_1', realName: '张同学', age: 12 }),
            })).code,
            500
        );
        assert.equal((await requestJson(app, '/v1/activity-signup/find/as/student_1')).code, 500);
    });

    const createFails = createSignupPocketBaseMock(createSignupState(), { createFails: true });
    await withSignupHandlers(createFails, async ({ createHandler, findHandler, detailHandler }) => {
        const app = createSignupApp(createHandler, findHandler, detailHandler);
        assert.equal(
            (await requestJson(app, '/v1/activity-signup/as/student_1', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ activityId: 'activity_1', realName: '张同学', age: 12 }),
            })).code,
            500
        );
    });

    const detailFails = createSignupPocketBaseMock(createSignupState(), { detailFails: true });
    await withSignupHandlers(detailFails, async ({ createHandler, findHandler, detailHandler }) => {
        const app = createSignupApp(createHandler, findHandler, detailHandler);
        assert.equal((await requestJson(app, '/v1/activity-signup/signup_other/as/student_2')).code, 500);
    });

    const detailMissingCollection = createSignupPocketBaseMock(createSignupState(), { detailMissingCollection: true });
    await withSignupHandlers(detailMissingCollection, async ({ createHandler, findHandler, detailHandler }) => {
        const app = createSignupApp(createHandler, findHandler, detailHandler);
        assert.equal((await requestJson(app, '/v1/activity-signup/signup_other/as/student_2')).code, 500);
    });
});

function createSignupApp(createHandler, findHandler, detailHandler) {
    const app = createRouteApp('/v1/activity-signup', 'post', createHandler);
    app.get('/v1/activity-signup/find', findHandler);
    app.get('/v1/activity-signup/detail', detailHandler);
    app.get('/v1/activity-signup/:id', detailHandler);
    app.post('/v1/activity-signup/as/:studentId', setStudentUser, createHandler);
    app.get('/v1/activity-signup/find/as/:studentId', setStudentUser, findHandler);
    app.get('/v1/activity-signup/detail/as/:studentId', setStudentUser, detailHandler);
    app.get('/v1/activity-signup/:id/as/:studentId', setStudentUser, detailHandler);
    return app;
}

function setStudentUser(c, next) {
    c.set('user', { id: c.req.param('studentId'), role: 'student' });
    return next();
}

function withSignupHandlers(pocketbaseMock, fn) {
    return withMockedRouteModules(
        [activitySignupCreateModulePath, activitySignupFindModulePath, activitySignupDetailModulePath],
        { pocketbaseMock },
        (createModule, findModule, detailModule) =>
            fn({
                createHandler: createModule.activitySignupCreateHandler,
                findHandler: findModule.activitySignupFindHandler,
                detailHandler: detailModule.activitySignupDetailHandler,
            })
    );
}

function createSignupState() {
    return {
        activities: [
            { id: 'activity_1', title: '公开课', status: 'active', maxParticipants: 2, endTime: '2099-01-01T00:00:00.000Z' },
            { id: 'activity_full', title: '满员课', status: 'active', maxParticipants: 1, endTime: '2099-01-01T00:00:00.000Z' },
            { id: 'activity_ended', title: '已结束', status: 'active', maxParticipants: 10, endTime: '2000-01-01T00:00:00.000Z' },
        ],
        activity_signups: [signup('signup_other', 'student_2', 'activity_1')],
    };
}

function signup(id, userId, activityId) {
    return { id, userId, activityId, realName: `${userId} name`, age: 11, status: 'registered', created: '2026-05-20T08:00:00.000Z' };
}

function createSignupPocketBaseMock(state, options = {}) {
    return createCollectionMock({
        activities: {
            async getOne(id) {
                if (options.activityLookupFails) {
                    throw new Error('activity lookup failed');
                }
                const activity = state.activities.find((item) => item.id === id);
                if (!activity) {
                    const error = new Error('missing');
                    error.status = 404;
                    throw error;
                }
                return { ...activity };
            },
        },
        activity_signups: {
            async getList(page, perPage, query = {}) {
                if (options.missingSignupCollection) {
                    const error = new Error('collection context not found');
                    error.status = 404;
                    throw error;
                }
                if (options.signupListFails) {
                    throw new Error('signup list failed');
                }
                if (options.countFails && String(query.filter || '').includes('status = "registered"')) {
                    throw new Error('count failed');
                }
                const items = state.activity_signups.filter((record) => matchSignup(record, query.filter || ''));
                return {
                    items: items.map((item) => hydrate(item, state)),
                    page: Number(page),
                    perPage: Number(perPage),
                    totalItems: items.length,
                    totalPages: items.length ? 1 : 0,
                };
            },
            async getOne(id) {
                if (options.detailMissingCollection) {
                    const error = new Error('collection context not found');
                    error.status = 404;
                    throw error;
                }
                if (options.detailFails) {
                    throw new Error('detail failed');
                }
                if (options.hydrateFails && id.startsWith('signup_')) {
                    options.hydrateFails = false;
                    throw new Error('hydrate failed');
                }
                const record = state.activity_signups.find((item) => item.id === id);
                if (!record) {
                    const error = new Error('missing');
                    error.status = 404;
                    throw error;
                }
                return hydrate(record, state);
            },
            async create(payload) {
                if (options.createMissingCollection) {
                    const error = new Error('collection context not found');
                    error.status = 404;
                    throw error;
                }
                if (options.createFails) {
                    throw new Error('create failed');
                }
                if (options.createDuplicateOnce) {
                    options.createDuplicateOnce = false;
                    state.activity_signups.push({ id: 'signup_recovered', ...payload, created: '2026-05-20T09:00:00.000Z' });
                    const error = new Error('duplicate');
                    error.status = 400;
                    throw error;
                }
                const existing = state.activity_signups.find((item) => item.userId === payload.userId && item.activityId === payload.activityId);
                if (existing) {
                    const error = new Error('duplicate');
                    error.status = 400;
                    throw error;
                }
                const created = { id: `signup_${state.activity_signups.length + 1}`, ...payload, created: '2026-05-20T09:00:00.000Z' };
                state.activity_signups.push(created);
                return { ...created };
            },
        },
    });
}

function hydrate(record, state) {
    const activity = state.activities.find((item) => item.id === record.activityId);
    return {
        ...record,
        expand: activity ? { activityId: activity } : {},
    };
}

function matchSignup(record, filter) {
    if (!filter) {
        return true;
    }
    const user = filter.match(/(?:userId)\s*=\s*"([^"]+)"/);
    if (user && record.userId !== user[1]) {
        return false;
    }
    const activity = filter.match(/activityId\s*=\s*"([^"]+)"/);
    if (activity && record.activityId !== activity[1]) {
        return false;
    }
    const status = filter.match(/status\s*=\s*"([^"]+)"/);
    if (status && record.status !== status[1]) {
        return false;
    }
    return true;
}
