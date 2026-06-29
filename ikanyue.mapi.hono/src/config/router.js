// 导入路由模块
const userRoutes = require('../routes/user');
const opsRoutes = require('../routes/ops');
const pointsRoutes = require('../routes/points');

const registerBizRoutes = function (routes) {
    // WeChat points lite release surface: login/profile, learner points, reward catalog, and the lite ops console.
    userRoutes(routes);
    pointsRoutes(routes);
    opsRoutes(routes);
};

module.exports = { registerBizRoutes };
