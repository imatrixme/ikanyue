/**
 * 主路由配置文件 - 使用通用路由构建器
 * 统一管理所有路由
 */

const { createRouteBuilder } = require('../utils/routeBuilder');

const { registerBizRoutes } = require('../config/router');

/**
 * 注册所有路由
 * @param {*} app Hono 应用实例
 */
function registerRoutes(app) {
    // 创建路由构建器
    const routes = createRouteBuilder(app);

    // 健康检查路由
    routes.get('/').handler((c) => {
        return c.data({
            status: 'ok',
            timestamp: new Date().toISOString(),
        });
    });

    // 注册各个业务模块的路由 - 各模块自行定义完整路径
    registerBizRoutes(routes);

    // 开发环境专用路由
    if (process.env.NODE_ENV === 'development') {
        routes.group('/debug', (debug) => {
            debug.get('/routes').handler((c) => c.json({ message: '调试信息：已注册路由' }));
        });
    }

    // Swagger 文档路由 - 生产环境返回 404
    routes.get('/swagger').handler((c) => {
        if (process.env.NODE_ENV === 'production') {
            return c.json(
                {
                    code: 404,
                    message: '接口不存在',
                    data: null,
                },
                404
            );
        }

        // 开发环境提示使用独立服务
        return c.json({
            code: 200,
            message: 'Swagger 文档已独立部署，请访问独立端口',
            data: {
                swaggerUI: 'http://localhost:3001/swagger',
                swaggerJSON: 'http://localhost:3001/swagger.json',
                tip: '请运行 npm run swagger:dev 启动 Swagger 服务',
            },
        });
    });

    // 404 处理
    routes.get('/*').handler((c) => {
        return c.json(
            {
                code: 404,
                message: '接口不存在',
                data: null,
            },
            404
        );
    });

    // 完成路由构建
    routes.finalize();

    // 错误处理
    app.onError((err, c) => {
        console.error('应用错误:', err);
        return c.json(
            {
                code: 500,
                message: '服务器内部错误',
                data: null,
            },
            500
        );
    });

    console.log('🚀 通用路由构建器加载完成');
    console.log('📍 支持特性: 中间件继承、group级中间件、条件中间件、完全通用');
}

module.exports = { registerRoutes };
