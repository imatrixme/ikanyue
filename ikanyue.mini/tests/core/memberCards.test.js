import { describe, expect, it } from 'vitest';
import { CARD_THEMES, cardTheme, findStudio, memberCards } from '../../miniprogram/core/memberCards.js';
import { profileEntries, profileStats } from '../../miniprogram/core/profile.js';

const courses = [
    { remainingLessons: 6, scheduledLessons: 1 },
    { remainingLessons: 2, scheduledLessons: 2 },
];

describe('member cards', () => {
    it('lists one card per studio, summarising the lessons left', () => {
        expect(memberCards({ courses, coverUrl: 'https://cdn.example.com/cover.jpg' })).toEqual([{
            coverUrl: 'https://cdn.example.com/cover.jpg',
            id: 'kanyue',
            name: '看乐艺术',
            summary: '剩余 8 课时',
            tagline: '声乐课程与预约',
            theme: 'mint',
        }]);
    });

    it('never reads an unknown balance as no lessons', () => {
        expect(memberCards()[0].summary).toBe('会员卡');
        expect(memberCards({ courses: [] })[0].summary).toBe('暂无课程');
        expect(memberCards({ role: 'teacher', courses })[0].summary).toBe('任教机构');
    });

    it('gives studios without a theme a stable one from their id', () => {
        expect(cardTheme({ id: 'studio-a' })).toBe(cardTheme({ id: 'studio-a' }));
        expect(CARD_THEMES).toContain(cardTheme({ id: 'studio-b' }));
        expect(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => cardTheme({ id }))).size).toBeGreaterThan(1);
        expect(cardTheme({ id: 'x', theme: 'sky' })).toBe('sky');
    });

    it('keeps studio information behind the card', () => {
        expect(findStudio('kanyue').infoLinks.length).toBeGreaterThan(0);
        expect(findStudio('missing')).toBeNull();
    });
});

describe('profile stats and entries', () => {
    it('shows the user\'s own numbers, with a dash while unknown', () => {
        expect(profileStats({ courses, points: 120 }).map(({ key, value }) => [key, value])).toEqual([
            ['remaining', '8'], ['scheduled', '3'], ['points', '120'],
        ]);
        expect(profileStats().map((stat) => stat.value)).toEqual(['—', '—', '—']);
    });

    it('keeps logout out of the shortcuts and the role switch only when it applies', () => {
        expect(profileEntries().map((entry) => entry.key)).toEqual(['orders', 'profile']);
        expect(profileEntries({ role: 'teacher', canSwitchRole: true }).map((entry) => entry.key)).toEqual(['profile', 'role']);
    });
});
