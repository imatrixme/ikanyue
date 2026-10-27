const { createStudentReportService } = require('../../services/reports');

function createStudentReportHandlers(service = createStudentReportService()) {
    return {
        async list(c) {
            return safe(c, () => service.listReports(c.get('user'), c.req.query()));
        },

        async detail(c) {
            return safeResult(c, () => service.getReport(c.get('user'), c.req.param('id')));
        },
    };
}

async function safe(c, operation) {
    try {
        return c.data(await operation());
    } catch (error) {
        return c.error(error.status || 500, error.status === 403 ? error.message : '查询报告失败');
    }
}

async function safeResult(c, operation) {
    try {
        const result = await operation();
        if (!result.ok) {
            return c.error(result.code || 400, result.message || '请求失败');
        }
        return c.data(result.data);
    } catch (error) {
        return c.error(error.status || 500, error.status === 403 ? error.message : '查询报告失败');
    }
}

module.exports = { createStudentReportHandlers };
