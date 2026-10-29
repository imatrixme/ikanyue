import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withCommandKey } from '../../miniprogram/services/commandKeys.js';

const storage = vi.hoisted(() => new Map());
const user = vi.hoisted(() => ({ current: { id: 'student_1', role: 'student' } }));

vi.mock('../../miniprogram/services/usermanager.js', () => ({ UserManager: { getUserInfo: () => user.current } }));

describe('command keys', () => {
    beforeEach(() => {
        storage.clear();
        user.current = { id: 'student_1', role: 'student' };
        wx.getStorageSync.mockImplementation((key) => storage.get(key) || '');
        wx.setStorageSync.mockImplementation((key, value) => storage.set(key, value));
        wx.removeStorageSync.mockImplementation((key) => storage.delete(key));
    });

    it('keeps the key when the request never reached the server', async () => {
        const keys = [];
        const send = async (key) => {
            keys.push(key);
            if (keys.length === 1) throw Object.assign(new Error('网络连接失败'), { code: 'NETWORK' });
        };
        await expect(withCommandKey('checkout:offer', send)).rejects.toMatchObject({ code: 'NETWORK' });
        await withCommandKey('checkout:offer', send);
        expect(keys[0]).toBe(keys[1]);
        expect(storage.size).toBe(0);
    });

    it('reuses the key after a transport failure and clears it once the server answers', async () => {
        const keys = [];
        const send = async (key) => {
            keys.push(key);
            if (keys.length === 1) throw Object.assign(new Error('request:fail timeout'), { errMsg: 'request:fail timeout' });
        };

        await expect(withCommandKey('request-appointment:o1:t1', send)).rejects.toThrow('timeout');
        await withCommandKey('request-appointment:o1:t1', send);
        expect(keys[0]).toBe(keys[1]);
        expect(keys[0]).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
        expect(storage.size).toBe(0);

        await withCommandKey('request-appointment:o1:t1', send);
        expect(keys[2]).not.toBe(keys[1]);
    });

    it('issues a new key after a business rejection or gateway failure is resolved', async () => {
        const keys = [];
        const reject = (error) => async (key) => { keys.push(key); throw error; };

        await expect(withCommandKey('cancel:a1', reject(Object.assign(new Error('x'), { httpStatus: 502 })))).rejects.toThrow();
        await expect(withCommandKey('cancel:a1', reject(Object.assign(new Error('x'), { code: 400 })))).rejects.toThrow();
        await expect(withCommandKey('cancel:a1', reject(Object.assign(new Error('x'), { code: 400 })))).rejects.toThrow();
        expect(keys[0]).toBe(keys[1]);
        expect(keys[2]).not.toBe(keys[1]);
    });

    it('never shares a pending key across accounts', async () => {
        const keys = [];
        const fail = async (key) => { keys.push(key); throw new Error('offline'); };
        await expect(withCommandKey('checkout:offer', fail)).rejects.toThrow();
        user.current = { id: 'student_2', role: 'student' };
        await expect(withCommandKey('checkout:offer', fail)).rejects.toThrow();
        expect(keys[0]).not.toBe(keys[1]);
    });
});
