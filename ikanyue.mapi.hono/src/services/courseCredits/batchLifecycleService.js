const {
    createOperationNo,
    createRecordId,
    invariant,
    scopedIdempotencyKey,
} = require('./domain');
const { balanceSnapshot } = require('./grantService');
const { fingerprintRequest, normalizeOperation } = require('./repositories/operationRepository');
const { operationAudit } = require('./operationAudit');

class CourseCreditBatchLifecycleService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async extendBatchExpiry(input = {}) {
        return this.extendAttempt(input, 0);
    }

    async extendAttempt(input, attempt) {
        validateAuditInput(input);
        const newExpiresAt = validFutureDate(input.newExpiresAt, this.clock(), 'newExpiresAt');
        const scopedKey = scopedIdempotencyKey('extendBatchExpiry', input.idempotencyKey);
        const request = {
            batchId: input.batchId,
            newExpiresAt,
            reason: input.reason,
            approvedBy: input.approvedBy || '',
        };
        const requestHash = fingerprintRequest(request);
        const replay = await this.resolveReplay(scopedKey, requestHash);
        if (replay) return replay;

        const batch = await this.repository.get('credit_batches', input.batchId);
        invariant(batch, 'CREDIT_BATCH_NOT_FOUND', 'Credit batch does not exist');
        const oldExpiresAt = requiredDate(batch.effectiveExpiresAt, 'BATCH_HAS_NO_EXPIRY');
        invariant(Date.parse(newExpiresAt) > Date.parse(oldExpiresAt),
            'EXPIRY_EXTENSION_REQUIRED', 'New expiry must be later than the effective expiry');
        const quantityScope = remainingQuantity(batch);
        invariant(quantityScope > 0, 'NO_REMAINING_CREDIT', 'Batch has no remaining quantity to extend');

        const operationId = this.idFactory();
        const version = positiveVersion(batch.version);
        const result = {
            batchId: batch.id,
            newExpiresAt,
            oldExpiresAt: new Date(oldExpiresAt).toISOString(),
            operationId,
            quantityScope,
        };
        const nextBatch = { ...batch, effectiveExpiresAt: newExpiresAt, version: version + 1 };
        const plan = [
            operation(this, input, scopedKey, requestHash, result, batch, operationId, 'extend'),
            versionClaim(this, batch.id, version, operationId),
            update('credit_batches', batch.id, { effectiveExpiresAt: newExpiresAt, version: version + 1 }),
            create('credit_expiry_changes', expiryChange(this, input, batch, oldExpiresAt, newExpiresAt, quantityScope)),
            create('credit_events', event(this, input, nextBatch, operationId, 'EXTEND', 0, 'expiry_extension')),
            outbox(this, 'course-credit.batch-extended', batch.id, result),
        ];
        return this.commit(plan, input, scopedKey, requestHash, result, attempt, 'extendAttempt');
    }

    async restoreExpiredQuantity(input = {}) {
        return this.restoreAttempt(input, 0);
    }

    async restoreAttempt(input, attempt) {
        validateAuditInput(input);
        invariant(Number.isInteger(input.quantity) && input.quantity > 0,
            'INVALID_CREDIT_QUANTITY', 'Restored quantity must be a positive integer');
        invariant(Number.isInteger(input.validityDurationDays) && input.validityDurationDays > 0,
            'INVALID_DURATION_DAYS', 'Compensation validityDurationDays must be a positive integer');
        const scopedKey = scopedIdempotencyKey('restoreExpiredQuantity', input.idempotencyKey);
        const request = {
            batchId: input.batchId,
            quantity: input.quantity,
            validityDurationDays: input.validityDurationDays,
            reason: input.reason,
            approvedBy: input.approvedBy || '',
        };
        const requestHash = fingerprintRequest(request);
        const replay = await this.resolveReplay(scopedKey, requestHash);
        if (replay) return replay;

        const source = await this.repository.get('credit_batches', input.batchId);
        invariant(source, 'CREDIT_BATCH_NOT_FOUND', 'Credit batch does not exist');
        const expiredQuantity = integerQuantity(source.expiredQuantity, 'expiredQuantity');
        invariant(expiredQuantity > 0, 'NO_EXPIRED_CREDIT', 'Batch has no expired quantity to restore');
        const compensations = await this.repository.list('credit_batches', {
            filter: `compensationSourceBatchId="${escapeFilter(source.id)}"`,
        });
        const alreadyRestored = compensations.reduce((sum, batch) => (
            sum + integerQuantity(batch.originalQuantity, 'originalQuantity')
        ), 0);
        invariant(alreadyRestored + input.quantity <= expiredQuantity,
            'COMPENSATION_EXCEEDS_EXPIRED', 'Compensation exceeds unrestored expired quantity', {
                alreadyRestored,
                expiredQuantity,
            });

        const now = new Date(this.clock()).toISOString();
        const expiresAt = addDays(now, input.validityDurationDays);
        const operationId = this.idFactory();
        const compensationBatchId = this.idFactory();
        const version = positiveVersion(source.version);
        const compensation = compensationBatch({
            expiresAt,
            id: compensationBatchId,
            input,
            now,
            operationId,
            source,
        });
        const result = {
            compensationBatchId,
            expiresAt,
            operationId,
            quantity: input.quantity,
            sourceBatchId: source.id,
        };
        const plan = [
            operation(this, input, scopedKey, requestHash, result, source, operationId, 'adjust'),
            versionClaim(this, source.id, version, operationId),
            update('credit_batches', source.id, { version: version + 1 }),
            create('credit_batches', compensation),
            create('credit_events', event(this, input, compensation, operationId, 'ADJUST', input.quantity, 'expired_compensation')),
            create('credit_expiry_changes', expiryChange(
                this, input, source, source.effectiveExpiresAt, expiresAt, input.quantity
            )),
            outbox(this, 'course-credit.expired-compensated', compensationBatchId, result),
        ];
        return this.commit(plan, input, scopedKey, requestHash, result, attempt, 'restoreAttempt');
    }

    async commit(plan, input, scopedKey, requestHash, result, attempt, retryMethod) {
        try {
            await this.repository.send(plan);
        } catch (error) {
            const replay = await this.resolveReplay(scopedKey, requestHash);
            if (replay) return replay;
            if (attempt === 0 && isVersionConflict(error)) return this[retryMethod](input, 1);
            error.code = error.code || 'COURSE_CREDIT_BATCH_FAILED';
            throw error;
        }
        return { ...result, replayed: false };
    }

    async resolveReplay(scopedKey, requestHash) {
        const existing = normalizeOperation(await this.repository.findFirst(
            'credit_operations', `idempotencyKey="${escapeFilter(scopedKey)}"`
        ));
        if (!existing) return null;
        invariant(existing.requestHash === requestHash,
            'IDEMPOTENCY_CONFLICT', 'Idempotency key conflicts with another request');
        return { ...existing.resultSnapshot, replayed: true };
    }
}

function validateAuditInput(input) {
    invariant(typeof input.batchId === 'string' && input.batchId,
        'BATCH_ID_REQUIRED', 'batchId is required');
    invariant(typeof input.reason === 'string' && input.reason.trim(),
        'AUDIT_REASON_REQUIRED', 'An audit reason is required');
    invariant(typeof input.actorId === 'string' && input.actorId,
        'ACTOR_ID_REQUIRED', 'An operator actorId is required');
}

function compensationBatch({ expiresAt, id, input, now, operationId, source }) {
    return {
        id,
        studentId: source.studentId,
        creditTypeId: source.creditTypeId,
        sourceOperationId: operationId,
        compensationSourceBatchId: source.id,
        originalQuantity: input.quantity,
        availableQuantity: input.quantity,
        frozenQuantity: 0,
        consumedQuantity: 0,
        expiredQuantity: 0,
        reversedQuantity: 0,
        status: 'active',
        validFrom: now,
        originalExpiresAt: expiresAt,
        effectiveExpiresAt: expiresAt,
        activationMode: 'GRANT_TIME',
        expiryPolicy: 'FIXED_DURATION',
        activationDeadline: '',
        activatedAt: now,
        validityDurationDays: input.validityDurationDays,
        grantSnapshot: { compensationSourceBatchId: source.id, reason: input.reason },
        listUnitValue: Number(source.listUnitValue || 0),
        paidUnitCost: Number(source.paidUnitCost || 0),
        currency: source.currency || 'CNY',
        priority: Number(source.priority || 0),
        version: 1,
    };
}

function operation(service, input, scopedKey, requestHash, result, batch, operationId, type) {
    return create('credit_operations', {
        id: operationId,
        operationNo: createOperationNo(type, new Date(service.clock()).toISOString(), operationId),
        studentId: batch.studentId,
        type,
        status: 'committed',
        idempotencyKey: scopedKey,
        sourceType: 'credit_batch',
        sourceId: batch.id,
        requestSnapshot: { requestHash },
        resultSnapshot: result,
        actorId: input.actorId,
        actorRole: input.actorRole || 'admin',
        traceId: input.traceId || '',
        ...operationAudit({
            reason: input.reason,
            beforeSummary: {
                batchId: batch.id,
                effectiveExpiresAt: batch.effectiveExpiresAt,
                expiredQuantity: batch.expiredQuantity,
                status: batch.status,
                version: batch.version,
            },
            afterSummary: result,
        }),
    });
}

function expiryChange(service, input, batch, oldExpiresAt, newExpiresAt, quantityScope) {
    return {
        id: service.idFactory(),
        batchId: batch.id,
        oldExpiresAt: oldExpiresAt || '',
        newExpiresAt,
        quantityScope,
        reason: input.reason.trim(),
        actorId: input.actorId,
        approvedBy: input.approvedBy || '',
    };
}

function event(service, input, batch, operationId, eventType, quantityDelta, reason) {
    return {
        id: service.idFactory(),
        operationId,
        batchId: batch.id,
        studentId: batch.studentId,
        creditTypeId: batch.creditTypeId,
        eventType,
        quantityDelta,
        bucketFrom: '',
        bucketTo: eventType === 'ADJUST' ? 'availableQuantity' : '',
        balanceSnapshot: balanceSnapshot(batch),
        businessTime: new Date(service.clock()).toISOString(),
        actorId: input.actorId,
        reason,
        metadata: { approvedBy: input.approvedBy || '', sourceBatchId: input.batchId },
    };
}

function versionClaim(service, batchId, version, operationId) {
    return create('credit_version_claims', {
        id: service.idFactory(), entityType: 'credit_batch', entityId: batchId,
        expectedVersion: version, operationId,
    });
}

function outbox(service, topic, aggregateId, payload) {
    return create('outbox_events', {
        id: service.idFactory(), topic, aggregateType: 'credit_batch', aggregateId,
        payload, status: 'pending', attempts: 0,
    });
}

function remainingQuantity(batch) {
    return integerQuantity(batch.availableQuantity, 'availableQuantity')
        + integerQuantity(batch.frozenQuantity, 'frozenQuantity');
}

function integerQuantity(value, name) {
    const quantity = Number(value || 0);
    invariant(Number.isInteger(quantity) && quantity >= 0,
        'INVALID_CREDIT_QUANTITY', `${name} must be a non-negative integer`);
    return quantity;
}

function validFutureDate(value, now, name) {
    const timestamp = Date.parse(value);
    invariant(Number.isFinite(timestamp), 'INVALID_DATE', `${name} must be a valid date`);
    invariant(timestamp > now, 'EXPIRY_MUST_BE_FUTURE', `${name} must be in the future`);
    return new Date(timestamp).toISOString();
}

function requiredDate(value, code) {
    invariant(Number.isFinite(Date.parse(value)), code, 'Batch does not have an effective expiry');
    return value;
}

function positiveVersion(value) {
    const version = Number(value);
    return Number.isInteger(version) && version > 0 ? version : 1;
}

function addDays(value, days) {
    return new Date(Date.parse(value) + days * 86400000).toISOString();
}

function isVersionConflict(error) {
    return error?.status === 400 || error?.status === 409 || error?.code === 'VERSION_CONFLICT';
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
    CourseCreditBatchLifecycleService,
    compensationBatch,
    integerQuantity,
    isVersionConflict,
    positiveVersion,
    remainingQuantity,
    requiredDate,
    validFutureDate,
    validateAuditInput,
};
