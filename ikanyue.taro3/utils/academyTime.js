// Lessons, bookings and activities run on the academy clock: Asia/Shanghai, fixed UTC+08:00 (no DST).
// The API books on the same clock (kanyue.server internal/coursecredit/booking_domain.go),
// so the miniapp must not depend on the device timezone when it displays or composes times.
const ACADEMY_OFFSET_MS = 8 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function toDate(value) {
    if (value === null || value === undefined || value === '') return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function academyParts(value) {
    const date = toDate(value);
    if (!date) return null;
    const shifted = new Date(date.getTime() + ACADEMY_OFFSET_MS);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
        weekday: shifted.getUTCDay(),
    };
}

function academyDateKey(value) {
    const parts = academyParts(value);
    return parts ? `${parts.year}-${pad(parts.month)}-${pad(parts.day)}` : '';
}

function academyTimeLabel(value) {
    const parts = academyParts(value);
    return parts ? `${pad(parts.hour)}:${pad(parts.minute)}` : '';
}

function academyWeekday(value) {
    const parts = academyParts(value);
    return parts ? WEEKDAY_LABELS[parts.weekday] : '';
}

// Academy wall-clock date ("YYYY-MM-DD") and time ("H:mm") to an absolute instant; null when invalid.
function academyDateTime(dateValue, timeValue = '00:00') {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || ''));
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(String(timeValue || ''));
    if (!dateMatch || !timeMatch) return null;
    const [, year, month, day] = dateMatch.map(Number);
    const [, hour, minute] = timeMatch.map(Number);
    if (hour > 23 || minute > 59) return null;
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute) - ACADEMY_OFFSET_MS);
    const parts = academyParts(date);
    return parts.year === year && parts.month === month && parts.day === day ? date : null;
}

function addAcademyDays(dateKey, days) {
    const start = academyDateTime(dateKey);
    return start ? academyDateKey(start.getTime() + days * 86400000) : '';
}

function pad(value) { return String(value).padStart(2, '0'); }

export {
    WEEKDAY_LABELS, academyDateKey, academyDateTime, academyParts, academyTimeLabel, academyWeekday, addAcademyDays,
};
