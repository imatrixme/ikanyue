const { invariant } = require('./domain');
const { COURSE_CREDIT_CAPABILITIES, hasCourseCreditCapability } = require('./authorization');
const { escapeFilter, mapEvent, mapPage, pagination, quantity, relationId } = require('./queryService');
const {
    SETTLEMENT_OPERATION_TYPES,
    buildSettlementExceptions,
    filterSettlementExceptions,
} = require('./settlementExceptionProjection');

const STUDENT_FIELDS = [
    'id', 'realName', 'nickName', 'cellphone', 'avatar', 'blocked', 'lastLoginAt',
    'created', 'updated',
];

const RESOURCE_CONFIGS = Object.freeze({
    courseSpecs: resource('course_specs', 'name', [
        'id', 'code', 'name', 'deliveryMode', 'durationMinutes', 'teacherTier',
        'status', 'defaultCreditTypeId', 'created', 'updated',
    ], ['draft', 'active', 'inactive']),
    creditTypes: resource('credit_types', 'kind,name', [
        'id', 'code', 'name', 'kind', 'courseSpecId', 'consumable', 'unitLabel',
        'referenceUnitValue', 'status', 'created', 'updated',
    ], ['draft', 'active', 'inactive']),
    packages: resource('packages', 'name', [
        'id', 'code', 'name', 'description', 'saleChannel', 'activationMode',
        'activationDeadlineDays', 'validityDurationDays', 'expiryPolicy', 'status', 'created', 'updated',
    ], ['draft', 'active', 'inactive']),
    grantLines: resource('package_grant_lines', 'packageId,creditTypeId', [
        'id', 'packageId', 'creditTypeId', 'quantity', 'created', 'updated',
    ], [], '', ['packageId', 'creditTypeId']),
    priceVersions: resource('price_versions', '-validFrom,-version', [
        'id', 'packageId', 'currency', 'listAmount', 'saleAmount', 'validFrom',
        'validTo', 'version', 'status', 'created',
    ], ['draft', 'active', 'inactive']),
    orders: resource('orders', '-created', [
        'id', 'orderNo', 'studentId', 'payerId', 'type', 'channel', 'status',
        'currency', 'listAmount', 'paidAmount', 'priceVersionId', 'paidAt',
        'productSnapshot', 'grantSnapshot', 'cancelledAt', 'version', 'created', 'updated',
    ], ['pending', 'paid', 'granted', 'cancelled', 'failed', 'reversal_pending', 'reversed'], '',
    ['studentId', 'priceVersionId'], ['productSnapshot', 'grantSnapshot']),
    enrollments: resource('credit_operations', '-created', [
        'id', 'operationNo', 'studentId', 'status', 'sourceId', 'requestSnapshot',
        'resultSnapshot', 'actorId', 'actorRole', 'traceId', 'created', 'updated',
    ], ['pending', 'committed', 'failed', 'reversed'], 'sourceType="enrollment"',
    ['studentId', 'sourceId'], ['requestSnapshot', 'resultSnapshot']),
    conversionRules: resource('conversion_rules', '-validFrom,-version', [
        'id', 'sourceCreditTypeId', 'targetCreditTypeId', 'sourceQuantity', 'targetQuantity',
        'minSourceQuantity', 'maxSourceQuantity', 'expiryPolicy', 'activationMode',
        'validityDurationDays', 'activationDeadlineDays', 'reversible', 'referenceValueLimit',
        'validFrom', 'validTo', 'version', 'status', 'created',
    ], ['draft', 'active', 'inactive']),
    classes: resource('classes', '-termStart,name', [
        'id', 'code', 'name', 'courseSpecId', 'defaultCreditTypeId', 'termStart',
        'termEnd', 'capacity', 'location', 'status', 'created', 'updated',
    ], ['draft', 'active', 'completed', 'cancelled']),
    classStudents: resource('class_students', '-effectiveFrom', [
        'id', 'classId', 'studentId', 'status', 'effectiveFrom', 'effectiveTo', 'sourceOrderId', 'created', 'updated',
    ], ['invited', 'active', 'paused', 'completed', 'cancelled'], '', ['classId', 'studentId']),
    classTeachers: resource('class_teachers', 'role,teacherId', [
        'id', 'classId', 'teacherId', 'role', 'status', 'effectiveFrom', 'effectiveTo', 'created', 'updated',
    ], ['active', 'inactive'], '', ['classId', 'teacherId']),
    sessions: resource('sessions', '-startAt', [
        'id', 'code', 'title', 'status', 'startAt', 'endAt', 'location',
        'requiredCreditTypeId', 'requiredQuantity', 'rosterVersion', 'version',
        'settlementOperationId', 'correctionBaseStatus', 'created', 'updated',
    ], ['draft', 'scheduled', 'enrollment_closed', 'in_progress', 'completed', 'settled', 'cancelled', 'correction_pending']),
    sessionClasses: resource('session_classes', 'sessionId', [
        'id', 'sessionId', 'classId', 'created', 'updated',
    ], [], '', ['sessionId', 'classId']),
    sessionStudents: resource('session_students', 'studentId', [
        'id', 'sessionId', 'studentId', 'sourceClassIds', 'attendanceStatus', 'creditStatus',
        'eligibilityReason', 'checkedInAt', 'settledAt', 'version', 'created', 'updated',
    ], [], '', ['sessionId', 'studentId', 'attendanceStatus', 'creditStatus']),
    sessionTeachers: resource('session_teachers', 'role,teacherId', [
        'id', 'sessionId', 'teacherId', 'role', 'assignmentSource', 'actualStatus', 'creditStatus', 'created', 'updated',
    ], [], '', ['sessionId', 'teacherId', 'actualStatus', 'creditStatus']),
    settlementExceptions: resource('session_students', '-updated', [
        'id', 'sessionId', 'studentId', 'attendanceStatus', 'creditStatus',
        'eligibilityReason', 'checkedInAt', 'settledAt', 'version', 'created', 'updated',
    ], [], 'creditStatus="credit_insufficient" || creditStatus="conversion_required"'),
    teacherEvents: resource('teacher_credit_events', '-created', [
        'id', 'sessionTeacherId', 'teacherId', 'ruleId', 'eventType', 'quantityDelta',
        'status', 'operationId', 'confirmationOfEventId', 'reversalOfEventId', 'reason', 'created',
    ], ['pending', 'confirmed', 'reversed'], '', ['teacherId', 'sessionTeacherId']),
    reconciliationRuns: resource('reconciliation_runs', '-startedAt', [
        'id', 'scope', 'status', 'startedAt', 'finishedAt', 'differenceCount', 'created',
    ], ['pending', 'running', 'passed', 'failed']),
    reconciliationExceptions: resource('reconciliation_exceptions', '-detectedAt', [
        'id', 'runId', 'batchId', 'code', 'field', 'expectedValue', 'actualValue',
        'status', 'detectedAt', 'created',
    ], ['open', 'acknowledged', 'resolved']),
    auditLogs: resource('ops_audit_logs', '-created', [
        'id', 'actorId', 'actorRole', 'action', 'resourceType', 'resourceId', 'outcome', 'metadata', 'created',
    ], [], '', ['actorId', 'resourceType', 'resourceId', 'outcome'], ['metadata']),
});

class CourseCreditOpsQueryService {
    constructor(repository) {
        this.repository = repository;
    }

    async listResource(name, query = {}) {
        const config = configFor(name);
        const page = pagination(query);
        const filters = config.baseFilter ? [config.baseFilter] : [];
        if (query.status) {
            invariant(config.statuses.has(query.status), 'OPS_FILTER_STATUS_INVALID', 'Resource status filter is invalid');
            filters.push(`status="${escapeFilter(query.status)}"`);
        }
        for (const field of config.filterFields) {
            if (query[field] !== undefined && query[field] !== '') {
                filters.push(`${field}="${escapeFilter(query[field])}"`);
            }
        }
        const result = await this.repository.page(config.collection, page.page, page.perPage, {
            ...(filters.length ? { filter: filters.join(' && ') } : {}),
            sort: config.sort,
        });
        return mapPage(result, (record) => project(record, config.fields, config.rawFields));
    }

    async getResource(name, id) {
        const config = configFor(name);
        invariant(typeof id === 'string' && id, 'OPS_RESOURCE_ID_REQUIRED', 'Resource id is required');
        const record = await this.repository.findFirst(
            config.collection,
            `id="${escapeFilter(id)}"${config.baseFilter ? ` && (${config.baseFilter})` : ''}`
        );
        invariant(record, 'OPS_RESOURCE_NOT_FOUND', 'Course-credit resource was not found', { resource: name });
        return project(record, config.fields, config.rawFields);
    }

    async listAccounts(query = {}) {
        const page = pagination(query);
        const batches = await this.repository.list('credit_batches', { sort: 'studentId,created' });
        const accounts = [...groupAccounts(batches).values()].sort((left, right) => (
            left.studentId.localeCompare(right.studentId)
        ));
        return arrayPage(accounts, page.page, page.perPage);
    }

    async getAccount(studentId) {
        invariant(typeof studentId === 'string' && studentId,
            'STUDENT_ID_REQUIRED', 'Student id is required');
        const [batches, events] = await Promise.all([
            this.repository.list('credit_batches', {
                filter: `studentId="${escapeFilter(studentId)}"`,
                sort: 'effectiveExpiresAt,priority,created',
            }),
            this.repository.list('credit_events', {
                filter: `studentId="${escapeFilter(studentId)}"`,
                sort: '-businessTime,-created',
                expand: 'creditTypeId,creditTypeId.courseSpecId,operationId',
            }),
        ]);
        return {
            ...(groupAccounts(batches).get(studentId) || emptyAccount(studentId)),
            batches: batches.map(projectAccountBatch),
            events: events.slice(0, 100).map(mapEvent),
        };
    }

    async listTeacherEvents(query = {}) {
        const page = pagination(query);
        const config = configFor('teacherEvents');
        if (query.status) {
            invariant(config.statuses.has(query.status),
                'OPS_FILTER_STATUS_INVALID', 'Resource status filter is invalid');
        }
        const filters = config.filterFields
            .filter((field) => query[field] !== undefined && query[field] !== '')
            .map((field) => `${field}="${escapeFilter(query[field])}"`);
        const records = await this.repository.list(config.collection, {
            ...(filters.length ? { filter: filters.join(' && ') } : {}),
            sort: config.sort,
        });
        const resolved = new Set(records.flatMap((record) => [
            relationId(record.confirmationOfEventId), relationId(record.reversalOfEventId),
        ]).filter(Boolean));
        const visible = records.filter((record) => {
            if (query.status === 'pending') {
                return record.status === 'pending' && ['earn', 'compensate'].includes(record.eventType)
                    && !resolved.has(record.id);
            }
            return !query.status || record.status === query.status;
        }).map((record) => project(record, config.fields, config.rawFields));
        return arrayPage(visible, page.page, page.perPage);
    }

    async listSettlementExceptions(query = {}) {
        const page = pagination(query);
        const operationTypes = SETTLEMENT_OPERATION_TYPES.map((type) => `type="${type}"`).join(' || ');
        const [roster, allocations, operations, sessions, reconciliation] = await Promise.all([
            this.repository.list('session_students', {
                filter: 'creditStatus="credit_insufficient" || creditStatus="conversion_required"', sort: '-updated',
            }),
            this.repository.list('session_credit_allocations', {
                filter: 'status="expired"', sort: '-updated', expand: 'sessionStudentId',
            }),
            this.repository.list('credit_operations', {
                filter: `status="failed" && (${operationTypes})`, sort: '-updated',
            }),
            this.repository.list('sessions', { filter: 'status="correction_pending"', sort: '-updated' }),
            this.repository.list('reconciliation_exceptions', {
                filter: 'status="open" || status="acknowledged"', sort: '-detectedAt',
            }),
        ]);
        const items = buildSettlementExceptions({ roster, allocations, operations, sessions, reconciliation });
        return arrayPage(filterSettlementExceptions(items, query), page.page, page.perPage);
    }

    async getAssignedTeacherEvent(operator, id) {
        const event = await this.getResource('teacherEvents', id);
        invariant(operator?.isAdmin === true || relationId(event.teacherId) === operator?.id,
            'TEACHER_EVENT_FORBIDDEN', '教师只能查看本人的工作量记录');
        return event;
    }

    async listAssignedStudents(operator, query = {}) {
        const page = pagination(query);
        const globalScope = operator?.isAdmin === true
            || hasCourseCreditCapability(operator, COURSE_CREDIT_CAPABILITIES.ACADEMIC);
        const scope = globalScope ? null : await teacherScope(this.repository, operator);
        const assignedStudentIds = scope ? studentIdsFromScope(scope) : [];
        if (scope && assignedStudentIds.length === 0) return arrayPage([], page.page, page.perPage);
        const filters = studentFilters(query);
        if (scope) filters.push(anyFilter('id', assignedStudentIds));
        const result = await this.repository.page('students', page.page, page.perPage, {
            fields: STUDENT_FIELDS.join(','),
            ...(filters.length ? { filter: filters.join(' && ') } : {}),
            sort: 'realName,nickName,cellphone',
        });
        const studentIds = (result.items || []).map((student) => student.id);
        const relations = scope || await studentRelations(this.repository, studentIds);
        return mapPage(result, (student) => projectAssignedStudent(student, relations));
    }

    async listAssignedClasses(operator, query = {}) {
        const globalScope = operator?.isAdmin === true
            || hasCourseCreditCapability(operator, COURSE_CREDIT_CAPABILITIES.ACADEMIC);
        const page = pagination(query);
        const scope = globalScope ? null : await teacherScope(this.repository, operator);
        const assignedClassIds = scope ? uniqueIds(scope.classTeachers, 'classId') : [];
        if (scope && assignedClassIds.length === 0) return arrayPage([], page.page, page.perPage);
        const filters = scope ? [anyFilter('id', assignedClassIds)] : [];
        if (query.classId) filters.push(`id="${escapeFilter(query.classId)}"`);
        if (query.status) {
            invariant(RESOURCE_CONFIGS.classes.statuses.has(query.status),
                'OPS_FILTER_STATUS_INVALID', 'Resource status filter is invalid');
            filters.push(`status="${escapeFilter(query.status)}"`);
        }
        const result = await this.repository.page('classes', page.page, page.perPage, {
            ...(filters.length ? { filter: filters.join(' && ') } : {}),
            sort: RESOURCE_CONFIGS.classes.sort,
        });
        const classIds = (result.items || []).map((teachingClass) => teachingClass.id);
        const relations = scope || {
            classStudents: await relatedRows(this.repository, 'class_students', 'classId', classIds),
            classTeachers: await relatedRows(this.repository, 'class_teachers', 'classId', classIds),
        };
        return mapPage(result, (record) => projectAssignedClass(record, relations));
    }

    async listAssignedLessons(operator, query = {}) {
        const globalScope = operator?.isAdmin === true
            || hasCourseCreditCapability(operator, COURSE_CREDIT_CAPABILITIES.ACADEMIC);
        const page = pagination(query);
        const scope = globalScope ? null : await teacherScope(this.repository, operator);
        const assignedSessionIds = scope ? uniqueIds(scope.sessionTeachers, 'sessionId') : [];
        if (scope && assignedSessionIds.length === 0) return arrayPage([], page.page, page.perPage);
        const filters = scope ? [anyFilter('id', assignedSessionIds)] : [];
        if (query.sessionId) filters.push(`id="${escapeFilter(query.sessionId)}"`);
        if (query.status) {
            const config = configFor('sessions');
            invariant(config.statuses.has(query.status), 'OPS_FILTER_STATUS_INVALID', 'Resource status filter is invalid');
            filters.push(`status="${escapeFilter(query.status)}"`);
        }
        const result = await this.repository.page('sessions', page.page, page.perPage, {
            ...(filters.length ? { filter: filters.join(' && ') } : {}),
            sort: RESOURCE_CONFIGS.sessions.sort,
        });
        const sessionIds = (result.items || []).map((lesson) => lesson.id);
        const relations = scope || {
            sessionStudents: await relatedRows(this.repository, 'session_students', 'sessionId', sessionIds),
            sessionTeachers: await relatedRows(this.repository, 'session_teachers', 'sessionId', sessionIds),
        };
        return mapPage(result, (record) => projectAssignedLesson(record, relations));
    }
}

async function teacherScope(repository, operator = {}) {
    invariant(hasCourseCreditCapability(operator, COURSE_CREDIT_CAPABILITIES.TEACHER),
        'COURSE_CREDIT_CAPABILITY_REQUIRED', '缺少课程运营权限');
    const teacherId = escapeFilter(operator.id);
    const [classTeachers, sessionTeachers] = await Promise.all([
        repository.list('class_teachers', {
            filter: `teacherId="${teacherId}" && status="active"`, sort: 'classId',
        }),
        repository.list('session_teachers', {
            filter: `teacherId="${teacherId}" && actualStatus!="cancelled"`, sort: 'sessionId',
        }),
    ]);
    const [classStudents, sessionStudents] = await Promise.all([
        relatedRows(repository, 'class_students', 'classId', uniqueIds(classTeachers, 'classId')),
        relatedRows(repository, 'session_students', 'sessionId', uniqueIds(sessionTeachers, 'sessionId')),
    ]);
    return { classStudents, classTeachers, sessionStudents, sessionTeachers };
}

async function studentRelations(repository, studentIds) {
    const [classStudents, sessionStudents] = await Promise.all([
        relatedRows(repository, 'class_students', 'studentId', studentIds),
        relatedRows(repository, 'session_students', 'studentId', studentIds),
    ]);
    return { classStudents, classTeachers: [], sessionStudents, sessionTeachers: [] };
}

async function relatedRows(repository, collection, field, ids) {
    return ids.length ? repository.list(collection, {
        filter: anyFilter(field, ids), sort: `${field},created`,
    }) : [];
}

function projectAssignedStudent(student, scope) {
    return {
        ...project(student, STUDENT_FIELDS),
        classAssignments: scope.classStudents.filter((row) => relationId(row.studentId) === student.id)
            .map((row) => project(row, RESOURCE_CONFIGS.classStudents.fields)),
        lessonAssignments: scope.sessionStudents.filter((row) => relationId(row.studentId) === student.id)
            .map((row) => project(row, RESOURCE_CONFIGS.sessionStudents.fields)),
    };
}

function projectAssignedClass(teachingClass, scope) {
    return {
        ...project(teachingClass, RESOURCE_CONFIGS.classes.fields, RESOURCE_CONFIGS.classes.rawFields),
        students: scope.classStudents.filter((row) => relationId(row.classId) === teachingClass.id)
            .map((row) => project(row, RESOURCE_CONFIGS.classStudents.fields)),
        teachers: scope.classTeachers.filter((row) => relationId(row.classId) === teachingClass.id)
            .map((row) => project(row, RESOURCE_CONFIGS.classTeachers.fields)),
    };
}

function projectAssignedLesson(lesson, scope) {
    return {
        ...project(lesson, RESOURCE_CONFIGS.sessions.fields, RESOURCE_CONFIGS.sessions.rawFields),
        students: scope.sessionStudents.filter((row) => relationId(row.sessionId) === lesson.id)
            .map((row) => project(row, RESOURCE_CONFIGS.sessionStudents.fields)),
        teachers: scope.sessionTeachers.filter((row) => relationId(row.sessionId) === lesson.id)
            .map((row) => project(row, RESOURCE_CONFIGS.sessionTeachers.fields)),
    };
}

function studentIdsFromScope(scope) {
    return [...new Set([
        ...uniqueIds(scope.classStudents, 'studentId'),
        ...uniqueIds(scope.sessionStudents, 'studentId'),
    ])];
}

function uniqueIds(rows, field) {
    return [...new Set(rows.map((row) => relationId(row[field])).filter(Boolean))];
}

function anyFilter(field, values) {
    return `(${values.map((value) => `${field}="${escapeFilter(value)}"`).join(' || ')})`;
}

function studentFilters(query) {
    const filters = [];
    if (query.studentId) filters.push(`id="${escapeFilter(query.studentId)}"`);
    const keyword = String(query.q || query.keyword || '').trim();
    if (keyword) {
        const value = escapeFilter(keyword);
        filters.push(`(realName ~ "${value}" || nickName ~ "${value}" || cellphone ~ "${value}")`);
    }
    if (query.status === 'active' || query.status === 'inactive') {
        filters.push(`blocked = ${query.status === 'inactive'}`);
    }
    return filters;
}

function resource(collection, sort, fields, statuses, baseFilter = '', filterFields = [], rawFields = []) {
    return {
        collection, sort, fields, statuses: new Set(statuses), baseFilter,
        filterFields, rawFields: new Set(rawFields),
    };
}

function configFor(name) {
    const config = RESOURCE_CONFIGS[name];
    invariant(config, 'OPS_RESOURCE_INVALID', 'Course-credit resource is not supported');
    return config;
}

function project(record, fields, rawFields = new Set()) {
    return Object.fromEntries(fields.map((field) => [
        field,
        rawFields.has(field) ? record[field] ?? null : relationOrValue(record[field]),
    ]));
}

function relationOrValue(value) {
    if (Array.isArray(value)) return value.map(relationId);
    if (value && typeof value === 'object') return relationId(value);
    return value ?? null;
}

function groupAccounts(batches) {
    const accounts = new Map();
    for (const batch of batches) {
        const studentId = relationId(batch.studentId);
        if (!accounts.has(studentId)) accounts.set(studentId, emptyAccount(studentId));
        const account = accounts.get(studentId);
        account.batchCount += 1;
        account.availableQuantity += quantity(batch.availableQuantity);
        account.frozenQuantity += quantity(batch.frozenQuantity);
        account.consumedQuantity += quantity(batch.consumedQuantity);
        account.expiredQuantity += quantity(batch.expiredQuantity);
        account.unactivatedQuantity += ['pending', 'unactivated'].includes(batch.status)
            ? quantity(batch.availableQuantity) : 0;
    }
    return accounts;
}

function emptyAccount(studentId) {
    return {
        studentId,
        batchCount: 0,
        availableQuantity: 0,
        frozenQuantity: 0,
        consumedQuantity: 0,
        expiredQuantity: 0,
        unactivatedQuantity: 0,
    };
}

function projectAccountBatch(batch) {
    return {
        id: batch.id,
        creditTypeId: relationId(batch.creditTypeId),
        sourceOperationId: relationId(batch.sourceOperationId),
        status: batch.status,
        originalQuantity: quantity(batch.originalQuantity),
        availableQuantity: quantity(batch.availableQuantity),
        frozenQuantity: quantity(batch.frozenQuantity),
        consumedQuantity: quantity(batch.consumedQuantity),
        expiredQuantity: quantity(batch.expiredQuantity),
        effectiveExpiresAt: batch.effectiveExpiresAt || null,
        activationDeadline: batch.activationDeadline || null,
        activatedAt: batch.activatedAt || null,
        listUnitValue: Number(batch.listUnitValue) || 0,
        paidUnitCost: Number(batch.paidUnitCost) || 0,
        currency: batch.currency || '',
        created: batch.created || null,
    };
}

function arrayPage(items, page, perPage) {
    const totalItems = items.length;
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / perPage);
    const start = (page - 1) * perPage;
    return { page, perPage, totalItems, totalPages, items: items.slice(start, start + perPage) };
}

module.exports = {
    CourseCreditOpsQueryService,
    RESOURCE_CONFIGS,
    arrayPage,
    anyFilter,
    configFor,
    emptyAccount,
    groupAccounts,
    project,
    projectAccountBatch,
    projectAssignedClass,
    projectAssignedLesson,
    projectAssignedStudent,
    relationOrValue,
    resource,
    studentFilters,
    studentIdsFromScope,
    teacherScope,
    uniqueIds,
};
