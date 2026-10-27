const { jwtAuth, OPS_SCOPE } = require('../utils/jwtAuth');
const { getBearerToken } = require('../services/ops/opsUtils');

function opsAuthMiddleware() {
    return async (c, next) => {
        const token = getBearerToken(c);
        if (!token) {
            return c.error(403, '后台未登录');
        }

        const user = jwtAuth.check(token);
        // Miniapp tokens live longer; only short-lived tokens issued by Admin login reach /ops.
        if (!user || user.scope !== OPS_SCOPE) {
            return c.error(403, '后台登录已过期，请重新登录');
        }
        if (user.role !== 'teacher') {
            return c.error(403, '后台仅允许教师或管理员访问');
        }

        c.set('user', user);
        await next();
    };
}

function opsPasswordChangeGuard() {
    return async (c, next) => {
        const user = c.get('user');
        if (!user?.passwordChangeRequired) {
            await next();
            return;
        }
        const path = c.req.path || '';
        if (path === '/ops/auth/me' || path === '/ops/auth/change-password') {
            await next();
            return;
        }
        return c.error(403, '首次登录必须先修改默认密码');
    };
}

module.exports = { opsAuthMiddleware, opsPasswordChangeGuard };
