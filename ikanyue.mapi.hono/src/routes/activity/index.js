/**
 * 活动路由模块
 */

// 导入中间件
const { authMiddleware } = require('../../middleware/auth');
const { isTeacherMiddleware } = require('../../middleware/isTeacher');
const { isAdminMiddleware } = require('../../middleware/isAdmin');

// 导入处理器
const { activityFindHandler } = require('./find');
const { activityCreateHandler } = require('./create');
const { activityUpdateHandler } = require('./update');
const { activityDeleteHandler } = require('./delete');
/**
 * 注册活动相关路由
 */
function activityRoutes(routes) {
    routes.use(authMiddleware).group('/v1/activity', (activity) => {
        activity.post('/find').handler(activityFindHandler);

        activity.use(isTeacherMiddleware, isAdminMiddleware).group('', (activity) => {
            activity.post('/update').handler(activityUpdateHandler);
            activity.post('/create').handler(activityCreateHandler);
            activity.post('/delete').handler(activityDeleteHandler);
        });
    });
}

module.exports = activityRoutes;
