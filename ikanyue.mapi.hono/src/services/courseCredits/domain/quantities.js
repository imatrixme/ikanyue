const { invariant } = require('./errors');

const QUANTITY_BUCKETS = [
    'availableQuantity',
    'frozenQuantity',
    'consumedQuantity',
    'expiredQuantity',
    'reversedQuantity',
];

function assertNonNegativeInteger(value, name) {
    invariant(Number.isInteger(value) && value >= 0, 'INVALID_CREDIT_QUANTITY', `${name} must be a non-negative integer`, {
        name,
        value,
    });
    return value;
}

function validateBatchQuantities(batch) {
    assertNonNegativeInteger(batch.originalQuantity, 'originalQuantity');
    let total = 0;
    for (const bucket of QUANTITY_BUCKETS) {
        total += assertNonNegativeInteger(batch[bucket], bucket);
    }
    invariant(total === batch.originalQuantity, 'BATCH_QUANTITY_MISMATCH', 'batch quantities must conserve original quantity', {
        originalQuantity: batch.originalQuantity,
        bucketTotal: total,
    });
    return batch;
}

function moveQuantity(batch, fromBucket, toBucket, quantity) {
    invariant(QUANTITY_BUCKETS.includes(fromBucket), 'INVALID_CREDIT_BUCKET', `unknown source bucket ${fromBucket}`);
    invariant(QUANTITY_BUCKETS.includes(toBucket), 'INVALID_CREDIT_BUCKET', `unknown target bucket ${toBucket}`);
    invariant(fromBucket !== toBucket, 'INVALID_CREDIT_BUCKET', 'source and target buckets must differ');
    assertNonNegativeInteger(quantity, 'quantity');
    invariant(quantity > 0, 'INVALID_CREDIT_QUANTITY', 'quantity must be greater than zero');
    validateBatchQuantities(batch);
    invariant(batch[fromBucket] >= quantity, 'CREDIT_INSUFFICIENT', `${fromBucket} does not contain enough quantity`, {
        available: batch[fromBucket],
        requested: quantity,
    });

    const next = {
        ...batch,
        [fromBucket]: batch[fromBucket] - quantity,
        [toBucket]: batch[toBucket] + quantity,
    };
    validateBatchQuantities(next);
    return next;
}

function deriveBatchStatus(batch) {
    validateBatchQuantities(batch);
    if (batch.reversedQuantity === batch.originalQuantity) return 'cancelled';
    if (batch.expiredQuantity === batch.originalQuantity) return 'expired';
    if (batch.availableQuantity === 0 && batch.frozenQuantity === 0) return 'depleted';
    return batch.activatedAt ? 'active' : 'unactivated';
}

module.exports = {
    QUANTITY_BUCKETS,
    assertNonNegativeInteger,
    deriveBatchStatus,
    moveQuantity,
    validateBatchQuantities,
};
