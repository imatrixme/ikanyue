import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withCommandKey } from './commandKeys';

const storage = vi.hoisted(() => new Map());
const user = vi.hoisted(() => ({ current: { id: 'student_1', role: 'student' } }));

vi.mock('@tarojs/taro', () => ({
    default: {
        getStorageSync: (key) => storage.get(key) || '',
        removeStorageSync: (key) => storage.delete(key),
        setStorageSync: (key, value) => storage.set(key, value),
    },
}));
vi.mock('./usermanager', () => ({ UserManager: { getUserInfo: () => user.current } }));

describe('command keys', () => {
    beforeEach(() => {
        storage.clear();
        user.current = { id: 'student_1', role: 'student' };
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
