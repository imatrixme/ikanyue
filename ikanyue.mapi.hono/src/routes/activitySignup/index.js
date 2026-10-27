/**
 * 活动报名路由模块
 */

const { authMiddleware } = require('../../middleware/auth');
const { activitySignupCreateHandler } = require('./create');
const { activitySignupFindHandler } = require('./find');
const { activitySignupDetailHandler } = require('./detail');

function activitySignupRoutes(routes) {
    routes.use(authMiddleware).group('/v1/activity-signup', (signup) => {
        signup.post('/').handler(activitySignupCreateHandler);
        signup.get('/find').handler(activitySignupFindHandler);
        signup.get('/detail').handler(activitySignupDetailHandler);
        signup.get('/:id').handler(activitySignupDetailHandler);
    });
}

module.exports = activitySignupRoutes;

