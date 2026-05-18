const { opsAuthMiddleware } = require('../../middleware/opsAuth');
const { createOpsHandlers } = require('./handlers');

function opsRoutes(routes, handlers = createOpsHandlers()) {
    routes.post('/ops/auth/login').handler(handlers.login);
    routes.get('/ops/share/:token').handler(handlers.viewSharedReport);

    routes.get('/ops/auth/me').use(opsAuthMiddleware).handler(handlers.me);
    routes.get('/ops/dashboard').use(opsAuthMiddleware).handler(handlers.dashboard);

    routes.get('/ops/assessment-templates').use(opsAuthMiddleware).handler(handlers.listTemplates);
    routes.post('/ops/assessment-templates').use(opsAuthMiddleware).handler(handlers.createTemplate);
    routes.post('/ops/assessment-templates/:id/publish').use(opsAuthMiddleware).handler(handlers.publishTemplate);

    routes.post('/ops/assessments').use(opsAuthMiddleware).handler(handlers.createAssessment);
    routes.post('/ops/assessments/:id/save').use(opsAuthMiddleware).handler(handlers.saveAssessment);
    routes.post('/ops/assessments/:id/submit').use(opsAuthMiddleware).handler(handlers.submitAssessment);

    routes.get('/ops/reports').use(opsAuthMiddleware).handler(handlers.listReports);
    routes.post('/ops/reports/:reportId/share-links').use(opsAuthMiddleware).handler(handlers.createShare);
    routes.post('/ops/share-links/:id/revoke').use(opsAuthMiddleware).handler(handlers.revokeShare);

    routes.get('/ops/:resource').use(opsAuthMiddleware).handler(handlers.list);
    routes.get('/ops/:resource/:id').use(opsAuthMiddleware).handler(handlers.detail);
    routes.post('/ops/:resource').use(opsAuthMiddleware).handler(handlers.create);
    routes.post('/ops/:resource/:id').use(opsAuthMiddleware).handler(handlers.update);
}

module.exports = opsRoutes;
