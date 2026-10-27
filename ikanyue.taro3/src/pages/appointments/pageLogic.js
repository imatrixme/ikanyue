import {
    academyDateKey, academyDateTime, academyParts, academyTimeLabel, academyWeekday,
} from '../../../utils/academyTime';

const STATUS_META = Object.freeze({
    pending: { label: '待教师确认', tone: 'pending' },
    confirmed: { label: '已确认', tone: 'success' },
    rescheduled: { label: '已改期', tone: 'success' },
    fulfilled: { label: '已完成', tone: 'muted' },
    declined: { label: '未通过', tone: 'danger' },
    withdrawn: { label: '已撤回', tone: 'muted' },
    cancelled: { label: '已取消', tone: 'muted' },
    expired: { label: '已过期', tone: 'danger' },
    slot_taken: { label: '时段已被预约', tone: 'danger' },
    eligibility_lost: { label: '当前课时不足', tone: 'danger' },
});

const WEEKDAY_LABELS = Object.freeze(['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']);

function normalizeBookingOption(option = {}) {
    return {
        offeringId: option.offeringId || '',
        course: {
            courseId: option.course?.courseId || '',
            name: option.course?.name || '课程',
            durationMinutes: count(option.course?.durationMinutes),
        },
        teacher: {
            teacherId: option.teacher?.teacherId || '',
            name: option.teacher?.name || '授课教师',
            avatar: option.teacher?.avatar || '',
        },
        location: option.location || '',
    };
}

function normalizeAppointment(item = {}) {
    return {
        appointmentId: item.appointmentId || '',
        status: item.status || 'pending',
        course: {
            courseId: item.course?.courseId || '',
            name: item.course?.name || '课程',
        },
        teacher: {
            teacherId: item.teacher?.teacherId || '',
            name: item.teacher?.name || '授课教师',
            avatar: item.teacher?.avatar || '',
        },
        student: item.student ? {
            studentId: item.student.studentId || '',
            name: item.student.name || '学员',
            avatar: item.student.avatar || '',
        } : null,
        startAt: item.startAt || null,
        endAt: item.endAt || null,
        responseDeadline: item.responseDeadline || null,
        location: item.location || '',
        note: item.note || '',
        responseReason: item.responseReason || '',
        lessonId: item.lessonId || '',
        canWithdraw: Boolean(item.canWithdraw),
        canCancel: Boolean(item.canCancel),
        canConfirm: Boolean(item.canConfirm),
        canDecline: Boolean(item.canDecline),
        version: positive(item.version, 1),
    };
}

function normalizeAppointmentPage(payload = {}) {
    return {
        items: array(payload.items).map(normalizeAppointment),
        page: positive(payload.page, 1),
        perPage: positive(payload.perPage, 20),
        totalItems: count(payload.totalItems),
        totalPages: count(payload.totalPages),
    };
}

function normalizeTeacherDashboard(payload = {}) {
    return {
        pending: array(payload.pending).map(normalizeAppointment),
        confirmed: array(payload.confirmed).map(normalizeAppointment),
        pendingCount: count(payload.pendingCount),
        offerings: array(payload.offerings).map(normalizeBookingOption),
    };
}

function normalizeAvailability(payload = {}) {
    return {
        offering: normalizeBookingOption(payload.offering),
        policy: {
            timezone: payload.policy?.timezone || 'Asia/Shanghai',
            defaultWindows: array(payload.policy?.defaultWindows).map((window) => ({
                startMinute: count(window.startMinute),
                endMinute: count(window.endMinute),
            })),
        },
        rules: array(payload.rules).map((rule) => ({
            id: rule.id || '',
            weekday: positive(rule.weekday, 1),
            startMinute: count(rule.startMinute),
            endMinute: count(rule.endMinute),
            effectiveFrom: rule.effectiveFrom || null,
            effectiveTo: rule.effectiveTo || null,
        })),
        overrides: array(payload.overrides).map((item) => ({
            id: item.id || '',
            type: item.type === 'available' ? 'available' : 'unavailable',
            startAt: item.startAt || null,
            endAt: item.endAt || null,
            reason: item.reason || '',
        })),
    };
}

function groupSlots(slots = []) {
    const groups = new Map();
    array(slots).forEach((slot) => {
        const start = validDate(slot.startAt);
        const end = validDate(slot.endAt);
        if (!start || !end) return;
        const key = academyDateKey(start);
        if (!groups.has(key)) {
            groups.set(key, {
                dateKey: key,
                dateLabel: monthDayLabel(start),
                weekday: academyWeekday(start),
                slots: [],
            });
        }
        groups.get(key).slots.push({
            startAt: slot.startAt,
            endAt: slot.endAt,
            label: `${academyTimeLabel(start)}-${academyTimeLabel(end)}`,
        });
    });
    return [...groups.values()];
}

function mergeAppointmentPage(current = [], incoming = []) {
    const merged = new Map();
    [...current, ...incoming].forEach((item) => {
        if (item?.appointmentId) merged.set(item.appointmentId, item);
    });
    return [...merged.values()];
}

function statusMeta(status) {
    return STATUS_META[status] || { label: '待确认', tone: 'muted' };
}

function formatAppointmentTime(startAt, endAt) {
    const start = validDate(startAt);
    const end = validDate(endAt);
    if (!start) return '时间待定';
    const prefix = `${monthDayLabel(start)} ${academyWeekday(start)}`;
    return end ? `${prefix} ${academyTimeLabel(start)}-${academyTimeLabel(end)}` : `${prefix} ${academyTimeLabel(start)}`;
}

function formatDeadline(value) {
    const date = validDate(value);
    return date ? `${monthDayLabel(date)} ${academyTimeLabel(date)} 前确认` : '';
}

function bookingDateRange(now = Date.now(), days = 30) {
    return { from: new Date(now).toISOString(), to: new Date(now + days * 86400000).toISOString() };
}

function createRescheduleDraft(value, now = Date.now()) {
    const existing = validDate(value);
    const date = existing || new Date(now + 86400000);
    return {
        date: academyDateKey(date),
        startTime: existing ? academyTimeLabel(existing) : '09:00',
        reason: '',
    };
}

function buildRescheduleWindow(draft = {}, appointment = {}) {
    const start = academyDateTime(draft.date, draft.startTime);
    if (!start) return null;
    const originalStart = validDate(appointment.startAt);
    const originalEnd = validDate(appointment.endAt);
    const duration = originalStart && originalEnd && originalEnd > originalStart
        ? Math.max(15, (originalEnd - originalStart) / 60000)
        : 60;
    return {
        newStartAt: start.toISOString(),
        newEndAt: new Date(start.getTime() + duration * 60000).toISOString(),
    };
}

const REASON_REQUIRED_MESSAGE = '请填写至少 2 个字的原因';

// Comparable form of the weekly availability editor; default mode ignores leftover rules.
function weeklySnapshot(mode, rules = []) {
    const kept = mode === 'default' ? [] : (rules || []).map(({ weekday, startMinute, endMinute }) => [weekday, startMinute, endMinute]);
    return JSON.stringify([mode, kept]);
}

function rescheduleEndLabel(draft = {}, appointment = {}) {
    const window = buildRescheduleWindow(draft, appointment);
    return window ? academyTimeLabel(window.newEndAt) : '--:--';
}

// Open windows of the appointment's course on the chosen day, as shown in the reschedule sheet.
function rescheduleWindowsLabel(windows = [], courseId = '') {
    const labels = (windows || [])
        .filter((item) => !courseId || item.course?.courseId === courseId)
        .map((item) => `${academyTimeLabel(item.startAt)}-${academyTimeLabel(item.endAt)}`)
        .filter((label) => label !== '-');
    return labels.length ? labels.join('、') : '当天没有开放时段';
}

function cancellationCopy(quote = {}) {
    if (quote.mode === 'cash') {
        const yuan = (minor) => (Number(minor || 0) / 100).toFixed(2);
        return `取消将扣减1课时，扣费 ¥${yuan(quote.fee)}，原路退款 ¥${yuan(quote.amount)}`;
    }
    return '取消后这节课占用的 1 课时会退回课程，不扣费。';
}

function createOverrideDraft(now = Date.now()) {
    return {
        type: 'unavailable',
        date: academyDateKey(now + 86400000),
        startTime: '09:00',
        endTime: '11:00',
        reason: '',
    };
}

function validateAvailabilityRules(rules = [], policyWindows = []) {
    if (!rules.length) return '请至少添加一个每周时段';
    const normalized = array(rules).map((rule) => ({
        weekday: Number(rule.weekday),
        startMinute: Number(rule.startMinute),
        endMinute: Number(rule.endMinute),
    })).sort((left, right) => left.weekday - right.weekday || left.startMinute - right.startMinute);
    for (let index = 0; index < normalized.length; index += 1) {
        const rule = normalized[index];
        if (!Number.isInteger(rule.weekday) || rule.weekday < 1 || rule.weekday > 7
            || !Number.isInteger(rule.startMinute) || !Number.isInteger(rule.endMinute)
            || rule.endMinute <= rule.startMinute) return '结束时间必须晚于开始时间';
        if (!array(policyWindows).some((window) => rule.startMinute >= Number(window.startMinute)
            && rule.endMinute <= Number(window.endMinute))) return '可预约时间不能超出机构开放时间';
        const previous = normalized[index - 1];
        if (previous && previous.weekday === rule.weekday && previous.endMinute > rule.startMinute) {
            return '同一天的可预约时间不能重叠';
        }
    }
    return '';
}

function buildAvailabilityOverride(form = {}, policyWindows = [], now = Date.now()) {
    const start = academyDateTime(form.date, form.startTime);
    const end = academyDateTime(form.date, form.endTime);
    if (!start || !end || end <= start) return { error: '请选择有效的开始和结束时间' };
    if (start.getTime() <= now) return { error: '临时调整必须设置在未来时间' };
    const startMinute = minuteOfDay(start);
    const endMinute = minuteOfDay(end);
    if (form.type === 'available' && !array(policyWindows).some((window) => startMinute >= Number(window.startMinute)
        && endMinute <= Number(window.endMinute))) return { error: '临时开放不能超出机构开放时间' };
    return {
        error: '',
        payload: {
            type: form.type === 'available' ? 'available' : 'unavailable',
            startAt: start.toISOString(),
            endAt: end.toISOString(),
            reason: String(form.reason || '').trim(),
        },
    };
}

function bookingErrorMessage(error, fallback = '预约服务暂时无法使用') {
    const messages = {
        APPOINTMENT_CANCELLATION_CUTOFF_PASSED: '已超过可取消时间，请联系老师或前台处理。',
        APPOINTMENT_CANCEL_REASON_REQUIRED: '请填写取消原因。',
        APPOINTMENT_DECLINE_REASON_REQUIRED: '请填写拒绝原因。',
        APPOINTMENT_PENDING_DUPLICATE: '这门课程已有待确认预约，请先处理原预约。',
        APPOINTMENT_ELIGIBILITY_LOST: '当前已没有可用于这次课程的剩余课时。',
        APPOINTMENT_NOT_CANCELLABLE: '当前预约状态不能取消。',
        APPOINTMENT_NOT_PENDING: '该预约已被处理，请刷新后查看最新状态。',
        APPOINTMENT_NOT_RESCHEDULABLE: '当前预约状态不能调整时间。',
        APPOINTMENT_RESCHEDULE_REASON_REQUIRED: '请填写改期原因。',
        APPOINTMENT_TIME_UNCHANGED: '请选择一个不同的预约时间。',
        BOOKING_COURSE_NOT_ELIGIBLE: '当前课程没有可预约的剩余课时。',
        BOOKING_OFFERING_INACTIVE: '这位老师暂未开放预约。',
        BOOKING_OVERRIDE_DAY_INVALID: '临时调整必须位于同一自然日。',
        BOOKING_OVERRIDE_OUTSIDE_POLICY: '临时开放不能超出机构开放时间。',
        BOOKING_OVERRIDE_TIME_INVALID: '临时调整必须设置在未来的有效时段。',
        BOOKING_SLOT_TAKEN: '该时段刚刚被占用，请重新选择。',
        BOOKING_SLOT_UNAVAILABLE: '该时段当前不可预约，请重新选择。',
        BOOKING_TEACHER_UNAVAILABLE: '教师在该时段已有课程，请重新选择。',
        BOOKING_TEACHER_REQUIRED: '请切换到教师身份后操作。',
        BOOKING_WINDOWS_OVERLAP: '同一天的可预约时间不能重叠。',
        BOOKING_WINDOW_OUTSIDE_POLICY: '可预约时间不能超出机构开放时间。',
        BOOKING_WINDOW_RANGE_INVALID: '结束时间必须晚于开始时间。',
        STUDENT_SCOPE_REQUIRED: '请切换到学员身份后操作。',
        WECHAT_ROLE_CHALLENGE_EXPIRED: '身份选择已过期，请重新登录。',
    };
    return messages[error?.errorCode] || error?.message || fallback;
}

function appointmentDetailUrl(appointmentId) {
    return `/pages/appointmentDetail/index?id=${encodeURIComponent(appointmentId || '')}`;
}

function bookingSlotsUrl(option = {}, extra = {}) {
    const params = new URLSearchParams({
        offeringId: option.offeringId || '',
        courseName: option.course?.name || '',
        teacherName: option.teacher?.name || '',
        location: option.location || '',
        ...extra,
    });
    return `/pages/appointmentSlots/index?${params.toString()}`;
}

function availabilityUrl(offeringId) {
    return `/pages/teacherAvailability/index?offeringId=${encodeURIComponent(offeringId || '')}`;
}

function hasNextPage(page = {}) {
    return Number(page.page || 1) < Number(page.totalPages || 0);
}

function minutesToTime(value) {
    const minute = Math.max(0, Math.min(1440, Number(value) || 0));
    return `${pad(Math.floor(minute / 60) % 24)}:${pad(minute % 60)}`;
}

function timeToMinutes(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
}

function weekdayName(value) {
    return WEEKDAY_LABELS[Number(value)] || '周一';
}

function array(value) { return Array.isArray(value) ? value : []; }

function count(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
}

function positive(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function validDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function monthDayLabel(date) {
    const parts = academyParts(date);
    return `${parts.month}月${parts.day}日`;
}

function minuteOfDay(date) {
    const parts = academyParts(date);
    return parts.hour * 60 + parts.minute;
}

function pad(value) { return String(value).padStart(2, '0'); }

export {
    REASON_REQUIRED_MESSAGE, appointmentDetailUrl, availabilityUrl, bookingDateRange, bookingErrorMessage,
    bookingSlotsUrl, buildAvailabilityOverride, buildRescheduleWindow, cancellationCopy, createOverrideDraft,
    createRescheduleDraft, formatAppointmentTime, formatDeadline, groupSlots, hasNextPage,
    mergeAppointmentPage, minutesToTime, normalizeAppointment, normalizeAppointmentPage,
    normalizeAvailability, normalizeBookingOption, normalizeTeacherDashboard, rescheduleEndLabel,
    rescheduleWindowsLabel, statusMeta, timeToMinutes, validateAvailabilityRules, weekdayName, weeklySnapshot,
};
