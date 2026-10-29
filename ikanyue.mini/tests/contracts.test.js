import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// Role-aware schedule contracts, carried over from the Taro build's componentContracts test.
const read = (path) => readFile(new URL(`../miniprogram/${path}`, import.meta.url), 'utf8');

describe('role-aware schedule component contracts', () => {
    it('keeps activity loading independent from the shared upcoming module', async () => {
        const [activityView, activity, upcoming, upcomingView] = await Promise.all([
            read('pages/activity/index.wxml'), read('pages/activity/index.js'),
            read('components/upcoming-lessons/index.js'), read('components/upcoming-lessons/index.wxml'),
        ]);
        expect(activityView).toContain('<upcoming-lessons id="upcomingLessons"');
        expect(activity).toContain('Promise.all([');
        expect(activity).toContain("this.selectComponent('#upcomingLessons')?.refresh(true)");
        expect(upcoming).toContain('Api.getUpcomingSchedule({ limit: 3 })');
        expect(upcoming).toContain("role === 'teacher'");
        expect(upcoming).toContain('ScheduleManager.scopeFor');
        expect(upcomingView).toContain('wx:if="{{visible}}"');
    });

    it('renders three learner lessons with teacher and class context', async () => {
        const [courses, row] = await Promise.all([read('pages/courses/index.wxml'), read('components/lesson-row/index.js')]);
        expect(courses).toContain('wx:for="{{overview.upcomingLessons}}"');
        expect(courses).toContain('title="即将上课"');
        expect(row).toContain('lesson.teacherSummary');
        expect(row).toContain('lesson.classSummary');
        expect(row).toContain('lesson.participantSummary');
    });

    it('uses formal teacher lessons, a seven-day strip, availability overlay, and detail navigation', async () => {
        const [calendar, calendarView, detail, workbench, points, app] = await Promise.all([
            read('components/teacher-calendar-home/index.js'),
            read('components/teacher-calendar-home/index.wxml'),
            read('pages/teacherLessonDetail/index.js'),
            read('components/teacher-booking-home/index.wxml'),
            read('pages/points/index.js'),
            read('app.json'),
        ]);
        expect(calendar).toContain('Api.getTeacherSchedule');
        expect(calendar).toContain('buildSevenDayStrip');
        expect(calendarView).toContain('<switch');
        expect(`${calendar}${calendarView}`).not.toContain('appointment-row');
        expect(calendar).not.toContain('getTeacherCalendar');
        expect(detail).toContain('Api.getTeacherSchedule(dayRange(date))');
        expect(workbench).toContain('<upcoming-lessons id="upcoming"');
        expect(points).toContain("page.title(role === 'teacher' ? '课程日历'");
        expect(JSON.parse(app).pages).toContain('pages/teacherLessonDetail/index');
    });

    it('retains the pageable learner schedule and excludes internal vocabulary from runtime sources', async () => {
        const [lessons, scheduleLogic, upcoming, teacherDetail] = await Promise.all([
            read('pages/courseLessons/index.js'), read('core/schedule.js'),
            read('components/upcoming-lessons/index.js'), read('pages/teacherLessonDetail/index.js'),
        ]);
        expect(lessons).toContain('onReachBottom()');
        expect(lessons).toContain('pagination.page + 1');
        const runtime = `${scheduleLogic}\n${upcoming}\n${teacherDetail}`;
        ['credit_batches', 'conversion-authorizations', '/v1/course-credits', '课程点', '批次', '冻结'].forEach((term) => {
            expect(runtime).not.toContain(term);
        });
    });
});
