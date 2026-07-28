const test = require('node:test');
const assert = require('node:assert/strict');

const {
    blockedByClaim,
    blockedByOverride,
    effectiveWindows,
    generateAvailableSlots,
    intersections,
    mergeWindows,
    overrideWindowsForDate,
} = require('../src/services/courseCredits/booking/availability');
const { buildScheduleClaims, findClaimConflicts } = require('../src/services/courseCredits/booking/claims');
const { DEFAULT_BOOKING_POLICY, normalizeBookingPolicy, responseDeadline } = require('../src/services/courseCredits/booking/policy');
const { isTerminalAppointment, transitionAppointment } = require('../src/services/courseCredits/booking/state');

test('default booking policy keeps morning and afternoon institution windows', () => {
    const policy = normalizeBookingPolicy();
    assert.deepEqual(policy.defaultWindows, [
        { startMinute: 540, endMinute: 660 },
        { startMinute: 840, endMinute: 1140 },
    ]);
    assert.equal(policy.timezone, 'Asia/Shanghai');
    assert.throws(() => normalizeBookingPolicy({ slotStepMinutes: 20 }), /占位粒度/);
    assert.throws(() => normalizeBookingPolicy({ claimGranularityMinutes: 30 }), /固定为 15 分钟/);
    assert.throws(() => normalizeBookingPolicy({ timezone: 'UTC' }), /Asia\/Shanghai/);
});

test('response deadline respects both ttl and the lesson cutoff', () => {
    assert.equal(responseDeadline('2026-08-01T00:00:00.000Z', '2026-08-03T02:00:00.000Z', DEFAULT_BOOKING_POLICY),
        '2026-08-02T00:00:00.000Z');
    assert.equal(responseDeadline('2026-08-02T19:00:00.000Z', '2026-08-03T02:00:00.000Z', DEFAULT_BOOKING_POLICY),
        '2026-08-02T20:00:00.000Z');
});

test('availability produces complete slots and removes overrides, claims, and ineligible starts', () => {
    const slots = generateAvailableSlots({
        now: '2026-08-02T00:00:00.000Z',
        from: '2026-08-03T00:00:00.000Z',
        to: '2026-08-04T12:00:00.000Z',
        durationMinutes: 60,
        policy: { ...DEFAULT_BOOKING_POLICY, minLeadMinutes: 0 },
        claims: [{ status: 'active', cellStartAt: '2026-08-03T01:30:00.000Z', cellEndAt: '2026-08-03T01:45:00.000Z' }],
        overrides: [{ status: 'active', type: 'unavailable', startAt: '2026-08-03T06:00:00.000Z', endAt: '2026-08-03T07:00:00.000Z' }],
        isStudentEligible: (startAt) => startAt !== '2026-08-03T10:00:00.000Z',
    });
    assert.ok(slots.some((slot) => slot.startAt === '2026-08-03T02:00:00.000Z'));
    assert.equal(slots.some((slot) => slot.startAt === '2026-08-03T01:30:00.000Z'), false);
    assert.equal(slots.some((slot) => slot.startAt === '2026-08-03T06:00:00.000Z'), false);
    assert.equal(slots.some((slot) => slot.startAt === '2026-08-03T10:00:00.000Z'), false);
});

test('custom availability is intersected with institution hours and merged', () => {
    assert.deepEqual(intersections(
        [{ startMinute: 540, endMinute: 660 }],
        [{ startMinute: 480, endMinute: 600 }, { startMinute: 590, endMinute: 630 }]
    ), [{ startMinute: 540, endMinute: 630 }]);
    assert.deepEqual(mergeWindows([
        { startMinute: 600, endMinute: 630 }, { startMinute: 540, endMinute: 600 },
    ]), [{ startMinute: 540, endMinute: 630 }]);
});

test('availability helpers cover cross-day overrides, inactive records, and invalid ranges', () => {
    const policy = { ...DEFAULT_BOOKING_POLICY, minLeadMinutes: 0 };
    const override = {
        status: 'active', type: 'available',
        startAt: '2026-08-03T01:00:00.000Z', endAt: '2026-08-05T02:00:00.000Z',
    };
    assert.deepEqual(overrideWindowsForDate(override, '2026-08-02'), []);
    assert.deepEqual(overrideWindowsForDate(override, '2026-08-03'), [{ startMinute: 540, endMinute: 1440 }]);
    assert.deepEqual(overrideWindowsForDate(override, '2026-08-04'), [{ startMinute: 0, endMinute: 1440 }]);
    assert.deepEqual(overrideWindowsForDate(override, '2026-08-05'), [{ startMinute: 0, endMinute: 600 }]);

    const windows = effectiveWindows('2026-08-03', 1, policy, [
        { weekday: 1, startMinute: 570, endMinute: 630, status: 'active' },
        { weekday: 1, startMinute: 840, endMinute: 900, status: 'inactive' },
        { weekday: 2, startMinute: 840, endMinute: 900, status: 'active' },
    ], 'custom', [{ ...override, status: 'cancelled' }]);
    assert.deepEqual(windows, [{ startMinute: 570, endMinute: 630 }]);
    assert.deepEqual(effectiveWindows('2026-08-03', 1, policy, [], 'custom'), policy.defaultWindows);
    assert.equal(blockedByOverride(START_AT, END_AT, [{ ...override, type: 'available' }]), false);
    assert.equal(blockedByOverride(START_AT, END_AT, [{
        status: 'cancelled', type: 'unavailable', startAt: START_AT, endAt: END_AT,
    }]), false);
    assert.equal(blockedByClaim(START_AT, END_AT, [{
        status: 'released', cellStartAt: START_AT, cellEndAt: END_AT,
    }]), false);
    assert.throws(() => generateAvailableSlots({
        now: START_AT, from: END_AT, to: START_AT, durationMinutes: 60, policy,
    }), /结束时间/);
    assert.throws(() => generateAvailableSlots({
        now: START_AT, from: START_AT, to: END_AT, durationMinutes: 50, policy,
    }), /课程时长/);
});

test('schedule claims use deterministic time cells and detect active collisions', () => {
    let next = 0;
    const claims = buildScheduleClaims({
        ownerType: 'teacher', ownerId: 'teacher-1', sourceId: 'lesson-1',
        startAt: '2026-08-03T01:00:00.000Z', endAt: '2026-08-03T02:00:00.000Z', granularityMinutes: 15,
    }, () => `claim-${++next}`);
    assert.equal(claims.length, 4);
    assert.equal(claims[0].cellStartAt, '2026-08-03T01:00:00.000Z');
    assert.equal(claims[3].cellEndAt, '2026-08-03T02:00:00.000Z');
    assert.equal(findClaimConflicts(claims, [{ ...claims[2], status: 'active' }]).length, 1);
    assert.equal(findClaimConflicts(claims, [{ ...claims[2], status: 'released' }]).length, 0);
    const rounded = buildScheduleClaims({
        ownerType: 'teacher', ownerId: 'teacher-1', sourceId: 'lesson-1',
        startAt: '2026-08-03T01:05:00.000Z', endAt: '2026-08-03T02:00:00.000Z', granularityMinutes: 15,
    }, () => 'id');
    assert.equal(rounded[0].cellStartAt, '2026-08-03T01:00:00.000Z');
});

test('appointment state machine allows only declared transitions', () => {
    assert.equal(transitionAppointment('pending', 'confirmed'), 'confirmed');
    assert.equal(transitionAppointment('confirmed', 'rescheduled'), 'rescheduled');
    assert.equal(isTerminalAppointment('declined'), true);
    assert.equal(isTerminalAppointment('confirmed'), false);
    assert.throws(() => transitionAppointment('declined', 'confirmed'), /状态流转无效/);
});

const START_AT = '2026-08-03T01:00:00.000Z';
const END_AT = '2026-08-03T02:00:00.000Z';
