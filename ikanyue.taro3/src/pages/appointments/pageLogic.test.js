import { describe, expect, it } from 'vitest';
import {
    appointmentDetailUrl, availabilityUrl, bookingDateRange, bookingErrorMessage, bookingSlotsUrl,
    buildAvailabilityOverride, buildRescheduleWindow, createCommandKey, createOverrideDraft,
    createRescheduleDraft, formatAppointmentTime, formatDeadline, groupSlots, hasNextPage,
    mergeAppointmentPage, minutesToTime, normalizeAppointment, normalizeAppointmentPage,
    normalizeAvailability, normalizeBookingOption, normalizeTeacherDashboard, statusMeta,
    timeToMinutes, validateAvailabilityRules, weekdayName,
} from './pageLogic';

const START = '2026-08-03T09:00:00+08:00';
const END = '2026-08-03T10:00:00+08:00';

describe('booking presentation logic', () => {
    it('normalizes student-safe booking options and appointments', () => {
        expect(normalizeBookingOption()).toEqual({
            offeringId: '', course: { courseId: '', name: '课程', durationMinutes: 0 },
            teacher: { teacherId: '', name: '授课教师', avatar: '' }, location: '',
        });
        const appointment = normalizeAppointment({
            appointmentId: 'a', status: 'confirmed', startAt: START, endAt: END,
            course: { courseId: 'voice', name: '声乐课' }, teacher: { name: '林老师' },
            student: { studentId: 's', name: '小陈' }, canCancel: true, version: 2,
        });
        expect(appointment).toMatchObject({ appointmentId: 'a', canCancel: true, version: 2 });
        expect(appointment.student.name).toBe('小陈');
        expect(normalizeAppointment().student).toBeNull();
    });

    it('normalizes pages, dashboard, and teacher availability defensively', () => {
        const page = normalizeAppointmentPage({ items: [{ appointmentId: 'a' }], page: '2', totalPages: '3' });
        expect(page).toMatchObject({ page: 2, perPage: 20, totalPages: 3 });
        expect(page.items[0].appointmentId).toBe('a');
        const dashboard = normalizeTeacherDashboard({
            pending: [{ appointmentId: 'a' }], confirmed: [{}], pendingCount: '1',
            offerings: [{ offeringId: 'o', course: { name: '声乐' } }],
        });
        expect(dashboard.pendingCount).toBe(1);
        expect(dashboard.offerings[0].course.name).toBe('声乐');
        const availability = normalizeAvailability({
            rules: [{ weekday: '2', startMinute: '540', endMinute: '660' }],
            overrides: [{ type: 'available' }, { type: 'other' }],
            policy: { defaultWindows: [{ startMinute: 540, endMinute: 660 }] },
        });
        expect(availability.rules[0]).toMatchObject({ weekday: 2, startMinute: 540, endMinute: 660 });
        expect(availability.overrides.map((item) => item.type)).toEqual(['available', 'unavailable']);
    });

    it('groups valid slots by local calendar day and skips malformed values', () => {
        const groups = groupSlots([
            { startAt: START, endAt: END },
            { startAt: '2026-08-03T14:00:00+08:00', endAt: '2026-08-03T15:00:00+08:00' },
            { startAt: 'invalid', endAt: END },
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].slots.map((slot) => slot.label)).toEqual(['09:00-10:00', '14:00-15:00']);
    });

    it('formats appointment dates, deadlines, status labels, and time controls', () => {
        expect(formatAppointmentTime(START, END)).toBe('8月3日 周一 09:00-10:00');
        expect(formatAppointmentTime()).toBe('时间待定');
        expect(formatDeadline(START)).toBe('8月3日 09:00 前确认');
        expect(formatDeadline()).toBe('');
        expect(statusMeta('confirmed')).toEqual({ label: '已确认', tone: 'success' });
        expect(statusMeta('unknown')).toEqual({ label: '待确认', tone: 'muted' });
        expect(minutesToTime(540)).toBe('09:00');
        expect(minutesToTime(1440)).toBe('00:00');
        expect(timeToMinutes('19:00')).toBe(1140);
        expect(timeToMinutes('25:00')).toBeNull();
        expect(timeToMinutes('bad')).toBeNull();
        expect(weekdayName(7)).toBe('周日');
        expect(weekdayName(0)).toBe('周一');
    });

    it('builds stable routes, command keys, pagination, and date windows', () => {
        expect(appointmentDetailUrl('a/b')).toContain('a%2Fb');
        expect(availabilityUrl('offer 1')).toContain('offer%201');
        expect(bookingSlotsUrl({
            offeringId: 'offer', course: { name: '声乐课' }, teacher: { name: '林老师' }, location: '一号教室',
        })).toContain('courseName=%E5%A3%B0%E4%B9%90%E8%AF%BE');
        expect(createCommandKey('confirm', 'a', 1000, 0.5)).toBe('confirm:a:rs:89oqgw');
        expect(hasNextPage({ page: 1, totalPages: 2 })).toBe(true);
        expect(hasNextPage({ page: 2, totalPages: 2 })).toBe(false);
        expect(bookingDateRange(Date.parse('2026-08-01T00:00:00Z'), 1)).toEqual({
            from: '2026-08-01T00:00:00.000Z', to: '2026-08-02T00:00:00.000Z',
        });
    });

    it('merges pages and maps stable booking failures into natural language', () => {
        expect(mergeAppointmentPage(
            [{ appointmentId: 'a', status: 'pending' }],
            [{ appointmentId: 'a', status: 'confirmed' }, { appointmentId: 'b' }, {}]
        )).toEqual([{ appointmentId: 'a', status: 'confirmed' }, { appointmentId: 'b' }]);
        expect(bookingErrorMessage({ errorCode: 'BOOKING_SLOT_TAKEN' })).toContain('被占用');
        expect(bookingErrorMessage({ errorCode: 'APPOINTMENT_PENDING_DUPLICATE' })).toContain('已有待确认预约');
        expect(bookingErrorMessage({ message: '网络错误' })).toBe('网络错误');
        expect(bookingErrorMessage(null, '稍后再试')).toBe('稍后再试');
    });

    it('builds safe local reschedule drafts and preserves the original duration', () => {
        expect(createRescheduleDraft(START)).toEqual({ date: '2026-08-03', startTime: '09:00', reason: '' });
        expect(createRescheduleDraft('', Date.parse('2026-08-01T08:00:00+08:00'))).toEqual({
            date: '2026-08-02', startTime: '09:00', reason: '',
        });
        const window = buildRescheduleWindow({ date: '2026-08-04', startTime: '14:30' }, {
            startAt: START, endAt: END,
        });
        expect(new Date(window.newEndAt) - new Date(window.newStartAt)).toBe(60 * 60000);
        expect(buildRescheduleWindow({ date: '2026-02-30', startTime: '09:00' })).toBeNull();
        expect(buildRescheduleWindow({ date: '2026-08-04', startTime: '09:00' }, {})).toBeTruthy();
    });

    it('validates weekly teacher availability against institution windows', () => {
        const windows = [{ startMinute: 540, endMinute: 660 }, { startMinute: 840, endMinute: 1140 }];
        expect(validateAvailabilityRules([], windows)).toContain('至少');
        expect(validateAvailabilityRules([{ weekday: 1, startMinute: 600, endMinute: 590 }], windows)).toContain('晚于');
        expect(validateAvailabilityRules([{ weekday: 1, startMinute: 480, endMinute: 540 }], windows)).toContain('机构');
        expect(validateAvailabilityRules([
            { weekday: 1, startMinute: 540, endMinute: 620 },
            { weekday: 1, startMinute: 600, endMinute: 660 },
        ], windows)).toContain('重叠');
        expect(validateAvailabilityRules([
            { weekday: 2, startMinute: 540, endMinute: 600 },
            { weekday: 1, startMinute: 840, endMinute: 900 },
        ], windows)).toBe('');
    });

    it('builds future availability overrides without relying on string date parsing', () => {
        const now = Date.parse('2026-08-01T08:00:00+08:00');
        expect(createOverrideDraft(now)).toEqual({
            type: 'unavailable', date: '2026-08-02', startTime: '09:00', endTime: '11:00', reason: '',
        });
        expect(buildAvailabilityOverride({ date: 'bad', startTime: '09:00', endTime: '10:00' }, [], now).error).toContain('有效');
        expect(buildAvailabilityOverride({ date: '2026-08-01', startTime: '07:00', endTime: '08:00' }, [], now).error).toContain('未来');
        expect(buildAvailabilityOverride({
            type: 'available', date: '2026-08-02', startTime: '11:00', endTime: '12:00',
        }, [{ startMinute: 540, endMinute: 660 }], now).error).toContain('机构');
        const result = buildAvailabilityOverride({
            type: 'available', date: '2026-08-02', startTime: '09:00', endTime: '10:00', reason: '  加课  ',
        }, [{ startMinute: 540, endMinute: 660 }], now);
        expect(result.error).toBe('');
        expect(result.payload).toMatchObject({ type: 'available', reason: '加课' });
        expect(buildAvailabilityOverride({
            type: 'unavailable', date: '2026-08-02', startTime: '11:00', endTime: '12:00',
        }, [], now).error).toBe('');
    });

    it('covers defensive booking fallbacks and malformed boundary values', () => {
        expect(normalizeBookingOption({
            offeringId: 'o', course: { courseId: 'c', name: '声乐', durationMinutes: 45 },
            teacher: { teacherId: 't', name: '林老师', avatar: 'a' }, location: 'A 室',
        })).toMatchObject({ offeringId: 'o', location: 'A 室' });
        expect(normalizeAppointment({
            appointmentId: 'a', status: 'cancelled', course: { courseId: 'c', name: '声乐' },
            teacher: { teacherId: 't', name: '林老师', avatar: 't.png' },
            student: { studentId: '', name: '', avatar: '' }, startAt: START, endAt: END,
            responseDeadline: START, location: 'A 室', note: '备注', responseReason: '原因',
            lessonId: 'lesson', canWithdraw: 1, canCancel: 1, canConfirm: 1, canDecline: 1, version: 0,
        })).toMatchObject({ status: 'cancelled', version: 1, canConfirm: true });
        expect(normalizeAppointmentPage({ items: 'bad', page: 0, perPage: 0, totalItems: -1, totalPages: -1 }))
            .toMatchObject({ items: [], page: 1, perPage: 20, totalItems: 0, totalPages: 0 });
        expect(normalizeTeacherDashboard()).toEqual({ pending: [], confirmed: [], pendingCount: 0, offerings: [] });
        expect(normalizeAvailability({
            offering: {}, policy: { timezone: 'UTC', defaultWindows: 'bad' }, rules: 'bad', overrides: 'bad',
        }).policy.timezone).toBe('UTC');
        expect(groupSlots([
            { startAt: START, endAt: 'bad' },
            { startAt: '2026-08-04T09:00:00+08:00', endAt: '2026-08-04T10:00:00+08:00' },
        ])).toHaveLength(1);
        expect(formatAppointmentTime(START)).toBe('8月3日 周一 09:00');
        expect(createRescheduleDraft(new Date(START)).startTime).toBe('09:00');
        expect(createRescheduleDraft('invalid', Date.parse('2026-08-01T08:00:00+08:00')).startTime).toBe('09:00');
        expect(buildRescheduleWindow({ date: '2026-08-04', startTime: '09:00' }, {
            startAt: END, endAt: START,
        })).toBeTruthy();
        const windows = [{ startMinute: 540, endMinute: 660 }];
        expect(validateAvailabilityRules([{ weekday: 0, startMinute: 540, endMinute: 600 }], windows)).toContain('晚于');
        expect(validateAvailabilityRules([{ weekday: 1, startMinute: 540.5, endMinute: 600 }], windows)).toContain('晚于');
        expect(validateAvailabilityRules([{ weekday: 1, startMinute: 540, endMinute: 600.5 }], windows)).toContain('晚于');
        expect(buildAvailabilityOverride({
            date: '2026-08-02', startTime: '10:00', endTime: '09:00',
        }, windows, Date.parse('2026-08-01T08:00:00+08:00')).error).toContain('有效');
        expect(buildAvailabilityOverride({
            date: '2026-08-02', startTime: '24:00', endTime: '10:00',
        }, windows, Date.parse('2026-08-01T08:00:00+08:00')).error).toContain('有效');
        expect(buildAvailabilityOverride({
            date: '2026-08-02', startTime: '09:00', endTime: '10:60',
        }, windows, Date.parse('2026-08-01T08:00:00+08:00')).error).toContain('有效');
        expect(createCommandKey('request', '', 1, 0)).toBe('request:new:1:0');
        expect(bookingSlotsUrl()).toContain('offeringId=');
        expect(appointmentDetailUrl('')).toContain('id=');
        expect(availabilityUrl('')).toContain('offeringId=');
        expect(hasNextPage()).toBe(false);
        expect(minutesToTime(-10)).toBe('00:00');
        expect(minutesToTime(2000)).toBe('00:00');
        expect(timeToMinutes('23:60')).toBeNull();
        expect(bookingErrorMessage({ errorCode: 'BOOKING_WINDOWS_OVERLAP' })).toContain('重叠');
    });
});
