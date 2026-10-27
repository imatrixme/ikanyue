const test = require('node:test');
const assert = require('node:assert/strict');

const {
    bucketTotal,
    compareEvents,
    reconstructBatch,
    replayEvent,
    summarizeAllocations,
} = require('../src/services/courseCredits/domain');
const {
    CourseCreditReconciliationService,
    exceptionRecord,
    validateScope,
    validateSince,
} = require('../src/services/courseCredits/reconciliationService');

const NOW = '2026-08-22T10:00:00.000Z';

test('event replay reconstructs buckets independently from stored balance snapshots', () => {
    const result = reconstructBatch(
        batch(),
        [
            event('consume', 'CONSUME', -1, 'frozenQuantity', 'consumedQuantity', 3),
            event('grant', 'GRANT', 2, '', 'availableQuantity', 1),
            event('freeze', 'FREEZE', -1, 'availableQuantity', 'frozenQuantity', 2),
            event('convert', 'CONVERT_OUT', -1, 'availableQuantity', 'consumedQuantity', 4),
        ],
        [allocation('consumed', 1)]
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.expected, {
        availableQuantity: 0,
        consumedQuantity: 2,
        expiredQuantity: 0,
        frozenQuantity: 0,
        reversedQuantity: 0,
    });
    assert.equal(bucketTotal(result.expected), 2);
});

test('reconciliation reports snapshot, conservation, event, and allocation drift without mutation', () => {
    const stored = batch({ availableQuantity: 2, consumedQuantity: 2, originalQuantity: 3 });
    const result = reconstructBatch(stored, [
        event('grant', 'GRANT', 2, '', 'availableQuantity', 1),
        event('bad-bucket', 'FREEZE', -1, 'unknown', 'frozenQuantity', 2),
        event('wrong-batch', 'GRANT', 1, '', 'availableQuantity', 3, { batchId: 'other' }),
        event('duplicate', 'FREEZE', -1, 'availableQuantity', 'frozenQuantity', 4),
        event('duplicate', 'FREEZE', -1, 'availableQuantity', 'frozenQuantity', 5),
        event('underflow', 'CONSUME', -2, 'frozenQuantity', 'consumedQuantity', 6),
        event('missing-movement', 'ADJUST', 1, '', '', 7),
        event('', 'ADJUST', 1, '', 'availableQuantity', 8),
        event('bad-quantity', 'ADJUST', 0.5, '', 'availableQuantity', 9),
    ], [
        allocation('reserved', 1),
        allocation('unknown', 1),
        allocation('reserved', 1, { batchId: 'other' }),
    ]);
    const codes = new Set(result.differences.map((item) => item.code));

    assert.equal(result.ok, false);
    for (const code of [
        'BUCKET_MISMATCH', 'SNAPSHOT_CONSERVATION_MISMATCH', 'EVENT_BUCKET_INVALID',
        'EVENT_BATCH_MISMATCH', 'DUPLICATE_EVENT', 'EVENT_SOURCE_UNDERFLOW',
        'EVENT_MOVEMENT_MISSING', 'EVENT_ID_INVALID', 'EVENT_QUANTITY_INVALID',
        'ALLOCATION_INVALID', 'ALLOCATION_BATCH_MISMATCH', 'RESERVED_ALLOCATION_MISMATCH',
    ]) assert.ok(codes.has(code), code);
    assert.equal(stored.availableQuantity, 2);
});

test('full reconciliation persists a passed run and never updates ledger snapshots', async () => {
    const repository = mockRepository({
        batches: [batch()],
        eventsByBatch: { batch: [event('grant', 'GRANT', 2, '', 'availableQuantity', 1),
            event('convert', 'CONVERT_OUT', -2, 'availableQuantity', 'consumedQuantity', 2)] },
    });
    const result = await service(repository).run({ scope: 'full' });

    assert.deepEqual(result, {
        batchCount: 1, differenceCount: 0, runId: 'reconcile0001',
        scope: 'full', since: '', status: 'passed',
    });
    assert.equal(repository.plans.length, 1);
    assert.equal(repository.plans[0][0].collection, 'reconciliation_runs');
    assert.equal(repository.plans[0].some((item) => item.action === 'update'), false);
});

test('failed reconciliation appends review exceptions without rewriting the batch', async () => {
    const repository = mockRepository({
        batches: [batch({ availableQuantity: 2, consumedQuantity: 0 })],
        eventsByBatch: { batch: [event('grant', 'GRANT', 2, '', 'availableQuantity', 1),
            event('convert', 'CONVERT_OUT', -2, 'availableQuantity', 'consumedQuantity', 2)] },
    });
    const result = await service(repository).run({ scope: 'full' });
    const exceptions = repository.plans[0].filter((item) => item.collection === 'reconciliation_exceptions');

    assert.equal(result.status, 'failed');
    assert.equal(result.differenceCount, 2);
    assert.equal(exceptions.length, 2);
    assert.ok(exceptions.every((item) => item.action === 'create' && item.data.status === 'open'));
    assert.equal(repository.plans[0].some((item) => item.collection === 'credit_batches'), false);
});

test('incremental reconciliation unions changed batches with batches referenced by new events', async () => {
    const repository = mockRepository({
        batches: [batch({ id: 'batch-a' })],
        changedEvents: [{ batchId: 'batch-b' }],
        fetchedBatches: { 'batch-b': batch({ id: 'batch-b' }) },
        eventsByBatch: {
            'batch-a': [event('grant-a', 'GRANT', 2, '', 'availableQuantity', 1, { batchId: 'batch-a' }),
                event('consume-a', 'CONVERT_OUT', -2, 'availableQuantity', 'consumedQuantity', 2,
                    { batchId: 'batch-a' })],
            'batch-b': [event('grant-b', 'GRANT', 2, '', 'availableQuantity', 1, { batchId: 'batch-b' }),
                event('consume-b', 'CONVERT_OUT', -2, 'availableQuantity', 'consumedQuantity', 2,
                    { batchId: 'batch-b' })],
        },
    });
    const result = await service(repository).run({
        scope: 'incremental',
        since: '2026-08-20T00:00:00+08:00',
    });

    assert.equal(result.batchCount, 2);
    assert.equal(result.since, '2026-08-19T16:00:00.000Z');
    assert.deepEqual(repository.gets, [['credit_batches', 'batch-b']]);
    assert.ok(repository.queries.some((item) => item.options.filter?.includes('updated>=')));
    assert.ok(repository.queries.some((item) => item.options.filter?.includes('created>=')));
});

test('reconciliation validates scope, incremental time, and storage failures', async () => {
    await assert.rejects(service(mockRepository()).run({ scope: 'student' }), hasCode('RECONCILIATION_SCOPE_INVALID'));
    await assert.rejects(service(mockRepository()).run({ scope: 'incremental' }),
        hasCode('RECONCILIATION_SINCE_REQUIRED'));
    await assert.rejects(service(mockRepository({ sendError: new Error('storage') })).run({ scope: 'full' }),
        /storage/);
    assert.equal(validateScope('full'), 'full');
    assert.equal(validateSince('2026-08-20T00:00:00Z'), '2026-08-20T00:00:00.000Z');
});

test('reconciliation helpers cover ordering, malformed snapshots, and exception projection', () => {
    const events = [
        event('freeze', 'FREEZE', -1, 'availableQuantity', 'frozenQuantity', 1),
        event('grant', 'GRANT', 1, '', 'availableQuantity', 1),
    ].sort(compareEvents);
    assert.deepEqual(events.map((item) => item.eventType), ['GRANT', 'FREEZE']);
    const unknownEvents = [
        { id: 'z', batchId: 'batch', eventType: 'UNKNOWN' },
        { id: 'a', batchId: 'batch', eventType: 'UNKNOWN' },
    ].sort(compareEvents);
    assert.deepEqual(unknownEvents.map((item) => item.id), ['a', 'z']);
    const differences = [];
    const summary = summarizeAllocations('batch', [{ ...allocation('reserved', 'bad'), quantity: 'bad' }], differences);
    assert.equal(summary.reserved, 0);
    assert.equal(differences[0].code, 'ALLOCATION_INVALID');
    const statusDifferences = [];
    summarizeAllocations('batch', [allocation('unknown', 1)], statusDifferences);
    assert.equal(statusDifferences[0].code, 'ALLOCATION_INVALID');
    const replayDifferences = [];
    const buckets = {
        availableQuantity: 0, consumedQuantity: 0, expiredQuantity: 0, frozenQuantity: 0, reversedQuantity: 0,
    };
    replayEvent('batch', buckets, null, new Set(), replayDifferences);
    replayEvent('batch', buckets, { id: 1 }, new Set(), replayDifferences);
    replayEvent('batch', buckets, {
        id: 'activate', batchId: 'batch', eventType: 'ACTIVATE', quantityDelta: undefined,
    }, new Set(), replayDifferences);
    assert.equal(replayDifferences[0].code, 'EVENT_ID_INVALID');
    assert.equal(replayDifferences[1].code, 'EVENT_ID_INVALID');
    const record = exceptionRecord('exception', 'run', NOW, {
        batchId: 'batch', code: 'CODE', field: 'field', expected: 'text', actual: 2,
    });
    assert.equal(record.actualValue, 2);
    assert.equal(Object.hasOwn(record, 'expectedValue'), false);
    const malformed = reconstructBatch(batch({ originalQuantity: 'bad', availableQuantity: 'bad' }), [], []);
    assert.ok(malformed.differences.some((item) => item.code === 'BATCH_ORIGINAL_QUANTITY_INVALID'));
    assert.ok(malformed.differences.some((item) => item.code === 'BATCH_BUCKET_INVALID'));
    const invalidActual = reconstructBatch(batch({ availableQuantity: 'bad' }), [
        event('grant', 'GRANT', 2, '', 'availableQuantity', 1),
        event('consume', 'CONVERT_OUT', -2, 'availableQuantity', 'consumedQuantity', 2),
    ], []);
    assert.ok(invalidActual.differences.some((item) => item.code === 'BATCH_BUCKET_INVALID'));
    assert.equal(bucketTotal({}), null);
    assert.throws(() => reconstructBatch(null), hasCode('RECONCILIATION_BATCH_REQUIRED'));
    assert.throws(() => reconstructBatch({ id: '' }), hasCode('RECONCILIATION_BATCH_REQUIRED'));
});

function service(repository) {
    return new CourseCreditReconciliationService(repository, {
        clock: () => Date.parse(NOW),
        idFactory: ids(),
    });
}

function mockRepository(options = {}) {
    return {
        plans: [],
        queries: [],
        gets: [],
        async list(collection, query = {}) {
            this.queries.push({ collection, options: query });
            if (collection === 'credit_batches') return options.batches || [];
            if (collection === 'credit_events' && query.filter?.startsWith('created>=')) {
                return options.changedEvents || [];
            }
            if (collection === 'credit_events') return byFilter(options.eventsByBatch, query.filter);
            if (collection === 'session_credit_allocations') return byFilter(options.allocationsByBatch, query.filter);
            throw new Error(`Unexpected list ${collection}`);
        },
        async get(collection, id) {
            this.gets.push([collection, id]);
            return options.fetchedBatches?.[id];
        },
        async send(plan) {
            this.plans.push(plan);
            if (options.sendError) throw options.sendError;
            return plan;
        },
    };
}

function byFilter(records = {}, filter = '') {
    const id = Object.keys(records).find((candidate) => filter.includes(candidate));
    return records[id] || [];
}

function batch(changes = {}) {
    return {
        id: 'batch', originalQuantity: 2,
        availableQuantity: 0, frozenQuantity: 0, consumedQuantity: 2,
        expiredQuantity: 0, reversedQuantity: 0,
        ...changes,
    };
}

function event(id, eventType, quantityDelta, bucketFrom, bucketTo, order, changes = {}) {
    return {
        id, batchId: 'batch', eventType, quantityDelta, bucketFrom, bucketTo,
        businessTime: '2026-08-20T10:00:00.000Z',
        created: `2026-08-20T10:00:00.${String(order).padStart(3, '0')}Z`,
        ...changes,
    };
}

function allocation(status, quantity, changes = {}) {
    return { id: `allocation-${status}`, batchId: 'batch', status, quantity, ...changes };
}

function hasCode(code) {
    return (error) => error.code === code;
}

function ids() {
    let index = 0;
    return () => `reconcile${String(++index).padStart(4, '0')}`;
}
