const { invariant } = require('./errors');
const { addDays, asDate, isAtOrAfter, optionalDate, toIso } = require('./time');

const ACTIVATION_MODES = [
    'GRANT_TIME',
    'FIRST_RESERVATION',
    'FIRST_CHECK_IN',
    'FIRST_COMPLETED_SESSION',
    'TERM_START',
];

const ACTIVATION_TRIGGERS = {
    GRANT_TIME: 'GRANT',
    FIRST_RESERVATION: 'RESERVATION_SUCCEEDED',
    FIRST_CHECK_IN: 'VALID_CHECK_IN',
    FIRST_COMPLETED_SESSION: 'SESSION_COMPLETED',
    TERM_START: 'TERM_STARTED',
};

function validateActivationPolicy(policy) {
    invariant(ACTIVATION_MODES.includes(policy.activationMode), 'INVALID_ACTIVATION_MODE', 'activation mode is not supported', {
        activationMode: policy.activationMode,
    });
    if (policy.activationMode !== 'GRANT_TIME') {
        invariant(optionalDate(policy.activationDeadline, 'activationDeadline'), 'ACTIVATION_DEADLINE_REQUIRED', 'unactivated batches require an activation deadline');
    }
    if (policy.validityDurationDays !== null && policy.validityDurationDays !== undefined) {
        invariant(Number.isInteger(policy.validityDurationDays) && policy.validityDurationDays >= 0,
            'INVALID_DURATION_DAYS', 'validityDurationDays must be a non-negative integer');
    }
    return policy;
}

function activationDeadlinePassed(batch, at) {
    const deadline = optionalDate(batch.activationDeadline, 'activationDeadline');
    return Boolean(deadline && isAtOrAfter(at, deadline));
}

function activateBatch(batch, trigger, at, options = {}) {
    validateActivationPolicy(batch);
    if (batch.activatedAt) {
        return { batch: { ...batch }, activated: false };
    }
    invariant(ACTIVATION_TRIGGERS[batch.activationMode] === trigger, 'ACTIVATION_TRIGGER_MISMATCH', 'event does not activate this batch', {
        activationMode: batch.activationMode,
        trigger,
    });
    const activationAt = batch.activationMode === 'TERM_START'
        ? asDate(options.termStart, 'termStart')
        : asDate(at, 'activatedAt');
    invariant(!activationDeadlinePassed(batch, activationAt), 'ACTIVATION_DEADLINE_PASSED', 'batch activation deadline has passed');
    const expiry = batch.validityDurationDays === null || batch.validityDurationDays === undefined
        ? optionalDate(options.fixedExpiresAt || batch.effectiveExpiresAt, 'effectiveExpiresAt')
        : addDays(activationAt, batch.validityDurationDays);
    const next = {
        ...batch,
        activatedAt: activationAt.toISOString(),
        effectiveExpiresAt: toIso(expiry),
        status: 'active',
    };
    return { batch: next, activated: true };
}

function canReserveUnactivatedBatch(batch, sessionStart, now) {
    validateActivationPolicy(batch);
    if (batch.activatedAt) return true;
    if (activationDeadlinePassed(batch, now)) return false;
    const deadline = optionalDate(batch.activationDeadline, 'activationDeadline');
    return Boolean(deadline && asDate(sessionStart, 'sessionStart') < deadline);
}

module.exports = {
    ACTIVATION_MODES,
    ACTIVATION_TRIGGERS,
    activateBatch,
    activationDeadlinePassed,
    canReserveUnactivatedBatch,
    validateActivationPolicy,
};
