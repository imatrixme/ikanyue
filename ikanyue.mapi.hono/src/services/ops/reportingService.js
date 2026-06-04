const { buildPagination, mapRecord, normalizeString, parseJsonField } = require('./opsUtils');
const { projectReportInstance, projectReportSummary } = require('../reports/reportProjection');

const REPORT_EVENT_FIELDS = ['id', 'title', 'reportType', 'templateId', 'scopeType', 'scopeId', 'programId', 'sessionId', 'status', 'createdBy', 'subjectRulesJson', 'recipientRulesJson', 'metadata', 'created', 'updated'];
const REPORT_INSTANCE_FIELDS = ['id', 'eventId', 'templateId', 'reportType', 'scopeType', 'scopeId', 'subjectType', 'subjectId', 'recipientType', 'recipientId', 'status', 'sourceType', 'sourceId', 'totalScore', 'grade', 'reportJson', 'publishedAt', 'created', 'updated'];

class OpsReportingService {
    constructor(repository, rbacService, auditService) {
        this.repository = repository;
        this.rbacService = rbacService;
        this.auditService = auditService;
    }

    async listEvents(user, query = {}) {
        this.rbacService.assertTeacher(user);
        const page = Math.max(Number(query.page) || 1, 1);
        const perPage = Math.min(Math.max(Number(query.perPage || query.limit) || 20, 1), 100);
        const filter = buildEventFilter(user, query);
        const result = await this.repository.list('report_events', page, perPage, {
            filter,
            sort: query.sort || '-created',
        });
        return {
            items: (result.items || []).map(normalizeEvent),
            pagination: buildPagination(result, page, perPage),
        };
    }

    async createEvent(user, data = {}) {
        await this.assertEventScopeAccess(user, data);
        const payload = buildEventPayload(data, user);
        const created = await this.repository.create('report_events', payload);
        await this.auditService.record({
            actor: user,
            action: 'ops.report_event.create',
            resourceType: 'report_event',
            resourceId: created.id,
            metadata: { scopeType: created.scopeType, scopeId: created.scopeId },
        });
        return { ok: true, data: normalizeEvent(created) };
    }

    async updateEvent(user, eventId, data = {}) {
        const current = await this.repository.get('report_events', eventId);
        await this.assertEventScopeAccess(user, current);
        const payload = sanitizeEventUpdate(data);
        const updated = await this.repository.update('report_events', eventId, payload);
        await this.auditService.record({
            actor: user,
            action: 'ops.report_event.update',
            resourceType: 'report_event',
            resourceId: eventId,
        });
        return { ok: true, data: normalizeEvent(updated) };
    }

    async listInstances(user, query = {}) {
        this.rbacService.assertTeacher(user);
        const page = Math.max(Number(query.page) || 1, 1);
        const perPage = Math.min(Math.max(Number(query.perPage || query.limit) || 20, 1), 100);
        const filter = buildInstanceFilter(user, query);
        const result = await this.repository.list('report_instances', page, perPage, {
            filter,
            sort: query.sort || '-publishedAt',
        });
        return {
            items: (result.items || []).map(projectReportSummary),
            pagination: buildPagination(result, page, perPage),
        };
    }

    async getInstance(user, id) {
        if (!id) {
            return { ok: false, code: 400, message: '缺少报告' };
        }
        const report = await this.repository.get('report_instances', id);
        await this.assertInstanceAccess(user, report, 'ops.report_instance.detail');
        return { ok: true, data: projectReportInstance(report) };
    }

    async generateInstances(user, eventId, data = {}) {
        const event = await this.loadEventWithAccess(user, eventId, 'ops.report_instance.generate');
        const template = await this.repository.get('report_templates', event.templateId);
        const targets = normalizeTargets(data.targets || data.recipients || []);
        if (targets.length === 0) {
            return { ok: false, code: 400, message: '缺少报告接收对象' };
        }

        const created = [];
        for (const target of targets) {
            const payload = buildInstancePayload(event, template, target, data);
            created.push(await this.repository.create('report_instances', payload));
        }
        await this.auditService.record({
            actor: user,
            action: 'ops.report_instance.generate',
            resourceType: 'report_event',
            resourceId: eventId,
            metadata: { count: created.length },
        });
        return { ok: true, data: { items: created.map((item) => mapRecord(item, REPORT_INSTANCE_FIELDS)) } };
    }

    async publishInstance(user, id) {
        const report = await this.repository.get('report_instances', id);
        await this.assertInstanceAccess(user, report, 'ops.report_instance.publish');
        const updated = await this.repository.update('report_instances', id, {
            status: 'published',
            publishedAt: new Date().toISOString(),
        });
        await this.auditService.record({
            actor: user,
            action: 'ops.report_instance.publish',
            resourceType: 'report_instance',
            resourceId: id,
        });
        return { ok: true, data: mapRecord(updated, REPORT_INSTANCE_FIELDS) };
    }

    async revokeInstance(user, id) {
        const report = await this.repository.get('report_instances', id);
        await this.assertInstanceAccess(user, report, 'ops.report_instance.revoke');
        const updated = await this.repository.update('report_instances', id, {
            status: 'revoked',
        });
        await this.auditService.record({
            actor: user,
            action: 'ops.report_instance.revoke',
            resourceType: 'report_instance',
            resourceId: id,
        });
        return { ok: true, data: mapRecord(updated, REPORT_INSTANCE_FIELDS) };
    }

    async assertEventScopeAccess(user, data = {}) {
        this.rbacService.assertTeacher(user);
        if (user.isAdmin) {
            return true;
        }
        const scopeType = data.scopeType;
        const scopeId = data.scopeId || data.programId || data.sessionId;
        if (scopeType === 'program' || data.programId) {
            return assertJoinAccess(this.repository, 'program_teachers', 'programId', data.programId || scopeId, user.id, this.auditService, user, 'ops.report_event.scope');
        }
        if (scopeType === 'session' || data.sessionId) {
            return assertJoinAccess(this.repository, 'session_teachers', 'sessionId', data.sessionId || scopeId, user.id, this.auditService, user, 'ops.report_event.scope');
        }
        this.rbacService.assertAdmin(user);
        return true;
    }

    async loadEventWithAccess(user, eventId, action) {
        const event = await this.repository.get('report_events', eventId);
        await this.assertEventScopeAccess(user, event);
        await this.auditService.record({
            actor: user,
            action,
            resourceType: 'report_event',
            resourceId: eventId,
        });
        return event;
    }

    async assertInstanceAccess(user, report, action) {
        this.rbacService.assertTeacher(user);
        if (user.isAdmin) {
            return true;
        }
        if (report.recipientType === 'teacher' && report.recipientId === user.id && report.status === 'published') {
            return true;
        }
        if (report.eventId) {
            const event = await this.repository.get('report_events', report.eventId);
            return this.assertEventScopeAccess(user, event);
        }
        await this.auditService.denied(user, action, 'report_instance', report.id);
        this.rbacService.assertAdmin(user);
        return true;
    }
}

function buildEventPayload(data = {}, user = {}) {
    const scopeType = normalizeString(data.scopeType || (data.sessionId ? 'session' : data.programId ? 'program' : 'custom'));
    const scopeId = normalizeString(data.scopeId || data.sessionId || data.programId);
    if (!data.title || !data.templateId || !data.reportType || !scopeType || !scopeId) {
        const error = new Error('缺少报告事件标题、模板、类型或作用域');
        error.code = 400;
        throw error;
    }
    return {
        title: normalizeString(data.title),
        reportType: normalizeString(data.reportType),
        templateId: normalizeString(data.templateId),
        scopeType,
        scopeId,
        programId: data.programId || (scopeType === 'program' ? scopeId : ''),
        sessionId: data.sessionId || (scopeType === 'session' ? scopeId : ''),
        status: data.status || 'open',
        createdBy: user.id,
        subjectRulesJson: data.subjectRulesJson || {},
        recipientRulesJson: data.recipientRulesJson || {},
        metadata: data.metadata || {},
    };
}

function buildInstancePayload(event, template, target = {}, data = {}) {
    const subjectType = target.subjectType || target.type || 'student';
    const subjectId = target.subjectId || target.id || target.recipientId;
    const recipientType = target.recipientType || target.type || subjectType;
    const recipientId = target.recipientId || target.id || subjectId;
    if (!subjectType || !subjectId || !recipientType || !recipientId) {
        const error = new Error('缺少报告对象或接收人');
        error.code = 400;
        throw error;
    }
    const reportJson = buildReportJson(event, template, target, data);
    return {
        eventId: event.id,
        templateId: event.templateId,
        reportType: target.reportType || event.reportType,
        scopeType: event.scopeType,
        scopeId: event.scopeId,
        subjectType,
        subjectId,
        recipientType,
        recipientId,
        status: target.status || data.status || 'draft',
        sourceType: target.sourceType || '',
        sourceId: target.sourceId || '',
        totalScore: Number(target.totalScore ?? reportJson.score?.totalScore ?? 0),
        grade: target.grade || reportJson.score?.grade || '',
        reportJson,
        inputIdsJson: target.inputIdsJson || target.inputIds || [],
        publishedAt: '',
    };
}

function buildReportJson(event, template, target = {}, data = {}) {
    const templateJson = parseJsonField(template.reportJson, {});
    return {
        title: target.title || data.title || templateJson.title || event.title,
        reportType: target.reportType || event.reportType,
        scope: { type: event.scopeType, id: event.scopeId, title: target.scopeTitle || '' },
        subject: target.subject || { id: target.subjectId || target.id, name: target.subjectName || target.name || '' },
        recipient: target.recipient || { id: target.recipientId || target.id, name: target.recipientName || target.name || '' },
        score: target.score || {},
        summary: target.summary || '',
        sections: target.sections || [],
        recommendations: target.recommendations || [],
        templateSnapshot: template,
        generatedAt: new Date().toISOString(),
    };
}

function normalizeEvent(record = {}) {
    return {
        ...mapRecord(record, REPORT_EVENT_FIELDS),
        subjectRulesJson: parseJsonField(record.subjectRulesJson, {}),
        recipientRulesJson: parseJsonField(record.recipientRulesJson, {}),
        metadata: parseJsonField(record.metadata, {}),
    };
}

function sanitizeEventUpdate(data = {}) {
    const allowed = new Set(['title', 'reportType', 'templateId', 'scopeType', 'scopeId', 'programId', 'sessionId', 'status', 'subjectRulesJson', 'recipientRulesJson', 'metadata']);
    return Object.entries(data).reduce((payload, [key, value]) => {
        if (allowed.has(key)) {
            payload[key] = value;
        }
        return payload;
    }, {});
}

function normalizeTargets(targets = []) {
    return Array.isArray(targets) ? targets.filter(Boolean) : [];
}

function buildEventFilter(user, query = {}) {
    const filters = [];
    if (query.status && query.status !== 'all') {
        filters.push(`status = "${query.status}"`);
    }
    if (query.scopeType && query.scopeId) {
        filters.push(`scopeType = "${query.scopeType}" && scopeId = "${query.scopeId}"`);
    }
    if (!user.isAdmin) {
        filters.push(`createdBy = "${user.id}"`);
    }
    return filters.join(' && ');
}

function buildInstanceFilter(user, query = {}) {
    const filters = [];
    if (query.status && query.status !== 'all') {
        filters.push(`status = "${query.status}"`);
    }
    if (query.eventId) {
        filters.push(`eventId = "${query.eventId}"`);
    }
    if (!user.isAdmin) {
        filters.push(`(recipientType = "teacher" && recipientId = "${user.id}")`);
    }
    return filters.join(' && ');
}

async function assertJoinAccess(repository, collection, field, resourceId, teacherId, auditService, user, action) {
    const result = await repository.list(collection, 1, 1, {
        filter: `${field} = "${resourceId}" && teacherId = "${teacherId}" && status = "active"`,
    });
    if (result.items?.length > 0) {
        return true;
    }
    await auditService.denied(user, action, collection, resourceId);
    const error = new Error('无权访问该报告作用域');
    error.code = 403;
    throw error;
}

module.exports = {
    OpsReportingService,
    buildEventPayload,
    buildInstancePayload,
};
