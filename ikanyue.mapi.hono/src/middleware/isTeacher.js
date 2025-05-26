/**
 * 教师权限验证中间件
 * 验证当前用户是否具有教师权限
 * 对应原项目: api/policies/isTeacher.js
 */

/**
 * 教师权限验证中间件
 * @returns {Function} Hono 中间件函数
 */
function isTeacherMiddleware() {
    return async (c, next) => {
        const user = c.get('user');

        // 检查是否已通过认证
        if (!user) {
            return c.error(403, '未授权操作，请先登录');
        }

        // 验证用户角色是否为教师
        if (user.role !== 'teacher') {
            return c.error(403, '权限不足，需要教师权限');
        }

        // 继续执行下一个中间件
        await next();
    };
}

module.exports = { isTeacherMiddleware };
