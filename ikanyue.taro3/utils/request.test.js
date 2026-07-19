import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iNet } from './request';

const taroMock = vi.hoisted(() => ({
    getStorageSync: vi.fn(),
    removeStorageSync: vi.fn(),
    request: vi.fn(),
}));

vi.mock('@tarojs/taro', () => ({
    default: taroMock,
}));

describe('iNet request wrapper', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.clearAllMocks();
        vi.stubGlobal('SERVICE_URL', 'https://api.example.com');
        vi.stubGlobal('STAGE', 'TEST');
        taroMock.getStorageSync.mockReturnValue(JSON.stringify({ token: 'token-1234567890' }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('prefixes relative URLs, attaches auth headers, and unwraps successful API payloads', async () => {
        taroMock.request.mockImplementation(({ success }) => {
            success({
                data: {
                    code: 10000,
                    message: 'ok',
                    data: { balance: 120 },
                },
            });
        });

        await expect(iNet.get('/v1/points/me', { page: 1 })).resolves.toEqual({ balance: 120 });

        const requestOptions = taroMock.request.mock.calls[0][0];
        expect(requestOptions).toMatchObject({
            url: 'https://api.example.com/v1/points/me',
            data: { page: 1 },
            method: 'GET',
        });
        expect(requestOptions.header).toMatchObject({
            'X-Ca-Stage': 'TEST',
            'X-Ca-Source': 'wechat_mp',
            'Content-Type': 'application/json',
            token: 'token-1234567890',
        });
        expect(requestOptions.header['X-Ca-Nonce']).toEqual(expect.any(Number));
    });

    it('keeps absolute URLs, skips auth when requested, and returns raw payloads', async () => {
        taroMock.request.mockImplementation(({ success }) => {
            success({
                data: {
                    ready: true,
                },
            });
        });

        await expect(iNet.post('https://external.example.com/ping', { ping: true }, false)).resolves.toEqual({
            ready: true,
        });

        const requestOptions = taroMock.request.mock.calls[0][0];
        expect(requestOptions.url).toBe('https://external.example.com/ping');
        expect(requestOptions.method).toBe('POST');
        expect(requestOptions.header.token).toBeUndefined();
    });

    it('rejects wrapped API errors with the response code', async () => {
        taroMock.request.mockImplementation(({ success }) => {
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
        taroMock.request.mockImplementation(({ success }) => {
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
        expect(taroMock.request.mock.calls[0][0].header['Idempotency-Key']).toBe('key');
    });

    it('rejects transport errors from Taro.request', async () => {
        const networkError = new Error('network failed');
        taroMock.request.mockImplementation(({ fail }) => {
            fail(networkError);
        });

        await expect(iNet.get('/v1/points/me')).rejects.toBe(networkError);
    });

    it('falls back to fetch when Taro.request is unavailable', async () => {
        const originalRequest = taroMock.request;
        const fetchMock = vi.fn().mockResolvedValue({
            json: vi.fn().mockResolvedValue({ ready: true }),
            status: 200,
        });
        taroMock.request = undefined;
        vi.stubGlobal('fetch', fetchMock);

        await expect(iNet.get('/v1/points/me', { page: 2 })).resolves.toEqual({ ready: true });
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.example.com/v1/points/me?page=2',
            expect.objectContaining({ method: 'GET' })
        );

        taroMock.request = originalRequest;
    });
});
