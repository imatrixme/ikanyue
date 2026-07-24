import { describe, expect, it } from 'vitest';
import {
    attendanceLabel,
    courseDetailUrl,
    courseListUrl,
    courseValidityText,
    formatDate,
    formatDateTime,
    formatLessonTime,
    hasNextPage,
    learningErrorMessage,
    lessonDetailUrl,
    lessonHourLabel,
    lessonStatusLabel,
    mergePage,
    normalizeCourse,
    normalizeCourseDetail,
    normalizeLesson,
    normalizeOverview,
    normalizePage,
    normalizeRecord,
    normalizeSource,
    pageState,
    recordQuantityText,
    sourceValidityText,
} from './pageLogic';

describe('student learning presentation', () => {
    it('normalizes the overview into course language', () => {
        const overview = normalizeOverview({
            courses: [{ courseId: 'voice', courseName: '少儿声乐', remainingLessons: '8', scheduledLessons: 2 }],
            nextLesson: lesson({ lessonId: 'next' }),
            recentRecords: [{ recordId: 'record', lessonHours: '1', course: { name: '少儿声乐' } }],
            warnings: [{ lessonId: 'next', title: '', message: '' }],
        });

        expect(overview.courses[0]).toMatchObject({ courseId: 'voice', remainingLessons: 8, scheduledLessons: 2 });
        expect(overview.nextLesson.lessonId).toBe('next');
        expect(overview.recentRecords[0].course.name).toBe('少儿声乐');
        expect(overview.warnings[0].title).toBe('课程安排提醒');
        expect(normalizeOverview({ warnings: [{}] }).warnings[0]).toEqual({
            lessonId: '', message: '当前课程安排需要教务老师处理。', startAt: null, title: '课程安排提醒',
        });
        expect(normalizeOverview()).toEqual({ courses: [], nextLesson: null, recentRecords: [], warnings: [] });
    });

    it('normalizes course details, sources, lessons, and records defensively', () => {
        expect(normalizeCourse()).toEqual({
            awaitingActivation: false, completedLessons: 0, courseId: '', courseName: '课程',
            deliveryMode: '', durationMinutes: 0, expiredLessons: 0, expiringSoon: false,
            remainingLessons: 0, scheduledLessons: 0, validUntil: null,
        });
        const detail = normalizeCourseDetail({
            courseId: 'voice', sources: [{ initialLessons: 10, status: 'active' }],
            recentLessons: [lesson()], recentRecords: [{ lessonHours: 1 }],
        });
        expect(detail.sources[0]).toEqual({
            completedLessons: 0, grantedAt: null, initialLessons: 10, remainingLessons: 0,
            scheduledLessons: 0, status: 'active', validFrom: null, validUntil: null,
        });
        expect(detail.recentLessons[0].title).toBe('声乐课');
        expect(detail.recentRecords[0].title).toBe('课时记录');
        expect(normalizeSource().status).toBe('pending');
        expect(normalizeLesson()).toMatchObject({ title: '课程', status: 'scheduled', attendanceResult: 'pending' });
        expect(normalizeLesson({ course: { name: '基础声乐' } }).title).toBe('基础声乐');
        expect(normalizeRecord()).toMatchObject({ impact: 'neutral', lessonHours: 0, title: '课时记录' });
    });

    it('normalizes, merges, and paginates list data', () => {
        const page = normalizePage({ items: [{ id: 1 }], page: '2', perPage: '5', totalItems: '6', totalPages: '2' }, (item) => ({ ...item, ready: true }));
        expect(page).toEqual({ items: [{ id: 1, ready: true }], page: 2, perPage: 5, totalItems: 6, totalPages: 2 });
        expect(normalizePage()).toEqual({ items: [], page: 1, perPage: 20, totalItems: 0, totalPages: 0 });
        expect(normalizePage({ items: ['unchanged'] }).items).toEqual(['unchanged']);
        expect(mergePage([{ lessonId: 'a', value: 1 }], [{ lessonId: 'a', value: 2 }, { lessonId: 'b' }])).toEqual([
            { lessonId: 'a', value: 2 }, { lessonId: 'b' },
        ]);
        expect(mergePage([{ recordId: 'r1' }], [{ recordId: 'r2' }, {}], 'recordId')).toEqual([{ recordId: 'r1' }, { recordId: 'r2' }]);
        expect(hasNextPage(page)).toBe(false);
        expect(hasNextPage({ page: 1, totalPages: 2 })).toBe(true);
        expect(hasNextPage()).toBe(false);
    });

    it('formats dates and lesson ranges without leaking invalid values', () => {
        expect(formatDate('2026-08-09T10:30:00+08:00')).toBe('2026.08.09');
        expect(formatDate(null)).toBe('长期有效');
        expect(formatDate('invalid')).toBe('长期有效');
        expect(formatDateTime('2026-08-09T10:30:00+08:00')).toBe('08.09 10:30');
        expect(formatDateTime()).toBe('时间待定');
        expect(formatLessonTime('2026-08-09T10:30:00+08:00', '2026-08-09T11:15:00+08:00')).toBe('08.09 10:30-11:15');
        expect(formatLessonTime('2026-08-09T10:30:00+08:00')).toBe('08.09 10:30');
        expect(formatLessonTime()).toBe('时间待定');
    });

    it('presents validity and operational statuses in student language', () => {
        expect(courseValidityText({ awaitingActivation: true })).toBe('课程安排待生效');
        expect(courseValidityText({})).toBe('长期有效');
        expect(courseValidityText({ validUntil: '2026-12-31T00:00:00Z' })).toBe('有效期至 2026.12.31');
        expect(courseValidityText({ validUntil: '2026-12-31T00:00:00Z', expiringSoon: true })).toContain('请留意安排');
        expect(sourceValidityText({ status: 'active' })).toBe('可安排 · 长期有效');
        expect(sourceValidityText({ status: 'expired', validUntil: '2026-01-01T00:00:00Z' })).toBe('已到期 · 2026.01.01');
        expect(sourceValidityText({ status: 'unknown' })).toBe('待确认 · 长期有效');
        expect(lessonStatusLabel('in_progress')).toBe('进行中');
        expect(lessonStatusLabel('unknown')).toBe('待确认');
        expect(attendanceLabel('present')).toBe('已到课');
        expect(attendanceLabel('unknown')).toBe('待确认');
        expect(lessonHourLabel('needs_help')).toBe('请联系教务');
        expect(lessonHourLabel('unknown')).toBe('待确认');
    });

    it('formats record quantities, page states, errors, and routes', () => {
        expect(recordQuantityText({ impact: 'added', lessonHours: 2 })).toBe('+2 课时');
        expect(recordQuantityText({ impact: 'returned', lessonHours: 1 })).toBe('+1 课时');
        expect(recordQuantityText({ impact: 'used', lessonHours: 1 })).toBe('-1 课时');
        expect(recordQuantityText({ lessonHours: -2 })).toBe('0 课时');
        expect(pageState({ loading: true })).toBe('loading');
        expect(pageState({ error: 'network' })).toBe('error');
        expect(pageState({ items: [{}] })).toBe('ready');
        expect(pageState()).toBe('empty');
        expect(learningErrorMessage({ errorCode: 'LEARNING_COURSE_NOT_FOUND' })).toBe('未找到这门课程');
        expect(learningErrorMessage({ errorCode: 'LEARNING_LESSON_NOT_FOUND' })).toBe('未找到这节课');
        expect(learningErrorMessage({ errorCode: 'LEARNING_LESSON_SCOPE_INVALID' })).toBe('课程日程筛选无效');
        expect(learningErrorMessage({ errorCode: 'STUDENT_SCOPE_REQUIRED' })).toBe('请使用学员账号登录');
        expect(learningErrorMessage({ message: '网络错误' })).toBe('网络错误');
        expect(learningErrorMessage(null, '稍后再试')).toBe('稍后再试');
        expect(courseDetailUrl('声乐/一班')).toBe('/pages/courseDetail/index?id=%E5%A3%B0%E4%B9%90%2F%E4%B8%80%E7%8F%AD');
        expect(courseDetailUrl()).toBe('/pages/courseDetail/index?id=');
        expect(lessonDetailUrl('lesson 1')).toBe('/pages/courseLessonDetail/index?id=lesson%201');
        expect(lessonDetailUrl()).toBe('/pages/courseLessonDetail/index?id=');
        expect(courseListUrl('courseLessons')).toBe('/pages/courseLessons/index');
        expect(courseListUrl('courseRecords', 'voice')).toBe('/pages/courseRecords/index?courseId=voice');
    });
});

function lesson(changes = {}) {
    return {
        lessonId: 'lesson', title: '声乐课', course: { courseId: 'voice', name: '少儿声乐' },
        status: 'scheduled', startAt: '2026-08-09T10:30:00+08:00', ...changes,
    };
}
