const {
    buildPagination,
    createShareToken,
    hashToken,
    mapRecord,
    parseJsonField,
    sanitizePrivateFields,
} = require('./opsUtils');
const { scoreAssessment, validateAssessmentTemplate } = require('./scoringService');

const TEMPLATE_FIELDS = ['id', 'name', 'version', 'status', 'schemaJson', 'scoringJson', 'reportJson', 'createdBy', 'publishedAt', 'created', 'updated'];
const RECORD_FIELDS = ['id', 'templateId', 'templateVersion', 'studentId', 'teacherId', 'lessonRecordId', 'status', 'totalScore', 'grade', 'submittedAt', 'created', 'updated'];
const REPORT_FIELDS = ['id', 'assessmentRecordId', 'studentId', 'teacherId', 'templateId', 'totalScore', 'grade', 'reportJson', 'created', 'updated'];

class OpsAssessmentService {
    constructor(repository, rbacService, auditService) {
        this.repository = repository;
        this.rbacService = rbacService;
        this.auditService = auditService;
    }

    async listTemplates(user, query = {}) {
        this.rbacService.assertTeacher(user);
        const page = Math.max(Number(query.page) || 1, 1);
        const perPage = Math.min(Math.max(Number(query.perPage || query.limit) || 20, 1), 100);
        const filters = [];
        if (query.status && query.status !== 'all') {
            filters.push(`status = "${query.status}"`);
        }
        const result = await this.repository.list('assessment_templates', page, perPage, {
            filter: filters.join(' && '),
            sort: query.sort || '-updated',
        });
        return {
            items: (result.items || []).map((record) => normalizeTemplate(record)),
            pagination: buildPagination(result, page, perPage),
        };
    }

    async createTemplate(user, data = {}) {
        this.rbacService.assertAdmin(user);
        const payload = buildTemplatePayload(data, user);
        const validation = validateAssessmentTemplate(payload);
        if (!validation.valid) {
            return validationError(validation.errors);
        }

        const created = await this.repository.create('assessment_templates', payload);
        await this.auditService.record({
            actor: user,
            action: 'ops.assessment_template.create',
            resourceType: 'assessment_template',
            resourceId: created.id,
        });
        return { ok: true, data: normalizeTemplate(created) };
    }

    async publishTemplate(user, id) {
        this.rbacService.assertAdmin(user);
        const template = normalizeTemplate(await this.repository.get('assessment_templates', id));
        const validation = validateAssessmentTemplate(template);
        if (!validation.valid) {
            return validationError(validation.errors);
        }
        const published = await this.repository.update('assessment_templates', id, {
            status: 'published',
            publishedAt: new Date().toISOString(),
        });
        await this.auditService.record({
            actor: user,
            action: 'ops.assessment_template.publish',
            resourceType: 'assessment_template',
            resourceId: id,
        });
        return { ok: true, data: normalizeTemplate(published) };
    }

    async createRecord(user, data = {}) {
        const templateId = data.templateId;
        const studentId = data.studentId;
        if (!templateId || !studentId) {
            return { ok: false, code: 400, message: '缺少模板或学员' };
        }
        await this.rbacService.assertStudentAccess(user, studentId, 'ops.assessment.create');

        const template = normalizeTemplate(await this.repository.get('assessment_templates', templateId));
        if (template.status !== 'published') {
            return { ok: false, code: 400, message: '只能使用已发布评估模板' };
        }

        const created = await this.repository.create('assessment_records', {
            templateId,
            templateVersion: template.version,
            studentId,
            teacherId: user.id,
            lessonRecordId: data.lessonRecordId || '',
            status: 'draft',
            answersJson: data.answersJson || {},
        });
        await this.auditService.record({
            actor: user,
            action: 'ops.assessment_record.create',
            resourceType: 'assessment_record',
            resourceId: created.id,
        });
        return { ok: true, data: mapRecord(created, RECORD_FIELDS) };
    }

    async saveRecord(user, id, data = {}) {
        const record = await this.loadRecordWithAccess(user, id, 'ops.assessment.save');
        if (record.status === 'submitted') {
            return { ok: false, code: 400, message: '已提交评估不能修改' };
        }
        const updated = await this.repository.update('assessment_records', id, {
            answersJson: data.answersJson || data.answers || {},
            status: 'draft',
        });
        await this.auditService.record({
            actor: user,
            action: 'ops.assessment_record.save',
            resourceType: 'assessment_record',
            resourceId: id,
        });
        return { ok: true, data: mapRecord(updated, RECORD_FIELDS) };
    }

    async submitRecord(user, id, data = {}) {
        const record = await this.loadRecordWithAccess(user, id, 'ops.assessment.submit');
        if (record.status === 'submitted') {
            return { ok: false, code: 400, message: '评估已提交' };
        }

        const template = normalizeTemplate(await this.repository.get('assessment_templates', record.templateId));
        const answers = data.answersJson || data.answers || parseJsonField(record.answersJson, {});
        const score = scoreAssessment(template, answers);
        const submittedAt = new Date().toISOString();
        const updated = await this.repository.update('assessment_records', id, {
            answersJson: answers,
            scoreSummaryJson: score,
            totalScore: score.totalScore,
            grade: score.grade,
            status: 'submitted',
            submittedAt,
        });

        const report = await this.createReportSnapshot(updated, template, answers, score);
        await this.auditService.record({
            actor: user,
            action: 'ops.assessment_record.submit',
            resourceType: 'assessment_record',
            resourceId: id,
            metadata: { reportId: report.id },
        });
        return { ok: true, data: { record: mapRecord(updated, RECORD_FIELDS), report: mapRecord(report, REPORT_FIELDS) } };
    }

    async listReports(user, query = {}) {
        this.rbacService.assertTeacher(user);
        const page = Math.max(Number(query.page) || 1, 1);
        const perPage = Math.min(Math.max(Number(query.perPage || query.limit) || 20, 1), 100);
        const filters = [];
        if (query.studentId) {
            await this.rbacService.assertStudentAccess(user, query.studentId, 'ops.report.list');
            filters.push(`studentId = "${query.studentId}"`);
        }
        if (!user.isAdmin && !query.studentId) {
            filters.push(`teacherId = "${user.id}"`);
        }
        const result = await this.repository.list('assessment_report_snapshots', page, perPage, {
            filter: filters.join(' && '),
            sort: query.sort || '-created',
        });
        return {
            items: (result.items || []).map((record) => mapRecord(record, REPORT_FIELDS)),
            pagination: buildPagination(result, page, perPage),
        };
    }

    async createShareLink(user, reportId, data = {}) {
        await this.loadReportWithAccess(user, reportId, 'ops.share_link.create');
        const token = createShareToken(reportId);
        const share = await this.repository.create('assessment_share_links', {
            reportId,
            tokenHash: hashToken(token),
            expiresAt: data.expiresAt || '',
            revokedAt: '',
            accessCount: 0,
            createdBy: user.id,
        });
        await this.auditService.record({
            actor: user,
            action: 'ops.share_link.create',
            resourceType: 'assessment_share_link',
            resourceId: share.id,
            metadata: { reportId },
        });
        return { ok: true, data: { id: share.id, reportId, token, expiresAt: share.expiresAt } };
    }

    async revokeShareLink(user, shareId) {
        this.rbacService.assertTeacher(user);
        const share = await this.repository.get('assessment_share_links', shareId);
        await this.loadReportWithAccess(user, share.reportId, 'ops.share_link.revoke');
        const updated = await this.repository.update('assessment_share_links', shareId, {
            revokedAt: new Date().toISOString(),
        });
        await this.auditService.record({
            actor: user,
            action: 'ops.share_link.revoke',
            resourceType: 'assessment_share_link',
            resourceId: shareId,
        });
        return { ok: true, data: updated };
    }

    async viewSharedReport(token) {
        const tokenHash = hashToken(token || '');
        const result = await this.repository.list('assessment_share_links', 1, 1, {
            filter: `tokenHash = "${tokenHash}"`,
        });
        const share = result.items?.[0];
        if (!share || share.revokedAt || isExpired(share.expiresAt)) {
            return { ok: false, code: 404, message: '分享链接无效或已过期' };
        }
        const report = await this.repository.get('assessment_report_snapshots', share.reportId);
        await this.repository.update('assessment_share_links', share.id, {
            accessCount: Number(share.accessCount || 0) + 1,
        });
        return { ok: true, data: sanitizePrivateFields(parseJsonField(report.reportJson, report)) };
    }

    async loadRecordWithAccess(user, id, action) {
        this.rbacService.assertTeacher(user);
        const record = await this.repository.get('assessment_records', id);
        await this.rbacService.assertStudentAccess(user, record.studentId, action);
        return record;
    }

    async loadReportWithAccess(user, reportId, action) {
        this.rbacService.assertTeacher(user);
        const report = await this.repository.get('assessment_report_snapshots', reportId);
        await this.rbacService.assertStudentAccess(user, report.studentId, action);
        return report;
    }

    async createReportSnapshot(record, template, answers, score) {
        const [student, teacher] = await Promise.all([
            this.repository.get('students', record.studentId),
            this.repository.get('teachers', record.teacherId),
        ]);
        const reportJson = {
            id: record.id,
            title: template.reportJson?.title || template.name,
            student: sanitizePrivateFields(student),
            teacher: sanitizePrivateFields(teacher),
            template: template,
            answers,
            score,
            generatedAt: new Date().toISOString(),
        };
        return this.repository.create('assessment_report_snapshots', {
            assessmentRecordId: record.id,
            studentId: record.studentId,
            teacherId: record.teacherId,
            templateId: record.templateId,
            totalScore: score.totalScore,
            grade: score.grade,
            reportJson,
            studentSnapshotJson: sanitizePrivateFields(student),
            teacherSnapshotJson: sanitizePrivateFields(teacher),
            templateSnapshotJson: template,
            answersSnapshotJson: answers,
            scoreSnapshotJson: score,
        });
    }
}

function buildTemplatePayload(data, user) {
    const schemaJson = data.schemaJson || data.schema || {};
    const scoringJson = data.scoringJson || data.scoring || schemaJson.scoring || { type: 'weighted_sum', maxScore: 100 };
    return {
        name: data.name,
        version: Number(data.version || 1),
        status: data.status || 'draft',
        schemaJson,
        scoringJson,
        reportJson: data.reportJson || {},
        createdBy: user.id,
    };
}

function normalizeTemplate(record = {}) {
    return {
        ...mapRecord(record, TEMPLATE_FIELDS),
        version: Number(record.version || 1),
        schemaJson: parseJsonField(record.schemaJson, {}),
        scoringJson: parseJsonField(record.scoringJson, {}),
        reportJson: parseJsonField(record.reportJson, {}),
    };
}

function validationError(errors) {
    return { ok: false, code: 400, message: errors.join('；') };
}

function isExpired(expiresAt) {
    return Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());
}

module.exports = { OpsAssessmentService, normalizeTemplate };
