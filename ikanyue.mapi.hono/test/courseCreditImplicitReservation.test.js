const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseCreditError,
    conversionTermsFingerprint,
} = require('../src/services/courseCredits/domain');
const {
    conversionMutationPlan,
    conversionResult,
    sourceQuantityForTarget,
    storedTargetBatch,
} = require('../src/services/courseCredits/implicitReservation');
const { fingerprintRequest } = require('../src/services/courseCredits/repositories/operationRepository');
const { assertBatchPlanPolicy } = require('../src/services/courseCredits/repositories/sdkBatchRepository');
const { CourseCreditReservationService } = require('../src/services/courseCredits/reservationService');

const NOW = '2026-07-17T10:00:00.000Z';
const SESSION_START = '2026-07-20T10:00:00.000Z';

test('authorized implicit conversion creates and freezes target credit in one SDK batch', async () => {
    const repository = mockRepository();
    const result = await service(repository).reserveSessionCredit(command());

    assert.equal(result.creditStatus, 'reserved');
    assert.equal(result.conversion.authorizationId, 'authorization');
    assert.equal(result.conversion.sourceQuantity, 200);
    assert.equal(result.conversion.targetQuantity, 2);
    assert.equal(result.allocations.length, 1);
    assert.doesNotThrow(() => assertBatchPlanPolicy(repository.plan));
    assert.equal(requests(repository.plan, 'credit_operations').length, 1);
    assert.equal(requests(repository.plan, 'conversion_allocations').length, 1);
    assert.equal(requests(repository.plan, 'session_credit_allocations').length, 1);
    assert.equal(requests(repository.plan, 'outbox_events').length, 2);
    assert.deepEqual(requests(repository.plan, 'credit_events').map((item) => item.data.eventType), [
        'CONVERT_OUT', 'CONVERT_IN', 'FREEZE',
    ]);

    const sourceUpdate = repository.plan.find((item) => item.action === 'update'
        && item.collection === 'credit_batches').data;
    assert.deepEqual(sourceUpdate, {
        availableQuantity: 0, consumedQuantity: 200, status: 'depleted', version: 3,
    });
    const target = repository.plan.find((item) => item.action === 'create'
        && item.collection === 'credit_batches').data;
    assert.equal(target.availableQuantity, 0);
    assert.equal(target.frozenQuantity, 2);
    assert.equal(target.version, 1);
    assert.equal(update(repository.plan, 'session_students').creditStatus, 'reserved');
});

test('implicit conversion preserves exact FEFO allocation and converts only the missing quantity', async () => {
    const repository = mockRepository({
        exactBatches: [exactBatch({ availableQuantity: 1, originalQuantity: 1 })],
        session: { requiredQuantity: 2 },
        sourceBatches: [sourceBatch({ originalQuantity: 100, availableQuantity: 100 })],
    });
    const result = await service(repository).reserveSessionCredit(command());

    assert.equal(result.conversion.sourceQuantity, 100);
    assert.deepEqual(result.allocations.map((item) => item.quantity), [1, 1]);
    assert.deepEqual(requests(repository.plan, 'credit_events').map((item) => item.data.eventType), [
        'FREEZE', 'CONVERT_OUT', 'CONVERT_IN', 'FREEZE',
    ]);
    assert.equal(requests(repository.plan, 'credit_version_claims').length, 3);
    assert.equal(requests(repository.plan, 'session_credit_allocations').length, 2);
});

test('converted target must remain valid at session time before any batch is sent', async () => {
    const repository = mockRepository({
        sourceBatches: [sourceBatch({ effectiveExpiresAt: '2026-07-19T00:00:00Z' })],
    });
    await assert.rejects(service(repository).reserveSessionCredit(command()),
        hasCode('CONVERSION_TARGET_NOT_RESERVABLE'));
    assert.equal(repository.plan, null);
});

test('implicit reservation rejects missing, stale, and wrong-target authorizations', async () => {
    await reject({ authorization: null }, 'CONVERSION_AUTHORIZATION_REQUIRED');
    await reject({ authorization: authorization({ termsFingerprint: 'stale' }) },
        'CONVERSION_AUTHORIZATION_STALE');
    await reject({ rule: conversionRule({ targetCreditTypeId: 'other-course' }) },
        'CONVERSION_TARGET_MISMATCH');
    await reject({ authorization: authorization({ studentId: 'other' }) },
        'CONVERSION_AUTHORIZATION_SCOPE_MISMATCH');
});

test('implicit reservation replays immutable results and rejects conflicting reuse', async () => {
    const requestHash = fingerprintRequest({
        authorizationId: 'authorization', sessionStudentId: 'session-student', targetTermEnd: '',
    });
    const replayRepository = mockRepository({ existing: operation(requestHash) });
    const replay = await service(replayRepository).reserveSessionCredit(command());
    assert.equal(replay.replayed, true);
    assert.equal(replayRepository.plan, null);

    await assert.rejects(service(mockRepository({ existing: operation('different') }))
        .reserveSessionCredit(command()), hasCode('IDEMPOTENCY_CONFLICT'));

    const raced = mockRepository({ raceReplayAfterSend: true });
    assert.equal((await service(raced).reserveSessionCredit(command())).replayed, true);
});

test('implicit reservation retries a version conflict and preserves storage failures', async () => {
    const retry = mockRepository({ raceOnce: true });
    const result = await service(retry).reserveSessionCredit(command());
    assert.equal(result.creditStatus, 'reserved');
    assert.equal(retry.plans.length, 2);

    const failed = mockRepository({ sendError: new Error('batch failed') });
    await assert.rejects(service(failed).reserveSessionCredit(command()),
        (error) => error.code === 'COURSE_CREDIT_BATCH_FAILED');
});

test('implicit conversion helpers preserve target batch and rounding contracts', () => {
    assert.equal(sourceQuantityForTarget(conversionRule(), 3), 300);
    const stored = storedTargetBatch({ id: 'target', availableQuantity: 2, frozenQuantity: 0, version: 1 }, {
        activatedAt: NOW, availableQuantity: 1, effectiveExpiresAt: '2026-08-01T00:00:00Z',
        frozenQuantity: 1, status: 'active', version: 2,
    });
    assert.deepEqual(stored, {
        id: 'target', activatedAt: NOW, availableQuantity: 1,
        effectiveExpiresAt: '2026-08-01T00:00:00Z', frozenQuantity: 1,
        status: 'active', version: 1,
    });
    const materialized = { entries: [{
        source: { id: 'source' },
        target: {
            effectiveExpiresAt: '', sourceQuantity: 100, targetBatchId: 'target', targetQuantity: 1,
        },
    }] };
    assert.equal(conversionResult(authorization(), materialized, {
        preview: { previewHash: 'hash' }, rule: conversionRule(),
    }, 100).targets[0].sourceBatchId, 'source');

    assert.deepEqual(storedTargetBatch({ id: 'empty-target' }, {
        activatedAt: '', availableQuantity: 1, effectiveExpiresAt: '', frozenQuantity: 0, status: 'unactivated',
    }), {
        id: 'empty-target', activatedAt: '', availableQuantity: 1,
        effectiveExpiresAt: '', frozenQuantity: 0, status: 'unactivated', version: 1,
    });

    const idFactory = ids();
    const unreservedPlan = conversionMutationPlan(
        { idFactory },
        { actorId: 'student', studentId: 'student' },
        { rule: conversionRule() },
        { entries: [{
            source: sourceBatch({ version: 1 }),
            nextSource: sourceBatch({ availableQuantity: 100, consumedQuantity: 100, version: 2 }),
            initialTargetBatch: exactBatch({ id: 'unreserved-target' }),
            target: {
                activationDeadline: '', activationMode: 'GRANT_TIME', effectiveExpiresAt: '',
                sourceQuantity: 100, targetBatchId: 'unreserved-target', targetQuantity: 1,
            },
        }] },
        new Map(),
        {
            actor: { actorId: 'student' }, idFactory, now: NOW, operationId: 'operation',
            session: baseSession(), sessionStudent: baseSessionStudent(),
        }
    );
    assert.equal(requests(unreservedPlan, 'session_credit_allocations').length, 0);
    assert.equal(requests(unreservedPlan, 'credit_batches').find((item) => item.action === 'create').data.id,
        'unreserved-target');
});

function service(repository) {
    return new CourseCreditReservationService(repository, {
        clock: () => Date.parse(NOW), idFactory: ids(),
    });
}

function mockRepository(options = {}) {
    const rule = options.rule || conversionRule();
    const state = { sessionStudent: baseSessionStudent() };
    return {
        existing: options.existing || null,
        plan: null,
        plans: [],
        async findFirst() { return this.existing; },
        async get(collection, id) {
            if (collection === 'session_students') return state.sessionStudent;
            if (collection === 'sessions') return { ...baseSession(), ...(options.session || {}) };
            if (collection === 'conversion_authorizations') {
                return options.authorization === null ? null : (options.authorization || authorization({}, rule));
            }
            if (collection === 'conversion_rules') return rule;
            if (collection === 'credit_types') {
                return id === rule.sourceCreditTypeId
                    ? { id, kind: 'universal', consumable: false }
                    : { id, kind: 'course', courseSpecId: 'spec', consumable: true };
            }
            throw new Error(`Unexpected get ${collection}`);
        },
        async list(collection, query) {
            if (collection === 'credit_batches') {
                return query.filter.includes(`creditTypeId="${rule.sourceCreditTypeId}"`)
                    ? (options.sourceBatches || [sourceBatch()])
                    : (options.exactBatches || []);
            }
            if (collection === 'conversion_rules') return [rule];
            throw new Error(`Unexpected list ${collection}`);
        },
        async send(plan) {
            this.plan = plan;
            this.plans.push(plan);
            if (options.raceOnce && this.plans.length === 1) {
                state.sessionStudent = { ...state.sessionStudent, version: 4 };
                throw Object.assign(new Error('version conflict'), { status: 409 });
            }
            if (options.raceReplayAfterSend) {
                this.existing = plan.find((item) => item.collection === 'credit_operations').data;
                throw Object.assign(new Error('race'), { status: 409 });
            }
            if (options.sendError) throw options.sendError;
            return plan;
        },
    };
}

function command(changes = {}) {
    return {
        authorizationId: 'authorization', idempotencyKey: 'implicit-key',
        sessionStudentId: 'session-student', studentId: 'student', ...changes,
    };
}

function baseSession() {
    return {
        id: 'session', status: 'scheduled', startAt: SESSION_START,
        requiredCreditTypeId: 'course', requiredQuantity: 2,
    };
}

function baseSessionStudent() {
    return {
        id: 'session-student', sessionId: 'session', studentId: 'student',
        version: 3, creditStatus: 'pending',
    };
}

function conversionRule(changes = {}) {
    return {
        id: 'rule', sourceCreditTypeId: 'universal', targetCreditTypeId: 'course',
        sourceQuantity: 100, targetQuantity: 1, minSourceQuantity: 100, maxSourceQuantity: 1000,
        expiryPolicy: 'INHERIT_SOURCE', activationMode: 'GRANT_TIME', validityDurationDays: 0,
        activationDeadlineDays: 0, reversible: false, status: 'active',
        validFrom: '2026-01-01T00:00:00Z', validTo: '', version: 2, ...changes,
    };
}

function authorization(changes = {}, rule = conversionRule()) {
    return {
        id: 'authorization', studentId: 'student', ruleId: rule.id,
        sourceCreditTypeId: rule.sourceCreditTypeId, targetCreditTypeId: rule.targetCreditTypeId,
        termsFingerprint: conversionTermsFingerprint(rule), status: 'active',
        validFrom: '2026-07-01T00:00:00Z', validTo: '2026-08-01T00:00:00Z', ...changes,
    };
}

function sourceBatch(changes = {}) {
    return {
        id: 'source', studentId: 'student', creditTypeId: 'universal',
        originalQuantity: 200, availableQuantity: 200, frozenQuantity: 0,
        consumedQuantity: 0, expiredQuantity: 0, reversedQuantity: 0,
        status: 'active', validFrom: '2026-01-01T00:00:00Z',
        effectiveExpiresAt: '2026-08-01T00:00:00Z', activationMode: 'GRANT_TIME',
        activatedAt: '2026-01-01T00:00:00Z', expiryPolicy: 'FIXED_DURATION',
        listUnitValue: 1, paidUnitCost: 1, currency: 'CNY', priority: 0,
        version: 2, created: '2026-01-01T00:00:00Z', ...changes,
    };
}

function exactBatch(changes = {}) {
    return {
        ...sourceBatch({
            id: 'exact', creditTypeId: 'course', originalQuantity: 1,
            availableQuantity: 1, listUnitValue: 300, paidUnitCost: 280,
        }),
        ...changes,
    };
}

function operation(requestHash) {
    return {
        id: 'stored', requestSnapshot: { requestHash },
        resultSnapshot: { operationId: 'stored', creditStatus: 'reserved', allocations: [] },
    };
}

function requests(plan, collection) {
    return plan.filter((item) => item.collection === collection);
}

function update(plan, collection) {
    return plan.find((item) => item.action === 'update' && item.collection === collection)?.data;
}

async function reject(options, code) {
    await assert.rejects(service(mockRepository(options)).reserveSessionCredit(command()), hasCode(code));
}

function ids() {
    let value = 0;
    return () => String(++value).padStart(15, '0');
}

function hasCode(code) {
    return (error) => error instanceof CourseCreditError && error.code === code;
}
