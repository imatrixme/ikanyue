const { invariant } = require('./errors');

const DAY_MS = 24 * 60 * 60 * 1000;

function asDate(value, name = 'date') {
    invariant(value !== null && value !== undefined && value !== '', 'INVALID_DATE', `${name} must be a valid date`, { name, value });
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    invariant(!Number.isNaN(date.getTime()), 'INVALID_DATE', `${name} must be a valid date`, { name, value });
    return date;
}

function optionalDate(value, name) {
    return value === null || value === undefined || value === '' ? null : asDate(value, name);
}

function addDays(value, days) {
    invariant(Number.isInteger(days) && days >= 0, 'INVALID_DURATION_DAYS', 'days must be a non-negative integer', { days });
    return new Date(asDate(value).getTime() + days * DAY_MS);
}

function earlierDate(left, right) {
    const leftDate = optionalDate(left, 'left');
    const rightDate = optionalDate(right, 'right');
    if (!leftDate) return rightDate;
    if (!rightDate) return leftDate;
    return leftDate <= rightDate ? leftDate : rightDate;
}

function isAtOrAfter(value, boundary) {
    return asDate(value, 'value').getTime() >= asDate(boundary, 'boundary').getTime();
}

function isWithinHalfOpen(value, start, end) {
    const timestamp = asDate(value, 'value').getTime();
    const startDate = optionalDate(start, 'start');
    const endDate = optionalDate(end, 'end');
    return (!startDate || timestamp >= startDate.getTime()) && (!endDate || timestamp < endDate.getTime());
}

function toIso(value) {
    return value === null || value === undefined ? null : asDate(value).toISOString();
}

module.exports = {
    DAY_MS,
    addDays,
    asDate,
    earlierDate,
    isAtOrAfter,
    isWithinHalfOpen,
    optionalDate,
    toIso,
};
