import { describe, expect, it } from 'vitest';
import {
    homeCourseRows, homeState, needsRenewal, renewalHint,
} from './pageLogic';

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
});
