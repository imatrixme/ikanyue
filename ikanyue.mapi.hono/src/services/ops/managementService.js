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
        fields: ['id', 'cellphone', 'nickName', 'realName', 'avatar', 'verified', 'blocked', 'isAdmin', 'idAdmin', 'created', 'updated'],
        searchable: ['cellphone', 'nickName', 'realname'],
        normalize: normalizeTeacherRecord,
        normalizePayload: normalizeTeacherPayload,
    },
    activities: {
        collection: 'activities',
        resourceType: 'activity',
        adminOnlyWrite: true,
        fields: [
            'id',
            'title',
            'description',
            'status',
            'type',
            'location',
            'startTime',
            'endTime',
            'price',
            'sequence',
            'coverImage',
            'images',
            'tags',
            'maxParticipants',
            'currentParticipants',
            'externalLink',
            'created',
            'updated',
        ],
        searchable: ['title', 'location'],
    },
    audioMaterials: {
        collection: 'audio_materials',
        resourceType: 'audio_material',
        fields: [
            'id',
            'title',
            'type',
            'author',
            'status',
            'language',
            'difficulty',
            'sequence',
            'coverImage',
            'audioSource',
            'description',
            'content',
            'tags',
            'duration',
            'created',
            'updated',
        ],
        searchable: ['title', 'author'],
    },
    videoMaterials: {
        collection: 'video_materials',
        resourceType: 'video_material',
        fields: [
            'id',
            'title',
            'type',
            'author',
            'status',
            'language',
            'difficulty',
            'resolution',
            'sequence',
            'coverImage',
            'thumbnail',
            'videoSource',
            'description',
            'content',
            'tags',
            'duration',
            'created',
            'updated',
        ],
        searchable: ['title', 'author'],
    },
    operationSlots: {
        collection: 'operation_slots',
        resourceType: 'operation_slot',
        adminOnlyWrite: true,
        fields: ['id', 'channel', 'placement', 'title', 'description', 'status', 'sortOrder', 'visibleFrom', 'visibleTo', 'imageUrl', 'targetType', 'targetId', 'targetUrl', 'metadata', 'created', 'updated'],
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
    activitySignups: {
        collection: 'activity_signups',
        resourceType: 'activity_signup',
        adminOnlyWrite: true,
        teacherStudentScoped: true,
        studentOwnerFields: ['userId'],
        fields: ['id', 'userId', 'studentId', 'activityId', 'realName', 'age', 'status', 'remark', 'created', 'updated'],
        searchable: ['realName', 'status'],
    },
    learningPrograms: {
        collection: 'learning_programs',
        resourceType: 'learning_program',
        adminOnlyWrite: true,
        fields: ['id', 'title', 'type', 'status', 'description', 'plannedSessionCount', 'plannedStartAt', 'plannedEndAt', 'metadata', 'created', 'updated'],
        searchable: ['title', 'type', 'status'],
    },
    learningSessions: {
        collection: 'learning_sessions',
        resourceType: 'learning_session',
        adminOnlyWrite: true,
        fields: ['id', 'programId', 'title', 'theme', 'status', 'sequence', 'startTime', 'endTime', 'metadata', 'created', 'updated'],
        searchable: ['title', 'theme', 'status'],
    },
    programStudents: {
        collection: 'program_students',
        resourceType: 'program_student',
        adminOnlyWrite: true,
        teacherStudentScoped: true,
        studentOwnerFields: ['studentId'],
        fields: ['id', 'programId', 'studentId', 'status', 'metadata', 'created', 'updated'],
        searchable: ['status'],
    },
    programTeachers: {
        collection: 'program_teachers',
        resourceType: 'program_teacher',
        adminOnlyWrite: true,
        fields: ['id', 'programId', 'teacherId', 'role', 'status', 'metadata', 'created', 'updated'],
        searchable: ['role', 'status'],
    },
    sessionStudents: {
        collection: 'session_students',
        resourceType: 'session_student',
        adminOnlyWrite: true,
        teacherStudentScoped: true,
        studentOwnerFields: ['studentId'],
        fields: ['id', 'sessionId', 'studentId', 'status', 'metadata', 'created', 'updated'],
        searchable: ['status'],
    },
    sessionTeachers: {
        collection: 'session_teachers',
        resourceType: 'session_teacher',
        adminOnlyWrite: true,
        fields: ['id', 'sessionId', 'teacherId', 'role', 'status', 'metadata', 'created', 'updated'],
        searchable: ['role', 'status'],
    },
    reportTemplates: {
        collection: 'report_templates',
        resourceType: 'report_template',
        adminOnlyWrite: true,
        fields: ['id', 'name', 'version', 'reportType', 'status', 'schemaJson', 'reportJson', 'createdBy', 'created', 'updated'],
        searchable: ['name', 'reportType', 'status'],
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
            items: (result.items || []).map((record) => projectRecord(config, record)),
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
        if (config.teacherStudentScoped) {
            await this.rbacService.assertStudentAccess(user, resolveStudentId(record), `ops.${config.resourceType}.detail`);
        }
        return projectRecord(config, record);
    }

    async create(resourceKey, user, data = {}) {
        const config = getConfig(resourceKey);
        await this.assertWrite(config, user);
        const payload = sanitizeManagementPayload(config.normalizePayload ? config.normalizePayload(data) : data);
        const created = await this.repository.create(config.collection, payload);
        await this.auditService.record({
            actor: user,
            action: `ops.${config.resourceType}.create`,
            resourceType: config.resourceType,
            resourceId: created.id,
        });
        return projectRecord(config, created);
    }

    async update(resourceKey, id, user, data = {}) {
        const config = getConfig(resourceKey);
        await this.assertWrite(config, user);
        const payload = sanitizeManagementPayload(config.normalizePayload ? config.normalizePayload(data) : data);
        const updated = await this.repository.update(config.collection, id, payload);
        await this.auditService.record({
            actor: user,
            action: `ops.${config.resourceType}.update`,
            resourceType: config.resourceType,
            resourceId: id,
        });
        return projectRecord(config, updated);
    }

    async publicOperationSlots(query = {}) {
        const config = getConfig('operationSlots');
        const filters = ['status = "active"'];
        const channel = normalizeString(query.channel || 'wechat-mini');
        const placement = normalizeString(query.placement);
        if (channel) {
            filters.push(`channel = "${channel}"`);
        }
        if (placement) {
            filters.push(`placement = "${placement}"`);
        }

        let result;
        try {
            result = await this.repository.list(config.collection, 1, 100, {
                filter: filters.join(' && '),
                sort: 'sortOrder,-created',
            });
        } catch (error) {
            if (isMissingCollectionContextError(error)) {
                return {
                    items: [],
                    pagination: buildPagination({}, 1, 100),
                };
            }
            throw error;
        }
        const now = parseDate(query.now) || new Date();
        return {
            items: (result.items || [])
                .filter((record) => isVisibleSlot(record, now))
                .sort(compareSlots)
                .map((record) => projectRecord(config, record)),
            pagination: buildPagination(result, 1, 100),
        };
    }

    async assertRead(config, user) {
        this.rbacService.assertTeacher(user);
        if (config.adminOnly) {
            this.rbacService.assertAdmin(user);
        }
    }

    async assertWrite(config, user) {
        this.rbacService.assertTeacher(user);
        if (config.readOnly) {
            const error = new Error('该运营资源仅允许读取');
            error.code = 405;
            throw error;
        }
        if (config.adminOnly || config.adminOnlyWrite) {
            try {
                this.rbacService.assertAdmin(user);
            } catch (error) {
                if (error instanceof Error) {
                    await this.auditService.denied(user, `ops.${config.resourceType}.write`, config.resourceType);
                }
                throw error;
            }
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
        if (config.teacherStudentScoped && !user.isAdmin) {
            const relationResult = await this.repository.list('teacher_student_relations', 1, 100, {
                filter: `teacherId = "${user.id}" && status = "active"`,
            });
            const studentIds = (relationResult.items || []).map((item) => item.studentId).filter(Boolean);
            const ownerFields = config.studentOwnerFields || ['studentId'];
            const studentFilters = studentIds.flatMap((id) => ownerFields.map((field) => `${field} = "${id}"`));
            filters.push(studentFilters.length === 0 ? `${ownerFields[0]} = "__none__"` : `(${studentFilters.join(' || ')})`);
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

function resolveStudentId(record = {}) {
    return record.studentId || record.userId || '';
}

function projectRecord(config, record) {
    const normalized = config.normalize ? config.normalize(record) : record;
    return mapRecord(normalized, config.fields);
}

function normalizeTeacherRecord(record = {}) {
    return {
        ...record,
        nickName: record.nickName || record.nickname || '',
        realName: record.realname || record.realName || '',
        isAdmin: record.idAdmin ?? record.isAdmin ?? false,
    };
}

function normalizeTeacherPayload(data = {}) {
    const payload = { ...data };
    if (Object.prototype.hasOwnProperty.call(payload, 'realName')) {
        payload.realname = payload.realName;
        delete payload.realName;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'nickname')) {
        payload.nickName = payload.nickname;
        delete payload.nickname;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'isAdmin')) {
        payload.idAdmin = payload.isAdmin;
        delete payload.isAdmin;
    }
    return payload;
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
    const blocked = new Set(['id', 'sn', 'password', 'passwordConfirm', 'token', 'tokenKey', 'created', 'updated']);
    return Object.entries(data).reduce((acc, [key, value]) => {
        if (!blocked.has(key)) {
            acc[key] = value;
        }
        return acc;
    }, {});
}

function isVisibleSlot(record, now) {
    const visibleFrom = parseDate(record.visibleFrom);
    const visibleTo = parseDate(record.visibleTo);
    return (!visibleFrom || visibleFrom <= now) && (!visibleTo || visibleTo >= now);
}

function parseDate(value) {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function compareSlots(left, right) {
    const leftOrder = Number(left.sortOrder ?? 0);
    const rightOrder = Number(right.sortOrder ?? 0);
    if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
    }
    return String(right.created || '').localeCompare(String(left.created || ''));
}

function isMissingCollectionContextError(error) {
    return typeof error?.message === 'string' && error.message.toLowerCase().includes('collection context');
}

module.exports = { MANAGEMENT_CONFIG, OpsManagementService };
