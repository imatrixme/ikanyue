const { opsAuthMiddleware, opsPasswordChangeGuard } = require('../../middleware/opsAuth');
const { createOpsHandlers } = require('./handlers');

function opsRoutes(routes, handlers = createOpsHandlers()) {
    const opsAuth = [opsAuthMiddleware, opsPasswordChangeGuard];

    routes.post('/ops/auth/login').handler(handlers.login);
    routes.post('/ops/auth/register').handler(handlers.register);

    routes.get('/ops/auth/me').use(opsAuthMiddleware).handler(handlers.me);
    routes.post('/ops/auth/change-password').use(opsAuthMiddleware).handler(handlers.changePassword);

    routes.get('/ops/points/students').use(...opsAuth).handler(handlers.listStudents);
    routes.get('/ops/points/students/:studentId').use(...opsAuth).handler(handlers.studentPoints);
    routes.get('/ops/points/students/:studentId/events').use(...opsAuth).handler(handlers.studentPoints);
    routes.post('/ops/points/students/:studentId/earn').use(...opsAuth).handler(handlers.addStudentPoints);
    routes.post('/ops/points/offline-redeem').use(...opsAuth).handler(handlers.offlineRedeem);

    routes.get('/ops/reward-items').use(...opsAuth).handler(handlers.listRewards);
    routes.post('/ops/reward-items').use(...opsAuth).handler(handlers.createReward);
    routes.post('/ops/reward-items/:id').use(...opsAuth).handler(handlers.updateReward);
    routes.post('/ops/reward-items/:id/image').use(...opsAuth).handler(handlers.uploadRewardImage);
}

module.exports = opsRoutes;
