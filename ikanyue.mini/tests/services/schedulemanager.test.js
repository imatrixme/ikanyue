import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CACHE_KEY, DEFAULT_MAX_AGE, ScheduleManager } from '../../miniprogram/services/schedulemanager.js';



describe('ScheduleManager', () => {
    let store;

    beforeEach(() => {
        store = new Map();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(Date, 'now').mockReturnValue(10000);
        wx.getStorageSync.mockImplementation((key) => store.get(key) || '');
        wx.setStorageSync.mockImplementation((key, value) => store.set(key, value));
        wx.removeStorageSync.mockImplementation((key) => store.delete(key));
    });

    afterEach(() => vi.restoreAllMocks());

    it('keys cache scopes by role and principal', () => {
        expect(ScheduleManager.scopeFor({ id: 'u1', role: 'teacher' })).toBe('teacher:u1');
        expect(ScheduleManager.scopeFor({ userId: 'u2', role: 'student' })).toBe('student:u2');
        expect(ScheduleManager.scopeFor()).toBe('student:anonymous');
    });

    it('stores, reads, expires, and clears role-scoped values', () => {
        ScheduleManager.set('teacher:t1', 'upcoming', { items: [{ lessonId: 'l1' }] });
        expect(ScheduleManager.get('teacher:t1', 'upcoming')).toEqual({ items: [{ lessonId: 'l1' }] });
        expect(ScheduleManager.get('student:t1', 'upcoming')).toBeNull();

        vi.spyOn(Date, 'now').mockReturnValue(10000 + DEFAULT_MAX_AGE + 1);
        expect(ScheduleManager.get('teacher:t1', 'upcoming')).toBeNull();
        expect(ScheduleManager.get('teacher:t1', 'upcoming', { maxAge: -1 })).toEqual({ items: [{ lessonId: 'l1' }] });

        expect(ScheduleManager.clearScope('missing')).toBe(false);
        expect(ScheduleManager.clearScope('teacher:t1')).toBe(true);
        expect(store.has(CACHE_KEY)).toBe(false);
    });

    it('retains other role caches while clearing one scope and supports full reset', () => {
        ScheduleManager.set('teacher:t1', 'week', { items: [] });
        ScheduleManager.set('student:s1', 'upcoming', { items: [] });
        expect(ScheduleManager.clearScope('teacher:t1')).toBe(true);
        expect(ScheduleManager.get('student:s1', 'upcoming')).toEqual({ items: [] });
        ScheduleManager.clearAll();
        expect(wx.removeStorageSync).toHaveBeenCalledWith(CACHE_KEY);
    });

    it('recovers from corrupted storage and falls back to browser storage', () => {
        store.set(CACHE_KEY, '{broken');
        expect(ScheduleManager.get('student:s1', 'upcoming')).toBeNull();
        expect(wx.removeStorageSync).toHaveBeenCalledWith(CACHE_KEY);
    });

    it('ignores invalid writes and malformed entries', () => {
        expect(ScheduleManager.set('', '', 'unchanged')).toBe('unchanged');
        store.set(CACHE_KEY, JSON.stringify({ 'student:s1': { upcoming: { savedAt: 'bad', value: 1 } } }));
        expect(ScheduleManager.get('student:s1', 'upcoming')).toBeNull();
    });
});
