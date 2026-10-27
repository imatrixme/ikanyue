const test = require('node:test');
const assert = require('node:assert/strict');

const {
    calendarBoolean,
    normalizeCalendarFilters,
    parseCalendarRange,
    upcomingLimit,
} = require('../src/services/courseCredits/schedule/range');

test('calendar range accepts at most 42 days and normalizes dates', () => {
    const result = parseCalendarRange({
        from: '2026-08-01T00:00:00+08:00',
        to: '2026-09-12T00:00:00+08:00',
    });
    assert.deepEqual(result, {
        from: '2026-07-31T16:00:00.000Z',
        to: '2026-09-11T16:00:00.000Z',
    });
    assert.throws(() => parseCalendarRange({ from: 'invalid', to: '2026-08-02' }), hasCode('CALENDAR_FROM_INVALID'));
    assert.throws(() => parseCalendarRange({ from: '2026-08-02', to: 'invalid' }), hasCode('CALENDAR_TO_INVALID'));
    assert.throws(() => parseCalendarRange({ from: '2026-08-02', to: '2026-08-01' }), hasCode('CALENDAR_RANGE_INVALID'));
    assert.throws(() => parseCalendarRange({ from: '2026-08-01', to: '2026-09-13' }),
        hasCode('CALENDAR_RANGE_TOO_LARGE'));
    assert.deepEqual(parseCalendarRange({ from: 0, to: 1000 }), {
        from: '1970-01-01T00:00:00.000Z', to: '1970-01-01T00:00:01.000Z',
    });
});

test('calendar filters, booleans, and upcoming limits reject unsupported values', () => {
    assert.deepEqual(normalizeCalendarFilters({
        teacherId: ' teacher ', studentId: 2, classId: 'class', courseSpecId: 'course',
        status: 'scheduled,completed,scheduled', originType: 'class,appointment',
    }), {
        teacherId: 'teacher', studentId: '', classId: 'class', courseSpecId: 'course',
        statuses: ['scheduled', 'completed'], origins: ['class', 'appointment'],
    });
    assert.throws(() => normalizeCalendarFilters({ status: 'unknown' }), hasCode('CALENDAR_STATUS_INVALID'));
    assert.throws(() => normalizeCalendarFilters({ originType: 'legacy' }), hasCode('CALENDAR_ORIGIN_INVALID'));
    assert.deepEqual(['1', 'true', 'yes', 'on'].map(calendarBoolean), [true, true, true, true]);
    assert.deepEqual(['0', 'false', 'no', 'off', '', undefined].map(calendarBoolean),
        [false, false, false, false, false, false]);
    assert.throws(() => calendarBoolean('maybe'), hasCode('CALENDAR_BOOLEAN_INVALID'));
    assert.equal(upcomingLimit(undefined), 3);
    assert.equal(upcomingLimit('2'), 2);
    assert.throws(() => upcomingLimit(0), hasCode('CALENDAR_UPCOMING_LIMIT_INVALID'));
    assert.throws(() => upcomingLimit(4), hasCode('CALENDAR_UPCOMING_LIMIT_INVALID'));
});

function hasCode(code) {
    return (error) => error?.code === code;
}
