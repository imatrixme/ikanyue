const { invariant } = require('../domain');

const CALENDAR_TIMEZONE = 'Asia/Shanghai';
const MAX_CALENDAR_RANGE_DAYS = 42;
const MAX_CALENDAR_RANGE_MS = MAX_CALENDAR_RANGE_DAYS * 86400000;
const SESSION_STATUSES = new Set([
    'draft', 'scheduled', 'enrollment_closed', 'in_progress', 'completed', 'settled',
    'cancelled', 'correction_pending',
]);
const ORIGIN_TYPES = new Set(['class', 'appointment', 'admin']);
const UPCOMING_SESSION_STATUSES = new Set([
    'scheduled', 'enrollment_closed', 'in_progress', 'correction_pending',
]);

function parseCalendarRange(query = {}) {
    const from = requiredTime(query.from, 'CALENDAR_FROM_INVALID', '日历开始时间无效');
    const to = requiredTime(query.to, 'CALENDAR_TO_INVALID', '日历结束时间无效');
    invariant(to > from, 'CALENDAR_RANGE_INVALID', '日历结束时间必须晚于开始时间');
    invariant(to - from <= MAX_CALENDAR_RANGE_MS,
        'CALENDAR_RANGE_TOO_LARGE', `日历查询范围不能超过 ${MAX_CALENDAR_RANGE_DAYS} 天`, {
            maxDays: MAX_CALENDAR_RANGE_DAYS,
        });
    return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

function normalizeCalendarFilters(query = {}) {
    return {
        teacherId: text(query.teacherId),
        studentId: text(query.studentId),
        classId: text(query.classId),
        courseSpecId: text(query.courseSpecId),
        statuses: enumList(query.status, SESSION_STATUSES, 'CALENDAR_STATUS_INVALID'),
        origins: enumList(query.originType, ORIGIN_TYPES, 'CALENDAR_ORIGIN_INVALID'),
    };
}

function calendarBoolean(value) {
    if (value === undefined || value === null || value === '') return false;
    const normalized = String(value).trim().toLowerCase();
    invariant(['1', 'true', 'yes', 'on', '0', 'false', 'no', 'off'].includes(normalized),
        'CALENDAR_BOOLEAN_INVALID', '日历布尔参数无效');
    return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function upcomingLimit(value) {
    if (value === undefined || value === null || value === '') return 3;
    const result = Number(value);
    invariant(Number.isInteger(result) && result >= 1 && result <= 3,
        'CALENDAR_UPCOMING_LIMIT_INVALID', '首页课程数量必须在 1 到 3 之间');
    return result;
}

function requiredTime(value, code, message) {
    const timestamp = typeof value === 'number' ? value : Date.parse(value);
    invariant(Number.isFinite(timestamp), code, message);
    return timestamp;
}

function enumList(value, allowed, code) {
    if (value === undefined || value === null || value === '') return [];
    const values = String(value).split(',').map((item) => item.trim()).filter(Boolean);
    invariant(values.length > 0 && values.every((item) => allowed.has(item)), code, '日历筛选值无效');
    return [...new Set(values)];
}

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

module.exports = {
    CALENDAR_TIMEZONE,
    MAX_CALENDAR_RANGE_DAYS,
    ORIGIN_TYPES,
    SESSION_STATUSES,
    UPCOMING_SESSION_STATUSES,
    calendarBoolean,
    normalizeCalendarFilters,
    parseCalendarRange,
    upcomingLimit,
};
