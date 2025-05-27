/**
 * 用户路由模块
 */

// 导入中间件
const { authMiddleware } = require('../../middleware/auth');

// 导入路由处理器
const { userLoginHandler } = require('./login');
const { userUpdateHandler } = require('./update');
const { userRefreshHandler } = require('./refresh');

/**
 * 注册用户相关路由
 */
function userRoutes(routes) {
    routes.group('/v1/user', (user) => {
        // 用户登录 - 无需认证
        user.post('/login').handler(userLoginHandler);

        // 需要认证的路由组
        user.use(authMiddleware).group('', (authUser) => {
            authUser.post('/update').handler(userUpdateHandler);
            authUser.post('/refresh').handler(userRefreshHandler);
        });
    });
}

module.exports = userRoutes;
