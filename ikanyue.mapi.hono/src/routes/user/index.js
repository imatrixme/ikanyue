/**
 * 用户路由模块
 */

// 导入路由处理器
const userLogin = require('./login');
const userUpdate = require('./update');
const userRefresh = require('./refresh');

/**
 * 注册用户相关路由
 * @param {*} app Hono 应用实例
 * @param {*} authMiddleware 认证中间件
 */
function userRoutes(app, authMiddleware) {
    // 用户登录（无需认证）
    app.post('/v1/user/login', userLogin);

    // 更新用户信息（需要认证）
    app.post('/v1/user/update', authMiddleware(), userUpdate);

    // 刷新用户令牌（需要认证）
    app.post('/v1/user/refresh', authMiddleware(), userRefresh);
}

module.exports = userRoutes;
