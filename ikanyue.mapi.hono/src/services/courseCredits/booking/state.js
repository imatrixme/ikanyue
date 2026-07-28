const { invariant } = require('../domain');

const TRANSITIONS = Object.freeze({
    pending: new Set(['confirmed', 'declined', 'withdrawn', 'expired', 'slot_taken', 'eligibility_lost']),
    confirmed: new Set(['cancelled', 'rescheduled', 'fulfilled']),
    rescheduled: new Set(['rescheduled', 'cancelled', 'fulfilled']),
});

function transitionAppointment(current, next) {
    invariant(current && TRANSITIONS[current]?.has(next),
        'APPOINTMENT_STATUS_TRANSITION_INVALID', '预约状态流转无效', { current, next });
    return next;
}

function isTerminalAppointment(status) {
    return !TRANSITIONS[status];
}

module.exports = { TRANSITIONS, isTerminalAppointment, transitionAppointment };
