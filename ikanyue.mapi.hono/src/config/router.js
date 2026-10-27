// 导入路由模块
const userRoutes = require('../routes/user');
const opsRoutes = require('../routes/ops');
const pointsRoutes = require('../routes/points');
const courseCreditRoutes = require('../routes/courseCredits');
const publicCourseCatalogRoutes = require('../routes/publicCourseCatalog');
const { registerCommerceRoutes } = require('../routes/commerce');
const { activityFindHandler } = require('../routes/activity/find');

const registerBizRoutes = function (routes) {
    // WeChat release surface: public activities, login/profile, learner points, rewards, and the lite ops console.
    routes.get('/v1/activity/find').handler(activityFindHandler);
    publicCourseCatalogRoutes(routes);
    userRoutes(routes);
    pointsRoutes(routes);
    opsRoutes(routes);
    courseCreditRoutes(routes);
    registerCommerceRoutes(routes);
};

module.exports = { registerBizRoutes };
