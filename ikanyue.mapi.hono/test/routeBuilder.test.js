/**
 * 路由构建器测试
 * 验证链式 API 的各种功能
 */

const { Hono } = require('hono');
const { createRouteBuilder } = require('../src/utils/routeBuilder');

// 模拟中间件
const mockAuthMiddleware = () => (c, next) => {
    c.set('user', { id: 'test-user' });
    return next();
};

const mockAdminMiddleware = () => (c, next) => {
    const user = c.get('user');
    if (!user?.isAdmin) {
        return c.json({ error: 'Admin required' }, 403);
    }
    return next();
};

const mockTeacherMiddleware = () => (c, next) => {
    const user = c.get('user');
    if (!user?.isTeacher) {
        return c.json({ error: 'Teacher required' }, 403);
    }
    return next();
};

// 模拟处理器
const mockHandler = (c) => {
    return c.json({ message: 'success', user: c.get('user') });
};

const mockLoginHandler = (c) => {
    return c.json({ message: 'login success' });
};

/**
 * 基本功能测试
 */
function testBasicFunctionality() {
    console.log('🧪 测试基本功能...');

    const app = new Hono();
    const routes = createRouteBuilder(app);

    // 测试基本路由定义
    routes.post('/test/basic').setHandler(mockHandler);

    // 测试中间件添加
    routes.post('/test/with-auth').auth(mockAuthMiddleware).setHandler(mockHandler);

    // 测试多个中间件
    routes.post('/test/with-multiple').auth(mockAuthMiddleware).admin(mockAdminMiddleware).setHandler(mockHandler);

    routes.finalize();

    console.log('✅ 基本功能测试完成');
    return app;
}

/**
 * 路由分组测试
 */
function testRouteGrouping() {
    console.log('🧪 测试路由分组...');

    const app = new Hono();
    const routes = createRouteBuilder(app);

    routes.group('/api/v1', (api) => {
        api.post('/login').setHandler(mockLoginHandler);

        api.post('/profile').auth(mockAuthMiddleware).setHandler(mockHandler);

        // 嵌套分组
        api.group('/admin', (admin) => {
            admin.post('/users').auth(mockAuthMiddleware).admin(mockAdminMiddleware).setHandler(mockHandler);
        });
    });

    routes.finalize();

    console.log('✅ 路由分组测试完成');
    return app;
}

/**
 * 条件中间件测试
 */
function testConditionalMiddleware() {
    console.log('🧪 测试条件中间件...');

    const app = new Hono();
    const routes = createRouteBuilder(app);

    const isDevelopment = true;
    const requiresAuth = true;

    routes
        .post('/test/conditional')
        .when(requiresAuth, mockAuthMiddleware())
        .when(isDevelopment, (c, next) => {
            console.log('Development mode middleware');
            return next();
        })
        .setHandler(mockHandler);

    routes.finalize();

    console.log('✅ 条件中间件测试完成');
    return app;
}

/**
 * 全局中间件测试
 */
function testGlobalMiddleware() {
    console.log('🧪 测试全局中间件...');

    const app = new Hono();
    const routes = createRouteBuilder(app);

    // 添加全局中间件
    routes.addGlobalMiddleware((c, next) => {
        c.set('global', 'middleware-applied');
        return next();
    });

    routes.post('/test/global').setHandler((c) => {
        return c.json({ global: c.get('global') });
    });

    routes.finalize();

    console.log('✅ 全局中间件测试完成');
    return app;
}

/**
 * 错误处理测试
 */
function testErrorHandling() {
    console.log('🧪 测试错误处理...');

    const app = new Hono();
    const routes = createRouteBuilder(app);

    try {
        // 应该抛出错误：缺少处理器
        routes.post('/test/no-handler').build();
        console.log('❌ 应该抛出错误但没有');
    } catch (error) {
        console.log('✅ 正确捕获了缺少处理器的错误:', error.message);
    }

    console.log('✅ 错误处理测试完成');
    return app;
}

/**
 * 链式调用灵活性测试
 */
function testChainFlexibility() {
    console.log('🧪 测试链式调用灵活性...');

    const app = new Hono();
    const routes = createRouteBuilder(app);

    // 方式1: 连续链式调用
    routes.post('/test/chain1').setHandler(mockHandler).auth(mockAuthMiddleware).admin(mockAdminMiddleware);

    // 方式2: 分离调用
    const route2 = routes.post('/test/chain2');
    route2.auth(mockAuthMiddleware);
    route2.setHandler(mockHandler);
    route2.admin(mockAdminMiddleware);

    // 方式3: 混合调用
    routes.post('/test/chain3').auth(mockAuthMiddleware).setHandler(mockHandler);

    routes.finalize();

    console.log('✅ 链式调用灵活性测试完成');
    return app;
}

/**
 * 性能测试 - 创建大量路由
 */
function testPerformance() {
    console.log('🧪 测试性能 - 创建1000个路由...');

    const start = Date.now();
    const app = new Hono();
    const routes = createRouteBuilder(app);

    for (let i = 0; i < 1000; i++) {
        routes
            .post(`/test/route-${i}`)
            .auth(mockAuthMiddleware)
            .when(i % 2 === 0, mockAdminMiddleware())
            .setHandler(mockHandler);
    }

    routes.finalize();
    const end = Date.now();

    console.log(`✅ 性能测试完成，创建1000个路由耗时: ${end - start}ms`);
    return app;
}

/**
 * 运行所有测试
 */
function runAllTests() {
    console.log('🚀 开始路由构建器测试...\n');

    try {
        testBasicFunctionality();
        testRouteGrouping();
        testConditionalMiddleware();
        testGlobalMiddleware();
        testErrorHandling();
        testChainFlexibility();
        testPerformance();

        console.log('\n🎉 所有测试通过！');
    } catch (error) {
        console.error('\n❌ 测试失败:', error);
        process.exit(1);
    }
}

/**
 * 集成测试 - 使用真实的 Hono 应用
 */
async function integrationTest() {
    console.log('🧪 运行集成测试...');

    const app = new Hono();
    const routes = createRouteBuilder(app);

    // 创建测试路由
    routes.post('/integration/test').setHandler((c) => c.json({ message: '集成测试成功' }));

    routes.finalize();

    // 模拟请求测试
    const req = new Request('http://localhost/integration/test', {
        method: 'POST',
    });

    const res = await app.fetch(req);
    const data = await res.json();

    if (data.message === '集成测试成功') {
        console.log('✅ 集成测试通过');
    } else {
        throw new Error('集成测试失败');
    }
}

// 导出测试函数
module.exports = {
    runAllTests,
    integrationTest,
    testBasicFunctionality,
    testRouteGrouping,
    testConditionalMiddleware,
};

// 如果直接运行此文件，执行所有测试
if (require.main === module) {
    runAllTests();
    integrationTest().catch(console.error);
}
