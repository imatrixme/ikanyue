const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');
const { createRouteBuilder } = require('../src/utils/routeBuilder');

const authMiddleware = () => async (c, next) => {
    c.set('user', { id: 'test-user', isAdmin: true, isTeacher: true });
    await next();
};

const adminMiddleware = () => async (c, next) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
        return c.json({ error: 'Admin required' }, 403);
    }
    c.set('adminChecked', true);
    await next();
};

const teacherMiddleware = () => async (c, next) => {
    const user = c.get('user');
    if (!user?.isTeacher) {
        return c.json({ error: 'Teacher required' }, 403);
    }
    c.set('teacherChecked', true);
    await next();
};

test('registers routes with setHandler and permission aliases', async () => {
    const app = new Hono();
    const routes = createRouteBuilder(app);

    routes
        .post('/test/basic')
        .auth(authMiddleware)
        .admin(adminMiddleware)
        .teacher(teacherMiddleware)
        .setHandler((c) =>
            c.json({
                userId: c.get('user').id,
                adminChecked: c.get('adminChecked'),
                teacherChecked: c.get('teacherChecked'),
            })
        );

    routes.finalize();

    const response = await app.request('/test/basic', { method: 'POST' });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
        userId: 'test-user',
        adminChecked: true,
        teacherChecked: true,
    });
});

test('registers grouped and nested routes with prefixed paths', async () => {
    const app = new Hono();
    const routes = createRouteBuilder(app);

    routes.group('/api/v1', (api) => {
        api.post('/login').setHandler((c) => c.json({ route: 'login' }));

        api.group('/admin', (admin) => {
            admin.post('/users').auth(authMiddleware).admin(adminMiddleware).setHandler((c) => {
                return c.json({ route: 'admin-users', adminChecked: c.get('adminChecked') });
            });
        });
    });

    routes.finalize();

    const loginResponse = await app.request('/api/v1/login', { method: 'POST' });
    assert.deepEqual(await loginResponse.json(), { route: 'login' });

    const adminResponse = await app.request('/api/v1/admin/users', { method: 'POST' });
    assert.deepEqual(await adminResponse.json(), { route: 'admin-users', adminChecked: true });
});

test('applies global middleware to routes registered after it', async () => {
    const app = new Hono();
    const routes = createRouteBuilder(app);

    routes.addGlobalMiddleware(async (c, next) => {
        c.set('requestId', 'request-1');
        await next();
    });

    routes.get('/test/global').setHandler((c) => c.json({ requestId: c.get('requestId') }));
    routes.finalize();

    const response = await app.request('/test/global');
    assert.deepEqual(await response.json(), { requestId: 'request-1' });
});

test('adds conditional middleware only when the condition is true', async () => {
    const app = new Hono();
    const routes = createRouteBuilder(app);

    routes
        .post('/test/conditional')
        .when(false, async (c, next) => {
            c.set('disabled', true);
            await next();
        })
        .when(true, async (c, next) => {
            c.set('enabled', true);
            await next();
        })
        .setHandler((c) => c.json({ enabled: c.get('enabled'), disabled: c.get('disabled') || false }));

    routes.finalize();

    const response = await app.request('/test/conditional', { method: 'POST' });
    assert.deepEqual(await response.json(), { enabled: true, disabled: false });
});

test('auto-builds the previous route when a new route starts', async () => {
    const app = new Hono();
    const routes = createRouteBuilder(app);

    routes.get('/first').setHandler((c) => c.json({ route: 'first' }));
    routes.get('/second').setHandler((c) => c.json({ route: 'second' }));
    routes.finalize();

    const firstResponse = await app.request('/first');
    const secondResponse = await app.request('/second');

    assert.deepEqual(await firstResponse.json(), { route: 'first' });
    assert.deepEqual(await secondResponse.json(), { route: 'second' });
});

test('throws when building a route without a handler', () => {
    const app = new Hono();
    const routes = createRouteBuilder(app);

    assert.throws(() => {
        routes.post('/test/no-handler').build();
    }, /缺少处理器/);
});
