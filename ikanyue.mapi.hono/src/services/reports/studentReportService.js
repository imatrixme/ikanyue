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
        const result = await this.listMergedReports(studentId, page, perPage, query);
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
        const report = await this.findOwnedReport(studentId, reportId);
        if (!isStudentRecipient(report, studentId)) {
            return { ok: false, code: 403, message: '无权查看该报告' };
        }
        return { ok: true, data: projectPublicReport(report) };
    }

    async listMergedReports(studentId, page, perPage, query = {}) {
        const [legacy, generic] = await Promise.all([
            safeList(this.repository, 'assessment_report_snapshots', 1, 100, {
                filter: `studentId = "${studentId}"`,
                sort: query.sort || '-created',
            }),
            safeList(this.repository, 'report_instances', 1, 100, {
                filter: `recipientType = "student" && recipientId = "${studentId}" && status = "published"`,
                sort: query.sort || '-publishedAt',
            }),
        ]);
        const items = dedupeReports([...(generic.items || []), ...(legacy.items || [])]).sort(compareReports(query.sort));
        const start = (page - 1) * perPage;
        return {
            items: items.slice(start, start + perPage),
            page,
            perPage,
            totalItems: items.length,
            totalPages: Math.ceil(items.length / perPage),
        };
    }

    async findOwnedReport(studentId, reportId) {
        const generic = await findOptional(this.repository, 'report_instances', reportId);
        if (generic) {
            return generic;
        }
        return this.repository.get('assessment_report_snapshots', reportId);
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

async function safeList(repository, collection, page, perPage, options) {
    try {
        return await repository.list(collection, page, perPage, options);
    } catch (error) {
        if (isMissingCollectionError(error)) {
            return { items: [], page, perPage, totalItems: 0, totalPages: 0 };
        }
        throw error;
    }
}

async function findOptional(repository, collection, id) {
    try {
        return await repository.get(collection, id);
    } catch (error) {
        if (isMissingCollectionError(error) || error.status === 404 || error.code === 404) {
            return null;
        }
        throw error;
    }
}

function isStudentRecipient(report = {}, studentId = '') {
    if (report.recipientType) {
        return report.recipientType === 'student' && report.recipientId === studentId && report.status === 'published';
    }
    return report.studentId === studentId;
}

function dedupeReports(reports = []) {
    const seen = new Set();
    const items = [];
    for (const report of reports) {
        const key = report.sourceType && report.sourceId ? `${report.sourceType}:${report.sourceId}` : `id:${report.id}`;
        if (!seen.has(key)) {
            seen.add(key);
            items.push(report);
        }
    }
    return items;
}

function compareReports(sort = '') {
    const raw = String(sort || '-created').trim();
    const descending = raw.startsWith('-');
    const field = descending ? raw.slice(1) : raw;
    return (left, right) => {
        const leftValue = comparableDate(left, field);
        const rightValue = comparableDate(right, field);
        if (leftValue === rightValue) {
            return 0;
        }
        const result = leftValue > rightValue ? 1 : -1;
        return descending ? -result : result;
    };
}

function comparableDate(report = {}, field = 'created') {
    return report[field] || report.publishedAt || report.created || report.updated || '';
}

function isMissingCollectionError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('collection context') || message.includes('report_instances missing');
}

module.exports = { StudentReportService, requireStudent };
