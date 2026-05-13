import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { favoriteManager } from './favoriteManager';

const taroMock = vi.hoisted(() => ({
    getStorage: vi.fn(),
    removeStorage: vi.fn(),
    setStorage: vi.fn(),
}));

vi.mock('@tarojs/taro', () => ({
    default: taroMock,
}));

const readStoredValue = (storage, key) => storage.get(key);

describe('favoriteManager', () => {
    let storage;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-14T00:00:00.000Z'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        storage = new Map();
        vi.clearAllMocks();

        taroMock.getStorage.mockImplementation(async ({ key }) => {
            if (!storage.has(key)) {
                throw new Error(`missing ${key}`);
            }
            return { data: storage.get(key) };
        });
        taroMock.setStorage.mockImplementation(async ({ key, data }) => {
            storage.set(key, data);
        });
        taroMock.removeStorage.mockImplementation(async ({ key }) => {
            storage.delete(key);
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('adds, deduplicates, toggles, counts, and clears audio favorites', async () => {
        const audio = { id: 'audio_1', title: '声乐练习' };

        await expect(favoriteManager.getFavoriteIds()).resolves.toEqual([]);
        await expect(favoriteManager.addFavorite(audio)).resolves.toBe(true);
        await expect(favoriteManager.addFavorite(audio)).resolves.toBe(true);
        await expect(favoriteManager.isFavorite('audio_1')).resolves.toBe(true);
        await expect(favoriteManager.getFavoriteCount()).resolves.toBe(1);

        expect(readStoredValue(storage, 'audio_favorites')).toEqual(['audio_1']);
        expect(readStoredValue(storage, 'audio_favorites_details')).toEqual([
            {
                ...audio,
                favoriteTime: '2026-05-14T00:00:00.000Z',
            },
        ]);

        await expect(favoriteManager.toggleFavorite(audio)).resolves.toBe(false);
        await expect(favoriteManager.isFavorite('audio_1')).resolves.toBe(false);

        await expect(favoriteManager.toggleFavorite(audio)).resolves.toBe(true);
        await expect(favoriteManager.clearFavorites()).resolves.toBe(true);
        expect(storage.has('audio_favorites')).toBe(false);
        expect(storage.has('audio_favorites_details')).toBe(false);
    });

    it('adds, deduplicates, toggles, counts, and clears video favorites', async () => {
        const video = { id: 'video_1', title: '舞台片段' };

        await expect(favoriteManager.getFavoriteVideoIds()).resolves.toEqual([]);
        await expect(favoriteManager.addFavoriteVideo(video)).resolves.toBe(true);
        await expect(favoriteManager.addFavoriteVideo(video)).resolves.toBe(true);
        await expect(favoriteManager.isFavoriteVideo('video_1')).resolves.toBe(true);
        await expect(favoriteManager.getFavoriteVideoCount()).resolves.toBe(1);

        expect(readStoredValue(storage, 'video_favorites')).toEqual(['video_1']);
        expect(readStoredValue(storage, 'video_favorites_details')).toEqual([
            {
                ...video,
                favoriteTime: '2026-05-14T00:00:00.000Z',
            },
        ]);

        await expect(favoriteManager.toggleFavoriteVideo(video)).resolves.toBe(false);
        await expect(favoriteManager.isFavoriteVideo('video_1')).resolves.toBe(false);

        await expect(favoriteManager.toggleFavoriteVideo(video)).resolves.toBe(true);
        await expect(favoriteManager.clearVideoFavorites()).resolves.toBe(true);
        expect(storage.has('video_favorites')).toBe(false);
        expect(storage.has('video_favorites_details')).toBe(false);
    });

    it('normalizes invalid storage reads to empty lists', async () => {
        storage.set('audio_favorites', { invalid: true });
        storage.set('audio_favorites_details', null);
        storage.set('video_favorites', 'video_1');
        storage.set('video_favorites_details', { invalid: true });

        await expect(favoriteManager.getFavoriteIds()).resolves.toEqual([]);
        await expect(favoriteManager.getFavoriteAudios()).resolves.toEqual([]);
        await expect(favoriteManager.getFavoriteVideoIds()).resolves.toEqual([]);
        await expect(favoriteManager.getFavoriteVideos()).resolves.toEqual([]);
    });

    it('returns false when storage writes or clears fail', async () => {
        taroMock.setStorage.mockRejectedValueOnce(new Error('set failed'));
        await expect(favoriteManager.addFavorite({ id: 'audio_2', title: '音频2' })).resolves.toBe(false);

        taroMock.setStorage.mockRejectedValueOnce(new Error('set failed'));
        await expect(favoriteManager.removeFavorite('audio_2')).resolves.toBe(false);

        taroMock.removeStorage.mockRejectedValueOnce(new Error('remove failed'));
        await expect(favoriteManager.clearFavorites()).resolves.toBe(false);

        taroMock.setStorage.mockRejectedValueOnce(new Error('set failed'));
        await expect(favoriteManager.addFavoriteVideo({ id: 'video_2', title: '视频2' })).resolves.toBe(false);

        taroMock.setStorage.mockRejectedValueOnce(new Error('set failed'));
        await expect(favoriteManager.removeFavoriteVideo('video_2')).resolves.toBe(false);

        taroMock.removeStorage.mockRejectedValueOnce(new Error('remove failed'));
        await expect(favoriteManager.clearVideoFavorites()).resolves.toBe(false);
    });
});
