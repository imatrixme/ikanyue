import { storage } from '../kit/api.js';
import { UserManager } from './usermanager.js';

const PREFIX = 'com.ikanyue.command.';

// A server decision carries the envelope code; NETWORK means the request may or may not have arrived.
const serverAnswered = (error) => error?.code !== undefined && error.code !== 'NETWORK';

// One idempotency key per user and draft (e.g. `request-appointment:<offering>:<start>`), kept until the
// server answers. A retry after a lost response therefore replays the original command instead of issuing a new one.
async function withCommandKey(draft, send) {
    const user = UserManager.getUserInfo();
    const storageKey = `${PREFIX}${user.role === 'teacher' ? 'teacher' : 'student'}:${user.id || user.userId || ''}:${draft}`;
    let key = storage.get(storageKey);
    if (!key) {
        key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        storage.set(storageKey, key);
    }
    try {
        const result = await send(key);
        storage.remove(storageKey);
        return result;
    } catch (error) {
        // Transport and gateway failures keep the key for a retry.
        if (serverAnswered(error)) storage.remove(storageKey);
        throw error;
    }
}

export { withCommandKey };
