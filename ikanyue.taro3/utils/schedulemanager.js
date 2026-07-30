import Taro from '@tarojs/taro';

const CACHE_KEY = 'com.ikanyue.cache.schedule.v1';
const DEFAULT_MAX_AGE = 5 * 60 * 1000;

function getStorageValue() {
    if (typeof Taro.getStorageSync === 'function') return Taro.getStorageSync(CACHE_KEY);
    return globalThis.localStorage?.getItem(CACHE_KEY) || '';
}

function setStorageValue(value) {
    if (typeof Taro.setStorageSync === 'function') {
        Taro.setStorageSync(CACHE_KEY, value);
        return;
    }
    globalThis.localStorage?.setItem(CACHE_KEY, value);
}

function removeStorageValue() {
    if (typeof Taro.removeStorageSync === 'function') {
        Taro.removeStorageSync(CACHE_KEY);
        return;
    }
    globalThis.localStorage?.removeItem(CACHE_KEY);
}

function readStore() {
    try {
        const value = getStorageValue();
        return typeof value === 'string' && value ? JSON.parse(value) : {};
    } catch (error) {
        console.warn('课程日历缓存已损坏，正在清理:', error);
        removeStorageValue();
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
    setStorageValue(JSON.stringify(store));
    return value;
}

function clearScope(scope) {
    const store = readStore();
    if (!store[scope]) return false;
    delete store[scope];
    if (Object.keys(store).length) setStorageValue(JSON.stringify(store));
    else removeStorageValue();
    return true;
}

function clearAll() {
    removeStorageValue();
}

const ScheduleManager = { clearAll, clearScope, get, scopeFor, set };

export { CACHE_KEY, DEFAULT_MAX_AGE, ScheduleManager };
