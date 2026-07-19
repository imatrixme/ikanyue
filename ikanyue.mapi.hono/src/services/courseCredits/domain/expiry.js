const { invariant } = require('./errors');
const { deriveBatchStatus, moveQuantity, validateBatchQuantities } = require('./quantities');
const { activationDeadlinePassed } = require('./activation');
const { isAtOrAfter, isWithinHalfOpen, optionalDate } = require('./time');

function isServiceTimeValid(batch, sessionStart) {
    return isWithinHalfOpen(sessionStart, batch.validFrom, batch.effectiveExpiresAt);
}

function canConsumeProtectedReservation(batch, reservedForStartAt) {
    invariant(reservedForStartAt, 'RESERVATION_START_REQUIRED', 'reservedForStartAt is required');
    return isServiceTimeValid(batch, reservedForStartAt);
}

function expireAvailableQuantity(batch, at) {
    validateBatchQuantities(batch);
    const expiry = optionalDate(batch.effectiveExpiresAt, 'effectiveExpiresAt');
    const expiredByDate = Boolean(expiry && isAtOrAfter(at, expiry));
    const expiredBeforeActivation = !batch.activatedAt && activationDeadlinePassed(batch, at);
    if ((!expiredByDate && !expiredBeforeActivation) || batch.availableQuantity === 0) {
        return { batch: { ...batch }, expiredQuantity: 0 };
    }
    const quantity = batch.availableQuantity;
    const moved = moveQuantity(batch, 'availableQuantity', 'expiredQuantity', quantity);
    return { batch: { ...moved, status: deriveBatchStatus(moved) }, expiredQuantity: quantity };
}

function releaseFrozenQuantity(batch, quantity, releasedAt) {
    const expiry = optionalDate(batch.effectiveExpiresAt, 'effectiveExpiresAt');
    const target = expiry && isAtOrAfter(releasedAt, expiry) ? 'expiredQuantity' : 'availableQuantity';
    const moved = moveQuantity(batch, 'frozenQuantity', target, quantity);
    return { batch: { ...moved, status: deriveBatchStatus(moved) }, targetBucket: target };
}

module.exports = {
    canConsumeProtectedReservation,
    expireAvailableQuantity,
    isServiceTimeValid,
    releaseFrozenQuantity,
};
