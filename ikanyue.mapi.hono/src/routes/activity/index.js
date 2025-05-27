/**
 * 活动路由模块
 */

// 导入中间件
const { authMiddleware } = require('../../middleware/auth');
const { isTeacherMiddleware } = require('../../middleware/isTeacher');
const { isAdminMiddleware } = require('../../middleware/isAdmin');

// 导入处理器
const { activityFindHandler } = require('../activity/find');
const { activityCreateHandler } = require('../activity/create');
const { activityUpdateHandler } = require('../activity/update');
const { activityDeleteHandler } = require('../activity/delete');
/**
 * 注册活动相关路由
 */
function activityRoutes(routes) {
  routes.group('/v1/activity', (activity) => {
    activity.get('/find').handler(activityFindHandler);

    activity
      .use(authMiddleware)
      .use(isAdminMiddleware)
      .group('', (activity) => {
        activity.post('/update').handler(activityUpdateHandler);
        activity.post('/create').handler(activityCreateHandler);
        activity.post('/delete').handler(activityDeleteHandler);
      });
  });
}

module.exports = activityRoutes;
