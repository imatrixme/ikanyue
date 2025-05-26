/**
 * 主路由配置文件
 * 统一管理所有路由
 */

const { authMiddleware } = require('../middleware/auth');

// 导入路由处理器
const userRoutes = require('./user');
const studentRoutes = require('./student');
const teacherRoutes = require('./teacher');

/**
 * 注册所有路由
 * @param {*} app Hono 应用实例
 */
function registerRoutes(app) {
    // 健康检查路由
    app.get('/', (c) => {
        return c.json({
            message: 'ikanyue-hono API 服务运行正常',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
        });
    });

    // 用户相关路由
    userRoutes(app, authMiddleware);

    // 学生相关路由
    studentRoutes(app, authMiddleware);

    // 教师相关路由
    teacherRoutes(app, authMiddleware);

    // 404 处理
    app.notFound((c) => {
        return c.json(
            {
                code: 404,
                message: '接口不存在',
                data: null,
            },
            404
        );
    });

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
}

module.exports = { registerRoutes };
