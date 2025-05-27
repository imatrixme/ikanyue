/**
 * 活动路由模块 - 使用通用路由构建器
 */

// 导入中间件
const { authMiddleware } = require('../../middleware/auth');
const { isTeacherMiddleware } = require('../../middleware/isTeacher');
const { isAdminMiddleware } = require('../../middleware/isAdmin');

// 尝试导入真实处理器，如果不存在则使用临时处理器
let activityFindHandler, activityCreateHandler, activityUpdateHandler, activityDeleteHandler, activityPublishHandler;

try {
    ({ activityFindHandler } = require('./find'));
} catch (e) {
    activityFindHandler = (c) => c.json({ message: 'Activity find - handler not implemented', path: c.req.path });
}

try {
    ({ activityCreateHandler } = require('./create'));
} catch (e) {
    activityCreateHandler = (c) => c.json({ message: 'Activity create - handler not implemented', path: c.req.path });
}

try {
    ({ activityUpdateHandler } = require('./update'));
} catch (e) {
    activityUpdateHandler = (c) => c.json({ message: 'Activity update - handler not implemented', path: c.req.path });
}

try {
    ({ activityDeleteHandler } = require('./delete'));
} catch (e) {
    activityDeleteHandler = (c) => c.json({ message: 'Activity delete - handler not implemented', path: c.req.path });
}

try {
    ({ activityPublishHandler } = require('./publish'));
} catch (e) {
    activityPublishHandler = (c) => c.json({ message: 'Activity publish - handler not implemented', path: c.req.path });
}

/**
 * 注册活动相关路由
 * @param {*} routes 路由构建器实例
 */
function activityRoutes(routes) {
    // 活动相关路由组 - 需要认证
    routes.use(authMiddleware).group('/activity', (activity) => {
        // 查询活动 - 任何认证用户
        activity.post('/find').handler(activityFindHandler);

        // 教师权限路由 - 教师可以更新活动
        activity.use(isTeacherMiddleware).post('/update').handler(activityUpdateHandler);

        // 管理员权限路由 - 管理员可以创建、删除和发布活动
        activity.use(isAdminMiddleware).post('/create').handler(activityCreateHandler);
        activity.use(isAdminMiddleware).post('/delete').handler(activityDeleteHandler);
        activity.use(isAdminMiddleware).post('/publish').handler(activityPublishHandler);
    });
}

module.exports = activityRoutes;
