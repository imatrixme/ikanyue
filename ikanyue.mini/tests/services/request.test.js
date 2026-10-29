import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iNet } from '../../miniprogram/services/request.js';

describe('iNet request wrapper', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.clearAllMocks();
        wx.getStorageSync.mockReturnValue(JSON.stringify({ token: 'token-1234567890' }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('prefixes relative URLs, attaches auth headers, and unwraps successful API payloads', async () => {
        wx.request.mockImplementation(({ success }) => {
            success({
                data: {
                    code: 10000,
                    message: 'ok',
                    data: { balance: 120 },
                },
            });
        });

        await expect(iNet.get('/v1/points/me', { page: 1 })).resolves.toEqual({ balance: 120 });

        const requestOptions = wx.request.mock.calls[0][0];
        expect(requestOptions).toMatchObject({
            url: 'http://127.0.0.1:1437/v1/points/me',
            data: { page: 1 },
            method: 'GET',
        });
        expect(requestOptions.header).toMatchObject({
            'X-Ca-Stage': 'TEST',
            'X-Ca-Source': 'wechat_mp',
            'Content-Type': 'application/json',
            token: 'token-1234567890',
        });
        expect(requestOptions.header['X-Ca-Nonce']).toMatch(/^\d+$/);
    });

    it('keeps absolute URLs, skips auth when requested, and returns raw payloads', async () => {
        wx.request.mockImplementation(({ success }) => {
            success({
                data: {
                    ready: true,
                },
            });
        });

        await expect(iNet.post('https://external.example.com/ping', { ping: true }, false)).resolves.toEqual({
            ready: true,
        });

        const requestOptions = wx.request.mock.calls[0][0];
        expect(requestOptions.url).toBe('https://external.example.com/ping');
        expect(requestOptions.method).toBe('POST');
        expect(requestOptions.header.token).toBeUndefined();
    });

    it('rejects wrapped API errors with the response code', async () => {
        wx.request.mockImplementation(({ success }) => {
            success({
                data: {
                    code: 40001,
                    message: '未登录',
                    data: null,
                },
            });
        });

        await expect(iNet.Request('DELETE', '/v1/reward-items/1')).rejects.toMatchObject({
            message: '未登录',
            code: 40001,
        });
    });

    it('preserves stable course-credit error details and tracing fields', async () => {
        wx.request.mockImplementation(({ success }) => {
            success({
                data: {
                    code: 400,
                    message: '课程点不足',
                    data: null,
                    errorCode: 'CREDIT_INSUFFICIENT',
                    details: { missingQuantity: 1 },
                    operationId: 'operation',
                    traceId: 'trace',
                },
            });
        });

        await expect(iNet.post('/v1/course-credits/conversions', {}, true, {
            'Idempotency-Key': 'key',
        })).rejects.toMatchObject({
            code: 400,
            errorCode: 'CREDIT_INSUFFICIENT',
            details: { missingQuantity: 1 },
            operationId: 'operation',
            traceId: 'trace',
        });
        expect(wx.request.mock.calls[0][0].header['Idempotency-Key']).toBe('key');
    });

    it('drops the local session only when the server reports an invalid session', async () => {
        wx.request.mockImplementation(({ success }) => {
            success({ data: { code: 403, errorCode: 'AUTH_SESSION_INVALID', message: '登录已失效，请重新登录', data: null } });
        });
        await expect(iNet.get('/v1/points/me')).rejects.toMatchObject({ code: 403, errorCode: 'AUTH_SESSION_INVALID' });
        expect(wx.removeStorageSync).toHaveBeenCalledWith('com.ikanyue.cache.userinfo');

        wx.removeStorageSync.mockClear();
        wx.request.mockImplementation(({ success }) => {
            success({ data: { code: 403, message: '权限不足', data: null } });
        });
        await expect(iNet.get('/v1/teacher/calendar')).rejects.toMatchObject({ code: 403 });
        expect(wx.removeStorageSync).not.toHaveBeenCalledWith('com.ikanyue.cache.userinfo');
    });

    it('rejects non-envelope HTTP failures instead of throwing inside the success callback', async () => {
        wx.request.mockImplementation(({ success }) => success({ data: null, statusCode: 502 }));
        await expect(iNet.get('/v1/points/me')).rejects.toMatchObject({ httpStatus: 502 });
    });

    it('supports PUT and PATCH commands with caller-provided headers', async () => {
        wx.request.mockImplementation(({ success }) => success({ data: { ready: true } }));

        await iNet.put('/v1/teacher/availability', { rules: [] }, true, { 'Idempotency-Key': 'put-key' });
        await iNet.patch('/ops/offering', { status: 'active' }, true, { 'Idempotency-Key': 'patch-key' });

        expect(wx.request.mock.calls[0][0]).toMatchObject({ method: 'PUT' });
        expect(wx.request.mock.calls[0][0].header['Idempotency-Key']).toBe('put-key');
        expect(wx.request.mock.calls[1][0]).toMatchObject({ method: 'PATCH' });
        expect(wx.request.mock.calls[1][0].header['Idempotency-Key']).toBe('patch-key');
    });

    it('rejects transport errors with code NETWORK', async () => {
        wx.request.mockImplementation(({ fail }) => {
            fail({ errMsg: 'request:fail timeout' });
        });

        await expect(iNet.get('/v1/points/me')).rejects.toMatchObject({ code: 'NETWORK' });
    });
});
