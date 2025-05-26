/**
 * 教师路由模块
 */

// 导入路由处理器
const teacherFind = require('./find');
const teacherCreate = require('./create');
const teacherUpdate = require('./update');
const teacherDelete = require('./delete');

/**
 * 注册教师相关路由
 * @param {*} app Hono 应用实例
 * @param {*} authMiddleware 认证中间件
 */
function teacherRoutes(app, authMiddleware) {
    // 查询教师列表（需要认证）
    app.post('/v1/teacher/find', authMiddleware(), teacherFind);

    // 创建教师（需要认证）
    app.post('/v1/teacher/create', authMiddleware(), teacherCreate);

    // 更新教师信息（需要认证）
    app.post('/v1/teacher/update', authMiddleware(), teacherUpdate);

    // 删除教师（需要认证）
    app.post('/v1/teacher/delete', authMiddleware(), teacherDelete);
}

module.exports = teacherRoutes;
