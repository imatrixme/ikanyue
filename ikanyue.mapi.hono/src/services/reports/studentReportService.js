const { buildPagination } = require('../ops/opsUtils');
const { projectPublicReport, projectReportSummary } = require('./reportProjection');

class StudentReportService {
    constructor(repository) {
        this.repository = repository;
    }

    async listReports(user, query = {}) {
        const studentId = requireStudent(user);
        const page = Math.max(Number(query.page) || 1, 1);
        const perPage = Math.min(Math.max(Number(query.perPage || query.limit) || 20, 1), 100);
        const result = await this.repository.list('assessment_report_snapshots', page, perPage, {
            filter: `studentId = "${studentId}"`,
            sort: query.sort || '-created',
        });
        return {
            items: (result.items || []).map(projectReportSummary),
            pagination: buildPagination(result, page, perPage),
        };
    }

    async getReport(user, reportId) {
        const studentId = requireStudent(user);
        if (!reportId) {
            return { ok: false, code: 400, message: '缺少报告' };
        }
        const report = await this.repository.get('assessment_report_snapshots', reportId);
        if (report.studentId !== studentId) {
            return { ok: false, code: 403, message: '无权查看该报告' };
        }
        return { ok: true, data: projectPublicReport(report) };
    }
}

function requireStudent(user = {}) {
    if (!user.id || user.role !== 'student') {
        const error = new Error('仅允许学员查看报告');
        error.status = 403;
        throw error;
    }
    return user.id;
}

module.exports = { StudentReportService, requireStudent };
