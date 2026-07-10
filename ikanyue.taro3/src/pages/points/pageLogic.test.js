import { describe, expect, it } from 'vitest';
import {
    formatPoints,
    getRewardStateText,
    normalizeRewardAvailability,
    normalizePointSummary,
    normalizeRewardItem,
    splitRewardsByBalance,
} from './pageLogic';

describe('points page logic', () => {
    it('normalizes summaries and rewards for the lite points page', () => {
        expect(normalizePointSummary({ balance: '120', events: null, studentId: 'student_1' })).toEqual({
            balance: 120,
            events: [],
            studentId: 'student_1',
        });
        expect(normalizePointSummary()).toEqual({ balance: 0, events: [], studentId: '' });
        expect(normalizePointSummary({ events: [{ id: 'event_1' }] }).events).toHaveLength(1);

        expect(normalizeRewardItem({ id: 'reward_1', pointsPrice: '50', status: 'paused' })).toMatchObject({
            id: 'reward_1',
            name: '未命名实物',
            pointsPrice: 50,
            status: 'active',
        });
        expect(normalizeRewardItem()).toMatchObject({
            description: '',
            id: '',
            image: '',
            pointsPrice: 0,
            sortOrder: 0,
        });
    });

    it('splits active rewards into redeemable and locked groups', () => {
        const result = splitRewardsByBalance([
            { id: 'book', name: '练习册', pointsPrice: 200, sortOrder: 2, status: 'active' },
            { id: 'sticker', name: '贴纸', pointsPrice: 50, sortOrder: 1, status: 'active' },
            { id: 'badge', name: '徽章', pointsPrice: 50, sortOrder: 0, status: 'active' },
            { id: 'hidden', name: '下线', pointsPrice: 10, status: 'inactive' },
        ], 120);

        expect(result.redeemable.map((item) => item.id)).toEqual(['badge', 'sticker']);
        expect(result.locked.map((item) => item.id)).toEqual(['book']);
        expect(splitRewardsByBalance().redeemable).toEqual([]);
    });

    it('normalizes backend reward availability response', () => {
        const result = normalizeRewardAvailability({
            currentPoints: 120,
            redeemableItems: [
                { id: 'sticker', name: '贴纸', pointsPrice: 50, status: 'active' },
            ],
            lockedItems: [
                { id: 'book', name: '练习册', pointsPrice: 200, status: 'active' },
                { id: 'hidden', name: '下线', pointsPrice: 10, status: 'inactive' },
            ],
        }, 120);

        expect(result.currentPoints).toBe(120);
        expect(result.redeemable.map((item) => item.id)).toEqual(['sticker']);
        expect(result.locked.map((item) => item.id)).toEqual(['book']);

        expect(normalizeRewardAvailability({
            currentPoints: 'invalid',
            lockedItems: [{ id: 'book', pointsPrice: 200 }],
        }, 25)).toMatchObject({
            currentPoints: 25,
            redeemable: [],
        });
        expect(normalizeRewardAvailability({
            redeemableItems: [{ id: 'sticker', pointsPrice: 50 }],
        }).locked).toEqual([]);
    });

    it('keeps a fallback for flat reward item payloads', () => {
        const result = normalizeRewardAvailability({
            items: [
                { id: 'book', name: '练习册', pointsPrice: 200, status: 'active' },
                { id: 'sticker', name: '贴纸', pointsPrice: 50, status: 'active' },
            ],
        }, 120);

        expect(result.currentPoints).toBe(120);
        expect(result.redeemable.map((item) => item.id)).toEqual(['sticker']);
        expect(result.locked.map((item) => item.id)).toEqual(['book']);
    });

    it('formats point and reward state copy', () => {
        expect(formatPoints(30)).toBe('30 分');
        expect(formatPoints()).toBe('0 分');
        expect(getRewardStateText(null, 30)).toBe('可兑换');
        expect(getRewardStateText({ pointsPrice: 20 }, 30)).toBe('可兑换');
        expect(getRewardStateText({ pointsPrice: 50 }, 30)).toBe('还差 20 分');
    });
});
