const { authMiddleware } = require('../../middleware/auth');
const { createPointHandlers } = require('./handlers');

function pointsRoutes(routes, handlers = createPointHandlers()) {
    routes.get('/v1/points/me').use(authMiddleware).handler(handlers.myPoints);
    routes.get('/v1/reward-items').use(authMiddleware).handler(handlers.rewardItems);
}

module.exports = pointsRoutes;
