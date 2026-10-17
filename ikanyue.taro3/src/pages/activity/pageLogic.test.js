import { describe, expect, it } from 'vitest';
import {
    buildImageDetailUrl,
    createActivityQueryParams,
    createDateGroups,
    filterActivitiesByDateGroup,
    formatDateOnly,
    formatTimeOnly,
    mapActivityDetail,
} from './pageLogic';

describe('activity page logic', () => {
    it('creates the page-facing activity query range', () => {
        const params = createActivityQueryParams(new Date('2026-05-14T10:00:00Z'));

        expect(params).toEqual({
            start_time_gte: new Date('2020-01-01').toISOString(),
            start_time_lte: '2027-12-31T15:59:59.999Z',
            perPage: 100,
        });

        expect(createActivityQueryParams().perPage).toBe(100);
    });

    it('builds seven date groups and two image navigation groups', () => {
        const groups = createDateGroups(new Date('2026-05-14T08:00:00+08:00'));

        expect(groups).toHaveLength(9);
        expect(groups[0]).toMatchObject({
            title: '今天',
            dateText: '5月14日',
            type: 'day',
        });
        expect(groups[7]).toMatchObject({
            dateText: '看乐教学',
            action: 'navigate-image',
            detailTitle: '看乐教学',
        });
        expect(groups[8]).toMatchObject({
            dateText: '关于看乐',
            action: 'navigate-image',
            detailTitle: '关于看乐',
        });
        expect(createDateGroups()).toHaveLength(9);
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
        expect(filterActivitiesByDateGroup([{ id: 'x' }], { action: 'navigate-image' })).toEqual([]);
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
