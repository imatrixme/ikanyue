const {
    activationDeadlinePassed,
    buildTargetBatchTerms,
    calculateTargetQuantity,
    compareFefo,
    invariant,
    isServiceTimeValid,
} = require('./domain');

function planConversionSources(batches, sourceQuantity, rule, context) {
    invariant(Number.isInteger(sourceQuantity) && sourceQuantity > 0,
        'INVALID_CREDIT_QUANTITY', 'sourceQuantity must be a positive integer');
    const candidates = [];
    const rejectedBatches = [];
    for (const record of batches) {
        const batch = normalizeSourceBatch(record);
        const reason = conversionSourceRejection(batch, rule, context.now);
        if (reason) rejectedBatches.push({ batchId: batch.id, reason });
        else candidates.push(batch);
    }
    candidates.sort(compareFefo);

    let remaining = sourceQuantity;
    const allocations = [];
    for (const batch of candidates) {
        if (remaining === 0) break;
        const usable = Math.floor(batch.availableQuantity / rule.minSourceQuantity) * rule.minSourceQuantity;
        const quantity = Math.min(usable, remaining);
        allocations.push({ batch, quantity });
        remaining -= quantity;
    }
    return {
        allocations,
        allocatedQuantity: sourceQuantity - remaining,
        missingQuantity: remaining,
        rejectedBatches,
    };
}

function buildConversionTargetPreview(rule, allocation, convertedAt, options = {}) {
    const targetQuantity = calculateTargetQuantity(rule, allocation.quantity);
    const terms = buildTargetBatchTerms(rule, allocation.batch, convertedAt, {
        targetTermEnd: options.targetTermEnd,
    });
    const listValue = allocation.quantity * Number(allocation.batch.listUnitValue || 0);
    const paidValue = allocation.quantity * Number(allocation.batch.paidUnitCost || 0);
    return {
        sourceBatchId: allocation.batch.id,
        sourceBatchVersion: allocation.batch.version,
        sourceQuantity: allocation.quantity,
        targetQuantity,
        activationMode: terms.activationMode,
        activatedAt: terms.activatedAt,
        activationDeadline: terms.activationDeadline,
        effectiveExpiresAt: terms.effectiveExpiresAt,
        validityDurationDays: terms.validityDurationDays,
        status: terms.status,
        expiryPolicy: concreteExpiryPolicy(rule, terms, allocation.batch),
        listUnitValue: listValue / targetQuantity,
        paidUnitCost: paidValue / targetQuantity,
        currency: allocation.batch.currency || 'CNY',
        priority: Number(allocation.batch.priority || 0),
    };
}

function concreteExpiryPolicy(rule, terms, sourceBatch) {
    if (!terms.effectiveExpiresAt && rule.expiryPolicy !== 'RESET_ON_ACTIVATION') return 'NO_EXPIRY';
    if (rule.expiryPolicy === 'TARGET_TERM_END') return 'TERM_END';
    if (rule.expiryPolicy === 'INHERIT_SOURCE' && sourceBatch.expiryPolicy === 'NO_EXPIRY') return 'NO_EXPIRY';
    return 'FIXED_DURATION';
}

function conversionSourceRejection(batch, rule, now) {
    if (batch.creditTypeId !== rule.sourceCreditTypeId) return 'CREDIT_TYPE_MISMATCH';
    if (batch.locked) return 'BATCH_LOCKED';
    if (!['active', 'unactivated'].includes(batch.status)) return 'BATCH_UNAVAILABLE';
    if (batch.availableQuantity < rule.minSourceQuantity) return 'CONVERSION_BELOW_MINIMUM';
    if (batch.activatedAt) return isServiceTimeValid(batch, now) ? null : 'BATCH_EXPIRED';
    if (!batch.activationDeadline) return 'ACTIVATION_DEADLINE_REQUIRED';
    if (activationDeadlinePassed(batch, now)) return 'ACTIVATION_DEADLINE_PASSED';
    return null;
}

function normalizeSourceBatch(batch) {
    return {
        ...batch,
        availableQuantity: integer(batch.availableQuantity),
        consumedQuantity: integer(batch.consumedQuantity),
        expiredQuantity: integer(batch.expiredQuantity),
        frozenQuantity: integer(batch.frozenQuantity),
        originalQuantity: integer(batch.originalQuantity),
        priority: integer(batch.priority),
        reversedQuantity: integer(batch.reversedQuantity),
        version: positiveVersion(batch.version),
    };
}

function integer(value) {
    const number = Number(value || 0);
    return Number.isInteger(number) ? number : value;
}

function positiveVersion(value) {
    const version = Number(value);
    return Number.isInteger(version) && version > 0 ? version : 1;
}

module.exports = {
    buildConversionTargetPreview,
    concreteExpiryPolicy,
    conversionSourceRejection,
    normalizeSourceBatch,
    planConversionSources,
    positiveVersion,
};
