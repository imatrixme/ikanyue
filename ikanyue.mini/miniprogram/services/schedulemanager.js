import { storage } from '../kit/api.js';

const CACHE_KEY = 'com.ikanyue.cache.schedule.v1';
const DEFAULT_MAX_AGE = 5 * 60 * 1000;

function readStore() {
    try {
        const value = storage.get(CACHE_KEY);
        return typeof value === 'string' && value ? JSON.parse(value) : {};
    } catch (error) {
        console.warn('课程日历缓存已损坏，正在清理:', error);
        storage.remove(CACHE_KEY);
        return {};
    }
}

function scopeFor(user = {}) {
    const role = user.role === 'teacher' ? 'teacher' : 'student';
    const principalId = String(user.id || user.userId || 'anonymous');
    return `${role}:${principalId}`;
}

function get(scope, key, options = {}) {
    const entry = readStore()[scope]?.[key];
    if (!entry || typeof entry.savedAt !== 'number') return null;
    const maxAge = Number.isFinite(options.maxAge) ? options.maxAge : DEFAULT_MAX_AGE;
    if (maxAge >= 0 && Date.now() - entry.savedAt > maxAge) return null;
    return entry.value ?? null;
}

function set(scope, key, value) {
    if (!scope || !key) return value;
    const store = readStore();
    store[scope] = { ...(store[scope] || {}), [key]: { savedAt: Date.now(), value } };
    storage.set(CACHE_KEY, JSON.stringify(store));
    return value;
}

function clearScope(scope) {
    const store = readStore();
    if (!store[scope]) return false;
    delete store[scope];
    if (Object.keys(store).length) storage.set(CACHE_KEY, JSON.stringify(store));
    else storage.remove(CACHE_KEY);
    return true;
}

function clearAll() {
    storage.remove(CACHE_KEY);
}

const ScheduleManager = { clearAll, clearScope, get, scopeFor, set };

export { CACHE_KEY, DEFAULT_MAX_AGE, ScheduleManager };
