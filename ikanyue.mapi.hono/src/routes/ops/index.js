const { opsAuthMiddleware, opsPasswordChangeGuard } = require('../../middleware/opsAuth');
const { createOpsHandlers } = require('./handlers');

function opsRoutes(routes, handlers = createOpsHandlers()) {
    const opsAuth = [opsAuthMiddleware, opsPasswordChangeGuard];

    routes.post('/ops/auth/login').handler(handlers.login);
    routes.post('/ops/auth/register').handler(handlers.register);
    routes.get('/ops/share/:token').handler(handlers.viewSharedReport);
    routes.get('/ops/public/operation-slots').handler(handlers.publicOperationSlots);

    routes.get('/ops/auth/me').use(opsAuthMiddleware).handler(handlers.me);
    routes.post('/ops/auth/change-password').use(opsAuthMiddleware).handler(handlers.changePassword);
    routes.get('/ops/dashboard').use(...opsAuth).handler(handlers.dashboard);
    routes.post('/ops/uploads/rich-text-image').use(...opsAuth).handler(handlers.uploadRichTextImage);

    routes.get('/ops/assessment-templates').use(...opsAuth).handler(handlers.listTemplates);
    routes.post('/ops/assessment-templates').use(...opsAuth).handler(handlers.createTemplate);
    routes.post('/ops/assessment-templates/:id/publish').use(...opsAuth).handler(handlers.publishTemplate);

    routes.post('/ops/assessments').use(...opsAuth).handler(handlers.createAssessment);
    routes.post('/ops/assessments/:id/save').use(...opsAuth).handler(handlers.saveAssessment);
    routes.post('/ops/assessments/:id/submit').use(...opsAuth).handler(handlers.submitAssessment);

    routes.get('/ops/reports').use(...opsAuth).handler(handlers.listReports);
    routes.get('/ops/reports/:reportId').use(...opsAuth).handler(handlers.reportDetail);
    routes.post('/ops/reports/:reportId/share-links').use(...opsAuth).handler(handlers.createShare);
    routes.post('/ops/share-links/:id/revoke').use(...opsAuth).handler(handlers.revokeShare);

    routes.get('/ops/report-events').use(...opsAuth).handler(handlers.listReportEvents);
    routes.post('/ops/report-events').use(...opsAuth).handler(handlers.createReportEvent);
    routes.post('/ops/report-events/:id').use(...opsAuth).handler(handlers.updateReportEvent);
    routes.post('/ops/report-events/:eventId/instances').use(...opsAuth).handler(handlers.generateReportInstances);
    routes.get('/ops/report-instances').use(...opsAuth).handler(handlers.listReportInstances);
    routes.get('/ops/report-instances/:id').use(...opsAuth).handler(handlers.reportInstanceDetail);
    routes.post('/ops/report-instances/:id/publish').use(...opsAuth).handler(handlers.publishReportInstance);
    routes.post('/ops/report-instances/:id/revoke').use(...opsAuth).handler(handlers.revokeReportInstance);

    routes.get('/ops/:resource').use(...opsAuth).handler(handlers.list);
    routes.get('/ops/:resource/:id').use(...opsAuth).handler(handlers.detail);
    routes.post('/ops/:resource').use(...opsAuth).handler(handlers.create);
    routes.post('/ops/:resource/:id').use(...opsAuth).handler(handlers.update);
}

module.exports = opsRoutes;
