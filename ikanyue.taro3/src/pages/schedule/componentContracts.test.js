import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('role-aware schedule component contracts', () => {
    it('keeps activity loading independent from the shared upcoming module', async () => {
        const [activity, upcoming] = await Promise.all([
            read('../activity/index.vue'), read('../../components/UpcomingLessons.vue'),
        ]);
        expect(activity).toContain('<upcoming-lessons ref="upcomingLessons"');
        expect(activity).toContain('Promise.all([');
        expect(activity).toContain('refreshActivitiesWithToast(false)');
        expect(upcoming).toContain('Api.getUpcomingSchedule({ limit: 3 })');
        expect(upcoming).toContain("this.role === 'teacher'");
        expect(upcoming).toContain('ScheduleManager.scopeFor');
        expect(upcoming).toContain('v-if="visible"');
    });

    it('renders three learner lessons with teacher and class context', async () => {
        const [courses, row] = await Promise.all([
            read('../courses/index.vue'), read('../../components/LessonRow.vue'),
        ]);
        expect(courses).toContain('v-for="(lesson, index) in overview.upcomingLessons"');
        expect(courses).toContain('接下来 3 节已安排课程');
        expect(row).toContain('lesson.teacherSummary');
        expect(row).toContain('lesson.classSummary');
        expect(row).toContain('lesson.participantSummary');
    });

    it('uses formal teacher lessons, a seven-day strip, availability overlay, and detail navigation', async () => {
        const [calendar, detail, workbench, points, appConfig] = await Promise.all([
            read('../../components/TeacherCalendarHome.vue'),
            read('../teacherLessonDetail/index.vue'),
            read('../../components/TeacherBookingHome.vue'),
            read('../points/index.vue'),
            read('../../app.config.js'),
        ]);
        expect(calendar).toContain('Api.getTeacherSchedule');
        expect(calendar).toContain('buildSevenDayStrip');
        expect(calendar).toContain('<switch');
        expect(calendar).not.toContain('AppointmentRow');
        expect(calendar).not.toContain('getTeacherCalendar');
        expect(detail).toContain('Api.getTeacherSchedule(dayRange(this.date))');
        expect(workbench).toContain('<upcoming-lessons ref="upcomingLessons"');
        expect(points).toContain("title: this.role === 'teacher' ? '课程日历'");
        expect(appConfig).toContain("'pages/teacherLessonDetail/index'");
    });

    it('retains the pageable learner schedule and excludes internal vocabulary from runtime sources', async () => {
        const [lessons, scheduleLogic, upcoming, teacherDetail] = await Promise.all([
            read('../courseLessons/index.vue'), read('./pageLogic.js'),
            read('../../components/UpcomingLessons.vue'), read('../teacherLessonDetail/index.vue'),
        ]);
        expect(lessons).toContain('onReachBottom()');
        expect(lessons).toContain('this.pagination.page + 1');
        const runtime = `${scheduleLogic}\n${upcoming}\n${teacherDetail}`;
        ['credit_batches', 'conversion-authorizations', '/v1/course-credits', '课程点', '批次', '冻结'].forEach((term) => {
            expect(runtime).not.toContain(term);
        });
    });
});
