const {
    activationDeadlinePassed,
    canConsumeProtectedReservation,
    createOperationNo,
    createRecordId,
    deriveBatchStatus,
    expireAvailableQuantity,
    invariant,
    moveQuantity,
} = require('./domain');
const { balanceSnapshot } = require('./grantService');
const { operationAudit } = require('./operationAudit');
const {
    create,
    escapeFilter,
    outbox,
    positiveVersion,
    update,
    versionClaim,
} = require('./teachingCommand');

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

class CourseCreditExpiryService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async expireDue(input = {}) {
        const at = expiryAt(input.now, this.clock);
        const limit = expiryLimit(input.limit);
        const page = await this.repository.page('credit_batches', 1, limit, {
            filter: dueBatchFilter(at),
            sort: 'effectiveExpiresAt,activationDeadline,created,id',
        });
        const summary = emptySummary(page.items?.length || 0);
        const failures = [];

        for (const candidate of page.items || []) {
            try {
                mergeSummary(summary, await this.expireBatch(candidate.id, { ...input, at }, 0));
            } catch (error) {
                failures.push({ batchId: candidate.id, errorCode: safeErrorCode(error) });
            }
        }
        if (failures.length > 0) throw expiryRunError(summary, failures);
        return summary;
    }

    async expireBatch(batchId, input, attempt) {
        const batch = await this.repository.get('credit_batches', batchId);
        const allocations = Number(batch.frozenQuantity || 0) > 0
            ? await this.repository.list('session_credit_allocations', {
                filter: `batchId="${escapeFilter(batch.id)}" && status="reserved"`,
                sort: 'created,id',
            })
            : [];
        const activationExpired = !batch.activatedAt && activationDeadlinePassed(batch, input.at);
        const { invalid, protected: protectedAllocations } = partitionAllocations(
            batch, allocations, activationExpired
        );
        const availableMovement = expireAvailableQuantity(batch, input.at);
        const invalidQuantity = sumQuantity(invalid);
        const nextBatch = invalidQuantity > 0
            ? expireFrozen(availableMovement.batch, invalidQuantity)
            : availableMovement.batch;
        const expiredQuantity = availableMovement.expiredQuantity + invalidQuantity;

        if (expiredQuantity === 0) {
            return batchSummary(protectedAllocations, 0, null, false);
        }

        const operationId = this.idFactory();
        const batchVersion = positiveVersion(batch.version);
        const sessionStudents = await loadSessionStudents(this.repository, invalid);
        const result = {
            batchId: batch.id,
            expiredQuantity,
            expiredReservationQuantity: invalidQuantity,
            operationId,
            protectedReservationQuantity: sumQuantity(protectedAllocations),
        };
        const plan = [
            create('credit_operations', expiryOperation(this, input, batch, result, batchVersion)),
            versionClaim(this.idFactory, 'credit_batch', batch.id, batchVersion, operationId),
            update('credit_batches', batch.id, batchUpdate(nextBatch, batchVersion + 1)),
            ...allocationUpdates(invalid),
            ...sessionStudentUpdates(this.idFactory, sessionStudents, operationId),
            ...expiryEvents(this, input, batch, nextBatch, operationId,
                availableMovement.expiredQuantity, invalidQuantity, invalid),
            outbox(this.idFactory, 'course-credit.batch-expired', 'credit_batch', batch.id, result),
        ];
        try {
            await this.repository.send(plan);
        } catch (error) {
            if (attempt === 0 && isVersionConflict(error)) {
                return this.expireBatch(batchId, input, 1);
            }
            error.code = error.code || 'COURSE_CREDIT_EXPIRY_FAILED';
            throw error;
        }
        return batchSummary(protectedAllocations, expiredQuantity, operationId, true, invalid);
    }
}

function dueBatchFilter(at) {
    const value = escapeFilter(at);
    return '(status="active" || status="unactivated") && (availableQuantity>0 || frozenQuantity>0)'
        + ` && ((effectiveExpiresAt!="" && effectiveExpiresAt<="${value}")`
        + ` || (activatedAt="" && activationDeadline!="" && activationDeadline<="${value}"))`;
}

function partitionAllocations(batch, allocations, activationExpired) {
    return allocations.reduce((result, allocation) => {
        const valid = !activationExpired
            && canConsumeProtectedReservation(batch, allocation.reservedForStartAt);
        result[valid ? 'protected' : 'invalid'].push(allocation);
        return result;
    }, { invalid: [], protected: [] });
}

function expireFrozen(batch, quantity) {
    const moved = moveQuantity(batch, 'frozenQuantity', 'expiredQuantity', quantity);
    return { ...moved, status: deriveBatchStatus(moved) };
}

async function loadSessionStudents(repository, allocations) {
    const ids = [...new Set(allocations.map((allocation) => relationId(allocation.sessionStudentId)))];
    const records = await Promise.all(ids.filter(Boolean).map(
        (id) => repository.get('session_students', id)
    ));
    return records.filter((record) => record?.creditStatus === 'reserved');
}

function allocationUpdates(allocations) {
    return allocations.map((allocation) => update('session_credit_allocations', allocation.id, {
        status: 'expired',
    }));
}

function sessionStudentUpdates(idFactory, students, operationId) {
    return students.flatMap((student) => {
        const version = positiveVersion(student.version);
        return [
            versionClaim(idFactory, 'session_student', student.id, version, operationId),
            update('session_students', student.id, {
                creditStatus: 'credit_insufficient',
                eligibilityReason: 'CREDIT_EXPIRED',
                version: version + 1,
            }),
        ];
    });
}

function expiryEvents(service, input, batch, nextBatch, operationId, availableQuantity, frozenQuantity, allocations) {
    const definitions = [
        [availableQuantity, 'availableQuantity', []],
        [frozenQuantity, 'frozenQuantity', allocations.map((allocation) => allocation.id)],
    ];
    return definitions.filter(([quantity]) => quantity > 0).map(([quantity, bucketFrom, allocationIds]) => (
        create('credit_events', {
            id: service.idFactory(),
            operationId,
            batchId: batch.id,
            studentId: relationId(batch.studentId),
            creditTypeId: relationId(batch.creditTypeId),
            eventType: 'EXPIRE',
            quantityDelta: quantity,
            bucketFrom,
            bucketTo: 'expiredQuantity',
            balanceSnapshot: balanceSnapshot(nextBatch),
            businessTime: input.at,
            actorId: input.actorId || 'course-credit-expiry-worker',
            reason: 'scheduled_expiry',
            metadata: allocationIds.length > 0 ? { allocationIds } : {},
        })
    ));
}

function expiryOperation(service, input, batch, result, batchVersion) {
    return {
        id: result.operationId,
        operationNo: createOperationNo('expire', input.at, result.operationId),
        studentId: relationId(batch.studentId),
        type: 'expire',
        status: 'committed',
        idempotencyKey: `expireBatch:${batch.id}:v${batchVersion}`,
        sourceType: 'credit_batch',
        sourceId: batch.id,
        requestSnapshot: { at: input.at, batchVersion },
        resultSnapshot: result,
        actorId: input.actorId || 'course-credit-expiry-worker',
        actorRole: input.actorRole || 'system',
        traceId: input.traceId || '',
        ...operationAudit({
            reason: 'scheduled_expiry',
            beforeSummary: balanceSnapshot(batch),
            afterSummary: result,
        }),
    };
}

function batchUpdate(batch, version) {
    return {
        availableQuantity: batch.availableQuantity,
        frozenQuantity: batch.frozenQuantity,
        expiredQuantity: batch.expiredQuantity,
        status: batch.status,
        version,
    };
}

function emptySummary(scanned) {
    return {
        scanned,
        expiredBatches: 0,
        expiredQuantity: 0,
        expiredReservations: 0,
        operationIds: [],
        protectedReservations: 0,
    };
}

function batchSummary(protectedAllocations, expiredQuantity, operationId, changed, invalid = []) {
    return {
        expiredBatches: changed ? 1 : 0,
        expiredQuantity,
        expiredReservations: invalid.length,
        operationIds: operationId ? [operationId] : [],
        protectedReservations: protectedAllocations.length,
    };
}

function mergeSummary(target, item) {
    target.expiredBatches += item.expiredBatches;
    target.expiredQuantity += item.expiredQuantity;
    target.expiredReservations += item.expiredReservations;
    target.operationIds.push(...item.operationIds);
    target.protectedReservations += item.protectedReservations;
}

function expiryAt(value, clock) {
    const timestamp = value === undefined ? clock() : Date.parse(value);
    invariant(Number.isFinite(timestamp), 'EXPIRY_RUN_AT_INVALID', 'Expiry run time must be a valid date');
    return new Date(timestamp).toISOString();
}

function expiryLimit(value) {
    const limit = Number(value === undefined ? DEFAULT_LIMIT : value);
    invariant(Number.isInteger(limit) && limit > 0 && limit <= MAX_LIMIT,
        'EXPIRY_LIMIT_INVALID', `Expiry limit must be between 1 and ${MAX_LIMIT}`);
    return limit;
}

function sumQuantity(records) {
    return records.reduce((total, record) => {
        const quantity = Number(record.quantity);
        invariant(Number.isInteger(quantity) && quantity > 0,
            'ALLOCATION_QUANTITY_INVALID', 'Reserved allocation quantity must be a positive integer');
        return total + quantity;
    }, 0);
}

function relationId(value) {
    if (Array.isArray(value)) return relationId(value[0]);
    if (value && typeof value === 'object') return value.id || '';
    return typeof value === 'string' ? value : '';
}

function isVersionConflict(error) {
    return error?.status === 400 || error?.status === 409 || error?.code === 'VERSION_CONFLICT';
}

function safeErrorCode(error) {
    const code = String(error?.code || 'COURSE_CREDIT_EXPIRY_FAILED').toUpperCase();
    return /^[A-Z0-9_:-]{1,80}$/.test(code) ? code : 'COURSE_CREDIT_EXPIRY_FAILED';
}

function expiryRunError(summary, failures) {
    const error = new Error('One or more course-credit batches failed to expire');
    error.code = 'COURSE_CREDIT_EXPIRY_RUN_FAILED';
    error.status = 503;
    error.details = { ...summary, failed: failures };
    return error;
}

module.exports = {
    CourseCreditExpiryService,
    dueBatchFilter,
    expiryAt,
    expiryLimit,
    partitionAllocations,
    relationId,
    safeErrorCode,
};
