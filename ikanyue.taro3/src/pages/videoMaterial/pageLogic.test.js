import { describe, expect, it } from 'vitest';
import {
    applyMaterialListResponse,
    applyVideoDetailResponse,
    buildFavoriteStatus,
    buildVideoDetailUrl,
    createMaterialListParams,
    shouldLoadMore,
    sortFavoritesByTimeDesc,
} from './pageLogic';

describe('video material page logic', () => {
    it('builds list query params and applies paged responses', () => {
        expect(createMaterialListParams(3, 10)).toEqual({
            page: 3,
            perPage: 10,
            status: 'published',
            sort: '-sequence',
        });
        expect(applyMaterialListResponse({ items: new Array(10).fill(null), totalItems: 11 }, 3, 10)).toMatchObject({
            totalItems: 11,
            currentPage: 3,
            hasMore: true,
        });
    });

    it('sorts favorites and builds favorite status maps', () => {
        expect(
            sortFavoritesByTimeDesc([
                { id: 'v1', favoriteTime: '2026-05-13T00:00:00Z' },
                { id: 'v2', favoriteTime: '2026-05-14T00:00:00Z' },
            ]).map((item) => item.id)
        ).toEqual(['v2', 'v1']);

        expect(buildFavoriteStatus([{ id: 'v1' }, { id: 'v2' }])).toEqual({
            v1: true,
            v2: true,
        });
    });

    it('guards pagination and maps video detail state', () => {
        expect(shouldLoadMore({ activeTab: 'all', hasMore: true, loadingMore: false })).toBe(true);
        expect(shouldLoadMore({ activeTab: 'favorites', hasMore: true, loadingMore: false })).toBe(false);

        expect(buildVideoDetailUrl({ id: 'video_1' })).toBe('/pages/videoMaterial/detail/index?id=video_1');
        expect(applyVideoDetailResponse({ id: 'video_1', duration: 240 })).toEqual({
            detail: { id: 'video_1', duration: 240 },
            duration: 240,
        });
    });
});
