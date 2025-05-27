/**
 * 示例路由模块
 */

// 导入中间件
const { authMiddleware } = require('../../middleware/auth');

/**
 * 注册示例相关路由
 */
function exampleRoutes(routes) {
    routes.use(authMiddleware).group('/v1/example', (example) => {
        example.get('/find').handler((c) => {
            return c.data({
                message: 'Hello World',
            });
        });
    });
}

module.exports = exampleRoutes;
