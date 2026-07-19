const test = require('node:test');
const assert = require('node:assert/strict');

const { CourseCreditError } = require('../src/services/courseCredits/domain');
const { assertBatchPlanPolicy } = require('../src/services/courseCredits/repositories/sdkBatchRepository');
const { fingerprintRequest } = require('../src/services/courseCredits/repositories/operationRepository');
const {
    CourseCreditReservationService,
    findConversionAvailability,
    isVersionConflict,
    sourceQuantityForTarget,
    validateSession,
} = require('../src/services/courseCredits/reservationService');
const {
    buildReservationMovements,
    normalizeBatch,
    planReservation,
    positiveVersion,
} = require('../src/services/courseCredits/reservationPlanning');

test('Hono reservation service activates, allocates FEFO, freezes, and emits one atomic plan', async () => {
    const repository = mockRepository();
    const result = await createService(repository).reserveSessionCredit(command({ actorId: 'operator' }));

    assert.equal(result.creditStatus, 'reserved');
    assert.equal(result.replayed, false);
    assert.deepEqual(result.allocations.map((item) => [item.batchId, item.quantity]), [
        ['batch-first', 1], ['batch-later', 1],
    ]);
    assert.doesNotThrow(() => assertBatchPlanPolicy(repository.plan));
    const operations = repository.plan.filter((item) => item.collection === 'credit_operations');
    const claims = repository.plan.filter((item) => item.collection === 'credit_version_claims');
    const updates = repository.plan.filter((item) => item.action === 'update');
    const events = repository.plan.filter((item) => item.collection === 'credit_events').map((item) => item.data);
    assert.equal(operations.length, 1);
    assert.equal(claims.length, 3);
    assert.equal(updates.length, 3);
    assert.deepEqual(events.map((event) => event.eventType), ['ACTIVATE', 'FREEZE', 'FREEZE']);
    assert.equal(events[0].balanceSnapshot.availableQuantity, 1);
    assert.equal(events[0].balanceSnapshot.frozenQuantity, 0);
    assert.equal(events[1].balanceSnapshot.availableQuantity, 0);
    assert.equal(events[1].actorId, 'operator');
    assert.deepEqual(updateData(repository.plan, 'session_students'), {
        creditStatus: 'reserved', eligibilityReason: '', version: 4,
    });
});

test('first-reservation activation rejects a batch that expires before service time', async () => {
    const repository = mockRepository({
        batches: [batch({ id: 'too-short', validityDurationDays: 1 })],
        rules: [],
    });
    const result = await createService(repository).reserveSessionCredit(command());
    assert.equal(result.creditStatus, 'credit_insufficient');
    assert.equal(result.missingQuantity, 2);
    assert.equal(repository.plan.some((item) => item.collection === 'credit_batches'), false);
});

test('reservation may freeze a deferred non-reservation activation batch without activating it', async () => {
    const repository = mockRepository({
        session: { requiredQuantity: 1 },
        batches: [batch({ activationMode: 'FIRST_CHECK_IN' })],
    });
    const result = await createService(repository).reserveSessionCredit(command());
    assert.equal(result.creditStatus, 'reserved');
    const update = updateData(repository.plan, 'credit_batches');
    assert.equal(update.activatedAt, '');
    assert.equal(update.effectiveExpiresAt, '');
    assert.deepEqual(repository.plan.filter((item) => item.collection === 'credit_events')
        .map((item) => item.data.eventType), ['FREEZE']);
});

test('insufficient exact credit becomes conversion-required when an active rule can cover the gap', async () => {
    const repository = mockRepository({
        batches: [],
        rules: [conversionRule()],
        sourceBatches: [batch({
            id: 'universal-batch', creditTypeId: 'universal', activationMode: 'GRANT_TIME',
            activatedAt: NOW, effectiveExpiresAt: '2027-01-01T00:00:00Z', originalQuantity: 200,
            availableQuantity: 200,
        })],
    });
    const result = await createService(repository).reserveSessionCredit(command());
    assert.equal(result.creditStatus, 'conversion_required');
    assert.deepEqual(result.conversion, {
        ruleId: 'rule', ruleVersion: 2, sourceCreditTypeId: 'universal', sourceQuantity: 200, targetQuantity: 2,
    });
    assert.equal(updateData(repository.plan, 'session_students').eligibilityReason, 'conversion_required');
});

test('conversion availability skips capped and underfunded rules', async () => {
    const capped = conversionRule({ id: 'capped', maxSourceQuantity: 100 });
    const underfunded = conversionRule({ id: 'underfunded', maxSourceQuantity: 1000 });
    const repository = mockRepository({
        rules: [capped, underfunded],
        sourceBatches: [
            batch({ id: 'empty', creditTypeId: 'universal', originalQuantity: 0, availableQuantity: 0 }),
            batch({ creditTypeId: 'universal', originalQuantity: 100, availableQuantity: 100 }),
        ],
    });
    const result = await findConversionAvailability(repository, {
        missingQuantity: 2, now: NOW, studentId: 'student', targetCreditTypeId: 'course',
    });
    assert.equal(result, null);
});

test('reservation replay is stable and conflicting key reuse is rejected', async () => {
    const requestHash = fingerprintRequest({
        authorizationId: '', sessionStudentId: 'session-student', targetTermEnd: '',
    });
    const replayRepository = mockRepository({ existing: operation(requestHash) });
    const replay = await createService(replayRepository).reserveSessionCredit(command());
    assert.equal(replay.replayed, true);
    assert.equal(replay.creditStatus, 'reserved');
    assert.equal(replayRepository.plan, null);

    const conflictRepository = mockRepository({ existing: operation('different') });
    await assert.rejects(createService(conflictRepository).reserveSessionCredit(command()), hasCode('IDEMPOTENCY_CONFLICT'));
});

test('version conflict retries from fresh state and records insufficient status', async () => {
    const repository = mockRepository({ raceToInsufficient: true });
    const result = await createService(repository).reserveSessionCredit(command());
    assert.equal(result.creditStatus, 'credit_insufficient');
    assert.equal(repository.plans.length, 2);
    assert.equal(updateData(repository.plan, 'session_students').version, 5);
});

test('activation race reloads the winning activation and does not emit ACTIVATE twice', async () => {
    const repository = mockRepository({
        raceToActivated: true,
        session: { requiredQuantity: 1 },
        batches: [batch()],
    });
    const result = await createService(repository).reserveSessionCredit(command());

    assert.equal(result.creditStatus, 'reserved');
    assert.equal(repository.plans.length, 2);
    assert.deepEqual(repository.plans[0]
        .filter((item) => item.collection === 'credit_events')
        .map((item) => item.data.eventType), ['ACTIVATE', 'FREEZE']);
    assert.deepEqual(repository.plans[1]
        .filter((item) => item.collection === 'credit_events')
        .map((item) => item.data.eventType), ['FREEZE']);
});

test('same-request batch conflict returns the committed reservation replay', async () => {
    const repository = mockRepository({ raceReplayAfterSend: true });
    const result = await createService(repository).reserveSessionCredit(command());
    assert.equal(result.replayed, true);
    assert.equal(result.creditStatus, 'reserved');
    assert.equal(repository.plans.length, 1);
});

test('reservation preserves storage errors and validates command and session contracts', async () => {
    await assertRejects({}, { sessionStudentId: '' }, 'SESSION_STUDENT_ID_REQUIRED');
    await assertRejects({}, { idempotencyKey: '' }, 'IDEMPOTENCY_KEY_REQUIRED');
    await assertRejects({ sessionStudent: { studentId: '' } }, {}, 'SESSION_STUDENT_INVALID');
    await assertRejects({}, { studentId: 'another-student' }, 'SESSION_STUDENT_FORBIDDEN');
    await assertRejects({ session: { status: 'cancelled' } }, {}, 'SESSION_NOT_RESERVABLE');
    await assertRejects({ session: { requiredQuantity: 0 } }, {}, 'SESSION_CREDIT_QUANTITY_INVALID');
    await assertRejects({ session: { startAt: 'bad' } }, {}, 'SESSION_START_INVALID');
    await assertRejects({ creditType: { kind: 'universal', consumable: false } }, {}, 'SESSION_CREDIT_TYPE_INVALID');

    const known = mockRepository({ sendError: Object.assign(new Error('down'), { code: 'PB_DOWN' }) });
    await assert.rejects(createService(known).reserveSessionCredit(command()), (error) => error.code === 'PB_DOWN');
    const unknown = mockRepository({ sendError: new Error('failed') });
    await assert.rejects(createService(unknown).reserveSessionCredit(command()),
        (error) => error.code === 'COURSE_CREDIT_BATCH_FAILED');
});

test('reservation planning helpers normalize legacy records and expose conflict semantics', () => {
    const creditType = { kind: 'course', consumable: true };
    const normalized = normalizeBatch(batch({ version: undefined, priority: undefined }), creditType);
    assert.equal(normalized.version, 1);
    assert.equal(normalized.priority, 0);
    assert.equal(positiveVersion(3), 3);
    assert.equal(positiveVersion('bad'), 1);
    const planned = planReservation([batch({ activationMode: 'GRANT_TIME', activatedAt: NOW })], 1, {
        creditType, now: NOW, requiredCreditTypeId: 'course', sessionStart: SESSION_START,
    });
    const movements = buildReservationMovements(planned, ids());
    assert.equal(movements[0].nextBatch.frozenQuantity, 1);
    assert.equal(sourceQuantityForTarget(conversionRule(), 3), 300);
    assert.doesNotThrow(() => validateSession(baseSession()));
    assert.equal(isVersionConflict({ status: 400 }), true);
    assert.equal(isVersionConflict({ status: 409 }), true);
    assert.equal(isVersionConflict({ code: 'VERSION_CONFLICT' }), true);
    assert.equal(isVersionConflict(new Error('other')), false);
});

const NOW = '2026-07-17T10:00:00.000Z';
const SESSION_START = '2026-07-20T10:00:00.000Z';

function createService(repository) {
    return new CourseCreditReservationService(repository, {
        clock: () => Date.parse(NOW), idFactory: ids(),
    });
}

function mockRepository(options = {}) {
    const state = {
        batches: options.batches || [batch(), batch({
            id: 'batch-later', activationMode: 'GRANT_TIME', activatedAt: NOW,
            effectiveExpiresAt: '2026-12-01T00:00:00Z', originalQuantity: 2, availableQuantity: 2,
        })],
        sessionStudent: { ...baseSessionStudent(), ...(options.sessionStudent || {}) },
    };
    return {
        existing: options.existing || null,
        plan: null,
        plans: [],
        async findFirst() { return this.existing; },
        async get(collection) {
            if (collection === 'session_students') return state.sessionStudent;
            if (collection === 'sessions') return { ...baseSession(), ...(options.session || {}) };
            if (collection === 'credit_types') return options.creditType || { id: 'course', kind: 'course', consumable: true };
            throw new Error(`Unexpected collection ${collection}`);
        },
        async list(collection, query) {
            if (collection === 'conversion_rules') return options.rules || [];
            if (collection === 'credit_batches') {
                return query.filter.includes('creditTypeId="universal"')
                    ? (options.sourceBatches || [])
                    : state.batches;
            }
            throw new Error(`Unexpected collection ${collection}`);
        },
        async send(plan) {
            this.plan = plan;
            this.plans.push(plan);
            if (options.raceToInsufficient && this.plans.length === 1) {
                state.batches = [];
                state.sessionStudent = { ...state.sessionStudent, version: 4 };
                throw Object.assign(new Error('version conflict'), { status: 409 });
            }
            if (options.raceToActivated && this.plans.length === 1) {
                state.batches = state.batches.map((record) => ({
                    ...record,
                    activatedAt: NOW,
                    effectiveExpiresAt: '2026-08-16T10:00:00.000Z',
                    status: 'active',
                    version: record.version + 1,
                }));
                state.sessionStudent = { ...state.sessionStudent, version: 4 };
                throw Object.assign(new Error('activation version conflict'), { status: 409 });
            }
            if (options.raceReplayAfterSend) {
                const record = plan.find((item) => item.collection === 'credit_operations').data;
                this.existing = record;
                throw Object.assign(new Error('idempotency conflict'), { status: 409 });
            }
            if (options.sendError) throw options.sendError;
            return plan.map((item) => item.data || {});
        },
    };
}

function batch(changes = {}) {
    return {
        id: 'batch-first', studentId: 'student', creditTypeId: 'course', originalQuantity: 1,
        availableQuantity: 1, frozenQuantity: 0, consumedQuantity: 0, expiredQuantity: 0,
        reversedQuantity: 0, status: 'unactivated', validFrom: '2026-01-01T00:00:00Z',
        effectiveExpiresAt: '', activationMode: 'FIRST_RESERVATION',
        activationDeadline: '2026-10-01T00:00:00Z', activatedAt: '', validityDurationDays: 30,
        priority: 0, version: 2, created: '2026-07-01T00:00:00Z', ...changes,
    };
}

function conversionRule(changes = {}) {
    return {
        id: 'rule', sourceCreditTypeId: 'universal', targetCreditTypeId: 'course',
        sourceQuantity: 100, targetQuantity: 1, minSourceQuantity: 100, maxSourceQuantity: 1000,
        expiryPolicy: 'INHERIT_SOURCE', activationMode: 'GRANT_TIME', validityDurationDays: 0,
        status: 'active', validFrom: '2026-01-01T00:00:00Z', validTo: '', version: 2, ...changes,
    };
}

function baseSession() {
    return {
        id: 'session', status: 'scheduled', startAt: SESSION_START,
        requiredCreditTypeId: 'course', requiredQuantity: 2,
    };
}

function baseSessionStudent() {
    return { id: 'session-student', sessionId: 'session', studentId: 'student', version: 3, creditStatus: 'pending' };
}

function command(changes = {}) {
    return { sessionStudentId: 'session-student', idempotencyKey: 'reserve-key', ...changes };
}

function operation(requestHash) {
    return {
        id: 'stored-operation', requestSnapshot: { requestHash },
        resultSnapshot: { operationId: 'stored-operation', creditStatus: 'reserved', allocations: [] },
    };
}

async function assertRejects(repositoryOptions, commandChanges, code) {
    await assert.rejects(createService(mockRepository(repositoryOptions)).reserveSessionCredit(command(commandChanges)), hasCode(code));
}

function updateData(plan, collection) {
    return plan.find((item) => item.action === 'update' && item.collection === collection)?.data;
}

function ids() {
    let value = 0;
    return () => String(++value).padStart(15, '0');
}

function hasCode(code) {
    return (error) => error instanceof CourseCreditError && error.code === code;
}
