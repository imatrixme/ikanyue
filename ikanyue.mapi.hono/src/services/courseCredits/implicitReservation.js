const {
    calculateTargetQuantity,
    deriveBatchStatus,
    invariant,
    moveQuantity,
} = require('./domain');
const { CourseCreditConversionService, buildTargetBatch, sourceUpdate } = require('./conversionService');
const { balanceSnapshot } = require('./grantService');
const { buildReservationMovements, planReservation } = require('./reservationPlanning');
const {
    baseOperationPlan,
    create,
    reservationEventsAndAllocation,
    reservationMovementPlan,
    reservationResult,
    sessionStudentOutcomePlan,
    update,
    versionClaim,
} = require('./reservationRequests');

async function buildAuthorizedImplicitReservation(service, context) {
    const authorization = await service.repository.get(
        'conversion_authorizations', context.input.authorizationId
    );
    invariant(authorization, 'CONVERSION_AUTHORIZATION_REQUIRED', 'Conversion authorization does not exist');
    const rule = await service.repository.get('conversion_rules', authorization.ruleId);
    invariant(rule?.targetCreditTypeId === context.session.requiredCreditTypeId,
        'CONVERSION_TARGET_MISMATCH', 'Authorized conversion does not target the session credit type');
    const sourceQuantity = sourceQuantityForTarget(rule, context.planning.missingQuantity);
    const conversionInput = {
        actorId: context.input.actorId,
        actorRole: context.input.actorRole,
        authorizationId: authorization.id,
        ruleId: rule.id,
        sourceQuantity,
        studentId: context.sessionStudent.studentId,
        targetTermEnd: context.input.targetTermEnd || '',
        traceId: context.input.traceId,
    };
    const converter = new CourseCreditConversionService(service.repository, {
        clock: service.clock,
        idFactory: service.idFactory,
    });
    const prepared = await converter.prepare(conversionInput);
    await converter.validateConsent(conversionInput, prepared);
    const materialized = materializeConversion(service, conversionInput, prepared, context.operationId);
    const targetPlanning = planReservation(
        materialized.entries.map((entry) => ({ ...entry.initialTargetBatch, created: prepared.now })),
        context.planning.missingQuantity,
        {
            creditType: context.creditType,
            now: context.now,
            requiredCreditTypeId: context.session.requiredCreditTypeId,
            sessionStart: context.session.startAt,
        }
    );
    invariant(targetPlanning.missingQuantity === 0,
        'CONVERSION_TARGET_NOT_RESERVABLE', 'Converted credits cannot cover the target session', {
            missingQuantity: targetPlanning.missingQuantity,
            rejectedBatches: targetPlanning.rejectedBatches,
        });
    const targetMovements = buildReservationMovements(targetPlanning, service.idFactory);
    const targetMovementByBatch = new Map(targetMovements.map((movement) => [movement.nextBatch.id, movement]));
    const exactMovements = buildReservationMovements(context.planning, service.idFactory);
    const conversion = conversionResult(authorization, materialized, prepared, sourceQuantity);
    const outcome = reservationResult(
        context.operationId,
        context.session,
        context.sessionStudent,
        [...exactMovements, ...targetMovements],
        conversion
    );
    const requestContext = {
        actor: context.input,
        idFactory: service.idFactory,
        movements: exactMovements,
        now: context.now,
        operationId: context.operationId,
        outcome,
        requestHash: context.requestHash,
        requestSnapshot: { authorizationId: authorization.id },
        ruleVersionId: prepared.rule.id,
        scopedKey: context.scopedKey,
        session: context.session,
        sessionStudent: context.sessionStudent,
    };
    const plan = [
        ...baseOperationPlan(requestContext),
        ...reservationMovementPlan(requestContext),
        ...conversionMutationPlan(service, conversionInput, prepared, materialized,
            targetMovementByBatch, requestContext),
        ...sessionStudentOutcomePlan(requestContext),
        conversionOutbox(service.idFactory, context.operationId, conversion),
    ];
    return { outcome, plan };
}

function materializeConversion(service, input, prepared, operationId) {
    const entries = prepared.targets.map((target) => {
        const targetWithId = { ...target, targetBatchId: service.idFactory() };
        const source = prepared.sourceBatches.get(target.sourceBatchId);
        const nextSource = {
            ...moveQuantity(source, 'availableQuantity', 'consumedQuantity', target.sourceQuantity),
            version: source.version + 1,
        };
        nextSource.status = deriveBatchStatus(nextSource);
        return {
            initialTargetBatch: buildTargetBatch({
                convertedAt: prepared.now,
                input,
                operationId,
                rule: prepared.rule,
                target: targetWithId,
            }),
            nextSource,
            source,
            target: targetWithId,
        };
    });
    return { entries };
}

function conversionMutationPlan(service, input, prepared, materialized, targetMovementByBatch, context) {
    const plan = [];
    for (const entry of materialized.entries) {
        const movement = targetMovementByBatch.get(entry.target.targetBatchId);
        const storedTarget = movement
            ? storedTargetBatch(entry.initialTargetBatch, movement.nextBatch)
            : entry.initialTargetBatch;
        plan.push(
            versionClaim(service.idFactory, 'credit_batch', entry.source.id, entry.source.version, context.operationId),
            update('credit_batches', entry.source.id, sourceUpdate(entry.nextSource)),
            create('credit_batches', storedTarget),
            create('credit_events', conversionEvent(service, input, prepared.rule, context,
                entry.nextSource, 'CONVERT_OUT', -entry.target.sourceQuantity,
                'availableQuantity', 'consumedQuantity', entry.target.targetBatchId)),
            create('credit_events', conversionEvent(service, input, prepared.rule, context,
                entry.initialTargetBatch, 'CONVERT_IN', entry.target.targetQuantity,
                '', 'availableQuantity', entry.source.id)),
            create('conversion_allocations', {
                id: service.idFactory(),
                operationId: context.operationId,
                sourceBatchId: entry.source.id,
                targetBatchId: entry.target.targetBatchId,
                sourceQuantity: entry.target.sourceQuantity,
                targetQuantity: entry.target.targetQuantity,
                expiryPolicySnapshot: {
                    activationDeadline: entry.target.activationDeadline,
                    activationMode: entry.target.activationMode,
                    effectiveExpiresAt: entry.target.effectiveExpiresAt,
                    expiryPolicy: prepared.rule.expiryPolicy,
                    ruleId: prepared.rule.id,
                    ruleVersion: prepared.rule.version,
                },
            })
        );
        if (movement) {
            plan.push(...reservationEventsAndAllocation(context, movement));
        }
    }
    return plan;
}

function storedTargetBatch(initial, reserved) {
    return {
        ...initial,
        activatedAt: reserved.activatedAt || '',
        availableQuantity: reserved.availableQuantity,
        effectiveExpiresAt: reserved.effectiveExpiresAt || '',
        frozenQuantity: reserved.frozenQuantity,
        status: reserved.status,
        version: 1,
    };
}

function conversionResult(authorization, materialized, prepared, sourceQuantity) {
    return {
        authorizationId: authorization.id,
        previewHash: prepared.preview.previewHash,
        ruleId: prepared.rule.id,
        ruleVersion: prepared.rule.version,
        sourceQuantity,
        targetQuantity: calculateTargetQuantity(prepared.rule, sourceQuantity),
        targets: materialized.entries.map((entry) => ({
            effectiveExpiresAt: entry.target.effectiveExpiresAt,
            sourceBatchId: entry.source.id,
            sourceQuantity: entry.target.sourceQuantity,
            targetBatchId: entry.target.targetBatchId,
            targetQuantity: entry.target.targetQuantity,
        })),
    };
}

function conversionEvent(service, input, rule, context, batch, eventType,
    quantityDelta, bucketFrom, bucketTo, linkedBatchId) {
    return {
        id: service.idFactory(),
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
        actorId: input.actorId || context.sessionStudent.studentId,
        reason: 'implicit_session_conversion',
        metadata: {
            linkedBatchId,
            ruleId: rule.id,
            sessionId: context.session.id,
            sessionStudentId: context.sessionStudent.id,
        },
    };
}

function conversionOutbox(idFactory, operationId, conversion) {
    return create('outbox_events', {
        id: idFactory(),
        topic: 'course-credit.converted',
        aggregateType: 'credit_operation',
        aggregateId: operationId,
        payload: { operationId, conversion },
        status: 'pending',
        attempts: 0,
    });
}

function sourceQuantityForTarget(rule, targetQuantity) {
    const targetPerStep = calculateTargetQuantity(rule, rule.minSourceQuantity);
    return Math.ceil(targetQuantity / targetPerStep) * rule.minSourceQuantity;
}

module.exports = {
    buildAuthorizedImplicitReservation,
    conversionEvent,
    conversionMutationPlan,
    conversionOutbox,
    conversionResult,
    materializeConversion,
    sourceQuantityForTarget,
    storedTargetBatch,
};
