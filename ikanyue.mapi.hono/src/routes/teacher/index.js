/**
 * 教师路由模块
 */

// 导入中间件
const { authMiddleware } = require('../../middleware/auth');
const { isAdminMiddleware } = require('../../middleware/isAdmin');

// 导入路由处理器
const { teacherFindHandler } = require('./find');
const { teacherUpdateHandler } = require('./update');
const { teacherCreateHandler } = require('./create');
const { teacherDeleteHandler } = require('./delete');

/**
 * 注册教师相关路由
 */
function teacherRoutes(routes) {
  routes.use(authMiddleware).group('/v1/teacher', (teacher) => {
    teacher.get('/find').handler(teacherFindHandler);

    teacher.use(isAdminMiddleware).group('', (teacher) => {
      teacher.post('/update').handler(teacherUpdateHandler);
      teacher.post('/create').handler(teacherCreateHandler);
      teacher.post('/delete').handler(teacherDeleteHandler);
    });
  });
}

module.exports = teacherRoutes;
