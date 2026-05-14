import { describe, expect, it } from 'vitest';
import {
    applyAudioDetailResponse,
    applyMaterialListResponse,
    buildAudioDetailUrl,
    buildFavoriteStatus,
    createMaterialListParams,
    shouldLoadMore,
    sortFavoritesByTimeDesc,
} from './pageLogic';

describe('audio material page logic', () => {
    it('builds list query params and applies paged responses', () => {
        expect(createMaterialListParams()).toEqual({
            page: 1,
            perPage: 20,
            status: 'published',
            sort: '-sequence',
        });

        expect(applyMaterialListResponse({ items: [{ id: 'a1' }], totalItems: 3 }, 2, 2)).toEqual({
            items: [{ id: 'a1' }],
            totalItems: 3,
            currentPage: 2,
            hasMore: false,
        });

        expect(applyMaterialListResponse({ items: [{ id: 'a1' }, { id: 'a2' }] }, 1, 2).hasMore).toBe(true);
    });

    it('sorts favorites and builds favorite status by current list items', () => {
        const sorted = sortFavoritesByTimeDesc([
            { id: 'older', favoriteTime: '2026-05-13T00:00:00Z' },
            { id: 'newer', favoriteTime: '2026-05-14T00:00:00Z' },
        ]);

        expect(sorted.map((item) => item.id)).toEqual(['newer', 'older']);
        expect(buildFavoriteStatus([{ id: 'a1' }, { id: 'a2' }], ['a2'])).toEqual({
            a1: false,
            a2: true,
        });
    });

    it('guards pagination and maps detail navigation state', () => {
        expect(shouldLoadMore({ activeTab: 'all', hasMore: true, loadingMore: false })).toBe(true);
        expect(shouldLoadMore({ activeTab: 'favorites', hasMore: true, loadingMore: false })).toBe(false);
        expect(shouldLoadMore({ activeTab: 'all', hasMore: false, loadingMore: false })).toBe(false);
        expect(shouldLoadMore({ activeTab: 'all', hasMore: true, loadingMore: true })).toBe(false);

        expect(buildAudioDetailUrl({ id: 'audio_1' })).toBe('/pages/audioMaterial/detail/index?id=audio_1');
        expect(applyAudioDetailResponse({ id: 'audio_1', duration: 120 })).toEqual({
            detail: { id: 'audio_1', duration: 120 },
            duration: 120,
        });
        expect(applyAudioDetailResponse({ id: 'audio_2' }).duration).toBe(0);
    });
});
