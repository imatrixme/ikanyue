/**
 * 用户路由模块 - 使用通用路由构建器
 */

// 导入中间件
const { authMiddleware } = require('../../middleware/auth');

// 导入路由处理器
const userLogin = require('./login');
const { userUpdateHandler } = require('./update');
const { userRefreshHandler } = require('./refresh');

/**
 * 注册用户相关路由
 * @param {*} routes 路由构建器实例
 */
function userRoutes(routes) {
    // 用户相关路由组
    routes.group('/user', (user) => {
        // 用户登录 - 无需认证
        user.post('/login').handler(userLogin);

        // 需要认证的路由组
        user.use(authMiddleware).group('', (authUser) => {
            // 更新用户信息
            authUser.post('/update').handler(userUpdateHandler);

            // 刷新用户令牌
            authUser.post('/refresh').handler(userRefreshHandler);
        });
    });
}

module.exports = userRoutes;
