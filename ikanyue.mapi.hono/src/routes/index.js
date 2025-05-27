/**
 * 主路由配置文件 - 使用通用路由构建器
 * 统一管理所有路由
 */

const { createRouteBuilder } = require('../utils/routeBuilder');

// 导入路由模块
const userRoutes = require('./user');
const studentRoutes = require('./student');
const teacherRoutes = require('./teacher');
const activityRoutes = require('./activity');
const videoMaterialRoutes = require('./videoMaterial');
const audioMaterialRoutes = require('./audioMaterial');

/**
 * 注册所有路由
 * @param {*} app Hono 应用实例
 */
function registerRoutes(app) {
    // 创建路由构建器
    const routes = createRouteBuilder(app);

    // 健康检查路由
    routes.get('/').handler((c) => {
        return c.json({
            message: 'ikanyue-hono API 服务运行正常',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
        });
    });

    // API v1 分组
    routes.group('/v1', (v1) => {
        // 注册各个模块的路由 - 各模块自行管理中间件
        userRoutes(v1);
        studentRoutes(v1);
        teacherRoutes(v1);
        activityRoutes(v1);
        videoMaterialRoutes(v1);
        audioMaterialRoutes(v1);
    });

    // 开发环境专用路由
    if (process.env.NODE_ENV === 'development') {
        routes.group('/debug', (debug) => {
            debug.get('/routes').handler((c) => c.json({ message: '调试信息：已注册路由' }));
        });
    }

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
