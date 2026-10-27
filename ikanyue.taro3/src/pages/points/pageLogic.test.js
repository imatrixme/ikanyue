import { describe, expect, it } from 'vitest';
import {
    formatPoints,
    formatPointEventDate,
    formatPointEventDelta,
    getPointEventLabel,
    getPointEventReason,
    getRewardProgress,
    getRewardStateText,
    mergePointEvents,
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
            pagination: { page: 1, perPage: 20, totalItems: 0, totalPages: 1 },
            studentId: 'student_1',
        });
        expect(normalizePointSummary()).toEqual({
            balance: 0,
            events: [],
            pagination: { page: 1, perPage: 20, totalItems: 0, totalPages: 1 },
            studentId: '',
        });
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
        expect(getRewardStateText(null, 30)).toBe('可领取');
        expect(getRewardStateText({ pointsPrice: 20 }, 30)).toBe('可领取');
        expect(getRewardStateText({ pointsPrice: 50 }, 30)).toBe('还差 20 分');
        expect(getRewardProgress({ pointsPrice: 50 }, 30)).toBe(60);
        expect(getRewardProgress({ pointsPrice: 50 }, 80)).toBe(100);
        expect(getRewardProgress({ pointsPrice: 50 }, -5)).toBe(0);
        expect(getRewardProgress({ pointsPrice: 0 }, 30)).toBe(0);
        expect(getRewardProgress({ pointsPrice: 'invalid' }, 30)).toBe(0);
    });

    it('normalizes and formats the same point-event fields used by admin', () => {
        const summary = normalizePointSummary({
            balance: 70,
            events: [
                {
                    id: 'event_1',
                    studentId: 'student_1',
                    type: 'offline_redeem',
                    delta: '-50',
                    balanceAfter: '70',
                    reason: 'offline_redeem',
                    remark: '已领取',
                    rewardSnapshot: { id: 'sticker', name: '贴纸', pointsPrice: 50 },
                    created: '2026-07-13T08:00:00.000Z',
                },
            ],
            pagination: { page: 1, perPage: 20, totalItems: 1, totalPages: 1 },
        });
        const [event] = summary.events;

        expect(event).toMatchObject({ delta: -50, balanceAfter: 70, type: 'offline_redeem' });
        expect(getPointEventLabel(event)).toBe('线下兑换');
        expect(getPointEventReason(event)).toBe('贴纸');
        expect(formatPointEventDelta(event.delta)).toBe('-50');
        expect(formatPointEventDate(event.created)).toMatch(/^2026\.07\.13 /);
        expect(getPointEventLabel({ type: 'earn' })).toBe('增加积分');
        expect(getPointEventReason({ reason: 'admin_grant' })).toBe('管理员发放');
        expect(getPointEventReason({ reason: 'local_seed' })).toBe('初始积分');
        expect(getPointEventReason({ reason: '', remark: '补记' })).toBe('补记');
        expect(formatPointEventDelta(20)).toBe('+20');
        expect(formatPointEventDate('')).toBe('-');
        expect(formatPointEventDate('invalid-date')).toBe('invalid-date');
        expect(mergePointEvents([{ id: 'event_1' }], [{ id: 'event_1' }, { id: 'event_2' }])).toEqual([
            { id: 'event_1' },
            { id: 'event_2' },
        ]);
    });
});
