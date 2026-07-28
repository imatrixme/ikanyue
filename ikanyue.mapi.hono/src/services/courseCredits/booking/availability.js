const { invariant } = require('../domain');
const { normalizeBookingPolicy } = require('./policy');
const { addLocalDays, localDateMinuteToIso, localParts, overlaps } = require('./time');

function generateAvailableSlots(input = {}) {
    const policy = normalizeBookingPolicy(input.policy);
    const durationMinutes = positiveDuration(input.durationMinutes, policy.claimGranularityMinutes);
    const now = requiredTime(input.now || Date.now(), 'BOOKING_NOW_INVALID');
    const from = requiredTime(input.from, 'BOOKING_FROM_INVALID');
    const to = requiredTime(input.to, 'BOOKING_TO_INVALID');
    invariant(to > from, 'BOOKING_RANGE_INVALID', '预约查询结束时间必须晚于开始时间');
    const maxTo = now + policy.maxAdvanceDays * 86400000;
    const startDate = localParts(new Date(Math.max(from, now)).toISOString()).date;
    const endDate = localParts(new Date(Math.min(to, maxTo)).toISOString()).date;
    const slots = [];

    for (let date = startDate; date <= endDate; date = addLocalDays(date, 1)) {
        const weekday = localParts(localDateMinuteToIso(date, 0)).weekday;
        const windows = effectiveWindows(
            date, weekday, policy, input.rules || [], input.availabilityMode, input.overrides || []
        );
        for (const window of windows) {
            for (let minute = align(window.startMinute, policy.slotStepMinutes);
                minute + durationMinutes <= window.endMinute; minute += policy.slotStepMinutes) {
                const startAt = localDateMinuteToIso(date, minute);
                const endAt = localDateMinuteToIso(date, minute + durationMinutes);
                if (Date.parse(startAt) < now + policy.minLeadMinutes * 60000) continue;
                if (Date.parse(startAt) < from || Date.parse(endAt) > to || Date.parse(startAt) > maxTo) continue;
                if (blockedByOverride(startAt, endAt, input.overrides || [])) continue;
                if (blockedByClaim(startAt, endAt, input.claims || [])) continue;
                if (input.isStudentEligible && !input.isStudentEligible(startAt)) continue;
                slots.push({ startAt, endAt });
            }
        }
    }
    return slots;
}

function effectiveWindows(date, weekday, policy, rules, availabilityMode = 'default', overrides = []) {
    const base = policy.defaultWindows;
    if (availabilityMode !== 'custom') return base;
    const active = rules.filter((rule) => Number(rule.weekday) === weekday && rule.status !== 'inactive'
        && effectiveOnDate(rule, date)).map((rule) => ({
        startMinute: Number(rule.startMinute), endMinute: Number(rule.endMinute),
    }));
    const recurring = active.length > 0 ? intersections(base, active) : base;
    const temporary = overrides.filter((override) => override.status !== 'cancelled'
        && override.type === 'available').flatMap((override) => overrideWindowsForDate(override, date));
    return mergeWindows([...recurring, ...intersections(base, temporary)]);
}

function overrideWindowsForDate(override, date) {
    const start = localParts(override.startAt);
    const end = localParts(override.endAt);
    if (date < start.date || date > end.date) return [];
    return [{
        startMinute: date === start.date ? start.minute : 0,
        endMinute: date === end.date ? end.minute : 1440,
    }];
}

function intersections(left, right) {
    const result = [];
    for (const first of left) {
        for (const second of right) {
            const startMinute = Math.max(first.startMinute, second.startMinute);
            const endMinute = Math.min(first.endMinute, second.endMinute);
            if (endMinute > startMinute) result.push({ startMinute, endMinute });
        }
    }
    return mergeWindows(result);
}

function mergeWindows(windows) {
    const sorted = windows.sort((a, b) => a.startMinute - b.startMinute);
    const result = [];
    for (const window of sorted) {
        const last = result.at(-1);
        if (last && window.startMinute <= last.endMinute) last.endMinute = Math.max(last.endMinute, window.endMinute);
        else result.push({ ...window });
    }
    return result;
}

function blockedByOverride(startAt, endAt, overrides) {
    return overrides.some((override) => override.status !== 'cancelled' && override.type === 'unavailable'
        && overlaps(startAt, endAt, override.startAt, override.endAt));
}

function blockedByClaim(startAt, endAt, claims) {
    return claims.some((claim) => claim.status === 'active'
        && overlaps(startAt, endAt, claim.cellStartAt, claim.cellEndAt));
}

function effectiveOnDate(rule, date) {
    const start = rule.effectiveFrom ? localParts(rule.effectiveFrom).date : '';
    const end = rule.effectiveTo ? localParts(rule.effectiveTo).date : '';
    return (!start || start <= date) && (!end || end > date);
}

function align(minute, step) {
    return Math.ceil(minute / step) * step;
}

function positiveDuration(value, granularity) {
    const duration = Number(value);
    invariant(Number.isInteger(duration) && duration > 0 && duration % granularity === 0,
        'BOOKING_DURATION_INVALID', '课程时长必须是占位粒度的正整数倍');
    return duration;
}

function requiredTime(value, code) {
    const timestamp = typeof value === 'number' ? value : Date.parse(value);
    invariant(Number.isFinite(timestamp), code, '日期无效');
    return timestamp;
}

module.exports = {
    blockedByClaim,
    blockedByOverride,
    effectiveWindows,
    generateAvailableSlots,
    intersections,
    mergeWindows,
    overrideWindowsForDate,
};
