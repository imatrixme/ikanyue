const { invariant } = require('./domain');
const { activeConversionRulesAt } = require('./conversionRuleVersions');

const BATCH_STATUSES = new Set(['pending', 'unactivated', 'active', 'depleted', 'expired', 'cancelled']);
const EVENT_TYPES = new Set([
    'GRANT', 'CONVERT_OUT', 'CONVERT_IN', 'FREEZE', 'ACTIVATE', 'CONSUME',
    'RELEASE', 'EXPIRE', 'EXTEND', 'REVERSE', 'ADJUST',
]);

class CourseCreditQueryService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.expiryWarningDays = options.expiryWarningDays || 30;
    }

    async summary(studentId) {
        requiredStudentId(studentId);
        const batches = await this.repository.list('credit_batches', {
            filter: `studentId="${escapeFilter(studentId)}" && status!="cancelled"`,
            sort: 'effectiveExpiresAt,priority,created',
            expand: 'creditTypeId,creditTypeId.courseSpecId',
        });
        return buildSummary(batches, this.clock(), this.expiryWarningDays);
    }

    async listBatches(studentId, query = {}) {
        requiredStudentId(studentId);
        const page = pagination(query);
        const filters = [`studentId="${escapeFilter(studentId)}"`];
        if (query.status) {
            invariant(BATCH_STATUSES.has(query.status), 'BATCH_STATUS_INVALID', 'Batch status is invalid');
            filters.push(`status="${escapeFilter(query.status)}"`);
        }
        if (query.creditTypeId) filters.push(`creditTypeId="${escapeFilter(query.creditTypeId)}"`);
        const result = await this.repository.page('credit_batches', page.page, page.perPage, {
            filter: filters.join(' && '),
            sort: 'effectiveExpiresAt,priority,created',
            expand: 'creditTypeId,creditTypeId.courseSpecId',
        });
        return mapPage(result, mapBatch);
    }

    async getBatch(studentId, batchId) {
        requiredStudentId(studentId);
        invariant(typeof batchId === 'string' && batchId, 'BATCH_ID_REQUIRED', 'Batch id is required');
        const batch = await this.repository.findFirst(
            'credit_batches',
            `id="${escapeFilter(batchId)}" && studentId="${escapeFilter(studentId)}"`,
            { expand: 'creditTypeId,creditTypeId.courseSpecId' }
        );
        invariant(batch, 'CREDIT_BATCH_NOT_FOUND', 'Course-credit batch was not found');
        return mapBatch(batch);
    }

    async listEvents(studentId, query = {}) {
        requiredStudentId(studentId);
        const page = pagination(query);
        const filters = [`studentId="${escapeFilter(studentId)}"`];
        if (query.eventType) {
            invariant(EVENT_TYPES.has(query.eventType), 'CREDIT_EVENT_TYPE_INVALID', 'Event type is invalid');
            filters.push(`eventType="${escapeFilter(query.eventType)}"`);
        }
        const result = await this.repository.page('credit_events', page.page, page.perPage, {
            filter: filters.join(' && '),
            sort: '-businessTime,-created',
            expand: 'creditTypeId,creditTypeId.courseSpecId,operationId',
        });
        return mapPage(result, mapEvent);
    }

    async listConversionRules() {
        const now = new Date(this.clock()).toISOString();
        const rules = await this.repository.list('conversion_rules', {
            sort: 'sourceCreditTypeId,targetCreditTypeId,-version',
            expand: 'sourceCreditTypeId,targetCreditTypeId',
        });
        return activeConversionRulesAt(rules, now).map(mapConversionRule);
    }

    async listSessions(studentId, query = {}) {
        requiredStudentId(studentId);
        const page = pagination(query);
        const result = await this.repository.page('session_students', page.page, page.perPage, {
            filter: `studentId="${escapeFilter(studentId)}"`,
            sort: 'sessionId.startAt',
            expand: 'sessionId,sessionId.requiredCreditTypeId,sessionId.requiredCreditTypeId.courseSpecId',
        });
        return mapPage(result, mapSessionStudent);
    }
}

function buildSummary(batches, nowValue, warningDays) {
    const now = Number(nowValue);
    const warningAt = now + warningDays * 86400000;
    const groups = new Map();
    for (const batch of batches) {
        const creditType = relation(batch, 'creditTypeId');
        const id = creditType.id || relationId(batch.creditTypeId);
        if (!groups.has(id)) groups.set(id, emptySummary(creditType, id));
        const item = groups.get(id);
        const available = quantity(batch.availableQuantity);
        const frozen = quantity(batch.frozenQuantity);
        if (batch.status === 'pending' || batch.status === 'unactivated') item.unactivatedQuantity += available;
        else item.availableQuantity += available;
        item.frozenQuantity += frozen;
        const expiry = Date.parse(batch.effectiveExpiresAt || '');
        const remaining = available + frozen;
        if (remaining > 0 && Number.isFinite(expiry) && expiry > now) {
            if (!item.nearestExpiryAt || expiry < Date.parse(item.nearestExpiryAt)) {
                item.nearestExpiryAt = new Date(expiry).toISOString();
            }
            if (expiry <= warningAt) item.expiringQuantity += remaining;
        }
    }
    return {
        items: [...groups.values()].sort(summaryOrder),
        warningDays,
    };
}

function emptySummary(creditType, id) {
    const courseSpec = relation(creditType, 'courseSpecId');
    return {
        creditType: mapCreditType(creditType, id, courseSpec),
        exchangeOnly: creditType.kind === 'universal',
        availableQuantity: 0,
        frozenQuantity: 0,
        unactivatedQuantity: 0,
        expiringQuantity: 0,
        nearestExpiryAt: null,
    };
}

function mapBatch(batch) {
    const creditType = relation(batch, 'creditTypeId');
    return {
        id: batch.id,
        creditType: mapCreditType(creditType, relationId(batch.creditTypeId), relation(creditType, 'courseSpecId')),
        sourceOperationId: relationId(batch.sourceOperationId),
        compensationSourceBatchId: relationId(batch.compensationSourceBatchId) || null,
        originalQuantity: quantity(batch.originalQuantity),
        availableQuantity: quantity(batch.availableQuantity),
        frozenQuantity: quantity(batch.frozenQuantity),
        consumedQuantity: quantity(batch.consumedQuantity),
        expiredQuantity: quantity(batch.expiredQuantity),
        reversedQuantity: quantity(batch.reversedQuantity),
        status: batch.status,
        validFrom: nullableDate(batch.validFrom),
        originalExpiresAt: nullableDate(batch.originalExpiresAt),
        effectiveExpiresAt: nullableDate(batch.effectiveExpiresAt),
        activationMode: batch.activationMode,
        activationDeadline: nullableDate(batch.activationDeadline),
        activatedAt: nullableDate(batch.activatedAt),
        created: nullableDate(batch.created),
    };
}

function mapEvent(event) {
    const creditType = relation(event, 'creditTypeId');
    const operation = relation(event, 'operationId');
    return {
        id: event.id,
        operationId: relationId(event.operationId),
        batchId: relationId(event.batchId),
        creditType: mapCreditType(creditType, relationId(event.creditTypeId), relation(creditType, 'courseSpecId')),
        eventType: event.eventType,
        quantityDelta: Number(event.quantityDelta) || 0,
        bucketFrom: event.bucketFrom || null,
        bucketTo: event.bucketTo || null,
        businessTime: nullableDate(event.businessTime),
        reason: event.reason || '',
        reversalOfEventId: relationId(event.reversalOfEventId) || null,
        source: operation.id ? {
            id: relationId(operation.sourceId) || null,
            operationNo: operation.operationNo || '',
            type: operation.sourceType || '',
        } : null,
        created: nullableDate(event.created),
    };
}

function mapConversionRule(rule) {
    return {
        id: rule.id,
        sourceCreditType: mapCreditType(relation(rule, 'sourceCreditTypeId'), relationId(rule.sourceCreditTypeId)),
        targetCreditType: mapCreditType(relation(rule, 'targetCreditTypeId'), relationId(rule.targetCreditTypeId)),
        sourceQuantity: quantity(rule.sourceQuantity),
        targetQuantity: quantity(rule.targetQuantity),
        minSourceQuantity: quantity(rule.minSourceQuantity),
        maxSourceQuantity: quantity(rule.maxSourceQuantity) || null,
        expiryPolicy: rule.expiryPolicy,
        activationMode: rule.activationMode,
        validityDurationDays: quantity(rule.validityDurationDays) || null,
        activationDeadlineDays: quantity(rule.activationDeadlineDays) || null,
        reversible: Boolean(rule.reversible),
        validFrom: nullableDate(rule.validFrom),
        validTo: nullableDate(rule.validTo),
        version: quantity(rule.version),
    };
}

function mapSessionStudent(record) {
    const session = relation(record, 'sessionId');
    const creditType = relation(session, 'requiredCreditTypeId');
    return {
        sessionStudentId: record.id,
        session: {
            id: session.id || relationId(record.sessionId),
            code: session.code || '',
            title: session.title || '',
            status: session.status || '',
            startAt: nullableDate(session.startAt),
            endAt: nullableDate(session.endAt),
            location: session.location || '',
        },
        requiredCreditType: mapCreditType(
            creditType, relationId(session.requiredCreditTypeId), relation(creditType, 'courseSpecId')
        ),
        requiredQuantity: quantity(session.requiredQuantity),
        attendanceStatus: record.attendanceStatus,
        creditStatus: record.creditStatus,
        eligibilityReason: record.eligibilityReason || '',
        checkedInAt: nullableDate(record.checkedInAt),
        settledAt: nullableDate(record.settledAt),
    };
}

function mapCreditType(record = {}, fallbackId = '', courseSpec = {}) {
    return {
        id: record.id || fallbackId || '',
        code: record.code || '',
        name: record.name || '',
        kind: record.kind || '',
        courseSpec: courseSpec.id ? {
            id: courseSpec.id, code: courseSpec.code || '', name: courseSpec.name || '',
        } : null,
    };
}

function mapPage(result = {}, mapper) {
    return {
        page: Number(result.page) || 1,
        perPage: Number(result.perPage) || 20,
        totalItems: Number(result.totalItems) || 0,
        totalPages: Number(result.totalPages) || 0,
        items: (result.items || []).map(mapper),
    };
}

function pagination(query = {}) {
    const page = positiveInteger(query.page, 1);
    const perPage = positiveInteger(query.perPage, 20);
    invariant(perPage <= 100, 'PER_PAGE_INVALID', 'perPage must not exceed 100');
    return { page, perPage };
}

function positiveInteger(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const number = Number(value);
    invariant(Number.isInteger(number) && number > 0, 'PAGINATION_INVALID', 'Pagination values must be positive integers');
    return number;
}

function relation(record = {}, field) {
    const value = record.expand?.[field];
    if (Array.isArray(value)) return value[0] || {};
    return value || {};
}

function relationId(value) {
    if (Array.isArray(value)) return relationId(value[0]);
    return typeof value === 'object' ? value?.id || '' : value || '';
}

function nullableDate(value) {
    return value || null;
}

function quantity(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
}

function requiredStudentId(studentId) {
    invariant(typeof studentId === 'string' && studentId, 'STUDENT_ID_REQUIRED', 'Student id is required');
}

function escapeFilter(value) {
    return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function summaryOrder(left, right) {
    if (left.creditType.kind === 'universal' && right.creditType.kind !== 'universal') return -1;
    if (right.creditType.kind === 'universal' && left.creditType.kind !== 'universal') return 1;
    return (left.creditType.name || left.creditType.code || left.creditType.id)
        .localeCompare(right.creditType.name || right.creditType.code || right.creditType.id);
}

module.exports = {
    BATCH_STATUSES,
    CourseCreditQueryService,
    EVENT_TYPES,
    buildSummary,
    escapeFilter,
    mapBatch,
    mapConversionRule,
    mapCreditType,
    mapEvent,
    mapPage,
    mapSessionStudent,
    pagination,
    positiveInteger,
    quantity,
    relation,
    relationId,
    summaryOrder,
};
