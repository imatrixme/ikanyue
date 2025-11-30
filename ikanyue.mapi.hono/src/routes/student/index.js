/**
 * 学生路由模块
 */

// 导入中间件
const { authMiddleware } = require('../../middleware/auth');
const { isTeacherMiddleware } = require('../../middleware/isTeacher');
const { isAdminMiddleware } = require('../../middleware/isAdmin');

// 导入路由处理器
const { studentFindHandler } = require('./find');
const { studentCreateHandler } = require('./create');
const { studentUpdateHandler } = require('./update');
const { studentDeleteHandler } = require('./delete');

/**
 * 注册学生相关路由
 */
function studentRoutes(routes) {
    routes.use(authMiddleware).group('/v1/student', (student) => {
        student.get('/find').handler(studentFindHandler);
        student.use(isTeacherMiddleware).post('/update').handler(studentUpdateHandler);
        student.use(isAdminMiddleware).post('/create').handler(studentCreateHandler);
        student.use(isAdminMiddleware).post('/delete').handler(studentDeleteHandler);
    });
}

module.exports = studentRoutes;
