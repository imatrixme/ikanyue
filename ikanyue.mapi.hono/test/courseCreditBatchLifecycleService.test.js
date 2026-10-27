const test = require('node:test');
const assert = require('node:assert/strict');

const { CourseCreditError } = require('../src/services/courseCredits/domain');
const {
    CourseCreditBatchLifecycleService,
    compensationBatch,
    integerQuantity,
    isVersionConflict,
    positiveVersion,
    remainingQuantity,
    requiredDate,
    validFutureDate,
    validateAuditInput,
} = require('../src/services/courseCredits/batchLifecycleService');
const { fingerprintRequest } = require('../src/services/courseCredits/repositories/operationRepository');
const { assertBatchPlanPolicy } = require('../src/services/courseCredits/repositories/sdkBatchRepository');

const NOW = '2026-07-17T10:00:00.000Z';

test('expiry extension preserves original expiry and writes one audited atomic plan', async () => {
    const repository = mockRepository();
    const result = await service(repository).extendBatchExpiry(extendCommand());

    assert.equal(result.replayed, false);
    assert.equal(result.quantityScope, 3);
    assert.doesNotThrow(() => assertBatchPlanPolicy(repository.plan));
    assert.deepEqual(repository.plan.map((item) => `${item.action}:${item.collection}`), [
        'create:credit_operations',
        'create:credit_version_claims',
        'update:credit_batches',
        'create:credit_expiry_changes',
        'create:credit_events',
        'create:outbox_events',
    ]);
    const operation = data(repository.plan, 'credit_operations');
    assert.equal(operation.reason, 'approved extension');
    assert.equal(operation.outcome, 'committed');
    assert.equal(operation.beforeSummary.effectiveExpiresAt, '2026-07-20T00:00:00Z');
    assert.equal(operation.afterSummary.quantityScope, 3);
    assert.deepEqual(updateData(repository.plan, 'credit_batches'), {
        effectiveExpiresAt: '2026-08-20T00:00:00.000Z', version: 4,
    });
    const change = data(repository.plan, 'credit_expiry_changes');
    assert.equal(change.oldExpiresAt, '2026-07-20T00:00:00Z');
    assert.equal(change.quantityScope, 3);
    const event = data(repository.plan, 'credit_events');
    assert.equal(event.eventType, 'EXTEND');
    assert.equal(event.balanceSnapshot.expiredQuantity, 5);
});

test('expired quantity restoration creates a compensation batch without rewriting source quantities', async () => {
    const repository = mockRepository({ compensations: [{ originalQuantity: 1 }] });
    const result = await service(repository).restoreExpiredQuantity(restoreCommand());

    assert.equal(result.quantity, 2);
    assert.doesNotThrow(() => assertBatchPlanPolicy(repository.plan));
    const sourceUpdate = updateData(repository.plan, 'credit_batches');
    assert.deepEqual(sourceUpdate, { version: 4 });
    const compensation = repository.plan.find((item) => (
        item.action === 'create' && item.collection === 'credit_batches'
    )).data;
    assert.equal(compensation.compensationSourceBatchId, 'batch');
    assert.equal(compensation.originalQuantity, 2);
    assert.equal(compensation.availableQuantity, 2);
    assert.equal(compensation.expiredQuantity, 0);
    assert.equal(compensation.expiryPolicy, 'FIXED_DURATION');
    assert.equal(compensation.effectiveExpiresAt, '2026-08-16T10:00:00.000Z');
    const event = data(repository.plan, 'credit_events');
    assert.equal(event.eventType, 'ADJUST');
    assert.equal(event.quantityDelta, 2);
    assert.equal(event.bucketTo, 'availableQuantity');
});

test('batch lifecycle commands replay immutable results and reject conflicting key reuse', async () => {
    const extensionHash = fingerprintRequest({
        batchId: 'batch', newExpiresAt: '2026-08-20T00:00:00.000Z',
        reason: 'approved extension', approvedBy: 'supervisor',
    });
    const replayRepository = mockRepository({ existing: operation(extensionHash) });
    const replay = await service(replayRepository).extendBatchExpiry(extendCommand());
    assert.equal(replay.replayed, true);
    assert.equal(replayRepository.plan, null);

    const conflict = mockRepository({ existing: operation('different') });
    await assert.rejects(service(conflict).extendBatchExpiry(extendCommand()), hasCode('IDEMPOTENCY_CONFLICT'));
});

test('same-request storage race returns replay while unknown failures remain visible', async () => {
    const raced = mockRepository({ raceReplayAfterSend: true });
    const replay = await service(raced).restoreExpiredQuantity(restoreCommand());
    assert.equal(replay.replayed, true);

    const known = mockRepository({ sendError: Object.assign(new Error('down'), { code: 'PB_DOWN' }) });
    await assert.rejects(service(known).extendBatchExpiry(extendCommand()), (error) => error.code === 'PB_DOWN');
    const unknown = mockRepository({ sendError: new Error('failed') });
    await assert.rejects(service(unknown).restoreExpiredQuantity(restoreCommand()),
        (error) => error.code === 'COURSE_CREDIT_BATCH_FAILED');
});

test('version conflict retries restoration and prevents cumulative over-compensation', async () => {
    const repository = mockRepository({ raceToCompensated: true });
    await assert.rejects(service(repository).restoreExpiredQuantity(restoreCommand()),
        hasCode('COMPENSATION_EXCEEDS_EXPIRED'));
    assert.equal(repository.plans.length, 1);
});

test('batch lifecycle validation rejects unsafe extension and compensation requests', async () => {
    await rejectExtend({}, { batchId: '' }, 'BATCH_ID_REQUIRED');
    await rejectExtend({}, { reason: '' }, 'AUDIT_REASON_REQUIRED');
    await rejectExtend({}, { actorId: '' }, 'ACTOR_ID_REQUIRED');
    await rejectExtend({}, { idempotencyKey: '' }, 'IDEMPOTENCY_KEY_REQUIRED');
    await rejectExtend({}, { newExpiresAt: 'bad' }, 'INVALID_DATE');
    await rejectExtend({}, { newExpiresAt: NOW }, 'EXPIRY_MUST_BE_FUTURE');
    await rejectExtend({ batch: null }, {}, 'CREDIT_BATCH_NOT_FOUND');
    await rejectExtend({ batch: { effectiveExpiresAt: '' } }, {}, 'BATCH_HAS_NO_EXPIRY');
    await rejectExtend({ batch: { effectiveExpiresAt: '2026-09-01T00:00:00Z' } }, {}, 'EXPIRY_EXTENSION_REQUIRED');
    await rejectExtend({ batch: { availableQuantity: 0, frozenQuantity: 0 } }, {}, 'NO_REMAINING_CREDIT');

    await rejectRestore({}, { quantity: 0 }, 'INVALID_CREDIT_QUANTITY');
    await rejectRestore({}, { validityDurationDays: 0 }, 'INVALID_DURATION_DAYS');
    await rejectRestore({ batch: null }, {}, 'CREDIT_BATCH_NOT_FOUND');
    await rejectRestore({ batch: { expiredQuantity: 0 } }, {}, 'NO_EXPIRED_CREDIT');
    await rejectRestore({ compensations: [{ originalQuantity: 4 }] }, {}, 'COMPENSATION_EXCEEDS_EXPIRED');
});

test('batch lifecycle helpers preserve numeric and audit contracts', () => {
    assert.equal(integerQuantity(undefined, 'quantity'), 0);
    assertCode(() => integerQuantity(1.5, 'quantity'), 'INVALID_CREDIT_QUANTITY');
    assert.equal(remainingQuantity(batch()), 3);
    assert.equal(positiveVersion(undefined), 1);
    assert.equal(positiveVersion(2), 2);
    assert.equal(requiredDate('2026-01-01T00:00:00Z', 'MISSING'), '2026-01-01T00:00:00Z');
    assertCode(() => requiredDate('', 'MISSING'), 'MISSING');
    assert.equal(validFutureDate('2026-08-01T00:00:00Z', Date.parse(NOW), 'date'),
        '2026-08-01T00:00:00.000Z');
    assertCode(() => validateAuditInput({}), 'BATCH_ID_REQUIRED');
    assert.equal(isVersionConflict({ status: 400 }), true);
    assert.equal(isVersionConflict({ status: 409 }), true);
    assert.equal(isVersionConflict({ code: 'VERSION_CONFLICT' }), true);
    assert.equal(isVersionConflict(new Error('other')), false);
    const built = compensationBatch({
        expiresAt: '2026-08-01T00:00:00Z', id: 'new', input: restoreCommand(),
        now: NOW, operationId: 'operation', source: batch({ currency: '', priority: undefined }),
    });
    assert.equal(built.currency, 'CNY');
    assert.equal(built.priority, 0);
});

function service(repository) {
    return new CourseCreditBatchLifecycleService(repository, {
        clock: () => Date.parse(NOW), idFactory: ids(),
    });
}

function mockRepository(options = {}) {
    const state = {
        batch: options.batch === null ? null : { ...batch(), ...(options.batch || {}) },
        compensations: options.compensations || [],
    };
    return {
        existing: options.existing || null,
        plan: null,
        plans: [],
        async findFirst() { return this.existing; },
        async get() { return state.batch; },
        async list() { return state.compensations; },
        async send(plan) {
            this.plan = plan;
            this.plans.push(plan);
            if (options.raceReplayAfterSend) {
                this.existing = plan.find((item) => item.collection === 'credit_operations').data;
                throw Object.assign(new Error('race'), { status: 409 });
            }
            if (options.raceToCompensated && this.plans.length === 1) {
                state.compensations = [{ originalQuantity: 4 }];
                state.batch = { ...state.batch, version: 4 };
                throw Object.assign(new Error('version'), { status: 409 });
            }
            if (options.sendError) throw options.sendError;
            return plan.map((item) => item.data || {});
        },
    };
}

function batch(changes = {}) {
    return {
        id: 'batch', studentId: 'student', creditTypeId: 'course', sourceOperationId: 'grant',
        originalQuantity: 10, availableQuantity: 2, frozenQuantity: 1, consumedQuantity: 2,
        expiredQuantity: 5, reversedQuantity: 0, status: 'active',
        validFrom: '2026-01-01T00:00:00Z', originalExpiresAt: '2026-07-20T00:00:00Z',
        effectiveExpiresAt: '2026-07-20T00:00:00Z', activatedAt: '2026-01-01T00:00:00Z',
        listUnitValue: 300, paidUnitCost: 280, currency: 'CNY', priority: 1, version: 3,
        ...changes,
    };
}

function extendCommand(changes = {}) {
    return {
        batchId: 'batch', newExpiresAt: '2026-08-20T00:00:00Z', reason: 'approved extension',
        actorId: 'operator', approvedBy: 'supervisor', idempotencyKey: 'extend-key', ...changes,
    };
}

function restoreCommand(changes = {}) {
    return {
        batchId: 'batch', quantity: 2, validityDurationDays: 30, reason: 'approved compensation',
        actorId: 'operator', approvedBy: 'supervisor', idempotencyKey: 'restore-key', ...changes,
    };
}

function operation(requestHash) {
    return {
        id: 'stored', requestSnapshot: { requestHash },
        resultSnapshot: { operationId: 'stored', batchId: 'batch' },
    };
}

async function rejectExtend(repositoryOptions, changes, code) {
    await assert.rejects(service(mockRepository(repositoryOptions)).extendBatchExpiry(extendCommand(changes)), hasCode(code));
}

async function rejectRestore(repositoryOptions, changes, code) {
    await assert.rejects(service(mockRepository(repositoryOptions)).restoreExpiredQuantity(restoreCommand(changes)), hasCode(code));
}

function data(plan, collection) {
    return plan.find((item) => item.collection === collection)?.data;
}

function updateData(plan, collection) {
    return plan.find((item) => item.action === 'update' && item.collection === collection)?.data;
}

function ids() {
    let value = 0;
    return () => String(++value).padStart(15, '0');
}

function assertCode(action, code) {
    assert.throws(action, hasCode(code));
}

function hasCode(code) {
    return (error) => error instanceof CourseCreditError && error.code === code;
}
