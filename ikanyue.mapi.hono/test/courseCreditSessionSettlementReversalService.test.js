const test = require('node:test');
const assert = require('node:assert/strict');

const { fingerprintRequest } = require('../src/services/courseCredits/repositories/operationRepository');
const { assertBatchPlanPolicy } = require('../src/services/courseCredits/repositories/sdkBatchRepository');
const {
    CourseCreditSessionSettlementReversalService,
    validateCommand,
    validateOriginalOperation,
    validateSession,
} = require('../src/services/courseCredits/sessionSettlementReversalService');

const NOW = '2026-08-16T10:00:00.000Z';

test('reverseSessionSettlement restores reservations and appends linked reverse events atomically', async () => {
    const repository = mockRepository();
    const result = await service(repository).reverseSessionSettlement(command());

    assert.equal(result.replayed, false);
    assert.deepEqual(result.reversedCreditEventIds, ['consume-event', 'release-event']);
    assert.deepEqual(result.reversedTeacherEventIds, ['teacher-event']);
    assert.doesNotThrow(() => assertBatchPlanPolicy(repository.plan));
    const operation = created(repository.plan, 'credit_operations')[0];
    assert.equal(operation.type, 'reverse_session_settlement');
    assert.equal(operation.reversalOfOperationId, 'settlement-operation');
    assert.equal(operation.sourceType, 'settlement_operation');
    assert.equal(updated(repository.plan, 'sessions', 'session').status, 'correction_pending');
    assert.equal(updated(repository.plan, 'sessions', 'session').correctionBaseStatus, 'completed');
    assert.equal(created(repository.plan, 'session_credit_allocations').length, 2);
    assert.equal(created(repository.plan, 'credit_events').every((event) => event.reversalOfEventId), true);
    assert.equal(created(repository.plan, 'teacher_credit_events')[0].reversalOfEventId, 'teacher-event');
    assert.equal(repository.plan.some((item) => item.action === 'update' && item.collection === 'credit_events'), false);
    assert.equal(repository.plan.some((item) => item.action === 'update'
        && item.collection === 'teacher_credit_events'), false);
    assert.equal(created(repository.plan, 'outbox_events')[0].topic,
        'course-credit.session-settlement-reversed');
});

test('reversal supports a cancelled settlement with no teacher earnings', async () => {
    const repository = mockRepository({
        originalOperation: { requestSnapshot: { sessionStatus: 'cancelled' } },
        teacherEvents: [],
    });
    await service(repository).reverseSessionSettlement(command());
    assert.equal(updated(repository.plan, 'sessions', 'session').correctionBaseStatus, 'cancelled');
    assert.equal(created(repository.plan, 'teacher_credit_events').length, 0);
});

test('reversal replays committed results and resolves same-request races', async () => {
    const hash = fingerprintRequest({ reason: 'attendance correction', sessionId: 'session' });
    const replayRepository = mockRepository({ existing: storedOperation(hash) });
    assert.equal((await service(replayRepository).reverseSessionSettlement(command())).replayed, true);
    assert.equal(replayRepository.plan, null);

    const raced = mockRepository({ raceReplayAfterSend: true });
    assert.equal((await service(raced).reverseSessionSettlement(command())).replayed, true);

    await assert.rejects(
        service(mockRepository({ existing: storedOperation('different') })).reverseSessionSettlement(command()),
        hasCode('IDEMPOTENCY_CONFLICT')
    );
});

test('reversal preserves single-batch storage failure without compensation writes', async () => {
    const repository = mockRepository({ sendError: new Error('failed') });
    await assert.rejects(
        service(repository).reverseSessionSettlement(command()),
        hasCode('COURSE_CREDIT_BATCH_FAILED')
    );
    assert.equal(repository.sendCount, 1);
});

test('reversal validates command, session, and original operation contracts', async () => {
    await reject({}, { sessionId: '' }, 'SESSION_ID_REQUIRED');
    await reject({}, { reason: 'x' }, 'REVERSAL_REASON_REQUIRED');
    await reject({ session: { status: 'completed' } }, {}, 'SESSION_NOT_REVERSIBLE');
    await reject({ session: { settlementOperationId: '' } }, {}, 'SETTLEMENT_OPERATION_REQUIRED');
    await reject({ originalOperation: { type: 'reserve' } }, {}, 'SETTLEMENT_OPERATION_INVALID');
    await reject({ originalOperation: { sourceId: 'other' } }, {}, 'SETTLEMENT_OPERATION_SESSION_MISMATCH');
    await reject({ originalOperation: { requestSnapshot: {} } }, {}, 'SETTLEMENT_BASE_STATUS_INVALID');
});

test('reversal helper validation accepts the authoritative original settlement', () => {
    assert.doesNotThrow(() => validateCommand(command()));
    assert.doesNotThrow(() => validateSession(baseSession()));
    assert.equal(validateOriginalOperation(originalOperation(), 'session'), 'completed');
});

function service(repository) {
    return new CourseCreditSessionSettlementReversalService(repository, {
        clock: () => Date.parse(NOW), idFactory: ids(),
    });
}

function mockRepository(options = {}) {
    const state = {
        session: { ...baseSession(), ...(options.session || {}) },
        originalOperation: { ...originalOperation(), ...(options.originalOperation || {}) },
        creditEvents: options.creditEvents || creditEvents(),
        teacherEvents: options.teacherEvents === undefined ? [teacherEvent()] : options.teacherEvents,
        roster: options.roster || [student('consume', 'consumed'), student('release', 'released')],
        allocations: options.allocations || {
            'allocation-consume': allocation('consume', 'consumed'),
            'allocation-release': allocation('release', 'expired'),
        },
        batches: options.batches || {
            'batch-consume': batch('consume', 'account-consume', 'consumedQuantity'),
            'batch-release': batch('release', 'account-release', 'expiredQuantity'),
        },
    };
    return {
        existing: options.existing || null,
        plan: null,
        sendCount: 0,
        async findFirst() { return this.existing; },
        async get(collection, id) {
            if (collection === 'sessions') return state.session;
            if (collection === 'credit_operations') return state.originalOperation;
            if (collection === 'session_credit_allocations') return state.allocations[id];
            if (collection === 'credit_batches') return state.batches[id];
            throw new Error(`Unexpected get ${collection}`);
        },
        async list(collection) {
            if (collection === 'credit_events') return state.creditEvents;
            if (collection === 'teacher_credit_events') return state.teacherEvents;
            if (collection === 'session_students') return state.roster;
            throw new Error(`Unexpected list ${collection}`);
        },
        async send(plan) {
            this.plan = plan;
            this.sendCount += 1;
            if (options.raceReplayAfterSend) {
                this.existing = plan.find((item) => item.collection === 'credit_operations').data;
                throw Object.assign(new Error('race'), { status: 409 });
            }
            if (options.sendError) throw options.sendError;
            return plan;
        },
    };
}

async function reject(repositoryChanges, commandChanges, code) {
    await assert.rejects(
        service(mockRepository(repositoryChanges)).reverseSessionSettlement(command(commandChanges)),
        hasCode(code)
    );
}

function command(changes = {}) {
    return {
        sessionId: 'session', reason: 'attendance correction',
        idempotencyKey: 'reverse-key', actorId: 'operator', ...changes,
    };
}

function baseSession() {
    return { id: 'session', status: 'settled', settlementOperationId: 'settlement-operation', version: 6 };
}

function originalOperation() {
    return {
        id: 'settlement-operation', type: 'settle_session', status: 'committed',
        sourceType: 'session', sourceId: 'session', requestSnapshot: { sessionStatus: 'completed' },
    };
}

function creditEvents() {
    return [
        creditEvent('consume-event', 'CONSUME', 'consumedQuantity', -1, 'consume'),
        creditEvent('release-event', 'RELEASE', 'expiredQuantity', 1, 'release'),
    ];
}

function creditEvent(id, eventType, bucketTo, quantityDelta, suffix) {
    return {
        id, eventType, bucketTo, quantityDelta, batchId: `batch-${suffix}`,
        metadata: { allocationId: `allocation-${suffix}`, sessionStudentId: `student-${suffix}` },
    };
}

function teacherEvent() {
    return {
        id: 'teacher-event', eventType: 'earn', status: 'pending', quantityDelta: 1.25,
        sessionTeacherId: 'teacher-assignment', teacherId: 'teacher', ruleId: 'teacher-rule',
    };
}

function allocation(suffix, status) {
    return {
        id: `allocation-${suffix}`, sessionStudentId: `student-${suffix}`,
        batchId: `batch-${suffix}`, quantity: 1, status,
        reservedForStartAt: '2026-08-10T10:00:00.000Z',
    };
}

function batch(suffix, studentId, bucket) {
    return {
        id: `batch-${suffix}`, studentId, creditTypeId: 'course', originalQuantity: 1,
        availableQuantity: bucket === 'availableQuantity' ? 1 : 0,
        frozenQuantity: 0, consumedQuantity: bucket === 'consumedQuantity' ? 1 : 0,
        expiredQuantity: bucket === 'expiredQuantity' ? 1 : 0,
        reversedQuantity: 0, activatedAt: NOW, version: 3,
    };
}

function student(suffix, creditStatus) {
    return { id: `student-${suffix}`, studentId: `account-${suffix}`, creditStatus, version: 4 };
}

function storedOperation(requestHash) {
    return {
        id: 'stored', requestSnapshot: { requestHash },
        resultSnapshot: { operationId: 'stored', sessionId: 'session' },
    };
}

function created(plan, collection) {
    return plan.filter((item) => item.action === 'create' && item.collection === collection).map((item) => item.data);
}

function updated(plan, collection, id) {
    return plan.find((item) => item.action === 'update' && item.collection === collection && item.id === id).data;
}

function hasCode(code) {
    return (error) => error.code === code;
}

function ids() {
    let index = 0;
    return () => `reverseservice${String(++index).padStart(3, '0')}`;
}
