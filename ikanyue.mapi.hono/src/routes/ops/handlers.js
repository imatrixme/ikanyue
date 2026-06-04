const { OpsAuthorizationError } = require('../../services/ops/rbacService');
const { readRequestBody } = require('../../services/ops/opsUtils');

function createOpsHandlers(services = createDefaultOpsServices()) {
    return {
        async login(c) {
            const body = await readRequestBody(c);
            return sendResult(c, await services.authService.login(body, c.req));
        },

        async register(c) {
            const body = await readRequestBody(c);
            return sendResult(c, await services.authService.register(body, c.req));
        },

        async me(c) {
            return sendResult(c, await services.authService.me(c.get('user')));
        },

        async changePassword(c) {
            const body = await readRequestBody(c);
            return sendResult(c, await services.authService.changePassword(c.get('user'), body, c.req));
        },

        async dashboard(c) {
            return safe(c, () => services.managementService.dashboard(c.get('user')));
        },

        async publicOperationSlots(c) {
            return safe(c, () => services.managementService.publicOperationSlots(c.req.query()));
        },

        async uploadRichTextImage(c) {
            return safe(c, async () => services.richTextAssetService.uploadImage(c.get('user'), await c.req.parseBody()));
        },

        async list(c) {
            return safe(c, () => services.managementService.list(c.req.param('resource'), c.get('user'), c.req.query()));
        },

        async detail(c) {
            return safe(c, () => services.managementService.detail(c.req.param('resource'), c.req.param('id'), c.get('user')));
        },

        async create(c) {
            const body = await readRequestBody(c);
            return safe(c, () => services.managementService.create(c.req.param('resource'), c.get('user'), body));
        },

        async update(c) {
            const body = await readRequestBody(c);
            return safe(c, () => services.managementService.update(c.req.param('resource'), c.req.param('id'), c.get('user'), body));
        },

        async listTemplates(c) {
            return safe(c, () => services.assessmentService.listTemplates(c.get('user'), c.req.query()));
        },

        async createTemplate(c) {
            const body = await readRequestBody(c);
            return safeResult(c, () => services.assessmentService.createTemplate(c.get('user'), body));
        },

        async publishTemplate(c) {
            return safeResult(c, () => services.assessmentService.publishTemplate(c.get('user'), c.req.param('id')));
        },

        async createAssessment(c) {
            const body = await readRequestBody(c);
            return safeResult(c, () => services.assessmentService.createRecord(c.get('user'), body));
        },

        async saveAssessment(c) {
            const body = await readRequestBody(c);
            return safeResult(c, () => services.assessmentService.saveRecord(c.get('user'), c.req.param('id'), body));
        },

        async submitAssessment(c) {
            const body = await readRequestBody(c);
            return safeResult(c, () => services.assessmentService.submitRecord(c.get('user'), c.req.param('id'), body));
        },

        async listReports(c) {
            return safe(c, () => services.assessmentService.listReports(c.get('user'), c.req.query()));
        },

        async reportDetail(c) {
            return safeResult(c, () => services.assessmentService.getReportDetail(c.get('user'), c.req.param('reportId')));
        },

        async createShare(c) {
            const body = await readRequestBody(c);
            return safeResult(c, () => services.assessmentService.createShareLink(c.get('user'), c.req.param('reportId'), body));
        },

        async revokeShare(c) {
            return safeResult(c, () => services.assessmentService.revokeShareLink(c.get('user'), c.req.param('id')));
        },

        async viewSharedReport(c) {
            return safeResult(c, () => services.assessmentService.viewSharedReport(c.req.param('token')));
        },

        async listReportEvents(c) {
            return safe(c, () => services.reportingService.listEvents(c.get('user'), c.req.query()));
        },

        async createReportEvent(c) {
            const body = await readRequestBody(c);
            return safeResult(c, () => services.reportingService.createEvent(c.get('user'), body));
        },

        async updateReportEvent(c) {
            const body = await readRequestBody(c);
            return safeResult(c, () => services.reportingService.updateEvent(c.get('user'), c.req.param('id'), body));
        },

        async listReportInstances(c) {
            return safe(c, () => services.reportingService.listInstances(c.get('user'), c.req.query()));
        },

        async reportInstanceDetail(c) {
            return safeResult(c, () => services.reportingService.getInstance(c.get('user'), c.req.param('id')));
        },

        async generateReportInstances(c) {
            const body = await readRequestBody(c);
            return safeResult(c, () => services.reportingService.generateInstances(c.get('user'), c.req.param('eventId'), body));
        },

        async publishReportInstance(c) {
            return safeResult(c, () => services.reportingService.publishInstance(c.get('user'), c.req.param('id')));
        },

        async revokeReportInstance(c) {
            return safeResult(c, () => services.reportingService.revokeInstance(c.get('user'), c.req.param('id')));
        },
    };
}

async function safe(c, operation) {
    try {
        return c.data(await operation());
    } catch (error) {
        return sendError(c, error);
    }
}

async function safeResult(c, operation) {
    try {
        return sendResult(c, await operation());
    } catch (error) {
        return sendError(c, error);
    }
}

function sendResult(c, result) {
    if (!result?.ok) {
        return c.error(result?.code || 500, result?.message || '操作失败');
    }
    return c.data(result.data);
}

function sendError(c, error) {
    if (error instanceof OpsAuthorizationError) {
        return c.error(error.code, error.message);
    }
    return c.error(error.code || error.status || 500, error.message || '服务器内部错误');
}

function createDefaultOpsServices() {
    const { createOpsServices } = require('../../services/ops');
    return createOpsServices();
}

module.exports = { createOpsHandlers };
