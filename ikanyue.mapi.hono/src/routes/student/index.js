/**
 * 学生路由模块 - 使用通用路由构建器
 */

// 导入中间件
const { authMiddleware } = require('../../middleware/auth');
const { isTeacherMiddleware } = require('../../middleware/isTeacher');
const { isAdminMiddleware } = require('../../middleware/isAdmin');

// 导入路由处理器
const { studentFindHandler } = require('./find');

// 尝试导入真实处理器，如果不存在则使用临时处理器
let studentCreateHandler, studentUpdateHandler, studentDeleteHandler;

try {
    ({ studentCreateHandler } = require('./create'));
} catch (e) {
    studentCreateHandler = (c) => c.json({ message: 'Student create - handler not implemented', path: c.req.path });
}

try {
    ({ studentUpdateHandler } = require('./update'));
} catch (e) {
    studentUpdateHandler = (c) => c.json({ message: 'Student update - handler not implemented', path: c.req.path });
}

try {
    ({ studentDeleteHandler } = require('./delete'));
} catch (e) {
    studentDeleteHandler = (c) => c.json({ message: 'Student delete - handler not implemented', path: c.req.path });
}

/**
 * 注册学生相关路由
 * @param {*} routes 路由构建器实例
 */
function studentRoutes(routes) {
    // 学生相关路由组 - 需要认证
    routes.use(authMiddleware).group('/student', (student) => {
        // 查询学生 - 任何认证用户
        student.post('/find').handler(studentFindHandler);

        // 教师权限路由 - 教师可以更新学生信息
        student.use(isTeacherMiddleware).post('/update').handler(studentUpdateHandler);

        // 管理员权限路由 - 管理员可以创建和删除学生
        student.use(isAdminMiddleware).post('/create').handler(studentCreateHandler);
        student.use(isAdminMiddleware).post('/delete').handler(studentDeleteHandler);
    });
}

module.exports = studentRoutes;
