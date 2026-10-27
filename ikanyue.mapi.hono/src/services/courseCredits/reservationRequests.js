const { createOperationNo } = require('./domain');
const { balanceSnapshot } = require('./grantService');
const { positiveVersion } = require('./reservationPlanning');
const { operationAudit } = require('./operationAudit');

function reservationResult(operationId, session, sessionStudent, movements, conversion = null) {
    return {
        allocations: movements.map((movement) => ({
            allocationId: movement.allocationId,
            batchId: movement.nextBatch.id,
            quantity: movement.quantity,
        })),
        conversion,
        creditStatus: 'reserved',
        missingQuantity: 0,
        operationId,
        sessionId: session.id,
        sessionStudentId: sessionStudent.id,
    };
}

function buildReservedPlan(context) {
    return [
        ...baseOperationPlan(context),
        ...reservationMovementPlan(context),
        ...sessionStudentOutcomePlan(context),
    ];
}

function buildEligibilityPlan(context) {
    return [...baseOperationPlan(context), ...sessionStudentOutcomePlan(context)];
}

function baseOperationPlan(context) {
    const operationType = context.operationType || 'reserve';
    return [create('credit_operations', {
        id: context.operationId,
        operationNo: createOperationNo(operationType, context.now, context.operationId),
        studentId: context.sessionStudent.studentId,
        type: operationType,
        status: 'committed',
        idempotencyKey: context.scopedKey,
        sourceType: context.sourceType || 'session_student',
        sourceId: context.sourceId || context.sessionStudent.id,
        ruleVersionId: context.ruleVersionId || '',
        requestSnapshot: {
            requestHash: context.requestHash,
            sessionStudentId: context.sessionStudent.id,
            ...(context.requestSnapshot || {}),
        },
        resultSnapshot: context.outcome,
        actorId: context.actor.actorId || '',
        actorRole: context.actor.actorRole || 'service',
        traceId: context.actor.traceId || '',
        ...operationAudit({
            reason: context.auditReason || operationType,
            beforeSummary: {
                creditStatus: context.sessionStudent.creditStatus,
                sessionStudentId: context.sessionStudent.id,
            },
            afterSummary: context.outcome,
        }),
    })];
}

function reservationMovementPlan(context) {
    const plan = [];
    for (const movement of context.movements) {
        const batch = movement.nextBatch;
        plan.push(versionClaim(context.idFactory, 'credit_batch', batch.id, movement.expectedVersion, context.operationId));
        plan.push(update('credit_batches', batch.id, batchUpdate(batch)));
        plan.push(...reservationEventsAndAllocation(context, movement));
    }
    return plan;
}

function reservationEventsAndAllocation(context, movement) {
    const plan = [];
    if (movement.activated) {
        plan.push(create('credit_events', creditEvent(context, movement.activationSnapshot, 'ACTIVATE', 0, '', '')));
    }
    plan.push(create('credit_events', creditEvent(context, movement.nextBatch, 'FREEZE', -movement.quantity,
        'availableQuantity', 'frozenQuantity')));
    plan.push(create('session_credit_allocations', {
        id: movement.allocationId,
        sessionStudentId: context.sessionStudent.id,
        batchId: movement.nextBatch.id,
        quantity: movement.quantity,
        status: 'reserved',
        reservedForStartAt: context.session.startAt,
        operationId: context.operationId,
    }));
    return plan;
}

function sessionStudentOutcomePlan(context) {
    const version = positiveVersion(context.sessionStudent.version);
    return [
        versionClaim(context.idFactory, 'session_student', context.sessionStudent.id, version, context.operationId),
        update('session_students', context.sessionStudent.id, {
            creditStatus: context.outcome.creditStatus,
            eligibilityReason: context.outcome.creditStatus === 'reserved' ? '' : context.outcome.creditStatus,
            version: version + 1,
        }),
        create('outbox_events', {
            id: context.idFactory(),
            topic: `course-credit.session-${context.outcome.creditStatus.replaceAll('_', '-')}`,
            aggregateType: 'session_student',
            aggregateId: context.sessionStudent.id,
            payload: context.outcome,
            status: 'pending',
            attempts: 0,
        }),
    ];
}

function creditEvent(context, batch, eventType, quantityDelta, bucketFrom, bucketTo, metadata = {}) {
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
        actorId: context.actor.actorId || '',
        reason: 'session_reservation',
        metadata: {
            sessionId: context.session.id,
            sessionStudentId: context.sessionStudent.id,
            ...metadata,
        },
    };
}

function batchUpdate(batch) {
    return {
        activatedAt: batch.activatedAt || '',
        availableQuantity: batch.availableQuantity,
        effectiveExpiresAt: batch.effectiveExpiresAt || '',
        frozenQuantity: batch.frozenQuantity,
        status: batch.status,
        version: batch.version,
    };
}

function versionClaim(idFactory, entityType, entityId, expectedVersion, operationId) {
    return create('credit_version_claims', {
        id: idFactory(), entityType, entityId, expectedVersion, operationId,
    });
}

function create(collection, data) {
    return { action: 'create', collection, data };
}

function update(collection, id, data) {
    return { action: 'update', collection, id, data };
}

module.exports = {
    baseOperationPlan,
    batchUpdate,
    buildEligibilityPlan,
    buildReservedPlan,
    create,
    creditEvent,
    reservationEventsAndAllocation,
    reservationMovementPlan,
    reservationResult,
    sessionStudentOutcomePlan,
    update,
    versionClaim,
};
