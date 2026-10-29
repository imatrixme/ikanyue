import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { profileEntries } from '../../miniprogram/core/profile.js';
import {
    homeCourseRows, homeState, needsRenewal, normalizeReminders, renewalHint, teacherRenewalRows,
} from '../../miniprogram/core/home.js';

const course = (overrides = {}) => ({
    awaitingActivation: false,
    courseId: 'course-1',
    courseName: '成人声乐一对一',
    expiringSoon: false,
    remainingLessons: 8,
    validUntil: null,
    ...overrides,
});

describe('home page logic', () => {
    it('derives one state per audience', () => {
        expect(homeState({ isLogin: false, courses: [course()] })).toBe('signedOut');
        expect(homeState({ isLogin: true, loading: true })).toBe('loading');
        expect(homeState({ isLogin: true, error: '网络异常' })).toBe('error');
        expect(homeState({ isLogin: true })).toBe('noCourse');
        expect(homeState({ isLogin: true, courses: [course()] })).toBe('member');
        expect(homeState({ isLogin: true, loading: true, error: '网络异常', courses: [course()] })).toBe('member');
    });

    it('asks for renewal only when lessons run low or the course is expiring', () => {
        expect(needsRenewal(course())).toBe(false);
        expect(needsRenewal(course({ remainingLessons: 2 }))).toBe(true);
        expect(needsRenewal(course({ expiringSoon: true }))).toBe(true);
        expect(needsRenewal(course({ awaitingActivation: true, remainingLessons: 0 }))).toBe(false);
    });

    it('words renewal hints without prices', () => {
        expect(renewalHint(course())).toBe('');
        expect(renewalHint(course({ remainingLessons: 0 }))).toBe('课时已用完，可查看续费课包');
        expect(renewalHint(course({ remainingLessons: 1 }))).toBe('仅剩 1 节，可查看续费课包');
        expect(renewalHint(course({ expiringSoon: true }))).toBe('课程即将到期，可查看续费课包');
        expect(renewalHint(course({ expiringSoon: true, remainingLessons: 2 }))).toBe('仅剩 2 节，可查看续费课包');
    });

    it('projects course rows for the status card', () => {
        expect(homeCourseRows([course({ remainingLessons: 1 })])).toEqual([{
            courseId: 'course-1',
            name: '成人声乐一对一',
            remainingLessons: 1,
            renewalHint: '仅剩 1 节，可查看续费课包',
            validityText: '长期有效',
        }]);
    });

    it('shows the newest 教务提醒 and the subscribe template', () => {
        expect(normalizeReminders()).toEqual({ reminder: null, subscribeTemplateId: '' });
        expect(normalizeReminders({
            items: [{ id: 'r2', sender: '看乐教务', message: '《声乐》剩余 1 节课时。' }, { id: 'r1', message: '旧提醒' }],
            subscribeTemplateId: 'tpl',
        })).toEqual({ reminder: { id: 'r2', message: '《声乐》剩余 1 节课时。', sender: '看乐教务' }, subscribeTemplateId: 'tpl' });
    });

    it('lists due students for teachers in academy dates', () => {
        expect(teacherRenewalRows({
            items: [
                { studentId: 's1', studentName: '张同学', courseId: 'c1', courseName: '声乐', reason: 'low_balance', remainingLessons: 1 },
                // 18:00Z is already the next day in Shanghai.
                { studentId: 's2', studentName: '', courseId: 'c1', courseName: '声乐', reason: 'expiring', remainingLessons: 5, validUntil: '2026-11-09T18:00:00.000Z' },
            ],
        })).toEqual([
            { key: 's1-c1', title: '张同学', description: '声乐 · 课时不足', value: '剩 1 节' },
            { key: 's2-c1', title: '学员', description: '声乐 · 即将到期', value: '11月10日到期' },
        ]);
        expect(teacherRenewalRows()).toEqual([]);
    });
});

describe('profile entries', () => {
    it('point at published pages, switching tabs only for tab pages', () => {
        const app = JSON.parse(readFileSync(new URL('../../miniprogram/app.json', import.meta.url), 'utf8'));
        const tabs = app.tabBar.list.map((item) => `/${item.pagePath}`);
        for (const entry of profileEntries({ role: 'student', canSwitchRole: true }).filter((item) => item.url)) {
            expect(app.pages, entry.key).toContain(entry.url.slice(1));
            expect(entry.tab, entry.key).toBe(tabs.includes(entry.url));
        }
    });
});
