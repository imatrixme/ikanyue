import { describe, expect, it } from 'vitest';
import { buildImageDetailUrl } from '../../data/kanyueInfoLinks';
import {
    createActivityQueryParams,
    createDateGroups,
    daysWithActivities,
    filterActivitiesByDateGroup,
    formatDateOnly,
    formatTimeOnly,
    mapActivityDetail,
    nextDayWithActivities,
} from './pageLogic';

describe('activity page logic', () => {
    it('queries exactly the seven-day strip, earliest first', () => {
        const params = createActivityQueryParams(new Date('2026-05-14T10:00:00Z'));

        expect(params).toEqual({
            start_time_gte: '2026-05-13T16:00:00.000Z',
            start_time_lte: '2026-05-20T15:59:59.999Z',
            sort: 'startTime',
            perPage: 100,
        });

        expect(createActivityQueryParams().perPage).toBe(100);
    });

    it('builds seven date groups without navigation links', () => {
        const groups = createDateGroups(new Date('2026-05-14T08:00:00+08:00'));

        expect(groups).toHaveLength(7);
        expect(groups[0]).toMatchObject({
            title: '今天',
            dateText: '5月14日',
            type: 'day',
        });
        expect(groups.every((group) => group.type === 'day')).toBe(true);
        expect(createDateGroups()).toHaveLength(7);
    });

    it('marks days with activities and finds the next one', () => {
        const groups = createDateGroups(new Date('2026-05-14T08:00:00+08:00'));
        const activities = [
            { id: 'sat', startTime: '2026-05-16T19:00:00+08:00' },
            { id: 'tue', startTime: '2026-05-19T09:00:00+08:00' },
        ];

        expect(daysWithActivities(groups, activities)).toEqual([2, 5]);
        expect(nextDayWithActivities(groups, activities, 0)).toBe(2);
        expect(nextDayWithActivities(groups, activities, 2)).toBe(5);
        expect(nextDayWithActivities(groups, activities, 5)).toBe(-1);
        expect(nextDayWithActivities(groups, [], 0)).toBe(-1);
    });

    it('filters activities by the selected date group', () => {
        const [group] = createDateGroups(new Date('2026-05-14T08:00:00+08:00'));
        const filtered = filterActivitiesByDateGroup(
            [
                { id: 'same-day', startTime: '2026-05-14T10:30:00+08:00' },
                { id: 'next-day', startTime: '2026-05-15T10:30:00+08:00' },
                { id: 'invalid', startTime: 'not-a-date' },
                { id: 'missing' },
            ],
            group
        );

        expect(filtered).toEqual([{ id: 'same-day', startTime: '2026-05-14T10:30:00+08:00' }]);
        expect(filterActivitiesByDateGroup([{ id: 'x' }], null)).toEqual([]);
        expect(filterActivitiesByDateGroup(undefined, group)).toEqual([]);
        expect(
            filterActivitiesByDateGroup([], {
                startTime: 'invalid',
                endTime: '2026-05-14T23:59:59+08:00',
            })
        ).toEqual([]);
        expect(
            filterActivitiesByDateGroup([], {
                startTime: '2026-05-14T00:00:00+08:00',
                endTime: 'invalid',
            })
        ).toEqual([]);
    });

    it('maps activity detail API fields into page state', () => {
        const mapped = mapActivityDetail(
            { id: 0, title: '', images: [] },
            {
                id: 'activity_1',
                title: '公开课',
                description: '<p>详情</p>',
                coverImageUrl: 'https://example.com/cover.jpg',
                images: ['raw-one.jpg'],
                imageUrls: ['https://example.com/one.jpg'],
                startTime: '2026-05-14T10:00:00Z',
                endTime: '2026-05-14T11:00:00Z',
                location: '上海',
                price: 1000,
                external_link: 'https://example.com/signup',
                tags: '声乐,体验',
                max_participants: 30,
                current_participants: 20,
            }
        );

        expect(mapped).toMatchObject({
            id: 'activity_1',
            title: '公开课',
            coverImage: 'https://example.com/cover.jpg',
            images: ['https://example.com/one.jpg'],
            externalLink: 'https://example.com/signup',
            maxParticipants: 30,
            currentParticipants: 20,
        });

        expect(
            mapActivityDetail(
                { retained: true },
                {
                    id: 'activity_2',
                    title: '体验课',
                    coverImageUrl: '',
                    startTime: null,
                    endTime: null,
                    location: '',
                    price: 0,
                    externalLink: 'https://example.com/camel-signup',
                    maxParticipants: 12,
                    currentParticipants: 3,
                }
            )
        ).toMatchObject({
            retained: true,
            description: '',
            images: [],
            externalLink: 'https://example.com/camel-signup',
            tags: [],
            maxParticipants: 12,
            currentParticipants: 3,
        });
        expect(mapActivityDetail({}, { id: 'activity_3' })).toMatchObject({
            description: '',
            images: [],
            tags: [],
            maxParticipants: 0,
            currentParticipants: 0,
        });
        expect(mapActivityDetail({}, null)).toBeNull();
    });

    it('formats dates, times, and image detail navigation URLs', () => {
        expect(formatDateOnly('2026-05-14T10:05:00+08:00')).toBe('5月14日');
        expect(formatDateOnly(null)).toBe('');
        expect(formatDateOnly('invalid')).toBe('');
        expect(formatTimeOnly('2026-05-14T10:05:00+08:00')).toBe('10:05');
        expect(formatTimeOnly(null)).toBe('');
        expect(formatTimeOnly('invalid')).toBe('');

        expect(
            buildImageDetailUrl({
                imageUrl: 'https://example.com/a b.jpg',
                detailTitle: '关于看乐',
            })
        ).toBe('/pages/imageDetail/index?imageUrl=https%3A%2F%2Fexample.com%2Fa%20b.jpg&title=%E5%85%B3%E4%BA%8E%E7%9C%8B%E4%B9%90');
        expect(buildImageDetailUrl({ imageUrl: 'https://example.com/plain.jpg' })).toBe(
            '/pages/imageDetail/index?imageUrl=https%3A%2F%2Fexample.com%2Fplain.jpg'
        );
        expect(buildImageDetailUrl({})).toBe('');
    });
});
