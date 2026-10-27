const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function normalizeScheduleEntry(entry = {}) {
    return {
        adjusted: Boolean(entry.adjusted),
        attention: text(entry.attention),
        classSummary: normalizeSummary(entry.classSummary),
        course: {
            courseId: text(entry.course?.courseId),
            deliveryMode: text(entry.course?.deliveryMode),
            name: text(entry.course?.name) || '课程',
        },
        endAt: nullable(entry.endAt),
        lessonId: text(entry.lessonId),
        location: text(entry.location),
        participantSummary: normalizeSummary(entry.participantSummary),
        startAt: nullable(entry.startAt),
        status: text(entry.status) || 'scheduled',
        teacherSummary: normalizeSummary(entry.teacherSummary),
        title: text(entry.title) || text(entry.course?.name) || '课程',
    };
}

function normalizeSummary(summary = {}) {
    const items = array(summary.items).slice(0, 3).map((item) => ({
        id: text(item?.id), name: text(item?.name) || '未命名', ...(item?.role ? { role: text(item.role) } : {}),
    }));
    return {
        count: nonNegative(summary.count),
        items,
        label: text(summary.label),
        overflow: nonNegative(summary.overflow),
    };
}

function normalizeUpcomingResponse(payload = {}) {
    return { timezone: text(payload.timezone) || 'Asia/Shanghai', items: array(payload.items).map(normalizeScheduleEntry).slice(0, 3) };
}

function normalizeTeacherSchedule(payload = {}) {
    return {
        availability: array(payload.availability).map(normalizeAvailability),
        items: array(payload.items).map(normalizeScheduleEntry).sort(byStart),
        range: {
            from: nullable(payload.range?.from),
            timezone: text(payload.range?.timezone) || 'Asia/Shanghai',
            to: nullable(payload.range?.to),
        },
    };
}

function normalizeAvailability(item = {}) {
    return {
        course: { courseId: text(item.course?.courseId), name: text(item.course?.name) || '课程' },
        endAt: nullable(item.endAt),
        offeringId: text(item.offeringId),
        startAt: nullable(item.startAt),
    };
}

function buildSevenDayStrip(anchor = Date.now(), now = Date.now()) {
    const selected = dateKey(anchor);
    const start = addDateKey(selected, 1 - weekdayForDateKey(selected));
    const today = dateKey(now);
    return Array.from({ length: 7 }, (_, index) => {
        const key = addDateKey(start, index);
        const parts = key.split('-').map(Number);
        return {
            dateKey: key,
            day: String(parts[2]).padStart(2, '0'),
            isSelected: key === selected,
            isToday: key === today,
            month: `${parts[1]}月`,
            weekday: WEEKDAYS[weekdayForDateKey(key)],
        };
    });
}

function weekRange(anchor = Date.now()) {
    const days = buildSevenDayStrip(anchor);
    return { from: dateKeyToIso(days[0].dateKey), to: dateKeyToIso(addDateKey(days[6].dateKey, 1)) };
}

function dayRange(value = Date.now()) {
    const key = dateKey(value);
    return { from: dateKeyToIso(key), to: dateKeyToIso(addDateKey(key, 1)) };
}

function dateKey(value = Date.now()) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = validDate(value) || new Date();
    const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

function dateKeyToIso(key, minute = 0) {
    const hour = Math.floor(minute / 60);
    const minutes = minute % 60;
    return new Date(`${key}T${pad(hour)}:${pad(minutes)}:00+08:00`).toISOString();
}

function addDateKey(key, days) {
    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function shiftWeek(anchor, amount) {
    return addDateKey(dateKey(anchor), amount * 7);
}

function lessonsForDate(items, selectedDate) {
    return array(items).filter((item) => dateKey(item.startAt) === dateKey(selectedDate)).sort(byStart);
}

function availabilityForDate(items, selectedDate) {
    return array(items).filter((item) => dateKey(item.startAt) === dateKey(selectedDate)).sort(byStart);
}

function formatScheduleTime(startAt, endAt) {
    const start = localTime(startAt);
    const end = localTime(endAt);
    return start ? `${start}${end ? `-${end}` : ''}` : '时间待定';
}

function teacherLessonDetailUrl(lesson = {}) {
    const id = encodeURIComponent(lesson.lessonId || '');
    const date = encodeURIComponent(dateKey(lesson.startAt));
    return `/pages/teacherLessonDetail/index?id=${id}&date=${date}`;
}

function scheduleErrorMessage(error, fallback = '课程安排暂时无法加载') {
    const messages = {
        CALENDAR_RANGE_INVALID: '课程日期范围无效',
        CALENDAR_RANGE_TOO_LARGE: '课程日期范围过大',
        CALENDAR_ROLE_UNSUPPORTED: '当前身份暂不支持课程日历',
        CALENDAR_TEACHER_REQUIRED: '请使用教师账号登录',
    };
    return messages[error?.errorCode] || error?.message || fallback;
}

function weekdayForDateKey(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function localTime(value) {
    const date = validDate(value);
    if (!date) return '';
    const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
    return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

function byStart(left, right) {
    return Date.parse(left.startAt || '') - Date.parse(right.startAt || '') || String(left.lessonId || left.offeringId).localeCompare(String(right.lessonId || right.offeringId));
}

function validDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function array(value) { return Array.isArray(value) ? value : []; }
function nonNegative(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : 0; }
function nullable(value) { return value || null; }
function pad(value) { return String(value).padStart(2, '0'); }
function text(value) { return typeof value === 'string' ? value.trim() : ''; }

export {
    addDateKey, availabilityForDate, buildSevenDayStrip, dateKey, dayRange, formatScheduleTime,
    lessonsForDate, normalizeScheduleEntry, normalizeTeacherSchedule, normalizeUpcomingResponse,
    scheduleErrorMessage, shiftWeek, teacherLessonDetailUrl, weekRange,
};
