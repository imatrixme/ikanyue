const { buildPagination, mapRecord, normalizeString } = require('./opsUtils');

const MANAGEMENT_CONFIG = {
    students: {
        collection: 'students',
        resourceType: 'student',
        teacherScoped: true,
        fields: ['id', 'cellphone', 'nickName', 'realName', 'avatar', 'gender', 'birthday', 'blocked', 'created', 'updated'],
        searchable: ['cellphone', 'nickName', 'realName'],
    },
    teachers: {
        collection: 'teachers',
        resourceType: 'teacher',
        adminOnly: true,
        fields: ['id', 'cellphone', 'nickName', 'realName', 'avatar', 'verified', 'blocked', 'isAdmin', 'created', 'updated'],
        searchable: ['cellphone', 'nickName', 'realName'],
    },
    activities: {
        collection: 'activities',
        resourceType: 'activity',
        adminOnlyWrite: true,
        fields: ['id', 'title', 'description', 'status', 'type', 'location', 'startTime', 'endTime', 'price', 'sequence', 'created', 'updated'],
        searchable: ['title', 'location'],
    },
    audioMaterials: {
        collection: 'audio_materials',
        resourceType: 'audio_material',
        fields: ['id', 'title', 'type', 'author', 'status', 'language', 'difficulty', 'sequence', 'created', 'updated'],
        searchable: ['title', 'author'],
    },
    videoMaterials: {
        collection: 'video_materials',
        resourceType: 'video_material',
        fields: ['id', 'title', 'type', 'author', 'status', 'language', 'difficulty', 'resolution', 'sequence', 'created', 'updated'],
        searchable: ['title', 'author'],
    },
    operationSlots: {
        collection: 'operation_slots',
        resourceType: 'operation_slot',
        adminOnlyWrite: true,
        fields: ['id', 'channel', 'placement', 'title', 'status', 'sortOrder', 'visibleFrom', 'visibleTo', 'created', 'updated'],
        searchable: ['title', 'placement'],
    },
    auditLogs: {
        collection: 'ops_audit_logs',
        resourceType: 'audit_log',
        adminOnly: true,
        readOnly: true,
        fields: ['id', 'actorId', 'actorRole', 'action', 'resourceType', 'resourceId', 'outcome', 'metadata', 'created'],
        searchable: ['actorId', 'action', 'resourceType', 'resourceId', 'outcome'],
    },
};

class OpsManagementService {
    constructor(repository, rbacService, auditService) {
        this.repository = repository;
        this.rbacService = rbacService;
        this.auditService = auditService;
    }

    async dashboard(user) {
        this.rbacService.assertTeacher(user);
        const [students, activities, reports, audits] = await Promise.all([
            this.safeCount('students', user),
            this.safeCount('activities', user),
            this.safeCount('assessment_report_snapshots', user),
            this.safeCount('ops_audit_logs', user),
        ]);

        return {
            cards: [
                { key: 'students', label: '学员', value: students },
                { key: 'activities', label: '活动', value: activities },
                { key: 'reports', label: '评估报告', value: reports },
                { key: 'audits', label: '审计日志', value: audits },
            ],
            pending: [
                { key: 'teacherReview', label: '待审核教师', value: user.isAdmin ? await this.safeCount('teachers', user, 'verified = false') : 0 },
            ],
        };
    }

    async list(resourceKey, user, query = {}) {
        const config = getConfig(resourceKey);
        await this.assertRead(config, user);

        const page = Math.max(Number(query.page) || 1, 1);
        const perPage = Math.min(Math.max(Number(query.perPage || query.limit) || 20, 1), 100);
        const filter = await this.buildFilter(config, user, query);
        const result = await this.repository.list(config.collection, page, perPage, {
            filter,
            sort: query.sort || '-created',
        });

        return {
            items: (result.items || []).map((record) => mapRecord(record, config.fields)),
            pagination: buildPagination(result, page, perPage),
        };
    }

    async detail(resourceKey, id, user) {
        const config = getConfig(resourceKey);
        await this.assertRead(config, user);
        const record = await this.repository.get(config.collection, id);
        if (config.teacherScoped) {
            await this.rbacService.assertStudentAccess(user, record.id, `ops.${config.resourceType}.detail`);
        }
        return mapRecord(record, config.fields);
    }

    async create(resourceKey, user, data = {}) {
        const config = getConfig(resourceKey);
        this.assertWrite(config, user);
        const payload = sanitizeManagementPayload(data);
        const created = await this.repository.create(config.collection, payload);
        await this.auditService.record({
            actor: user,
            action: `ops.${config.resourceType}.create`,
            resourceType: config.resourceType,
            resourceId: created.id,
        });
        return mapRecord(created, config.fields);
    }

    async update(resourceKey, id, user, data = {}) {
        const config = getConfig(resourceKey);
        this.assertWrite(config, user);
        const payload = sanitizeManagementPayload(data);
        const updated = await this.repository.update(config.collection, id, payload);
        await this.auditService.record({
            actor: user,
            action: `ops.${config.resourceType}.update`,
            resourceType: config.resourceType,
            resourceId: id,
        });
        return mapRecord(updated, config.fields);
    }

    async assertRead(config, user) {
        this.rbacService.assertTeacher(user);
        if (config.adminOnly) {
            this.rbacService.assertAdmin(user);
        }
    }

    assertWrite(config, user) {
        this.rbacService.assertTeacher(user);
        if (config.readOnly) {
            const error = new Error('该运营资源仅允许读取');
            error.code = 405;
            throw error;
        }
        if (config.adminOnly || config.adminOnlyWrite) {
            this.rbacService.assertAdmin(user);
        }
    }

    async buildFilter(config, user, query) {
        const filters = [];
        const search = normalizeString(query.q || query.query || query.search);
        if (search && config.searchable.length > 0) {
            filters.push(`(${config.searchable.map((field) => `${field} ~ "${search}"`).join(' || ')})`);
        }
        if (query.status && query.status !== 'all') {
            filters.push(`status = "${query.status}"`);
        }
        if (config.teacherScoped && !user.isAdmin) {
            const relationResult = await this.repository.list('teacher_student_relations', 1, 100, {
                filter: `teacherId = "${user.id}" && status = "active"`,
            });
            const studentIds = (relationResult.items || []).map((item) => item.studentId).filter(Boolean);
            filters.push(studentIds.length === 0 ? 'id = "__none__"' : `(${studentIds.map((id) => `id = "${id}"`).join(' || ')})`);
        }
        return filters.join(' && ');
    }

    async safeCount(collection, user, extraFilter = '') {
        try {
            const result = await this.repository.list(collection, 1, 1, {
                filter: extraFilter,
            });
            return result.totalItems || result.items?.length || 0;
        } catch (error) {
            return user.isAdmin ? 0 : 0;
        }
    }
}

function getConfig(resourceKey) {
    const config = MANAGEMENT_CONFIG[resourceKey];
    if (!config) {
        const error = new Error('不支持的运营资源');
        error.code = 404;
        throw error;
    }
    return config;
}

function sanitizeManagementPayload(data = {}) {
    const blocked = new Set(['id', 'sn', 'password', 'token', 'tokenKey', 'created', 'updated']);
    return Object.entries(data).reduce((acc, [key, value]) => {
        if (!blocked.has(key)) {
            acc[key] = value;
        }
        return acc;
    }, {});
}

module.exports = { MANAGEMENT_CONFIG, OpsManagementService };
