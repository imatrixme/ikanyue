import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from './apis';

const iNetMock = vi.hoisted(() => ({
    get: vi.fn(),
    post: vi.fn(),
}));

const userManagerMock = vi.hoisted(() => ({
    isLogin: vi.fn(),
    logout: vi.fn(),
    updateUserInfoCache: vi.fn(),
}));

vi.mock('./request', () => ({
    iNet: iNetMock,
}));

vi.mock('./usermanager', () => ({
    UserManager: userManagerMock,
}));

describe('Api page-facing request wrappers', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('logs in with password and caches returned user info', async () => {
        const user = { id: 'student_1', token: 'jwt-token' };
        iNetMock.post.mockResolvedValue(user);

        await expect(Api.loginWithPassword('13800138000', 'secret')).resolves.toBe(user);
        expect(iNetMock.post).toHaveBeenCalledWith(
            '/v1/user/login',
            {
                cellphone: '13800138000',
                password: 'secret',
            },
            false
        );
        expect(userManagerMock.updateUserInfoCache).toHaveBeenCalledWith(user);
    });

    it('propagates password login errors without caching', async () => {
        const error = new Error('login failed');
        iNetMock.post.mockRejectedValue(error);

        await expect(Api.loginWithPassword('13800138000', 'bad')).rejects.toBe(error);
        expect(userManagerMock.updateUserInfoCache).not.toHaveBeenCalled();
    });

    it('logs in with WeChat payload and caches returned user info', async () => {
        const payload = {
            code: 'wx-code',
            phone: {
                encryptedData: 'encrypted',
                iv: 'iv',
            },
        };
        const user = { id: 'student_2', token: 'jwt-token-2' };
        iNetMock.post.mockResolvedValue(user);

        await expect(Api.loginWithWechat(payload)).resolves.toBe(user);
        expect(iNetMock.post).toHaveBeenCalledWith('/v1/user/wechat-login', payload, false);
        expect(userManagerMock.updateUserInfoCache).toHaveBeenCalledWith(user);
    });

    it('propagates WeChat login errors without caching', async () => {
        const error = new Error('wechat failed');
        iNetMock.post.mockRejectedValue(error);

        await expect(Api.loginWithWechat({ code: 'bad' })).rejects.toBe(error);
        expect(userManagerMock.updateUserInfoCache).not.toHaveBeenCalled();
    });

    it('updates the lightweight account profile and caches the server result', async () => {
        const payload = { nickName: '小陈', realName: '陈同学', gender: 2, age: 12, province: '上海市' };
        const updated = { id: 'student_1', ...payload };
        iNetMock.post.mockResolvedValue(updated);

        await expect(Api.updateUserInfo(payload)).resolves.toBe(updated);
        expect(iNetMock.post).toHaveBeenCalledWith('/v1/user/update', payload);
        expect(userManagerMock.updateUserInfoCache).toHaveBeenCalledWith(updated);
    });

    it('propagates profile update errors without changing local user info', async () => {
        const error = new Error('update failed');
        iNetMock.post.mockRejectedValue(error);

        await expect(Api.updateUserInfo({ nickName: '失败' })).rejects.toBe(error);
        expect(userManagerMock.updateUserInfoCache).not.toHaveBeenCalled();
    });

    it('refreshes login only when a local token exists', async () => {
        userManagerMock.isLogin.mockReturnValueOnce(false);
        await expect(Api.refreshLogin()).rejects.toThrow('未登录状态');
        expect(iNetMock.post).not.toHaveBeenCalled();

        userManagerMock.isLogin.mockReturnValueOnce(true);
        iNetMock.post.mockResolvedValue({ id: 'student_1', token: 'new-token' });
        await expect(Api.refreshLogin()).resolves.toEqual({ id: 'student_1', token: 'new-token' });
        expect(iNetMock.post).toHaveBeenCalledWith('/v1/user/refresh');
        expect(userManagerMock.updateUserInfoCache).toHaveBeenCalledWith({ id: 'student_1', token: 'new-token' });
    });

    it('clears local login when refresh returns an auth error', async () => {
        const authError = new Error('expired');
        authError.code = 10401;
        userManagerMock.isLogin.mockReturnValue(true);
        iNetMock.post.mockRejectedValue(authError);

        await expect(Api.refreshLogin()).rejects.toBe(authError);
        expect(userManagerMock.logout).toHaveBeenCalled();
    });

    it('clears local login when refresh returns a forbidden auth error', async () => {
        const authError = new Error('forbidden');
        authError.code = 10403;
        userManagerMock.isLogin.mockReturnValue(true);
        iNetMock.post.mockRejectedValue(authError);

        await expect(Api.refreshLogin()).rejects.toBe(authError);
        expect(userManagerMock.logout).toHaveBeenCalled();
    });

    it('clears a stale login when the user does not exist in the active environment', async () => {
        const missingUserError = new Error('用户不存在或已被删除');
        missingUserError.code = 404;
        userManagerMock.isLogin.mockReturnValue(true);
        iNetMock.post.mockRejectedValue(missingUserError);

        await expect(Api.refreshLogin()).rejects.toBe(missingUserError);
        expect(userManagerMock.logout).toHaveBeenCalled();
    });

    it('uses points-lite endpoints for balance and reward catalog', async () => {
        iNetMock.get.mockResolvedValue({ items: [] });

        await Api.getMyPointSummary({ page: 1, perPage: 20 });
        await Api.listRewardItems({ status: 'active' });

        expect(iNetMock.get).toHaveBeenNthCalledWith(1, '/v1/points/me', { page: 1, perPage: 20 });
        expect(iNetMock.get).toHaveBeenNthCalledWith(2, '/v1/reward-items', { status: 'active' });
    });

    it('loads the restored activity catalog through the public activity endpoint', async () => {
        iNetMock.get.mockResolvedValue({ items: [] });

        await Api.findActivities({ page: 1, perPage: 100 });

        expect(iNetMock.get).toHaveBeenCalledWith('/v1/activity/find', { page: 1, perPage: 100 });
    });
});
