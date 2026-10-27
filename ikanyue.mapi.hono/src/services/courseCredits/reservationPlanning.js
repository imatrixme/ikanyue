const {
    activateBatch,
    allocateFefo,
    deriveBatchStatus,
    evaluateBatchEligibility,
    isServiceTimeValid,
    moveQuantity,
} = require('./domain');

function planReservation(batches, quantity, context) {
    const prepared = [];
    const rejectedBatches = [];
    const activatedBatchIds = new Set();

    for (const record of batches) {
        const batch = normalizeBatch(record, context.creditType);
        const eligibility = evaluateBatchEligibility(batch, context);
        if (!eligibility.eligible) {
            rejectedBatches.push({ batchId: batch.id, reason: eligibility.reason });
            continue;
        }
        if (!batch.activatedAt && batch.activationMode === 'FIRST_RESERVATION') {
            const activated = activateBatch(batch, 'RESERVATION_SUCCEEDED', context.now).batch;
            if (!isServiceTimeValid(activated, context.sessionStart)) {
                rejectedBatches.push({ batchId: batch.id, reason: 'BATCH_EXPIRES_BEFORE_SESSION' });
                continue;
            }
            prepared.push(activated);
            activatedBatchIds.add(batch.id);
            continue;
        }
        prepared.push(batch);
    }

    const allocation = allocateFefo(prepared, quantity, context);
    return {
        ...allocation,
        activatedBatchIds,
        batchesById: new Map(prepared.map((batch) => [batch.id, batch])),
        rejectedBatches: [...rejectedBatches, ...allocation.rejectedBatches],
    };
}

function buildReservationMovements(planning, idFactory) {
    return planning.allocations.map((allocation) => {
        const batch = planning.batchesById.get(allocation.batchId);
        const moved = moveQuantity(batch, 'availableQuantity', 'frozenQuantity', allocation.quantity);
        const nextBatch = {
            ...moved,
            status: deriveBatchStatus(moved),
            version: positiveVersion(batch.version) + 1,
        };
        return {
            activationSnapshot: batch,
            activated: planning.activatedBatchIds.has(batch.id),
            allocationId: idFactory(),
            expectedVersion: positiveVersion(batch.version),
            nextBatch,
            quantity: allocation.quantity,
        };
    });
}

function normalizeBatch(batch, creditType) {
    return {
        ...batch,
        availableQuantity: quantity(batch.availableQuantity),
        consumedQuantity: quantity(batch.consumedQuantity),
        creditKind: creditType.kind,
        expiredQuantity: quantity(batch.expiredQuantity),
        frozenQuantity: quantity(batch.frozenQuantity),
        originalQuantity: quantity(batch.originalQuantity),
        priority: quantity(batch.priority),
        reversedQuantity: quantity(batch.reversedQuantity),
        consumable: creditType.consumable,
        version: positiveVersion(batch.version),
    };
}

function positiveVersion(value) {
    const version = Number(value);
    return Number.isInteger(version) && version > 0 ? version : 1;
}

function quantity(value) {
    const number = Number(value || 0);
    return Number.isInteger(number) ? number : value;
}

module.exports = {
    buildReservationMovements,
    normalizeBatch,
    planReservation,
    positiveVersion,
};
