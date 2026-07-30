import { describe, expect, it } from 'vitest';
import {
    addDateKey, availabilityForDate, buildSevenDayStrip, dateKey, dayRange, formatScheduleTime,
    lessonsForDate, normalizeScheduleEntry, normalizeTeacherSchedule, normalizeUpcomingResponse,
    scheduleErrorMessage, shiftWeek, teacherLessonDetailUrl, weekRange,
} from './pageLogic';

const lesson = (overrides = {}) => ({
    lessonId: 'lesson-1', title: '声乐课', startAt: '2026-07-29T01:00:00.000Z',
    endAt: '2026-07-29T02:00:00.000Z', course: { courseId: 'voice', name: '声乐基础' },
    teacherSummary: { count: 1, label: '王老师', items: [{ id: 't1', name: '王老师', phone: 'hidden' }] },
    participantSummary: { count: 1, label: '小明', items: [{ id: 's1', name: '小明' }] },
    classSummary: { count: 1, label: '周三班', items: [{ id: 'c1', name: '周三班' }] },
    status: 'scheduled', ...overrides,
});

describe('schedule presentation', () => {
    it('normalizes only role-safe public lesson fields', () => {
        const normalized = normalizeScheduleEntry({
            ...lesson(), rawStatus: 'scheduled', relationIds: { studentIds: ['s1'] }, creditTypeId: 'internal',
        });
        expect(normalized.teacherSummary.items[0]).toEqual({ id: 't1', name: '王老师' });
        expect(normalized.classSummary.label).toBe('周三班');
        expect(normalized).not.toHaveProperty('rawStatus');
        expect(normalized).not.toHaveProperty('relationIds');
        expect(normalized).not.toHaveProperty('creditTypeId');
        expect(normalizeScheduleEntry()).toMatchObject({ lessonId: '', title: '课程', status: 'scheduled' });
        expect(normalizeScheduleEntry({
            course: { name: 3 },
            teacherSummary: { count: -1, overflow: '2', items: [{ id: 1, name: '', role: 'lead' }, null] },
        }).teacherSummary).toEqual({
            count: 0,
            items: [{ id: '', name: '未命名', role: 'lead' }, { id: '', name: '未命名' }],
            label: '',
            overflow: 2,
        });
    });

    it('limits upcoming lessons to three and defensively normalizes teacher ranges', () => {
        const upcoming = normalizeUpcomingResponse({ items: [1, 2, 3, 4].map((value) => lesson({ lessonId: `${value}` })) });
        expect(upcoming.items.map((item) => item.lessonId)).toEqual(['1', '2', '3']);
        expect(normalizeUpcomingResponse().timezone).toBe('Asia/Shanghai');

        const schedule = normalizeTeacherSchedule({
            items: [lesson({ lessonId: 'later', startAt: '2026-07-29T03:00:00Z' }), lesson()],
            availability: [{ offeringId: 'o1', course: { name: '声乐基础' }, startAt: lesson().startAt }],
            range: { from: lesson().startAt, to: lesson().endAt },
        });
        expect(schedule.items.map((item) => item.lessonId)).toEqual(['lesson-1', 'later']);
        expect(schedule.availability[0]).toMatchObject({ offeringId: 'o1', course: { name: '声乐基础' } });
        expect(normalizeTeacherSchedule()).toMatchObject({ items: [], availability: [], range: { timezone: 'Asia/Shanghai' } });
        expect(normalizeTeacherSchedule({ availability: [{}] }).availability[0]).toEqual({
            course: { courseId: '', name: '课程' }, endAt: null, offeringId: '', startAt: null,
        });
    });

    it('builds Shanghai calendar weeks and half-open ranges across month boundaries', () => {
        const days = buildSevenDayStrip('2026-07-29', '2026-07-29T02:00:00Z');
        expect(days.map((item) => item.dateKey)).toEqual([
            '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02',
        ]);
        expect(days[2]).toMatchObject({ isSelected: true, isToday: true, weekday: '周三' });
        expect(weekRange('2026-07-29')).toEqual({
            from: '2026-07-26T16:00:00.000Z', to: '2026-08-02T16:00:00.000Z',
        });
        expect(dayRange('2026-07-29')).toEqual({
            from: '2026-07-28T16:00:00.000Z', to: '2026-07-29T16:00:00.000Z',
        });
        expect(addDateKey('2026-12-31', 1)).toBe('2027-01-01');
        expect(shiftWeek('2026-07-29', -1)).toBe('2026-07-22');
        expect(dateKey('2026-07-28T16:30:00Z')).toBe('2026-07-29');
        expect(dateKey(new Date('2026-07-28T16:30:00Z'))).toBe('2026-07-29');
    });

    it('filters daily lessons and availability and formats local times', () => {
        const items = [lesson(), lesson({ lessonId: 'other', startAt: '2026-07-30T01:00:00Z' })];
        expect(lessonsForDate(items, '2026-07-29').map((item) => item.lessonId)).toEqual(['lesson-1']);
        expect(availabilityForDate([{ offeringId: 'o1', startAt: lesson().startAt }], '2026-07-29')).toHaveLength(1);
        expect(formatScheduleTime(lesson().startAt, lesson().endAt)).toBe('09:00-10:00');
        expect(formatScheduleTime(lesson().startAt)).toBe('09:00');
        expect(formatScheduleTime()).toBe('时间待定');
        const tied = lessonsForDate([
            lesson({ lessonId: 'b' }), lesson({ lessonId: 'a' }),
        ], '2026-07-29');
        expect(tied.map((item) => item.lessonId)).toEqual(['a', 'b']);
    });

    it('creates teacher detail routes and stable user-facing errors', () => {
        expect(teacherLessonDetailUrl(lesson())).toBe('/pages/teacherLessonDetail/index?id=lesson-1&date=2026-07-29');
        expect(teacherLessonDetailUrl()).toContain('id=');
        expect(scheduleErrorMessage({ errorCode: 'CALENDAR_RANGE_INVALID' })).toBe('课程日期范围无效');
        expect(scheduleErrorMessage({ errorCode: 'CALENDAR_RANGE_TOO_LARGE' })).toBe('课程日期范围过大');
        expect(scheduleErrorMessage({ errorCode: 'CALENDAR_ROLE_UNSUPPORTED' })).toBe('当前身份暂不支持课程日历');
        expect(scheduleErrorMessage({ errorCode: 'CALENDAR_TEACHER_REQUIRED' })).toBe('请使用教师账号登录');
        expect(scheduleErrorMessage({ message: '离线' })).toBe('离线');
        expect(scheduleErrorMessage()).toBe('课程安排暂时无法加载');
    });
});
