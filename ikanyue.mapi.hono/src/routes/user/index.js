/**
 * 用户路由模块
 */

// 导入中间件
const { authMiddleware } = require('../../middleware/auth');

// 导入路由处理器
const { userLoginHandler } = require('./login');
const { userWechatLoginHandler } = require('./wechatLogin');
const { userUpdateHandler } = require('./update');
const { userRefreshHandler } = require('./refresh');

/**
 * 注册用户相关路由
 */
function userRoutes(routes) {
  routes.group('/v1/user', (user) => {
    // 用户登录 - 无需认证
    user.post('/login').handler(userLoginHandler);
    user.post('/wechat-login').handler(userWechatLoginHandler);

    user.post('/update').use(authMiddleware).handler(userUpdateHandler);
    user.post('/refresh').use(authMiddleware).handler(userRefreshHandler);
  });
}

module.exports = userRoutes;
