import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserManager } from '../../miniprogram/services/usermanager.js';

const scheduleManagerMock = vi.hoisted(() => ({ clearAll: vi.fn() }));

vi.mock('../../miniprogram/services/schedulemanager.js', () => ({ ScheduleManager: scheduleManagerMock }));

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
        wx.getStorageSync.mockReturnValueOnce(
            JSON.stringify({
                id: 'student_1',
                token: 'token-1234567890',
            })
        );

        expect(UserManager.getUserInfo()).toEqual({
            id: 'student_1',
            token: 'token-1234567890',
        });

        wx.getStorageSync.mockReturnValueOnce('');
        expect(UserManager.getUserInfo()).toEqual({});

        wx.getStorageSync.mockReturnValueOnce({ id: 'not-json' });
        expect(UserManager.getUserInfo()).toEqual({});
    });

    it('removes corrupted cached user info', () => {
        wx.getStorageSync.mockReturnValue('{bad-json');

        expect(UserManager.getUserInfo()).toEqual({});
        expect(wx.removeStorageSync).toHaveBeenCalledWith(storageKey);
    });

    it('merges cached user data, preserves token, and writes JSON back', () => {
        wx.getStorageSync.mockReturnValue(
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
        expect(wx.setStorageSync).toHaveBeenCalledWith(storageKey, JSON.stringify(updated));
        expect(scheduleManagerMock.clearAll).not.toHaveBeenCalled();
    });

    it('clears schedule state when the active principal or role changes', () => {
        wx.getStorageSync.mockReturnValue(JSON.stringify({ id: 'student_1', role: 'student', token: 'token' }));
        UserManager.updateUserInfoCache({ id: 'teacher_1', role: 'teacher' });
        expect(scheduleManagerMock.clearAll).toHaveBeenCalledTimes(1);
    });

    it('keeps legacy profile aliases aligned with the updated canonical fields', () => {
        wx.getStorageSync.mockReturnValue(
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

        wx.getStorageSync.mockReturnValue('{}');
        expect(UserManager.updateUserInfoCache({ nickname: '旧字段', realname: '旧姓名' })).toMatchObject({
            nickName: '旧字段', nickname: '旧字段', realName: '旧姓名', realname: '旧姓名',
        });
    });

    it('keeps an explicitly refreshed token when cache already has one', () => {
        wx.getStorageSync.mockReturnValue(JSON.stringify({ id: 'student_1', token: 'old-token' }));

        const updated = UserManager.updateUserInfoCache({ token: 'new-token' });

        expect(updated.token).toBe('new-token');

        const preserved = UserManager.updateUserInfoCache({ token: '' });
        expect(preserved.token).toBe('old-token');
    });

    it('returns the original user data when cache writing fails', () => {
        wx.getStorageSync.mockReturnValue('{}');
        wx.setStorageSync.mockImplementation(() => {
            throw new Error('storage failed');
        });

        expect(UserManager.updateUserInfoCache({ id: 'student_2' })).toEqual({ id: 'student_2' });
    });

    it('rejects empty cache updates', () => {
        expect(UserManager.updateUserInfoCache(null)).toEqual({});
        expect(wx.setStorageSync).not.toHaveBeenCalled();
    });

    it('reads token, checks login state, and logs out', () => {
        wx.getStorageSync.mockReturnValueOnce(JSON.stringify({ token: 'token-1234567890' }));
        expect(UserManager.getToken()).toBe('token-1234567890');

        wx.getStorageSync.mockReturnValueOnce(JSON.stringify({ token: 'token-1234567890' }));
        expect(UserManager.isLogin()).toBe(true);

        wx.getStorageSync.mockReturnValueOnce('{}');
        expect(UserManager.isLogin()).toBe(false);

        UserManager.logout();
        expect(wx.removeStorageSync).toHaveBeenCalledWith(storageKey);
        expect(scheduleManagerMock.clearAll).toHaveBeenCalled();
    });

    it('normalizes the active business role to student or teacher', () => {
        wx.getStorageSync.mockReturnValueOnce(JSON.stringify({ role: 'teacher' }));
        expect(UserManager.getRole()).toBe('teacher');
        wx.getStorageSync.mockReturnValueOnce(JSON.stringify({ role: 'student' }));
        expect(UserManager.getRole()).toBe('student');
        wx.getStorageSync.mockReturnValueOnce(JSON.stringify({ role: 'unexpected' }));
        expect(UserManager.getRole()).toBe('student');
    });
});
