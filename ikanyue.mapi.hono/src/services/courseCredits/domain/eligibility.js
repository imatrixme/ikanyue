const { canReserveUnactivatedBatch } = require('./activation');
const { invariant } = require('./errors');
const { isServiceTimeValid } = require('./expiry');
const { assertNonNegativeInteger } = require('./quantities');
const { optionalDate } = require('./time');

function evaluateBatchEligibility(batch, context) {
    if (batch.creditTypeId !== context.requiredCreditTypeId) return rejected('CREDIT_TYPE_MISMATCH');
    if (batch.creditKind === 'universal' || batch.consumable === false) return rejected('UNIVERSAL_CREDIT_REQUIRES_CONVERSION');
    if (batch.locked) return rejected('BATCH_LOCKED');
    if (!['active', 'unactivated'].includes(batch.status)) return rejected('BATCH_UNAVAILABLE');
    if (!Number.isInteger(batch.availableQuantity) || batch.availableQuantity <= 0) return rejected('CREDIT_INSUFFICIENT');
    if (!batch.activatedAt && !canReserveUnactivatedBatch(batch, context.sessionStart, context.now)) {
        return rejected('ACTIVATION_DEADLINE_PASSED');
    }
    if (batch.activatedAt && !isServiceTimeValid(batch, context.sessionStart)) return rejected('BATCH_EXPIRED');
    return { eligible: true, reason: null };
}

function allocateFefo(batches, quantity, context) {
    assertNonNegativeInteger(quantity, 'quantity');
    invariant(quantity > 0, 'INVALID_CREDIT_QUANTITY', 'quantity must be greater than zero');
    const rejectedBatches = [];
    const eligible = [];
    for (const batch of batches) {
        const result = evaluateBatchEligibility(batch, context);
        if (result.eligible) eligible.push(batch);
        else rejectedBatches.push({ batchId: batch.id, reason: result.reason });
    }
    eligible.sort(compareFefo);

    let remaining = quantity;
    const allocations = [];
    for (const batch of eligible) {
        if (remaining === 0) break;
        const allocatedQuantity = Math.min(batch.availableQuantity, remaining);
        allocations.push({ batchId: batch.id, quantity: allocatedQuantity });
        remaining -= allocatedQuantity;
    }
    return {
        allocations,
        allocatedQuantity: quantity - remaining,
        missingQuantity: remaining,
        rejectedBatches,
    };
}

function compareFefo(left, right) {
    const leftExpiry = optionalDate(left.effectiveExpiresAt, 'effectiveExpiresAt');
    const rightExpiry = optionalDate(right.effectiveExpiresAt, 'effectiveExpiresAt');
    const expiryDifference = nullableTime(leftExpiry) - nullableTime(rightExpiry);
    if (expiryDifference !== 0) return expiryDifference;
    const priorityDifference = (left.priority ?? 0) - (right.priority ?? 0);
    if (priorityDifference !== 0) return priorityDifference;
    const createdDifference = nullableTime(optionalDate(left.created, 'created')) - nullableTime(optionalDate(right.created, 'created'));
    if (createdDifference !== 0) return createdDifference;
    return String(left.id).localeCompare(String(right.id));
}

function nullableTime(date) {
    return date ? date.getTime() : Number.POSITIVE_INFINITY;
}

function rejected(reason) {
    return { eligible: false, reason };
}

module.exports = { allocateFefo, compareFefo, evaluateBatchEligibility };
