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

test('applies global middleware passed to createRouteBuilder', async () => {
    const app = new Hono();
    const routes = createRouteBuilder(app, () => async (c, next) => {
        c.set('source', 'factory-global');
        await next();
    });

    routes.get('/test/global-argument').setHandler((c) => c.json({ source: c.get('source') }));
    routes.finalize();

    const response = await app.request('/test/global-argument');
    assert.deepEqual(await response.json(), { source: 'factory-global' });
});

test('supports HTTP verb helpers and middleware aliases', async () => {
    const app = new Hono();
    const routes = createRouteBuilder(app);

    routes
        .put('/items/:id')
        .middleware(async (c, next) => {
            c.set('via', 'middleware');
            await next();
        })
        .setHandler((c) => c.json({ method: c.req.method, via: c.get('via'), id: c.req.param('id') }));

    routes
        .delete('/items/:id')
        .middlewares(async (c, next) => {
            c.set('via', 'middlewares');
            await next();
        })
        .handler((c) => c.json({ method: c.req.method, via: c.get('via'), id: c.req.param('id') }));

    routes.patch('/items/:id').handler((c) => c.json({ method: c.req.method, id: c.req.param('id') }));
    routes.finalize();

    assert.deepEqual(await (await app.request('/items/1', { method: 'PUT' })).json(), {
        method: 'PUT',
        via: 'middleware',
        id: '1',
    });
    assert.deepEqual(await (await app.request('/items/2', { method: 'DELETE' })).json(), {
        method: 'DELETE',
        via: 'middlewares',
        id: '2',
    });
    assert.deepEqual(await (await app.request('/items/3', { method: 'PATCH' })).json(), {
        method: 'PATCH',
        id: '3',
    });
});

test('normalizes throwing and non-function middleware factories during registration', () => {
    const app = new Hono();
    const routes = createRouteBuilder(app);

    const throwingZeroArgMiddleware = () => {
        throw new Error('factory should be treated as middleware');
    };
    const nonFunctionFactory = () => 'not middleware';

    routes
        .get('/test/non-function-factory')
        .group(nonFunctionFactory)
        .handler((c) => c.json({ registered: true }));

    routes
        .get('/test/throwing-factory')
        .use(throwingZeroArgMiddleware)
        .use(async (c, next) => {
            c.set('normalized', true);
            await next();
        })
        .handler((c) => c.json({ normalized: c.get('normalized') }));

    routes.finalize();
});

test('factory use creates inherited middleware chains without mutating the parent factory', async () => {
    const app = new Hono();
    const routes = createRouteBuilder(app);

    const childRoutes = routes.use(async (c, next) => {
        c.set('childOnly', true);
        await next();
    });

    routes.get('/parent').handler((c) => c.json({ childOnly: c.get('childOnly') || false }));
    childRoutes.get('/child').handler((c) => c.json({ childOnly: c.get('childOnly') }));
    routes.finalize();
    childRoutes.finalize();

    assert.deepEqual(await (await app.request('/parent')).json(), { childOnly: false });
    assert.deepEqual(await (await app.request('/child')).json(), { childOnly: true });
});

test('group conditional middleware applies only inside the group', async () => {
    const app = new Hono();
    const routes = createRouteBuilder(app);

    routes.group('/group', (group) => {
        group
            .when(false, async (c, next) => {
                c.set('disabled', true);
                await next();
            })
            .when(true, () => async (c, next) => {
                c.set('grouped', true);
                await next();
            })
            .get('/inside')
            .handler((c) => c.json({ grouped: c.get('grouped'), disabled: c.get('disabled') || false }));
    });

    routes.get('/outside').handler((c) => c.json({ grouped: c.get('grouped') || false }));
    routes.finalize();

    assert.deepEqual(await (await app.request('/group/inside')).json(), {
        grouped: true,
        disabled: false,
    });
    assert.deepEqual(await (await app.request('/outside')).json(), { grouped: false });
});

test('use and addGlobalMiddleware finalize any pending route first', async () => {
    const app = new Hono();
    const routes = createRouteBuilder(app);

    routes.get('/before-use').handler((c) => c.json({ route: 'before-use' }));
    const childRoutes = routes.use(async (c, next) => {
        c.set('child', true);
        await next();
    });
    childRoutes.get('/after-use').handler((c) => c.json({ child: c.get('child') }));

    routes.get('/before-global').handler((c) => c.json({ route: 'before-global' }));
    routes.addGlobalMiddleware(async (c, next) => {
        c.set('global', true);
        await next();
    });
    routes.get('/after-global').handler((c) => c.json({ global: c.get('global') }));

    routes.finalize();
    childRoutes.finalize();

    assert.deepEqual(await (await app.request('/before-use')).json(), { route: 'before-use' });
    assert.deepEqual(await (await app.request('/after-use')).json(), { child: true });
    assert.deepEqual(await (await app.request('/before-global')).json(), { route: 'before-global' });
    assert.deepEqual(await (await app.request('/after-global')).json(), { global: true });
});
