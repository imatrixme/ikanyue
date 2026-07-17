import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserManager } from './usermanager';

const taroMock = vi.hoisted(() => ({
    getStorageSync: vi.fn(),
    setStorageSync: vi.fn(),
    removeStorageSync: vi.fn(),
}));

vi.mock('@tarojs/taro', () => ({
    default: taroMock,
}));

const storageKey = 'com.ikanyue.cache.userinfo';

describe('UserManager', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reads valid cached user info and falls back for empty storage', () => {
        taroMock.getStorageSync.mockReturnValueOnce(
            JSON.stringify({
                id: 'student_1',
                token: 'token-1234567890',
            })
        );

        expect(UserManager.getUserInfo()).toEqual({
            id: 'student_1',
            token: 'token-1234567890',
        });

        taroMock.getStorageSync.mockReturnValueOnce('');
        expect(UserManager.getUserInfo()).toEqual({});

        taroMock.getStorageSync.mockReturnValueOnce({ id: 'not-json' });
        expect(UserManager.getUserInfo()).toEqual({});
    });

    it('removes corrupted cached user info', () => {
        taroMock.getStorageSync.mockReturnValue('{bad-json');

        expect(UserManager.getUserInfo()).toEqual({});
        expect(taroMock.removeStorageSync).toHaveBeenCalledWith(storageKey);
    });

    it('merges cached user data, preserves token, and writes JSON back', () => {
        taroMock.getStorageSync.mockReturnValue(
            JSON.stringify({
                id: 'student_1',
                token: 'token-1234567890',
                nickName: '旧昵称',
            })
        );

        const updated = UserManager.updateUserInfoCache({
            nickName: '新昵称',
            avatar: 'https://example.com/avatar.png',
        });

        expect(updated).toEqual({
            id: 'student_1',
            token: 'token-1234567890',
            nickName: '新昵称',
            nickname: '新昵称',
            avatar: 'https://example.com/avatar.png',
        });
        expect(taroMock.setStorageSync).toHaveBeenCalledWith(storageKey, JSON.stringify(updated));
    });

    it('keeps legacy profile aliases aligned with the updated canonical fields', () => {
        taroMock.getStorageSync.mockReturnValue(
            JSON.stringify({
                id: 'student_1',
                nickName: '旧昵称',
                nickname: '旧昵称',
                realName: '旧姓名',
                realname: '旧姓名',
            })
        );

        const updated = UserManager.updateUserInfoCache({
            nickName: '新昵称',
            nickname: '旧昵称',
            realName: '新姓名',
            realname: '旧姓名',
        });

        expect(updated).toMatchObject({
            nickName: '新昵称',
            nickname: '新昵称',
            realName: '新姓名',
            realname: '新姓名',
        });
    });

    it('keeps an explicitly refreshed token when cache already has one', () => {
        taroMock.getStorageSync.mockReturnValue(JSON.stringify({ id: 'student_1', token: 'old-token' }));

        const updated = UserManager.updateUserInfoCache({ token: 'new-token' });

        expect(updated.token).toBe('new-token');

        const preserved = UserManager.updateUserInfoCache({ token: '' });
        expect(preserved.token).toBe('old-token');
    });

    it('returns the original user data when cache writing fails', () => {
        taroMock.getStorageSync.mockReturnValue('{}');
        taroMock.setStorageSync.mockImplementation(() => {
            throw new Error('storage failed');
        });

        expect(UserManager.updateUserInfoCache({ id: 'student_2' })).toEqual({ id: 'student_2' });
    });

    it('rejects empty cache updates', () => {
        expect(UserManager.updateUserInfoCache(null)).toEqual({});
        expect(taroMock.setStorageSync).not.toHaveBeenCalled();
    });

    it('reads token, checks login state, and logs out', () => {
        taroMock.getStorageSync.mockReturnValueOnce(JSON.stringify({ token: 'token-1234567890' }));
        expect(UserManager.getToken()).toBe('token-1234567890');

        taroMock.getStorageSync.mockReturnValueOnce(JSON.stringify({ token: 'token-1234567890' }));
        expect(UserManager.isLogin()).toBe(true);

        taroMock.getStorageSync.mockReturnValueOnce('{}');
        expect(UserManager.isLogin()).toBe(false);

        UserManager.logout();
        expect(taroMock.removeStorageSync).toHaveBeenCalledWith(storageKey);
    });

    it('falls back to browser storage when Taro storage APIs are unavailable', () => {
        const originalGet = taroMock.getStorageSync;
        const originalSet = taroMock.setStorageSync;
        const originalRemove = taroMock.removeStorageSync;
        const browserStorage = new Map([[storageKey, JSON.stringify({ token: 'browser-token' })]]);
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: {
                getItem: vi.fn((key) => browserStorage.get(key) || null),
                removeItem: vi.fn((key) => browserStorage.delete(key)),
                setItem: vi.fn((key, value) => browserStorage.set(key, value)),
            },
        });
        taroMock.getStorageSync = undefined;
        taroMock.setStorageSync = undefined;
        taroMock.removeStorageSync = undefined;

        expect(UserManager.getToken()).toBe('browser-token');
        UserManager.updateUserInfoCache({ nickName: '浏览器学员' });
        expect(JSON.parse(browserStorage.get(storageKey))).toMatchObject({
            nickName: '浏览器学员',
            token: 'browser-token',
        });
        UserManager.logout();
        expect(browserStorage.has(storageKey)).toBe(false);

        taroMock.getStorageSync = originalGet;
        taroMock.setStorageSync = originalSet;
        taroMock.removeStorageSync = originalRemove;
        delete globalThis.localStorage;
    });
});
