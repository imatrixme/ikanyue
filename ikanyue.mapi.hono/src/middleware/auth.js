'use strict';
const dayjs = require('dayjs');
const { jwtAuth } = require('../utils/jwtAuth');

/**
 * 认证中间件
 */
function authMiddleware() {
    return async (c, next) => {
        const token = c.req.header('token') || c.req.header('jwtoken') || '';

        if (token.length === 0) {
            return c.json(
                {
                    code: 403,
                    message: '未授权，请登录后操作',
                    data: null,
                },
                200
            );
        }

        const isWeb = !!(c.req.header('sec-fetch-mode') && c.req.header('sec-fetch-site'));
        const user = jwtAuth.check(token);

        if (user === undefined) {
            return c.json(
                {
                    code: 403,
                    message: '非法授权，请正确登录',
                    data: null,
                },
                200
            );
        }

        if (user.expiredAt && user.expiredAt < dayjs().second()) {
            return c.json(
                {
                    code: 403,
                    message: '令牌过期，请重新登录',
                    data: null,
                },
                200
            );
        }

        // 将用户信息存储到上下文中
        c.set('user', user);
        c.set('isWeb', isWeb);

        await next();
    };
}

module.exports = { authMiddleware };
