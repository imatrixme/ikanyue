/**
 * 管理员权限验证中间件
 * 验证当前用户是否具有管理员权限
 * 对应原项目: api/policies/isAdmin.js
 */

/**
 * 管理员权限验证中间件
 * @returns {Function} Hono 中间件函数
 */
function isAdminMiddleware() {
    return async (c, next) => {
        const user = c.get('user');

        // 检查是否已通过认证
        if (!user) {
            return c.error(403, '未授权操作，请先登录');
        }

        // 验证用户是否为教师且具有管理员权限
        if (user.role !== 'teacher' || !user.isAdmin) {
            return c.error(403, '权限不足，需要管理员权限');
        }

        // 继续执行下一个中间件
        await next();
    };
}

module.exports = { isAdminMiddleware };
