/**
 * 学生路由模块
 */

// 导入路由处理器
const { studentFindHandler } = require('./find');
const { studentCreateHandler } = require('./create');
const { studentUpdateHandler } = require('./update');
const { studentDeleteHandler } = require('./delete');

/**
 * 注册学生相关路由
 * @param {*} app Hono 应用实例
 * @param {*} authMiddleware 认证中间件
 */
function studentRoutes(app, authMiddleware) {
    // 查询学生列表（需要认证）
    app.post('/v1/student/find', authMiddleware(), studentFindHandler);

    // 创建学生（需要认证）
    app.post('/v1/student/create', authMiddleware(), studentCreateHandler);

    // 更新学生信息（需要认证）
    app.post('/v1/student/update', authMiddleware(), studentUpdateHandler);

    // 删除学生（需要认证）
    app.post('/v1/student/delete', authMiddleware(), studentDeleteHandler);
}

module.exports = studentRoutes;
