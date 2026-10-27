const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseCreditExpiryService,
    dueBatchFilter,
    expiryAt,
    expiryLimit,
    partitionAllocations,
    relationId,
    safeErrorCode,
} = require('../src/services/courseCredits/expiryService');

const NOW = '2026-07-17T00:00:00.000Z';

test('expiry worker atomically expires available and invalid frozen credits while protecting service-time reservations', async () => {
    const repository = mockRepository({
        allocations: [
            allocation('protected', 'student-protected', 2, '2026-06-30T10:00:00Z'),
            allocation('invalid', 'student-invalid', 2, '2026-07-18T10:00:00Z'),
        ],
        batch: creditBatch(),
        sessionStudents: [sessionStudent('student-invalid')],
    });
    const service = createService(repository);

    const result = await service.expireDue({ actorId: 'scheduler', now: NOW });

    assert.deepEqual(result, {
        scanned: 1,
        expiredBatches: 1,
        expiredQuantity: 5,
        expiredReservations: 1,
        operationIds: ['id-1'],
        protectedReservations: 1,
    });
    assert.equal(repository.plans.length, 1);
    const plan = repository.plans[0];
    assert.deepEqual(findUpdate(plan, 'credit_batches').data, {
        availableQuantity: 0,
        frozenQuantity: 2,
        expiredQuantity: 5,
        status: 'active',
        version: 3,
    });
    assert.equal(findUpdate(plan, 'session_credit_allocations').id, 'invalid');
    assert.deepEqual(findUpdate(plan, 'session_students').data, {
        creditStatus: 'credit_insufficient', eligibilityReason: 'CREDIT_EXPIRED', version: 2,
    });
    assert.equal(plan.filter((request) => request.collection === 'credit_version_claims').length, 2);
    assert.deepEqual(plan.filter((request) => request.collection === 'credit_events').map(
        (request) => [request.data.bucketFrom, request.data.quantityDelta]
    ), [['availableQuantity', 3], ['frozenQuantity', 2]]);
    assert.equal(plan.find((request) => request.collection === 'credit_operations').data.idempotencyKey,
        'expireBatch:batch:v2');
    assert.equal(plan.at(-1).collection, 'outbox_events');
});

test('expiry worker expires every reservation when an unactivated batch misses its activation deadline', async () => {
    const batch = creditBatch({
        activatedAt: '', activationDeadline: '2026-07-16T00:00:00Z',
        availableQuantity: 1, frozenQuantity: 1, consumedQuantity: 0, originalQuantity: 2,
        effectiveExpiresAt: '', status: 'unactivated',
    });
    const repository = mockRepository({
        allocations: [allocation('deadline-allocation', 'deadline-student', 1, '2026-07-20T10:00:00Z')],
        batch,
        sessionStudents: [sessionStudent('deadline-student')],
    });

    const result = await createService(repository).expireDue({ now: NOW });

    assert.equal(result.expiredQuantity, 2);
    assert.deepEqual(findUpdate(repository.plans[0], 'credit_batches').data, {
        availableQuantity: 0, frozenQuantity: 0, expiredQuantity: 2, status: 'expired', version: 3,
    });
});

test('expiry worker is a no-op when all frozen credits remain protected', async () => {
    const repository = mockRepository({
        allocations: [allocation('protected', 'student-protected', 2, '2026-06-30T10:00:00Z')],
        batch: creditBatch({ availableQuantity: 0, frozenQuantity: 2, consumedQuantity: 3, originalQuantity: 5 }),
    });

    const result = await createService(repository).expireDue({ now: NOW });

    assert.equal(result.expiredBatches, 0);
    assert.equal(result.protectedReservations, 1);
    assert.equal(repository.plans.length, 0);
});

test('expiry worker retries a version race from current storage state without duplicating events', async () => {
    const repository = mockRepository({
        batch: creditBatch({ availableQuantity: 3, frozenQuantity: 0, originalQuantity: 6 }),
        raceToExpired: true,
    });

    const result = await createService(repository).expireDue({ now: NOW });

    assert.equal(result.expiredBatches, 0);
    assert.equal(repository.sendAttempts, 1);
    assert.equal(repository.plans.length, 0);
});

test('expiry worker reports safe per-batch failures after continuing the scan', async () => {
    const repository = mockRepository({ batch: creditBatch(), sendError: Object.assign(new Error('private'), { code: 'DB_DOWN' }) });

    await assert.rejects(
        createService(repository).expireDue({ now: NOW }),
        (error) => error.code === 'COURSE_CREDIT_EXPIRY_RUN_FAILED'
            && error.status === 503
            && error.details.failed[0].errorCode === 'DB_DOWN'
    );
});

test('expiry worker uses default configuration and accepts an empty repository page', async () => {
    const repository = {
        async page() { return {}; },
    };

    const result = await new CourseCreditExpiryService(repository).expireDue({ now: NOW });

    assert.deepEqual(result, {
        scanned: 0,
        expiredBatches: 0,
        expiredQuantity: 0,
        expiredReservations: 0,
        operationIds: [],
        protectedReservations: 0,
    });
});

test('expiry worker assigns a stable code to uncategorized storage failures', async () => {
    const repository = mockRepository({ batch: creditBatch(), sendError: new Error('private') });

    await assert.rejects(
        createService(repository).expireDue({ now: NOW }),
        (error) => error.details.failed[0].errorCode === 'COURSE_CREDIT_EXPIRY_FAILED'
    );
});

test('expiry worker rejects corrupt reserved allocation quantities before storage writes', async () => {
    const repository = mockRepository({
        allocations: [allocation('corrupt', 'student', 0, '2026-07-18T00:00:00Z')],
        batch: creditBatch(),
    });

    await assert.rejects(
        createService(repository).expireDue({ now: NOW }),
        (error) => error.details.failed[0].errorCode === 'ALLOCATION_QUANTITY_INVALID'
    );
    assert.equal(repository.sendAttempts, 0);
});

test('expiry helper contracts validate limits, dates, relations, filters, and safe errors', () => {
    assert.equal(expiryLimit(undefined), 100);
    assert.equal(expiryLimit('200'), 200);
    assert.throws(() => expiryLimit(0), hasCode('EXPIRY_LIMIT_INVALID'));
    assert.throws(() => expiryLimit(201), hasCode('EXPIRY_LIMIT_INVALID'));
    assert.equal(expiryAt(undefined, () => Date.parse(NOW)), NOW);
    assert.throws(() => expiryAt('bad', Date.now), hasCode('EXPIRY_RUN_AT_INVALID'));
    assert.match(dueBatchFilter(NOW), /activationDeadline/);
    assert.equal(relationId([{ id: 'relation' }]), 'relation');
    assert.equal(relationId({}), '');
    assert.equal(relationId(null), '');
    assert.equal(relationId(42), '');
    assert.equal(safeErrorCode(), 'COURSE_CREDIT_EXPIRY_FAILED');
    assert.equal(safeErrorCode({ code: 'bad private code' }), 'COURSE_CREDIT_EXPIRY_FAILED');
    const split = partitionAllocations(creditBatch(), [
        allocation('valid', 'student', 1, '2026-06-01T00:00:00Z'),
        allocation('invalid', 'student', 1, '2026-08-01T00:00:00Z'),
    ], false);
    assert.equal(split.protected.length, 1);
    assert.equal(split.invalid.length, 1);
});

function createService(repository) {
    let sequence = 0;
    return new CourseCreditExpiryService(repository, {
        clock: () => Date.parse(NOW),
        idFactory: () => `id-${++sequence}`,
    });
}

function mockRepository(options = {}) {
    const state = {
        batch: options.batch,
        plans: [],
        sendAttempts: 0,
        async page() { return { items: this.batch ? [this.batch] : [] }; },
        async list(collection) { return collection === 'session_credit_allocations' ? (options.allocations || []) : []; },
        async get(collection, id) {
            if (collection === 'credit_batches') return this.batch;
            return (options.sessionStudents || []).find((student) => student.id === id);
        },
        async send(plan) {
            this.sendAttempts += 1;
            if (options.raceToExpired && this.sendAttempts === 1) {
                this.batch = {
                    ...this.batch,
                    availableQuantity: 0,
                    expiredQuantity: this.batch.expiredQuantity + this.batch.availableQuantity,
                    status: this.batch.frozenQuantity > 0 ? 'active' : 'depleted',
                    version: this.batch.version + 1,
                };
                throw Object.assign(new Error('version conflict'), { status: 409 });
            }
            if (options.sendError) throw options.sendError;
            this.plans.push(plan);
        },
    };
    return state;
}

function creditBatch(overrides = {}) {
    return {
        id: 'batch', studentId: 'student', creditTypeId: 'credit-type',
        originalQuantity: 10, availableQuantity: 3, frozenQuantity: 4,
        consumedQuantity: 3, expiredQuantity: 0, reversedQuantity: 0,
        status: 'active', validFrom: '2026-01-01T00:00:00Z',
        effectiveExpiresAt: '2026-07-01T00:00:00Z', activationDeadline: '',
        activatedAt: '2026-01-01T00:00:00Z', version: 2,
        ...overrides,
    };
}

function allocation(id, sessionStudentId, quantity, reservedForStartAt) {
    return { id, sessionStudentId, quantity, reservedForStartAt, status: 'reserved' };
}

function sessionStudent(id) {
    return { id, creditStatus: 'reserved', version: 1 };
}

function findUpdate(plan, collection) {
    return plan.find((request) => request.action === 'update' && request.collection === collection);
}

function hasCode(code) {
    return (error) => error.code === code;
}
