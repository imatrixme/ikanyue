/**
 * 教师路由模块 - 使用通用路由构建器
 */

// 导入中间件
const { authMiddleware } = require('../../middleware/auth');
const { isAdminMiddleware } = require('../../middleware/isAdmin');

// 导入路由处理器
const { teacherFindHandler } = require('./find');
const teacherUpdateHandler = require('./update');

// 尝试导入真实处理器，如果不存在则使用临时处理器
let teacherCreateHandler, teacherDeleteHandler;

try {
    ({ teacherCreateHandler } = require('./create'));
} catch (e) {
    teacherCreateHandler = (c) => c.json({ message: 'Teacher create - handler not implemented', path: c.req.path });
}

try {
    ({ teacherDeleteHandler } = require('./delete'));
} catch (e) {
    teacherDeleteHandler = (c) => c.json({ message: 'Teacher delete - handler not implemented', path: c.req.path });
}

/**
 * 注册教师相关路由
 * @param {*} routes 路由构建器实例
 */
function teacherRoutes(routes) {
    // 教师相关路由组 - 需要认证
    routes.use(authMiddleware).group('/teacher', (teacher) => {
        // 查询教师 - 任何认证用户
        teacher.post('/find').handler(teacherFindHandler);

        // 更新教师信息 - 教师可以更新自己的信息
        teacher.post('/update').handler(teacherUpdateHandler);

        // 管理员权限路由 - 管理员可以创建和删除教师
        teacher.use(isAdminMiddleware).post('/create').handler(teacherCreateHandler);
        teacher.use(isAdminMiddleware).post('/delete').handler(teacherDeleteHandler);
    });
}

module.exports = teacherRoutes;
