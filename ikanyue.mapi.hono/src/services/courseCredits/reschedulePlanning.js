const {
    assertNonNegativeInteger,
    deriveBatchStatus,
    invariant,
    isServiceTimeValid,
    releaseFrozenQuantity,
} = require('./domain');
const { balanceSnapshot } = require('./grantService');
const { buildReservationMovements, normalizeBatch, planReservation, positiveVersion } = require('./reservationPlanning');
const { batchUpdate: reservationBatchUpdate, create, update, versionClaim } = require('./reservationRequests');

function planRescheduledStudent(input) {
    validateInput(input);
    const batchesById = mergeBatchRecords(input.candidateBatches, input.batchesById);
    const seenBatchIds = new Set();
    const retainedAllocations = [];
    const releasedMovements = [];

    for (const allocation of input.allocations) {
        validateAllocation(allocation, seenBatchIds);
        const record = batchesById.get(allocation.batchId);
        invariant(record, 'RESCHEDULE_BATCH_NOT_FOUND', 'Reserved allocation batch was not found');
        invariant(record.studentId === input.sessionStudent.studentId,
            'RESCHEDULE_BATCH_STUDENT_MISMATCH', 'Allocation batch belongs to another student');
        const batch = normalizeBatch(record, input.creditType);
        if (isServiceTimeValid(batch, input.newStartAt)) {
            retainedAllocations.push(allocation);
            continue;
        }
        const released = releaseFrozenQuantity(batch, allocation.quantity, input.now);
        const nextBatch = {
            ...released.batch,
            status: deriveBatchStatus(released.batch),
            version: positiveVersion(batch.version) + 1,
        };
        batchesById.set(batch.id, nextBatch);
        releasedMovements.push({
            allocation,
            allocationStatus: released.targetBucket === 'expiredQuantity' ? 'expired' : 'released',
            expectedVersion: positiveVersion(batch.version),
            nextBatch,
            quantity: allocation.quantity,
            targetBucket: released.targetBucket,
        });
    }

    const retainedQuantity = retainedAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
    invariant(retainedQuantity <= input.session.requiredQuantity,
        'RESCHEDULE_ALLOCATION_EXCESS', 'Retained allocation exceeds session requirement');
    const requiredQuantity = input.session.requiredQuantity - retainedQuantity;
    const reservation = requiredQuantity > 0
        ? planReservation([...batchesById.values()], requiredQuantity, {
            creditType: input.creditType,
            now: input.now,
            requiredCreditTypeId: input.session.requiredCreditTypeId,
            sessionStart: input.newStartAt,
        })
        : null;
    const complete = !reservation || reservation.missingQuantity === 0;
    const newMovements = complete && reservation
        ? buildReservationMovements(reservation, input.idFactory)
        : [];
    return {
        creditStatus: complete ? 'reserved' : 'credit_insufficient',
        missingQuantity: complete ? 0 : requiredQuantity,
        newMovements,
        releasedMovements,
        retainedAllocations,
    };
}

function buildRescheduleStudentRequests(context) {
    const planning = planRescheduledStudent(context);
    const requests = [];
    for (const allocation of planning.retainedAllocations) {
        requests.push(update('session_credit_allocations', allocation.id, {
            reservedForStartAt: context.newStartAt,
        }));
    }
    for (const movement of planning.releasedMovements) {
        requests.push(versionClaim(
            context.idFactory, 'credit_batch', movement.nextBatch.id,
            movement.expectedVersion, context.operationId
        ));
        requests.push(update('credit_batches', movement.nextBatch.id, releasedBatchUpdate(movement.nextBatch)));
        requests.push(update('session_credit_allocations', movement.allocation.id, {
            status: movement.allocationStatus,
        }));
        requests.push(create('credit_events', rescheduleEvent(
            context, movement.nextBatch, 'RELEASE', movement.quantity,
            'frozenQuantity', movement.targetBucket, movement.allocation.id
        )));
    }
    for (const movement of planning.newMovements) {
        requests.push(versionClaim(
            context.idFactory, 'credit_batch', movement.nextBatch.id,
            movement.expectedVersion, context.operationId
        ));
        requests.push(update('credit_batches', movement.nextBatch.id, reservationBatchUpdate(movement.nextBatch)));
        if (movement.activated) {
            requests.push(create('credit_events', rescheduleEvent(
                context, movement.activationSnapshot, 'ACTIVATE', 0, '', '', ''
            )));
        }
        requests.push(create('credit_events', rescheduleEvent(
            context, movement.nextBatch, 'FREEZE', -movement.quantity,
            'availableQuantity', 'frozenQuantity', movement.allocationId
        )));
        requests.push(create('session_credit_allocations', {
            id: movement.allocationId,
            sessionStudentId: context.sessionStudent.id,
            batchId: movement.nextBatch.id,
            quantity: movement.quantity,
            status: 'reserved',
            reservedForStartAt: context.newStartAt,
            operationId: context.operationId,
        }));
    }

    const version = positiveVersion(context.sessionStudent.version);
    requests.push(versionClaim(
        context.idFactory, 'session_student', context.sessionStudent.id, version, context.operationId
    ));
    requests.push(update('session_students', context.sessionStudent.id, {
        creditStatus: planning.creditStatus,
        eligibilityReason: planning.creditStatus === 'reserved' ? '' : 'reschedule_credit_insufficient',
        version: version + 1,
    }));
    return { ...planning, requests };
}

function validateInput(input) {
    invariant(input.sessionStudent?.creditStatus === 'reserved',
        'RESCHEDULE_STUDENT_NOT_RESERVED', 'Only reserved session students require revalidation');
    invariant(Number.isInteger(input.session?.requiredQuantity) && input.session.requiredQuantity > 0,
        'SESSION_CREDIT_QUANTITY_INVALID', 'Session required quantity must be a positive integer');
    invariant(input.creditType?.kind === 'course' && input.creditType.consumable === true,
        'SESSION_CREDIT_TYPE_INVALID', 'Session must require an exact consumable course credit');
    invariant(Number.isFinite(Date.parse(input.newStartAt)),
        'SESSION_START_INVALID', 'New session start time is invalid');
    invariant(Number.isFinite(Date.parse(input.now)),
        'RESCHEDULE_TIME_INVALID', 'Reschedule time is invalid');
    invariant(Array.isArray(input.allocations) && input.allocations.length > 0,
        'SESSION_ALLOCATION_REQUIRED', 'Reserved session credit allocations are required');
    invariant(typeof input.idFactory === 'function',
        'ID_FACTORY_REQUIRED', 'idFactory is required');
}

function validateAllocation(allocation, seenBatchIds) {
    invariant(allocation?.status === 'reserved',
        'SESSION_ALLOCATION_NOT_RESERVED', 'Only reserved allocations can be revalidated');
    invariant(typeof allocation.id === 'string' && allocation.id,
        'SESSION_ALLOCATION_ID_REQUIRED', 'Session allocation id is required');
    invariant(typeof allocation.batchId === 'string' && allocation.batchId,
        'RESCHEDULE_BATCH_ID_REQUIRED', 'Session allocation batchId is required');
    assertNonNegativeInteger(allocation.quantity, 'allocation.quantity');
    invariant(allocation.quantity > 0,
        'INVALID_CREDIT_QUANTITY', 'Allocation quantity must be greater than zero');
    invariant(!seenBatchIds.has(allocation.batchId),
        'DUPLICATE_RESCHEDULE_BATCH', 'A batch can appear only once per student revalidation');
    seenBatchIds.add(allocation.batchId);
}

function mergeBatchRecords(candidateBatches = [], allocatedBatches = new Map()) {
    const result = new Map(candidateBatches.map((batch) => [batch.id, batch]));
    const entries = allocatedBatches instanceof Map
        ? allocatedBatches.entries()
        : Object.entries(allocatedBatches || {});
    for (const [id, batch] of entries) result.set(id, batch);
    return result;
}

function rescheduleEvent(context, batch, eventType, quantityDelta, bucketFrom, bucketTo, allocationId) {
    return {
        id: context.idFactory(),
        operationId: context.operationId,
        batchId: batch.id,
        studentId: context.sessionStudent.studentId,
        creditTypeId: batch.creditTypeId,
        eventType,
        quantityDelta,
        bucketFrom,
        bucketTo,
        balanceSnapshot: balanceSnapshot(batch),
        businessTime: context.now,
        actorId: context.actor?.actorId || '',
        reason: 'session_reschedule',
        metadata: {
            allocationId,
            newStartAt: context.newStartAt,
            oldStartAt: context.session.startAt,
            sessionId: context.session.id,
            sessionStudentId: context.sessionStudent.id,
        },
    };
}

function releasedBatchUpdate(batch) {
    return {
        availableQuantity: batch.availableQuantity,
        expiredQuantity: batch.expiredQuantity,
        frozenQuantity: batch.frozenQuantity,
        status: batch.status,
        version: batch.version,
    };
}

module.exports = {
    buildRescheduleStudentRequests,
    mergeBatchRecords,
    planRescheduledStudent,
    releasedBatchUpdate,
    rescheduleEvent,
    validateAllocation,
    validateInput,
};
