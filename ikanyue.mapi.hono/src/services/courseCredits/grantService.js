const {
    createOperationNo,
    createRecordId,
    invariant,
    scopedIdempotencyKey,
} = require('./domain');
const { fingerprintRequest, normalizeOperation } = require('./repositories/operationRepository');
const { operationAudit } = require('./operationAudit');

class CourseCreditGrantService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async grantOrderCredits(input = {}) {
        invariant(typeof input.orderId === 'string' && input.orderId,
            'ORDER_ID_REQUIRED', 'orderId is required');
        const scopedKey = scopedIdempotencyKey('grantOrderCredits', input.idempotencyKey);
        const requestHash = fingerprintRequest({ orderId: input.orderId, traceId: input.traceId || '' });
        const replay = await this.resolveReplay(scopedKey, requestHash);
        if (replay) return replay;

        const order = await this.repository.get('orders', input.orderId);
        invariant(order.status === 'paid', 'ORDER_NOT_PAID', 'Only paid orders can grant credits');
        const snapshot = normalizeGrantSnapshot(order.grantSnapshot);
        const creditTypes = new Map();
        for (const line of snapshot.lines) {
            if (!creditTypes.has(line.creditTypeId)) {
                creditTypes.set(line.creditTypeId, await this.repository.get('credit_types', line.creditTypeId));
            }
        }

        const at = new Date(this.clock()).toISOString();
        const operationId = this.idFactory();
        const batches = snapshot.lines.map((line) => buildGrantBatch({
            at,
            creditType: creditTypes.get(line.creditTypeId),
            idFactory: this.idFactory,
            line,
            operationId,
            order,
            snapshot,
            actorId: input.actorId || '',
        }));
        const result = {
            operationId,
            orderId: order.id,
            batches: batches.map(({ batch }) => ({
                activationDeadline: batch.activationDeadline || null,
                activationMode: batch.activationMode,
                batchId: batch.id,
                creditTypeId: batch.creditTypeId,
                effectiveExpiresAt: batch.effectiveExpiresAt || null,
                quantity: batch.originalQuantity,
            })),
        };
        const orderVersion = positiveVersion(order.version);
        const plan = [
            create('credit_operations', {
                id: operationId,
                operationNo: createOperationNo('grant', at, operationId),
                studentId: order.studentId,
                type: 'grant',
                status: 'committed',
                idempotencyKey: scopedKey,
                sourceType: 'order',
                sourceId: order.id,
                requestSnapshot: { requestHash, orderId: order.id },
                resultSnapshot: result,
                actorId: input.actorId || '',
                actorRole: input.actorRole || 'service',
                traceId: input.traceId || '',
                ...operationAudit({
                    reason: 'order_grant',
                    beforeSummary: { orderId: order.id, status: order.status, version: order.version },
                    afterSummary: result,
                }),
            }),
            create('credit_version_claims', {
                id: this.idFactory(),
                entityType: 'order',
                entityId: order.id,
                expectedVersion: orderVersion,
                operationId,
            }),
            ...batches.flatMap(({ batch, event }) => [create('credit_batches', batch), create('credit_events', event)]),
            update('orders', order.id, { status: 'granted', version: orderVersion + 1 }),
            create('outbox_events', {
                id: this.idFactory(),
                topic: 'course-credit.order-granted',
                aggregateType: 'order',
                aggregateId: order.id,
                payload: result,
                status: 'pending',
                attempts: 0,
            }),
        ];

        try {
            await this.repository.send(plan);
        } catch (error) {
            const racedReplay = await this.resolveReplay(scopedKey, requestHash);
            if (racedReplay) return racedReplay;
            error.code = error.code || 'COURSE_CREDIT_BATCH_FAILED';
            throw error;
        }
        return { ...result, replayed: false };
    }

    async resolveReplay(scopedKey, requestHash) {
        const existing = normalizeOperation(await this.repository.findFirst(
            'credit_operations',
            `idempotencyKey="${escapeFilter(scopedKey)}"`
        ));
        if (!existing) return null;
        invariant(existing.requestHash === requestHash,
            'IDEMPOTENCY_CONFLICT', 'Idempotency key conflicts with another request');
        return { ...existing.resultSnapshot, replayed: true };
    }
}

function buildGrantBatch({ actorId = '', at, creditType, idFactory, line, operationId, order, snapshot }) {
    invariant(line && typeof line.creditTypeId === 'string' && line.creditTypeId
        && Number.isInteger(line.quantity) && line.quantity > 0,
    'ORDER_GRANT_SNAPSHOT_INVALID', 'Grant lines require creditTypeId and positive integer quantity');
    validateCreditTypeForOrder(creditType, order.type);
    const policy = { ...snapshot.defaults, ...line };
    invariant(['GRANT_TIME', 'FIRST_RESERVATION', 'FIRST_CHECK_IN', 'FIRST_COMPLETED_SESSION', 'TERM_START'].includes(policy.activationMode),
        'INVALID_ACTIVATION_MODE', 'Grant activation mode is invalid');
    invariant(['FIXED_DURATION', 'TERM_END', 'NO_EXPIRY'].includes(policy.expiryPolicy),
        'INVALID_EXPIRY_POLICY', 'Grant expiry policy is invalid');
    const activeAtGrant = policy.activationMode === 'GRANT_TIME';
    if (!activeAtGrant) {
        invariant(Number.isInteger(policy.activationDeadlineDays) && policy.activationDeadlineDays >= 0,
            'ACTIVATION_DEADLINE_REQUIRED', 'Deferred activation requires activationDeadlineDays');
    }
    if (policy.expiryPolicy === 'FIXED_DURATION') {
        invariant(Number.isInteger(policy.validityDurationDays) && policy.validityDurationDays >= 0,
            'INVALID_DURATION_DAYS', 'Fixed duration requires validityDurationDays');
    }
    const listUnitValue = nonNegativeCost(policy.listUnitValue);
    const paidUnitCost = nonNegativeCost(policy.paidUnitCost);
    const activationDeadline = activeAtGrant ? '' : addDays(at, policy.activationDeadlineDays);
    let effectiveExpiresAt = '';
    if (policy.expiryPolicy === 'TERM_END') {
        invariant(Number.isFinite(Date.parse(policy.termEnd)), 'INVALID_DATE', 'Term expiry requires termEnd');
        effectiveExpiresAt = new Date(policy.termEnd).toISOString();
    } else if (policy.expiryPolicy === 'FIXED_DURATION' && activeAtGrant) {
        effectiveExpiresAt = addDays(at, policy.validityDurationDays);
    }
    const batchId = idFactory();
    const batch = {
        id: batchId,
        studentId: order.studentId,
        creditTypeId: line.creditTypeId,
        sourceOperationId: operationId,
        originalQuantity: line.quantity,
        availableQuantity: line.quantity,
        frozenQuantity: 0,
        consumedQuantity: 0,
        expiredQuantity: 0,
        reversedQuantity: 0,
        status: activeAtGrant ? 'active' : 'unactivated',
        validFrom: policy.validFrom || at,
        originalExpiresAt: effectiveExpiresAt,
        effectiveExpiresAt,
        activationMode: policy.activationMode,
        expiryPolicy: policy.expiryPolicy,
        activationDeadline,
        activatedAt: activeAtGrant ? at : '',
        validityDurationDays: policy.validityDurationDays ?? 0,
        grantSnapshot: policy,
        listUnitValue,
        paidUnitCost,
        currency: policy.currency || order.currency,
        priority: Number.isInteger(policy.priority) ? policy.priority : 0,
        version: 1,
    };
    return {
        batch,
        event: {
            id: idFactory(),
            operationId,
            batchId,
            studentId: order.studentId,
            creditTypeId: line.creditTypeId,
            eventType: 'GRANT',
            quantityDelta: line.quantity,
            bucketFrom: '',
            bucketTo: 'availableQuantity',
            balanceSnapshot: balanceSnapshot(batch),
            businessTime: at,
            actorId,
            reason: 'order_grant',
            metadata: { orderId: order.id },
        },
    };
}

function normalizeGrantSnapshot(value) {
    const snapshot = Array.isArray(value) ? { lines: value } : value;
    invariant(snapshot && Array.isArray(snapshot.lines) && snapshot.lines.length > 0,
        'ORDER_GRANT_SNAPSHOT_INVALID', 'Order grant snapshot has no lines');
    const { lines, ...defaults } = snapshot;
    return { defaults, lines };
}

function validateCreditTypeForOrder(creditType, orderType) {
    invariant(creditType, 'CREDIT_TYPE_INVALID', 'Granted credit type does not exist');
    invariant(['package_purchase', 'universal_recharge'].includes(orderType),
        'ORDER_TYPE_INVALID', 'Order type cannot grant course credits');
    if (creditType.kind === 'universal') {
        invariant(creditType.consumable === false, 'CREDIT_TYPE_INVALID', 'Universal credit must be non-consumable');
        invariant(orderType === 'universal_recharge', 'ORDER_CREDIT_TYPE_MISMATCH', 'Order type does not match granted credit type');
        return;
    }
    invariant(creditType.kind === 'course' && creditType.consumable === true && Boolean(creditType.courseSpecId),
        'CREDIT_TYPE_INVALID', 'Course credit must be consumable and reference one course specification');
    invariant(orderType === 'package_purchase', 'ORDER_CREDIT_TYPE_MISMATCH', 'Order type does not match granted credit type');
}

function nonNegativeCost(value) {
    const number = Number(value);
    invariant(Number.isFinite(number) && number >= 0,
        'ORDER_GRANT_SNAPSHOT_INVALID', 'Grant line cost basis is invalid');
    return number;
}

function addDays(value, days) {
    return new Date(Date.parse(value) + days * 86400000).toISOString();
}

function positiveVersion(value) {
    const version = Number(value);
    return Number.isInteger(version) && version > 0 ? version : 1;
}

function balanceSnapshot(batch) {
    return {
        originalQuantity: batch.originalQuantity,
        availableQuantity: batch.availableQuantity,
        frozenQuantity: batch.frozenQuantity,
        consumedQuantity: batch.consumedQuantity,
        expiredQuantity: batch.expiredQuantity,
        reversedQuantity: batch.reversedQuantity,
    };
}

function create(collection, data) {
    return { action: 'create', collection, data };
}

function update(collection, id, data) {
    return { action: 'update', collection, id, data };
}

function escapeFilter(value) {
    return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

module.exports = {
    CourseCreditGrantService,
    balanceSnapshot,
    buildGrantBatch,
    normalizeGrantSnapshot,
    positiveVersion,
};
