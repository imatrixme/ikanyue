const { invariant } = require('./domain');
const { escapeFilter, mapPage, pagination, quantity, relationId } = require('./queryService');

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
    priceVersions: resource('price_versions', '-validFrom,-version', [
        'id', 'packageId', 'currency', 'listAmount', 'saleAmount', 'validFrom',
        'validTo', 'version', 'status', 'created',
    ], ['draft', 'active', 'inactive']),
    orders: resource('orders', '-created', [
        'id', 'orderNo', 'studentId', 'payerId', 'type', 'channel', 'status',
        'currency', 'listAmount', 'paidAmount', 'priceVersionId', 'paidAt',
        'cancelledAt', 'version', 'created', 'updated',
    ], ['pending', 'paid', 'granted', 'cancelled', 'failed', 'reversal_pending', 'reversed']),
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
    sessions: resource('sessions', '-startAt', [
        'id', 'code', 'title', 'status', 'startAt', 'endAt', 'location',
        'requiredCreditTypeId', 'requiredQuantity', 'rosterVersion', 'version',
        'settlementOperationId', 'correctionBaseStatus', 'created', 'updated',
    ], ['draft', 'scheduled', 'enrollment_closed', 'in_progress', 'completed', 'settled', 'cancelled', 'correction_pending']),
    settlementExceptions: resource('session_students', '-updated', [
        'id', 'sessionId', 'studentId', 'attendanceStatus', 'creditStatus',
        'eligibilityReason', 'checkedInAt', 'settledAt', 'version', 'created', 'updated',
    ], [], 'creditStatus="credit_insufficient" || creditStatus="conversion_required"'),
    teacherEvents: resource('teacher_credit_events', '-created', [
        'id', 'sessionTeacherId', 'teacherId', 'ruleId', 'eventType', 'quantityDelta',
        'status', 'operationId', 'confirmationOfEventId', 'reversalOfEventId', 'reason', 'created',
    ], ['pending', 'confirmed', 'reversed']),
    reconciliationRuns: resource('reconciliation_runs', '-startedAt', [
        'id', 'scope', 'status', 'startedAt', 'finishedAt', 'differenceCount', 'created',
    ], ['pending', 'running', 'passed', 'failed']),
    reconciliationExceptions: resource('reconciliation_exceptions', '-detectedAt', [
        'id', 'runId', 'batchId', 'code', 'field', 'expectedValue', 'actualValue',
        'status', 'detectedAt', 'created',
    ], ['open', 'acknowledged', 'resolved']),
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
        const result = await this.repository.page(config.collection, page.page, page.perPage, {
            ...(filters.length ? { filter: filters.join(' && ') } : {}),
            sort: config.sort,
        });
        return mapPage(result, (record) => project(record, config.fields));
    }

    async getResource(name, id) {
        const config = configFor(name);
        invariant(typeof id === 'string' && id, 'OPS_RESOURCE_ID_REQUIRED', 'Resource id is required');
        const record = await this.repository.findFirst(
            config.collection,
            `id="${escapeFilter(id)}"${config.baseFilter ? ` && (${config.baseFilter})` : ''}`
        );
        invariant(record, 'OPS_RESOURCE_NOT_FOUND', 'Course-credit resource was not found', { resource: name });
        return project(record, config.fields);
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
        const batches = await this.repository.list('credit_batches', {
            filter: `studentId="${escapeFilter(studentId)}"`,
            sort: 'effectiveExpiresAt,priority,created',
        });
        return {
            ...(groupAccounts(batches).get(studentId) || emptyAccount(studentId)),
            batches: batches.map(projectAccountBatch),
        };
    }
}

function resource(collection, sort, fields, statuses, baseFilter = '') {
    return { collection, sort, fields, statuses: new Set(statuses), baseFilter };
}

function configFor(name) {
    const config = RESOURCE_CONFIGS[name];
    invariant(config, 'OPS_RESOURCE_INVALID', 'Course-credit resource is not supported');
    return config;
}

function project(record, fields) {
    return Object.fromEntries(fields.map((field) => [field, relationOrValue(record[field])])) ;
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
    configFor,
    emptyAccount,
    groupAccounts,
    project,
    projectAccountBatch,
    relationOrValue,
    resource,
};
