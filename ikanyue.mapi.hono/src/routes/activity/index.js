/**
 * 活动管理路由
 * 对应原项目: api/controllers/activity/
 */

const { activityFindHandler } = require('./find');
const { activityCreateHandler } = require('./create');
const { activityUpdateHandler } = require('./update');
const { activityDeleteHandler } = require('./delete');

/**
 * 注册活动相关路由
 * @param {*} app Hono 应用实例
 * @param {*} authMiddleware 认证中间件
 * @param {*} isAdminMiddleware 管理员权限中间件
 */
function activityRoutes(app, authMiddleware, isAdminMiddleware) {
    // 活动查询接口
    app.post('/v1/activity/find', authMiddleware(), activityFindHandler);

    // 活动创建接口 (需要管理员权限)
    app.post('/v1/activity/create', authMiddleware(), isAdminMiddleware(), activityCreateHandler);

    // 活动更新接口 (需要管理员权限)
    app.post('/v1/activity/update', authMiddleware(), isAdminMiddleware(), activityUpdateHandler);

    // 活动删除接口 (需要管理员权限)
    app.post('/v1/activity/delete', authMiddleware(), isAdminMiddleware(), activityDeleteHandler);
}

module.exports = activityRoutes;
