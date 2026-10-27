const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseCreditOutboxService,
    deadLetterProjection,
    deliveryLimit,
    deliverySummary,
    dueFilter,
    safeErrorCode,
    validateOutboxEvent,
} = require('../src/services/courseCredits/outboxService');

const NOW = '2026-08-21T10:00:00.000Z';

test('outbox worker claims and sends committed events with provider idempotency', async () => {
    const repository = mockRepository({ events: [outboxEvent()] });
    const deliveries = [];
    const service = createService(repository, {
        dispatcher: { async deliver(message) { deliveries.push(message); } },
    });
    const result = await service.deliverDue();

    assert.deepEqual(result, {
        attempted: 1, deadLetter: 0, failed: 0, sent: 1,
        results: [{ eventId: 'event-1', status: 'sent' }],
    });
    assert.equal(repository.queries[0].collection, 'outbox_events');
    assert.match(repository.queries[0].options.filter, /status="processing"/);
    assert.deepEqual(deliveries, [{
        aggregateId: 'order-1', aggregateType: 'order', idempotencyKey: 'event-1',
        payload: { operationId: 'operation' }, topic: 'course-credit.order-granted',
    }]);
    assert.equal(repository.plans.length, 2);
    assert.equal(repository.plans[0][0].data.status, 'processing');
    assert.equal(repository.plans[1][0].data.status, 'sent');
    assert.equal(repository.plans[1][0].data.attempts, 1);
    assert.equal(repository.plans[1][0].data.sentAt, NOW);
});

test('provider failure schedules exponential retry with a privacy-safe code', async () => {
    const repository = mockRepository({ events: [outboxEvent()] });
    const service = createService(repository, {
        dispatcher: { async deliver() { throw Object.assign(new Error('private details'), { code: 'PROVIDER_DOWN' }); } },
    });
    const result = await service.deliverDue({ limit: 1 });
    const failure = repository.plans[1][0].data;

    assert.equal(result.failed, 1);
    assert.equal(failure.status, 'failed');
    assert.equal(failure.lastErrorCode, 'PROVIDER_DOWN');
    assert.equal(failure.nextAttemptAt, '2026-08-21T10:01:00.000Z');
    assert.equal(JSON.stringify(failure).includes('private details'), false);
});

test('final failed attempt becomes visible as a dead letter', async () => {
    const repository = mockRepository({ events: [outboxEvent({ attempts: 2 })] });
    const service = createService(repository, {
        dispatcher: { async deliver() { throw Object.assign(new Error('failed'), { code: 'HTTP_503' }); } },
        maxAttempts: 3,
    });
    const result = await service.deliverDue();
    const failure = repository.plans[1][0].data;

    assert.equal(result.deadLetter, 1);
    assert.equal(failure.status, 'dead_letter');
    assert.equal(failure.deadLetterAt, NOW);
    assert.equal(failure.nextAttemptAt, '');
});

test('worker retries stale processing events and respects batch limits', async () => {
    const repository = mockRepository({ events: [outboxEvent(), outboxEvent({ id: 'event-2' })] });
    const service = createService(repository, {
        dispatcher: { async deliver() {} },
        staleProcessingMs: 120_000,
    });
    const result = await service.deliverDue({ limit: 1 });

    assert.equal(result.attempted, 1);
    assert.match(repository.queries[0].options.filter, /processingStartedAt<="2026-08-21 09:58:00\.000Z"/);
    assert.equal(repository.plans.length, 2);
});

test('claim failure prevents external delivery', async () => {
    let deliveryCount = 0;
    const repository = mockRepository({
        events: [outboxEvent()],
        sendErrorAt: 1,
    });
    const service = createService(repository, {
        dispatcher: { async deliver() { deliveryCount += 1; } },
    });

    await assert.rejects(service.deliverDue(), /storage failed/);
    assert.equal(deliveryCount, 0);
});

test('dead-letter listing is paginated and omits payload contents', async () => {
    const repository = mockRepository({ events: [
        outboxEvent({ id: 'dead-1', status: 'dead_letter', lastErrorCode: 'HTTP_500' }),
        outboxEvent({ id: 'dead-2', status: 'dead_letter', lastErrorCode: '' }),
        outboxEvent({ id: 'dead-3', status: 'dead_letter' }),
    ] });
    const result = await createService(repository).listDeadLetters({ page: 2, perPage: 2 });

    assert.equal(result.totalItems, 3);
    assert.equal(result.totalPages, 2);
    assert.deepEqual(result.items.map((item) => item.id), ['dead-3']);
    assert.equal(Object.hasOwn(result.items[0], 'payload'), false);
    assert.equal(repository.queries[0].options.filter, 'status="dead_letter"');
});

test('outbox validation and helper contracts reject unsafe inputs', async () => {
    assert.throws(() => createService(mockRepository(), { maxAttempts: 0 }), hasCode('OUTBOX_CONFIGURATION_INVALID'));
    assert.throws(() => deliveryLimit(0), hasCode('OUTBOX_LIMIT_INVALID'));
    assert.throws(() => deliveryLimit(201), hasCode('OUTBOX_LIMIT_INVALID'));
    assert.equal(deliveryLimit(undefined), 50);
    assert.equal(safeErrorCode({ code: 'http_429' }), 'HTTP_429');
    assert.equal(safeErrorCode({ code: 'private message!' }), 'DELIVERY_FAILED');
    assert.equal(safeErrorCode(), 'DELIVERY_FAILED');
    assert.match(dueFilter(NOW, '2026-08-21T09:55:00.000Z'), /nextAttemptAt<="2026-08-21 10:00:00\.000Z"/);
    assert.match(dueFilter(NOW, '2026-08-21T09:55:00.000Z'), /processingStartedAt<="2026-08-21 09:55:00\.000Z"/);
    assert.deepEqual(deliverySummary([]), {
        attempted: 0, deadLetter: 0, failed: 0, results: [], sent: 0,
    });
    assert.equal(deadLetterProjection(outboxEvent({ attempts: '', lastErrorCode: '' })).attempts, 0);
    assert.throws(() => validateOutboxEvent(null), hasCode('OUTBOX_EVENT_INVALID'));
    assert.throws(() => validateOutboxEvent(outboxEvent({ topic: '' })), hasCode('OUTBOX_EVENT_INVALID'));
    assert.throws(() => validateOutboxEvent(outboxEvent({ attempts: -1 })), hasCode('OUTBOX_ATTEMPTS_INVALID'));
    await assert.rejects(createService(mockRepository()).deliverDue(), hasCode('OUTBOX_DISPATCHER_REQUIRED'));
});

function createService(repository, options = {}) {
    return new CourseCreditOutboxService(repository, {
        clock: () => Date.parse(NOW),
        ...options,
    });
}

function mockRepository(options = {}) {
    return {
        events: options.events || [],
        plans: [],
        queries: [],
        async list(collection, query) {
            this.queries.push({ collection, options: query });
            return this.events;
        },
        async send(plan) {
            this.plans.push(plan);
            if (options.sendErrorAt === this.plans.length) throw new Error('storage failed');
            return plan;
        },
    };
}

function outboxEvent(changes = {}) {
    return {
        id: 'event-1', topic: 'course-credit.order-granted', aggregateType: 'order', aggregateId: 'order-1',
        payload: { operationId: 'operation' }, status: 'pending', attempts: 0,
        created: '2026-08-21T09:00:00.000Z', deadLetterAt: NOW,
        ...changes,
    };
}

function hasCode(code) {
    return (error) => error.code === code;
}
