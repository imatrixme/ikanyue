const {
    assertNonNegativeInteger,
    canConsumeProtectedReservation,
    deriveBatchStatus,
    invariant,
    moveQuantity,
    releaseFrozenQuantity,
    settlementDecision,
} = require('./domain');
const { balanceSnapshot } = require('./grantService');
const { normalizeBatch, positiveVersion } = require('./reservationPlanning');
const { create, update, versionClaim } = require('./reservationRequests');

function planStudentCreditSettlement(input) {
    const { allocations, batchesById, session, sessionStudent } = input;
    invariant(sessionStudent?.creditStatus === 'reserved',
        'SESSION_STUDENT_NOT_RESERVED', 'Session student must have reserved credit before settlement');
    invariant(Array.isArray(allocations) && allocations.length > 0,
        'SESSION_ALLOCATION_REQUIRED', 'Reserved session credit allocations are required');

    const decision = settlementDecision(session, sessionStudent);
    const seenBatchIds = new Set();
    const movements = allocations.map((allocation) => {
        validateAllocation(allocation, seenBatchIds);
        const record = resolveBatch(batchesById, allocation.batchId);
        invariant(record, 'SETTLEMENT_BATCH_NOT_FOUND', 'Reserved allocation batch was not found', {
            batchId: allocation.batchId,
        });
        invariant(record.studentId === sessionStudent.studentId,
            'SETTLEMENT_BATCH_STUDENT_MISMATCH', 'Allocation batch belongs to another student');
        const batch = normalizeBatch(record, { kind: 'course', consumable: true });
        if (decision.action === 'consume') {
            invariant(canConsumeProtectedReservation(batch, allocation.reservedForStartAt),
                'RESERVATION_SERVICE_TIME_INVALID', 'Frozen credit was not valid for its reserved service time');
        }
        const released = decision.action === 'release'
            ? releaseFrozenQuantity(batch, allocation.quantity, input.now)
            : null;
        const moved = released?.batch
            || moveQuantity(batch, 'frozenQuantity', decision.targetBucket, allocation.quantity);
        const nextBatch = {
            ...moved,
            status: deriveBatchStatus(moved),
            version: positiveVersion(batch.version) + 1,
        };
        return {
            allocation,
            expectedVersion: positiveVersion(batch.version),
            nextBatch,
            quantity: allocation.quantity,
            targetBucket: released?.targetBucket || decision.targetBucket,
            allocationStatus: released?.targetBucket === 'expiredQuantity'
                ? 'expired'
                : decision.creditStatus,
        };
    });

    return { decision, movements };
}

function buildStudentSettlementRequests(context) {
    const planning = planStudentCreditSettlement(context);
    const requests = [];
    for (const movement of planning.movements) {
        requests.push(versionClaim(
            context.idFactory,
            'credit_batch',
            movement.nextBatch.id,
            movement.expectedVersion,
            context.operationId
        ));
        requests.push(update('credit_batches', movement.nextBatch.id, batchUpdate(movement.nextBatch)));
        requests.push(update('session_credit_allocations', movement.allocation.id, {
            status: movement.allocationStatus,
        }));
        requests.push(create('credit_events', settlementEvent(context, planning.decision, movement)));
    }

    const version = positiveVersion(context.sessionStudent.version);
    requests.push(versionClaim(
        context.idFactory,
        'session_student',
        context.sessionStudent.id,
        version,
        context.operationId
    ));
    requests.push(update('session_students', context.sessionStudent.id, {
        creditStatus: planning.decision.creditStatus,
        settledAt: context.now,
        version: version + 1,
    }));
    return { ...planning, requests };
}

function validateAllocation(allocation, seenBatchIds) {
    invariant(allocation && allocation.status === 'reserved',
        'SESSION_ALLOCATION_NOT_RESERVED', 'Only reserved allocations can be settled');
    invariant(typeof allocation.id === 'string' && allocation.id,
        'SESSION_ALLOCATION_ID_REQUIRED', 'Session allocation id is required');
    invariant(typeof allocation.batchId === 'string' && allocation.batchId,
        'SETTLEMENT_BATCH_ID_REQUIRED', 'Session allocation batchId is required');
    assertNonNegativeInteger(allocation.quantity, 'allocation.quantity');
    invariant(allocation.quantity > 0,
        'INVALID_CREDIT_QUANTITY', 'Allocation quantity must be greater than zero');
    invariant(!seenBatchIds.has(allocation.batchId),
        'DUPLICATE_SETTLEMENT_BATCH', 'A batch can appear only once per student settlement');
    seenBatchIds.add(allocation.batchId);
}

function settlementEvent(context, decision, movement) {
    const batch = movement.nextBatch;
    return {
        id: context.idFactory(),
        operationId: context.operationId,
        batchId: batch.id,
        studentId: context.sessionStudent.studentId,
        creditTypeId: batch.creditTypeId,
        eventType: decision.eventType,
        quantityDelta: decision.action === 'consume' ? -movement.quantity : movement.quantity,
        bucketFrom: 'frozenQuantity',
        bucketTo: movement.targetBucket,
        balanceSnapshot: balanceSnapshot(batch),
        businessTime: context.now,
        actorId: context.actor?.actorId || '',
        reason: 'session_settlement',
        metadata: {
            allocationId: movement.allocation.id,
            attendanceStatus: context.sessionStudent.attendanceStatus,
            immediateExpiry: movement.targetBucket === 'expiredQuantity',
            ruleSource: decision.ruleSource,
            ruleVersion: decision.ruleVersion,
            sessionId: context.session.id,
            sessionStudentId: context.sessionStudent.id,
        },
    };
}

function batchUpdate(batch) {
    return {
        availableQuantity: batch.availableQuantity,
        consumedQuantity: batch.consumedQuantity,
        expiredQuantity: batch.expiredQuantity,
        frozenQuantity: batch.frozenQuantity,
        status: batch.status,
        version: batch.version,
    };
}

function resolveBatch(batchesById, batchId) {
    return batchesById instanceof Map ? batchesById.get(batchId) : batchesById?.[batchId];
}

module.exports = {
    batchUpdate,
    buildStudentSettlementRequests,
    planStudentCreditSettlement,
    resolveBatch,
    settlementEvent,
    validateAllocation,
};
