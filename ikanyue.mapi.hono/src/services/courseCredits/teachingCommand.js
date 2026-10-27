const {
    createOperationNo,
    invariant,
    scopedIdempotencyKey,
} = require('./domain');
const { fingerprintRequest, normalizeOperation } = require('./repositories/operationRepository');
const { operationAudit } = require('./operationAudit');

async function prepareTeachingCommand(service, scope, input, request) {
    invariant(typeof input.idempotencyKey === 'string' && input.idempotencyKey.trim(),
        'IDEMPOTENCY_KEY_REQUIRED', 'idempotencyKey is required');
    invariant(typeof input.actorId === 'string' && input.actorId,
        'ACTOR_ID_REQUIRED', 'actorId is required');
    const scopedKey = scopedIdempotencyKey(scope, input.idempotencyKey);
    const requestHash = fingerprintRequest(request);
    const replay = await resolveTeachingReplay(service.repository, scopedKey, requestHash);
    return {
        at: new Date(service.clock()).toISOString(),
        operationId: service.idFactory(),
        replay,
        requestHash,
        scopedKey,
    };
}

async function resolveTeachingReplay(repository, scopedKey, requestHash) {
    const existing = normalizeOperation(await repository.findFirst(
        'credit_operations', `idempotencyKey="${escapeFilter(scopedKey)}"`
    ));
    if (!existing) return null;
    invariant(existing.requestHash === requestHash,
        'IDEMPOTENCY_CONFLICT', 'Idempotency key conflicts with another request');
    return { ...existing.resultSnapshot, replayed: true };
}

function teachingOperation(context) {
    return create('credit_operations', {
        id: context.operationId,
        operationNo: createOperationNo(context.type, context.at, context.operationId),
        studentId: context.studentId || '',
        type: context.type,
        status: 'committed',
        idempotencyKey: context.scopedKey,
        sourceType: context.sourceType,
        sourceId: context.sourceId,
        reversalOfOperationId: context.reversalOfOperationId || '',
        requestSnapshot: { requestHash: context.requestHash, ...context.requestSnapshot },
        resultSnapshot: context.result,
        actorId: context.input.actorId,
        actorRole: context.input.actorRole || 'admin',
        traceId: context.input.traceId || '',
        ...operationAudit({
            reason: context.auditReason || context.input.reason || context.type,
            beforeSummary: context.beforeSummary || context.requestSnapshot,
            afterSummary: context.afterSummary || context.result,
        }),
    });
}

async function commitTeachingPlan(service, context, plan) {
    try {
        await service.repository.send(plan);
    } catch (error) {
        const replay = await resolveTeachingReplay(service.repository, context.scopedKey, context.requestHash);
        if (replay) return replay;
        error.code = error.code || 'COURSE_CREDIT_BATCH_FAILED';
        throw error;
    }
    return { ...context.result, replayed: false };
}

function outbox(idFactory, topic, aggregateType, aggregateId, payload) {
    return create('outbox_events', {
        id: idFactory(),
        topic,
        aggregateType,
        aggregateId,
        payload,
        status: 'pending',
        attempts: 0,
    });
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

function escapeFilter(value) {
    return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function positiveVersion(value) {
    const version = Number(value);
    return Number.isInteger(version) && version > 0 ? version : 1;
}

module.exports = {
    commitTeachingPlan,
    create,
    escapeFilter,
    outbox,
    positiveVersion,
    prepareTeachingCommand,
    resolveTeachingReplay,
    teachingOperation,
    update,
    versionClaim,
};
