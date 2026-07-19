const {
    assertNonNegativeInteger,
    deriveBatchStatus,
    invariant,
    moveQuantity,
} = require('./domain');
const { balanceSnapshot } = require('./grantService');
const { normalizeBatch, positiveVersion } = require('./reservationPlanning');
const { create, update, versionClaim } = require('./reservationRequests');

const REVERSIBLE_CREDIT_EVENTS = new Set(['CONSUME', 'RELEASE']);
const REVERSIBLE_BUCKETS = new Set(['consumedQuantity', 'availableQuantity', 'expiredQuantity']);

function buildCreditReversalRequests(context) {
    const movements = [];
    const seenBatches = new Set();
    const students = new Map();
    for (const event of context.creditEvents) {
        validateCreditEvent(event, seenBatches);
        const allocationId = event.metadata?.allocationId;
        const allocation = context.allocationsById.get(allocationId);
        invariant(allocation, 'REVERSAL_ALLOCATION_NOT_FOUND', 'Original settlement allocation was not found');
        invariant(allocation.status === allocationStatusFor(event),
            'REVERSAL_ALLOCATION_STATUS_INVALID', 'Original allocation is not in its settled state');
        const record = context.batchesById.get(event.batchId);
        invariant(record, 'REVERSAL_BATCH_NOT_FOUND', 'Original settlement batch was not found');
        const sessionStudent = context.sessionStudentsById.get(event.metadata?.sessionStudentId);
        invariant(sessionStudent, 'REVERSAL_SESSION_STUDENT_NOT_FOUND', 'Original session student was not found');
        invariant(record.studentId === sessionStudent.studentId,
            'REVERSAL_BATCH_STUDENT_MISMATCH', 'Settlement batch belongs to another student');

        const quantity = Math.abs(Number(event.quantityDelta));
        assertNonNegativeInteger(quantity, 'reversal.quantity');
        invariant(quantity > 0 && quantity === Number(allocation.quantity),
            'REVERSAL_QUANTITY_MISMATCH', 'Original event and allocation quantities must match');
        const batch = normalizeBatch(record, { kind: 'course', consumable: true });
        const moved = moveQuantity(batch, event.bucketTo, 'frozenQuantity', quantity);
        const nextBatch = {
            ...moved,
            status: deriveBatchStatus(moved),
            version: positiveVersion(batch.version) + 1,
        };
        const replacementAllocationId = context.idFactory();
        movements.push({
            allocation,
            event,
            expectedVersion: positiveVersion(batch.version),
            nextBatch,
            quantity,
            replacementAllocationId,
            sessionStudent,
        });
        students.set(sessionStudent.id, sessionStudent);
    }

    const requests = movements.flatMap((movement) => creditMovementRequests(context, movement));
    for (const sessionStudent of students.values()) {
        const version = positiveVersion(sessionStudent.version);
        requests.push(versionClaim(
            context.idFactory, 'session_student', sessionStudent.id, version, context.operationId
        ));
        requests.push(update('session_students', sessionStudent.id, {
            creditStatus: 'reserved', settledAt: '', version: version + 1,
        }));
    }
    return { movements, requests };
}

function creditMovementRequests(context, movement) {
    const { allocation, event, nextBatch, quantity } = movement;
    return [
        versionClaim(
            context.idFactory, 'credit_batch', nextBatch.id,
            movement.expectedVersion, context.operationId
        ),
        update('credit_batches', nextBatch.id, batchUpdate(nextBatch)),
        update('session_credit_allocations', allocation.id, { status: 'reversed' }),
        create('session_credit_allocations', {
            id: movement.replacementAllocationId,
            sessionStudentId: allocation.sessionStudentId || event.metadata.sessionStudentId,
            batchId: nextBatch.id,
            quantity,
            status: 'reserved',
            reservedForStartAt: allocation.reservedForStartAt,
            operationId: context.operationId,
        }),
        create('credit_events', {
            id: context.idFactory(),
            operationId: context.operationId,
            batchId: nextBatch.id,
            studentId: movement.sessionStudent.studentId,
            creditTypeId: nextBatch.creditTypeId,
            eventType: 'REVERSE',
            quantityDelta: -Number(event.quantityDelta),
            bucketFrom: event.bucketTo,
            bucketTo: 'frozenQuantity',
            balanceSnapshot: balanceSnapshot(nextBatch),
            businessTime: context.now,
            actorId: context.actor.actorId,
            reason: context.reason,
            reversalOfEventId: event.id,
            metadata: {
                originalAllocationId: allocation.id,
                originalOperationId: context.originalOperationId,
                replacementAllocationId: movement.replacementAllocationId,
                sessionId: context.session.id,
                sessionStudentId: movement.sessionStudent.id,
            },
        }),
    ];
}

function buildTeacherReversalRequests(context) {
    const seenAssignments = new Set();
    const reversals = context.teacherEvents.map((event) => {
        invariant(['earn', 'compensate'].includes(event?.eventType)
            && ['pending', 'confirmed'].includes(event.status),
        'TEACHER_EVENT_NOT_REVERSIBLE', 'Only earned teacher credits can be reversed');
        invariant(!event.reversalOfEventId,
            'TEACHER_EVENT_ALREADY_REVERSED', 'Teacher earning is already a reversal');
        invariant(!seenAssignments.has(event.sessionTeacherId),
            'DUPLICATE_TEACHER_REVERSAL', 'Teacher assignment can be reversed only once per settlement');
        seenAssignments.add(event.sessionTeacherId);
        invariant(Number.isFinite(event.quantityDelta) && event.quantityDelta > 0,
            'TEACHER_REVERSAL_QUANTITY_INVALID', 'Teacher earning quantity must be positive');
        return { event, reversalEventId: context.idFactory() };
    });
    return {
        reversals,
        requests: reversals.flatMap(({ event, reversalEventId }) => [
            create('teacher_credit_events', {
                id: reversalEventId,
                sessionTeacherId: event.sessionTeacherId,
                teacherId: event.teacherId,
                ruleId: event.ruleId || '',
                eventType: 'reverse',
                quantityDelta: -event.quantityDelta,
                status: 'reversed',
                operationId: context.operationId,
                reversalOfEventId: event.id,
                reason: context.reason,
            }),
            update('session_teachers', event.sessionTeacherId, { creditStatus: 'reversed' }),
        ]),
    };
}

function validateCreditEvent(event, seenBatches) {
    invariant(event && REVERSIBLE_CREDIT_EVENTS.has(event.eventType),
        'CREDIT_EVENT_NOT_REVERSIBLE', 'Only settlement consume or release events can be reversed');
    invariant(!event.reversalOfEventId,
        'CREDIT_EVENT_ALREADY_REVERSED', 'Credit event is already a reversal');
    invariant(REVERSIBLE_BUCKETS.has(event.bucketTo),
        'REVERSAL_BUCKET_INVALID', 'Settlement event target bucket cannot be reversed');
    invariant(typeof event.metadata?.allocationId === 'string' && event.metadata.allocationId,
        'REVERSAL_ALLOCATION_ID_REQUIRED', 'Settlement event must identify its allocation');
    invariant(!seenBatches.has(event.batchId),
        'DUPLICATE_REVERSAL_BATCH', 'A batch can be reversed only once per settlement');
    seenBatches.add(event.batchId);
}

function allocationStatusFor(event) {
    if (event.eventType === 'CONSUME') return 'consumed';
    return event.bucketTo === 'expiredQuantity' ? 'expired' : 'released';
}

function batchUpdate(batch) {
    return {
        availableQuantity: batch.availableQuantity,
        consumedQuantity: batch.consumedQuantity,
        expiredQuantity: batch.expiredQuantity,
        frozenQuantity: batch.frozenQuantity,
        reversedQuantity: batch.reversedQuantity,
        status: batch.status,
        version: batch.version,
    };
}

module.exports = {
    allocationStatusFor,
    batchUpdate,
    buildCreditReversalRequests,
    buildTeacherReversalRequests,
    creditMovementRequests,
    validateCreditEvent,
};
