const dayjs = require('dayjs');
const { jwtAuth } = require('../utils/jwtAuth');
const { getBearerToken } = require('../services/ops/opsUtils');

function opsAuthMiddleware() {
    return async (c, next) => {
        const token = getBearerToken(c);
        if (!token) {
            return c.error(403, '后台未登录');
        }

        const user = jwtAuth.check(token);
        if (!user || user.role !== 'teacher') {
            return c.error(403, '后台仅允许教师或管理员访问');
        }
        if (user.expiredAt && user.expiredAt < dayjs().unix()) {
            return c.error(403, '后台登录已过期');
        }

        c.set('user', user);
        await next();
    };
}

module.exports = { opsAuthMiddleware };
