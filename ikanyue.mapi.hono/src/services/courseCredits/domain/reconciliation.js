const { invariant } = require('./errors');

const QUANTITY_BUCKETS = [
    'availableQuantity',
    'frozenQuantity',
    'consumedQuantity',
    'expiredQuantity',
    'reversedQuantity',
];
const EVENT_ORDER = new Map([
    ['GRANT', 0],
    ['CONVERT_IN', 0],
    ['ADJUST', 0],
    ['ACTIVATE', 1],
    ['EXTEND', 1],
    ['FREEZE', 2],
    ['CONVERT_OUT', 2],
    ['CONSUME', 3],
    ['RELEASE', 3],
    ['EXPIRE', 3],
    ['REVERSE', 4],
]);

function reconstructBatch(batch, events = [], allocations = []) {
    invariant(batch && typeof batch.id === 'string' && batch.id,
        'RECONCILIATION_BATCH_REQUIRED', 'Reconciliation requires a credit batch');
    const differences = [];
    const expected = emptyBuckets();
    const seenEvents = new Set();
    for (const event of [...events].sort(compareEvents)) {
        replayEvent(batch.id, expected, event, seenEvents, differences);
    }

    const actual = normalizeSnapshot(batch, differences);
    for (const bucket of QUANTITY_BUCKETS) {
        if (actual[bucket] !== null && expected[bucket] !== actual[bucket]) {
            differences.push(difference('BUCKET_MISMATCH', bucket, expected[bucket], actual[bucket]));
        }
    }

    const originalQuantity = nonNegativeInteger(batch.originalQuantity);
    if (originalQuantity === null) {
        differences.push(difference('BATCH_ORIGINAL_QUANTITY_INVALID', 'originalQuantity', null,
            batch.originalQuantity));
    } else {
        const expectedTotal = bucketTotal(expected);
        const actualTotal = bucketTotal(actual);
        if (expectedTotal !== originalQuantity) {
            differences.push(difference('EXPECTED_CONSERVATION_MISMATCH', 'originalQuantity',
                originalQuantity, expectedTotal));
        }
        if (actualTotal !== null && actualTotal !== originalQuantity) {
            differences.push(difference('SNAPSHOT_CONSERVATION_MISMATCH', 'originalQuantity',
                originalQuantity, actualTotal));
        }
    }

    const allocationSummary = summarizeAllocations(batch.id, allocations, differences);
    if (allocationSummary.reserved !== expected.frozenQuantity) {
        differences.push(difference('RESERVED_ALLOCATION_MISMATCH', 'frozenQuantity',
            expected.frozenQuantity, allocationSummary.reserved));
    }

    return {
        actual,
        allocationSummary,
        batchId: batch.id,
        differences,
        expected,
        ok: differences.length === 0,
    };
}

function replayEvent(batchId, buckets, event, seenEvents, differences) {
    if (!event || typeof event.id !== 'string' || !event.id) {
        differences.push(difference('EVENT_ID_INVALID', 'eventId', null, event?.id));
        return;
    }
    if (seenEvents.has(event.id)) {
        differences.push(difference('DUPLICATE_EVENT', 'eventId', event.id, event.id));
        return;
    }
    seenEvents.add(event.id);
    if (event.batchId !== batchId) {
        differences.push(difference('EVENT_BATCH_MISMATCH', 'batchId', batchId, event.batchId));
        return;
    }
    const quantity = nonNegativeInteger(Math.abs(Number(event.quantityDelta || 0)));
    if (quantity === null) {
        differences.push(difference('EVENT_QUANTITY_INVALID', 'quantityDelta', null, event.quantityDelta));
        return;
    }
    const from = event.bucketFrom || '';
    const to = event.bucketTo || '';
    if (!validBucket(from) || !validBucket(to)) {
        differences.push(difference('EVENT_BUCKET_INVALID', 'bucket', QUANTITY_BUCKETS, { from, to }));
        return;
    }
    if (quantity > 0 && !from && !to) {
        differences.push(difference('EVENT_MOVEMENT_MISSING', 'bucket', 'source or target', { from, to }));
        return;
    }
    if (from) {
        buckets[from] -= quantity;
        if (buckets[from] < 0) {
            differences.push(difference('EVENT_SOURCE_UNDERFLOW', from, `>=${quantity}`, buckets[from] + quantity));
        }
    }
    if (to) buckets[to] += quantity;
}

function summarizeAllocations(batchId, allocations, differences) {
    const summary = { consumed: 0, expired: 0, released: 0, reserved: 0, reversed: 0 };
    for (const allocation of allocations) {
        if (allocation.batchId !== batchId) {
            differences.push(difference('ALLOCATION_BATCH_MISMATCH', 'batchId', batchId, allocation.batchId));
            continue;
        }
        const quantity = nonNegativeInteger(allocation.quantity);
        if (quantity === null || !Object.hasOwn(summary, allocation.status)) {
            differences.push(difference('ALLOCATION_INVALID', 'allocation', null, {
                id: allocation.id,
                quantity: allocation.quantity,
                status: allocation.status,
            }));
            continue;
        }
        summary[allocation.status] += quantity;
    }
    return summary;
}

function normalizeSnapshot(batch, differences) {
    return Object.fromEntries(QUANTITY_BUCKETS.map((bucket) => {
        const value = nonNegativeInteger(batch[bucket] || 0);
        if (value === null) differences.push(difference('BATCH_BUCKET_INVALID', bucket, null, batch[bucket]));
        return [bucket, value];
    }));
}

function compareEvents(left, right) {
    return eventTime(left, 'businessTime') - eventTime(right, 'businessTime')
        || eventTime(left, 'created') - eventTime(right, 'created')
        || (EVENT_ORDER.get(left?.eventType) ?? 99) - (EVENT_ORDER.get(right?.eventType) ?? 99)
        || String(left.id).localeCompare(String(right.id));
}

function eventTime(event, field) {
    const value = Date.parse(event?.[field] || '');
    return Number.isFinite(value) ? value : 0;
}

function emptyBuckets() {
    return Object.fromEntries(QUANTITY_BUCKETS.map((bucket) => [bucket, 0]));
}

function validBucket(bucket) {
    return bucket === '' || QUANTITY_BUCKETS.includes(bucket);
}

function nonNegativeInteger(value) {
    const quantity = Number(value);
    return Number.isInteger(quantity) && quantity >= 0 ? quantity : null;
}

function bucketTotal(buckets) {
    const values = QUANTITY_BUCKETS.map((bucket) => buckets[bucket]);
    return values.every((value) => Number.isInteger(value))
        ? values.reduce((sum, value) => sum + value, 0)
        : null;
}

function difference(code, field, expected, actual) {
    return { actual, code, expected, field };
}

module.exports = {
    QUANTITY_BUCKETS,
    EVENT_ORDER,
    bucketTotal,
    compareEvents,
    difference,
    emptyBuckets,
    reconstructBatch,
    replayEvent,
    summarizeAllocations,
};
