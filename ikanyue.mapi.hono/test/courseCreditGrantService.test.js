const test = require('node:test');
const assert = require('node:assert/strict');

const { CourseCreditError } = require('../src/services/courseCredits/domain');
const {
    CourseCreditGrantService,
    balanceSnapshot,
    buildGrantBatch,
    normalizeGrantSnapshot,
    positiveVersion,
} = require('../src/services/courseCredits/grantService');
const { fingerprintRequest } = require('../src/services/courseCredits/repositories/operationRepository');

test('Hono grant service builds one atomic SDK batch for a direct package', async () => {
    const repository = mockRepository();
    const service = createService(repository);

    const result = await service.grantOrderCredits(command());

    assert.equal(result.replayed, false);
    assert.equal(result.batches.length, 1);
    assert.deepEqual(repository.plan.map((item) => `${item.action}:${item.collection}`), [
        'create:credit_operations',
        'create:credit_version_claims',
        'create:credit_batches',
        'create:credit_events',
        'update:orders',
        'create:outbox_events',
    ]);
    const operation = data(repository.plan, 'credit_operations');
    const claim = data(repository.plan, 'credit_version_claims');
    const batch = data(repository.plan, 'credit_batches');
    const event = data(repository.plan, 'credit_events');
    assert.equal(operation.idempotencyKey, 'grantOrderCredits:grant-key');
    assert.equal(operation.status, 'committed');
    assert.equal(operation.reason, 'order_grant');
    assert.equal(operation.outcome, 'committed');
    assert.deepEqual(operation.beforeSummary, { orderId: 'order', status: 'paid', version: 4 });
    assert.equal(operation.afterSummary.batchesCount, 1);
    assert.equal(claim.entityType, 'order');
    assert.equal(claim.expectedVersion, 4);
    assert.equal(batch.originalQuantity, 10);
    assert.equal(batch.status, 'unactivated');
    assert.equal(batch.expiryPolicy, 'FIXED_DURATION');
    assert.equal(batch.grantSnapshot.paidUnitCost, 280);
    assert.equal(event.eventType, 'GRANT');
    assert.equal(event.actorId, 'operator');
    assert.equal(event.balanceSnapshot.availableQuantity, 10);
    assert.deepEqual(repository.plan.find((item) => item.collection === 'orders').data, { status: 'granted', version: 5 });
});

test('Hono grant service supports universal recharge and immediate no-expiry activation', async () => {
    const repository = mockRepository({
        order: {
            type: 'universal_recharge',
            grantSnapshot: [{
                creditTypeId: 'universal', quantity: 3000, activationMode: 'GRANT_TIME',
                expiryPolicy: 'NO_EXPIRY', listUnitValue: 1, paidUnitCost: 0.9,
            }],
        },
        creditTypes: {
            universal: { id: 'universal', kind: 'universal', consumable: false },
        },
    });
    const result = await createService(repository).grantOrderCredits(command());
    const batch = data(repository.plan, 'credit_batches');
    assert.equal(result.batches[0].effectiveExpiresAt, null);
    assert.equal(batch.status, 'active');
    assert.equal(batch.activatedAt, '2026-07-17T10:00:00.000Z');
    assert.equal(batch.currency, 'CNY');
    assert.equal(batch.priority, 0);
});

test('Hono grant service replays stored results and rejects conflicting reuse', async () => {
    const requestHash = fingerprintRequest({ orderId: 'order', traceId: '' });
    const replayRepository = mockRepository({
        existing: {
            id: 'operation', status: 'committed',
            requestSnapshot: { requestHash }, resultSnapshot: { operationId: 'operation', batches: [] },
        },
    });
    const replay = await createService(replayRepository).grantOrderCredits(command());
    assert.equal(replay.replayed, true);
    assert.equal(replayRepository.plan, null);

    const conflictRepository = mockRepository({
        existing: {
            id: 'operation', status: 'committed',
            requestSnapshot: { requestHash: 'different' }, resultSnapshot: {},
        },
    });
    await assert.rejects(createService(conflictRepository).grantOrderCredits(command()), hasCode('IDEMPOTENCY_CONFLICT'));
});

test('Hono grant service resolves a same-request race after Batch API conflict', async () => {
    const repository = mockRepository({ raceAfterSend: true });
    const result = await createService(repository).grantOrderCredits(command());
    assert.equal(result.replayed, true);
    assert.equal(result.operationId, 'raced-operation');
});

test('duplicate payment delivery replays once and cannot grant the same order twice', async () => {
    const repository = mockRepository({ commitState: true });
    const service = createService(repository);
    const paymentCommand = command({ idempotencyKey: 'payment:provider-event-1' });

    const first = await service.grantOrderCredits(paymentCommand);
    const replay = await service.grantOrderCredits(paymentCommand);
    await assert.rejects(
        service.grantOrderCredits(command({ idempotencyKey: 'payment:provider-event-1-duplicate' })),
        hasCode('ORDER_NOT_PAID')
    );

    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(repository.plans.length, 1);
    assert.equal(repository.order.status, 'granted');
});

test('cancelled orders cannot create any grant operation', async () => {
    const repository = mockRepository({ order: { status: 'cancelled' } });
    await assert.rejects(createService(repository).grantOrderCredits(command()), hasCode('ORDER_NOT_PAID'));
    assert.equal(repository.plan, null);
});

test('Hono grant service preserves non-idempotency storage failures', async () => {
    const repository = mockRepository({ sendError: Object.assign(new Error('storage down'), { code: 'PB_DOWN' }) });
    await assert.rejects(createService(repository).grantOrderCredits(command()), (error) => error.code === 'PB_DOWN');

    const unknown = mockRepository({ sendError: new Error('batch failed') });
    await assert.rejects(createService(unknown).grantOrderCredits(command()), (error) => error.code === 'COURSE_CREDIT_BATCH_FAILED');
});

test('Hono grant service rejects invalid order, snapshot, credit, activation, expiry, and cost inputs', async () => {
    await assertRejects({}, { orderId: '' }, 'ORDER_ID_REQUIRED');
    await assertRejects({}, { idempotencyKey: '' }, 'IDEMPOTENCY_KEY_REQUIRED');
    await assertRejects({ order: { status: 'cancelled' } }, {}, 'ORDER_NOT_PAID');
    await assertRejects({ order: { grantSnapshot: { lines: [] } } }, {}, 'ORDER_GRANT_SNAPSHOT_INVALID');
    await assertRejects({ order: { grantSnapshot: { lines: [{ quantity: 1 }] } } }, {}, 'ORDER_GRANT_SNAPSHOT_INVALID');
    await assertRejects({ creditTypes: { course: null } }, {}, 'CREDIT_TYPE_INVALID');
    await assertRejects({ creditTypes: { course: { id: 'course', kind: 'universal', consumable: true } } }, {}, 'CREDIT_TYPE_INVALID');
    await assertRejects({ order: { type: 'offline' } }, {}, 'ORDER_TYPE_INVALID');
    await assertRejects({ order: { type: 'universal_recharge' } }, {}, 'ORDER_CREDIT_TYPE_MISMATCH');
    await assertRejects({ order: { grantSnapshot: snapshot({ activationMode: 'BAD' }) } }, {}, 'INVALID_ACTIVATION_MODE');
    await assertRejects({ order: { grantSnapshot: snapshot({ expiryPolicy: 'BAD' }) } }, {}, 'INVALID_EXPIRY_POLICY');
    await assertRejects({ order: { grantSnapshot: snapshot({ activationDeadlineDays: -1 }) } }, {}, 'ACTIVATION_DEADLINE_REQUIRED');
    await assertRejects({ order: { grantSnapshot: snapshot({ validityDurationDays: -1 }) } }, {}, 'INVALID_DURATION_DAYS');
    await assertRejects({ order: { grantSnapshot: snapshot({ listUnitValue: 'bad' }) } }, {}, 'ORDER_GRANT_SNAPSHOT_INVALID');
    await assertRejects({ order: { grantSnapshot: snapshot({ expiryPolicy: 'TERM_END', termEnd: 'bad' }) } }, {}, 'INVALID_DATE');
});

test('grant helpers preserve policy defaults, term expiry, balance, and legacy versions', () => {
    assert.deepEqual(normalizeGrantSnapshot([{ creditTypeId: 'x', quantity: 1 }]).defaults, {});
    assert.equal(positiveVersion(undefined), 1);
    assert.equal(positiveVersion(2), 2);
    const built = buildGrantBatch({
        at: '2026-07-17T10:00:00Z',
        creditType: { kind: 'course', consumable: true, courseSpecId: 'spec' },
        idFactory: ids(),
        line: snapshot({ activationMode: 'GRANT_TIME', expiryPolicy: 'TERM_END', termEnd: '2026-12-31T00:00:00Z' }).lines[0],
        operationId: 'operation',
        order: baseOrder(),
        snapshot: { defaults: { validFrom: '2026-07-01T00:00:00Z', priority: 2 }, lines: [] },
    });
    assert.equal(built.batch.effectiveExpiresAt, '2026-12-31T00:00:00.000Z');
    assert.equal(built.batch.validFrom, '2026-07-01T00:00:00Z');
    assert.equal(built.batch.priority, 2);
    assert.deepEqual(balanceSnapshot(built.batch), built.event.balanceSnapshot);
});

async function assertRejects(repositoryOptions, commandChanges, code) {
    const repository = mockRepository(repositoryOptions);
    await assert.rejects(createService(repository).grantOrderCredits(command(commandChanges)), hasCode(code));
}

function createService(repository) {
    return new CourseCreditGrantService(repository, {
        clock: () => Date.parse('2026-07-17T10:00:00Z'),
        idFactory: ids(),
    });
}

function mockRepository(options = {}) {
    const order = { ...baseOrder(), ...(options.order || {}) };
    const creditTypes = options.creditTypes || {
        course: { id: 'course', kind: 'course', consumable: true, courseSpecId: 'spec' },
    };
    const repository = {
        plan: null,
        plans: [],
        order,
        existing: options.existing || null,
        async get(collection, id) {
            if (collection === 'orders') return order;
            if (collection === 'credit_types') return creditTypes[id] ?? null;
            throw new Error(`Unexpected collection ${collection}`);
        },
        async findFirst(collection, filter = '') {
            if (options.commitState && this.existing && !filter.includes(`"${this.existing.idempotencyKey}"`)) {
                return null;
            }
            return this.existing;
        },
        async send(plan) {
            this.plan = plan;
            this.plans.push(plan);
            if (options.raceAfterSend) {
                const operation = data(plan, 'credit_operations');
                this.existing = {
                    id: 'raced-operation', status: 'committed',
                    requestSnapshot: operation.requestSnapshot,
                    resultSnapshot: { ...operation.resultSnapshot, operationId: 'raced-operation' },
                };
                throw new Error('unique conflict');
            }
            if (options.sendError) throw options.sendError;
            if (options.commitState) {
                this.existing = data(plan, 'credit_operations');
                Object.assign(order, plan.find((item) => item.collection === 'orders').data);
            }
            return plan.map((item) => item.data || {});
        },
    };
    return repository;
}

function baseOrder() {
    return {
        id: 'order', studentId: 'student', status: 'paid', type: 'package_purchase',
        currency: 'CNY', version: 4, grantSnapshot: snapshot(),
    };
}

function snapshot(changes = {}) {
    return { lines: [{
        creditTypeId: 'course', quantity: 10, activationMode: 'FIRST_CHECK_IN',
        activationDeadlineDays: 90, validityDurationDays: 180, expiryPolicy: 'FIXED_DURATION',
        listUnitValue: 300, paidUnitCost: 280, currency: 'CNY', ...changes,
    }] };
}

function command(changes = {}) {
    return { orderId: 'order', idempotencyKey: 'grant-key', actorId: 'operator', ...changes };
}

function ids() {
    let value = 0;
    return () => String(++value).padStart(15, '0');
}

function data(plan, collection) {
    return plan.find((item) => item.collection === collection)?.data;
}

function hasCode(code) {
    return (error) => error instanceof CourseCreditError && error.code === code;
}
