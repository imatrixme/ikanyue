const { invariant } = require('../domain');

const SHANGHAI_TIMEZONE = 'Asia/Shanghai';
const SCHEDULE_CLAIM_GRANULARITY_MINUTES = 15;
const DEFAULT_WINDOWS = Object.freeze([
    Object.freeze({ startMinute: 9 * 60, endMinute: 11 * 60 }),
    Object.freeze({ startMinute: 14 * 60, endMinute: 19 * 60 }),
]);

const DEFAULT_BOOKING_POLICY = Object.freeze({
    timezone: SHANGHAI_TIMEZONE,
    defaultWindows: DEFAULT_WINDOWS,
    slotStepMinutes: 30,
    claimGranularityMinutes: SCHEDULE_CLAIM_GRANULARITY_MINUTES,
    minLeadMinutes: 12 * 60,
    maxAdvanceDays: 30,
    responseTtlMinutes: 24 * 60,
    responseCutoffMinutes: 6 * 60,
    cancellationCutoffMinutes: 12 * 60,
    version: 1,
});

function normalizeBookingPolicy(value = {}) {
    const policy = {
        ...DEFAULT_BOOKING_POLICY,
        ...value,
        defaultWindows: normalizeWindows(value.defaultWindows || DEFAULT_WINDOWS),
    };
    validatePolicy(policy);
    return policy;
}

function validatePolicy(policy) {
    invariant(policy.timezone === SHANGHAI_TIMEZONE,
        'BOOKING_TIMEZONE_UNSUPPORTED', '预约暂只支持 Asia/Shanghai 时区');
    positiveInteger(policy.slotStepMinutes, 'BOOKING_SLOT_STEP_INVALID');
    positiveInteger(policy.claimGranularityMinutes, 'BOOKING_CLAIM_GRANULARITY_INVALID');
    invariant(policy.claimGranularityMinutes === SCHEDULE_CLAIM_GRANULARITY_MINUTES,
        'BOOKING_CLAIM_GRANULARITY_IMMUTABLE', '日历占位粒度固定为 15 分钟');
    invariant(policy.slotStepMinutes % policy.claimGranularityMinutes === 0,
        'BOOKING_SLOT_ALIGNMENT_INVALID', '预约开始步长必须是占位粒度的整数倍');
    nonNegativeInteger(policy.minLeadMinutes, 'BOOKING_MIN_LEAD_INVALID');
    positiveInteger(policy.maxAdvanceDays, 'BOOKING_MAX_ADVANCE_INVALID');
    positiveInteger(policy.responseTtlMinutes, 'BOOKING_RESPONSE_TTL_INVALID');
    nonNegativeInteger(policy.responseCutoffMinutes, 'BOOKING_RESPONSE_CUTOFF_INVALID');
    nonNegativeInteger(policy.cancellationCutoffMinutes, 'BOOKING_CANCELLATION_CUTOFF_INVALID');
    positiveInteger(policy.version, 'BOOKING_POLICY_VERSION_INVALID');
    return policy;
}

function normalizeWindows(windows) {
    invariant(Array.isArray(windows) && windows.length > 0,
        'BOOKING_WINDOWS_REQUIRED', '至少需要一个可预约时间窗');
    const normalized = windows.map((window) => ({
        startMinute: minute(window.startMinute, 'BOOKING_WINDOW_START_INVALID'),
        endMinute: minute(window.endMinute, 'BOOKING_WINDOW_END_INVALID', true),
    })).sort((left, right) => left.startMinute - right.startMinute);
    normalized.forEach((window, index) => {
        invariant(window.endMinute > window.startMinute,
            'BOOKING_WINDOW_RANGE_INVALID', '预约时间窗结束时间必须晚于开始时间');
        if (index > 0) {
            invariant(window.startMinute >= normalized[index - 1].endMinute,
                'BOOKING_WINDOWS_OVERLAP', '预约时间窗不能重叠');
        }
    });
    return normalized;
}

function responseDeadline(requestedAt, startAt, policy) {
    const normalized = normalizeBookingPolicy(policy);
    const requested = timestamp(requestedAt, 'BOOKING_REQUESTED_AT_INVALID');
    const start = timestamp(startAt, 'BOOKING_START_INVALID');
    return new Date(Math.min(
        requested + normalized.responseTtlMinutes * 60000,
        start - normalized.responseCutoffMinutes * 60000
    )).toISOString();
}

function minute(value, code, allowEnd = false) {
    const number = Number(value);
    invariant(Number.isInteger(number) && number >= 0 && number <= (allowEnd ? 1440 : 1439),
        code, '分钟数无效');
    return number;
}

function positiveInteger(value, code) {
    invariant(Number.isInteger(Number(value)) && Number(value) > 0, code, '必须是正整数');
}

function nonNegativeInteger(value, code) {
    invariant(Number.isInteger(Number(value)) && Number(value) >= 0, code, '必须是非负整数');
}

function timestamp(value, code) {
    const parsed = Date.parse(value);
    invariant(Number.isFinite(parsed), code, '日期无效');
    return parsed;
}

module.exports = {
    DEFAULT_BOOKING_POLICY,
    DEFAULT_WINDOWS,
    SCHEDULE_CLAIM_GRANULARITY_MINUTES,
    SHANGHAI_TIMEZONE,
    normalizeBookingPolicy,
    normalizeWindows,
    responseDeadline,
    validatePolicy,
};
