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

    it('updates user info and refreshes local cache with submitted form data', async () => {
        const formData = {
            nickname: '看乐用户',
            age: 12,
        };
        iNetMock.post.mockResolvedValue({ id: 'student_1', ...formData });

        await expect(Api.updateUserInfo(formData)).resolves.toEqual({ id: 'student_1', ...formData });
        expect(iNetMock.post).toHaveBeenCalledWith('/v1/user/update', formData);
        expect(userManagerMock.updateUserInfoCache).toHaveBeenCalledWith(formData);
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

    it('uses page-facing find endpoints for activities and material resources', async () => {
        iNetMock.get.mockResolvedValue({ items: [] });

        await Api.findActivities({ page: 1 });
        await Api.findAudioMaterials({ status: 'published' });
        await Api.findAudioMaterialDetail({ id: 'audio_1' });
        await Api.findVideoMaterials({ status: 'published' });
        await Api.findVideoMaterialDetail({ id: 'video_1' });

        expect(iNetMock.get).toHaveBeenNthCalledWith(1, '/v1/activity/find', { page: 1 });
        expect(iNetMock.get).toHaveBeenNthCalledWith(2, '/v1/audioMaterial/find', { status: 'published' });
        expect(iNetMock.get).toHaveBeenNthCalledWith(3, '/v1/audioMaterial/find', { id: 'audio_1' });
        expect(iNetMock.get).toHaveBeenNthCalledWith(4, '/v1/videoMaterial/find', { status: 'published' });
        expect(iNetMock.get).toHaveBeenNthCalledWith(5, '/v1/videoMaterial/find', { id: 'video_1' });
    });
});
