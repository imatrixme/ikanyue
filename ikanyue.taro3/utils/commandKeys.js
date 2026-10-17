import Taro from '@tarojs/taro';
import { UserManager } from './usermanager';

const PREFIX = 'com.ikanyue.command.';

// One idempotency key per user and draft (e.g. `request-appointment:<offering>:<start>`), kept until the
// server answers. A retry after a lost response therefore replays the original command instead of issuing a new one.
async function withCommandKey(draft, send) {
    const user = UserManager.getUserInfo();
    const storageKey = `${PREFIX}${user.role === 'teacher' ? 'teacher' : 'student'}:${user.id || user.userId || ''}:${draft}`;
    let key = Taro.getStorageSync(storageKey);
    if (!key) {
        key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        Taro.setStorageSync(storageKey, key);
    }
    try {
        const result = await send(key);
        Taro.removeStorageSync(storageKey);
        return result;
    } catch (error) {
        // An API envelope (code) means the server decided; transport and gateway failures keep the key for a retry.
        if (error?.code !== undefined) Taro.removeStorageSync(storageKey);
        throw error;
    }
}

export { withCommandKey };
