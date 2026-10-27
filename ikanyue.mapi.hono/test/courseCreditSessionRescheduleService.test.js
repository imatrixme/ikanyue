const test = require('node:test');
const assert = require('node:assert/strict');

const { fingerprintRequest } = require('../src/services/courseCredits/repositories/operationRepository');
const { assertBatchPlanPolicy } = require('../src/services/courseCredits/repositories/sdkBatchRepository');
const {
    CourseCreditSessionRescheduleService,
    validateCommand,
    validateSession,
} = require('../src/services/courseCredits/sessionRescheduleService');

const NOW = '2026-08-15T10:00:00.000Z';
const NEW_START = '2026-08-20T10:00:00.000Z';
const NEW_END = '2026-08-20T11:00:00.000Z';

test('reschedule command updates session and revalidates reserved students in one SDK batch', async () => {
    const repository = mockRepository();
    const result = await service(repository).rescheduleSession(command());

    assert.equal(result.replayed, false);
    assert.equal(result.studentOutcomes.length, 1);
    assert.equal(result.studentOutcomes[0].creditStatus, 'reserved');
    assert.equal(result.studentOutcomes[0].releasedAllocationIds[0], 'old-allocation');
    assert.equal(result.studentOutcomes[0].newAllocationIds.length, 1);
    assert.doesNotThrow(() => assertBatchPlanPolicy(repository.plan));
    const operation = created(repository.plan, 'credit_operations');
    assert.equal(operation.type, 'reschedule_session');
    assert.equal(operation.sourceType, 'session');
    assert.deepEqual(updated(repository.plan, 'sessions', 'session'), {
        endAt: NEW_END, startAt: NEW_START, version: 4,
    });
    assert.equal(created(repository.plan, 'outbox_events').topic, 'course-credit.session-rescheduled');
    assert.equal(repository.plan.some((item) => item.id === 'pending-student'), false);
});

test('reschedule command can update a session with no reserved students', async () => {
    const repository = mockRepository({ roster: [student({ id: 'pending', creditStatus: 'pending' })] });
    const result = await service(repository).rescheduleSession(command());
    assert.deepEqual(result.studentOutcomes, []);
    assert.equal(repository.plan.some((item) => item.collection === 'session_credit_allocations'), false);
});

test('reschedule command replays committed results and resolves same-request races', async () => {
    const hash = fingerprintRequest({ newEndAt: NEW_END, newStartAt: NEW_START, sessionId: 'session' });
    const replayRepository = mockRepository({ existing: storedOperation(hash) });
    const replay = await service(replayRepository).rescheduleSession(command());
    assert.equal(replay.replayed, true);
    assert.equal(replayRepository.plan, null);

    const raced = mockRepository({ raceReplayAfterSend: true });
    assert.equal((await service(raced).rescheduleSession(command())).replayed, true);

    const conflict = mockRepository({ existing: storedOperation('different') });
    await assert.rejects(service(conflict).rescheduleSession(command()), hasCode('IDEMPOTENCY_CONFLICT'));
});

test('reschedule command preserves storage failures and validates command contracts', async () => {
    await assert.rejects(
        service(mockRepository({ sendError: new Error('failed') })).rescheduleSession(command()),
        hasCode('COURSE_CREDIT_BATCH_FAILED')
    );
    await reject({}, { sessionId: '' }, 'SESSION_ID_REQUIRED');
    await reject({}, { newStartAt: 'invalid' }, 'SESSION_TIME_INVALID');
    await reject({}, { newEndAt: NEW_START }, 'SESSION_TIME_INVALID');
    await reject({ session: { status: 'completed' } }, {}, 'SESSION_NOT_RESCHEDULABLE');
    await reject({ session: { startAt: 'invalid' } }, {}, 'SESSION_TIME_INVALID');
    await reject({}, { newStartAt: baseSession().startAt, newEndAt: baseSession().endAt }, 'SESSION_TIME_UNCHANGED');
    await reject({ creditType: { kind: 'universal', consumable: false } }, {}, 'SESSION_CREDIT_TYPE_INVALID');
    await reject({ allocations: [] }, {}, 'SESSION_ALLOCATION_REQUIRED');
});

test('reschedule validation helpers cover valid and invalid time boundaries', () => {
    assert.doesNotThrow(() => validateCommand(command()));
    assert.doesNotThrow(() => validateSession(baseSession(), command()));
    assertCode(() => validateCommand({ ...command(), newEndAt: NEW_START }), 'SESSION_TIME_INVALID');
    assertCode(() => validateSession({ ...baseSession(), status: 'draft' }, command()), 'SESSION_NOT_RESCHEDULABLE');
});

function service(repository) {
    return new CourseCreditSessionRescheduleService(repository, {
        clock: () => Date.parse(NOW), idFactory: ids(),
    });
}

function mockRepository(options = {}) {
    const state = {
        session: { ...baseSession(), ...(options.session || {}) },
        creditType: options.creditType || { id: 'course', kind: 'course', consumable: true },
        roster: options.roster || [student(), student({ id: 'pending-student', creditStatus: 'pending' })],
        allocations: options.allocations === undefined ? [allocation()] : options.allocations,
        batches: {
            old: oldBatch(),
            candidate: candidateBatch(),
            ...(options.batches || {}),
        },
    };
    return {
        existing: options.existing || null,
        plan: null,
        async findFirst() { return this.existing; },
        async get(collection, id) {
            if (collection === 'sessions') return state.session;
            if (collection === 'credit_types') return state.creditType;
            if (collection === 'credit_batches') return state.batches[id];
            throw new Error(`Unexpected get ${collection}`);
        },
        async list(collection) {
            if (collection === 'session_students') return state.roster;
            if (collection === 'session_teachers') return [{ id: 'teacher-row', teacherId: 'teacher', role: 'lead' }];
            if (collection === 'schedule_claims') return [];
            if (collection === 'session_credit_allocations') return state.allocations;
            if (collection === 'credit_batches') return [state.batches.candidate];
            throw new Error(`Unexpected list ${collection}`);
        },
        async send(plan) {
            this.plan = plan;
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
        service(mockRepository(repositoryChanges)).rescheduleSession(command(commandChanges)),
        hasCode(code)
    );
}

function command(changes = {}) {
    return {
        sessionId: 'session', newStartAt: NEW_START, newEndAt: NEW_END,
        idempotencyKey: 'reschedule-key', actorId: 'operator', ...changes,
    };
}

function baseSession() {
    return {
        id: 'session', status: 'scheduled', startAt: '2026-08-10T10:00:00.000Z',
        endAt: '2026-08-10T11:00:00.000Z', requiredCreditTypeId: 'course',
        requiredQuantity: 1, version: 3,
    };
}

function student(changes = {}) {
    return { id: 'session-student', sessionId: 'session', studentId: 'student', creditStatus: 'reserved', version: 2, ...changes };
}

function allocation() {
    return { id: 'old-allocation', batchId: 'old', quantity: 1, status: 'reserved' };
}

function oldBatch() {
    return batch({
        id: 'old', availableQuantity: 0, frozenQuantity: 1,
        effectiveExpiresAt: NOW, version: 2,
    });
}

function candidateBatch() {
    return batch({
        id: 'candidate', availableQuantity: 1, frozenQuantity: 0,
        effectiveExpiresAt: '2026-09-01T00:00:00.000Z', version: 5,
    });
}

function batch(changes) {
    return {
        studentId: 'student', creditTypeId: 'course', originalQuantity: 1,
        availableQuantity: 0, frozenQuantity: 0, consumedQuantity: 0,
        expiredQuantity: 0, reversedQuantity: 0, activatedAt: NOW,
        activationMode: 'GRANT_TIME', status: 'active', priority: 0, ...changes,
    };
}

function storedOperation(requestHash) {
    return {
        id: 'stored-operation', requestSnapshot: { requestHash },
        resultSnapshot: { operationId: 'stored-operation', sessionId: 'session', studentOutcomes: [] },
    };
}

function created(plan, collection) {
    return plan.find((item) => item.action === 'create' && item.collection === collection).data;
}

function updated(plan, collection, id) {
    return plan.find((item) => item.action === 'update' && item.collection === collection && item.id === id).data;
}

function hasCode(code) {
    return (error) => error.code === code;
}

function assertCode(callback, code) {
    assert.throws(callback, hasCode(code));
}

function ids() {
    let index = 0;
    return () => `sessionreschedule${String(++index).padStart(3, '0')}`;
}
