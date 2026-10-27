import Taro from '@tarojs/taro';
import { ScheduleManager } from './schedulemanager';

const kUserInfo = 'com.ikanyue.cache.userinfo';

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const getStorageValue = (key) => {
    if (typeof Taro.getStorageSync === 'function') {
        return Taro.getStorageSync(key);
    }
    return globalThis.localStorage?.getItem(key) || '';
};

const removeStorageValue = (key) => {
    if (typeof Taro.removeStorageSync === 'function') {
        Taro.removeStorageSync(key);
        return;
    }
    globalThis.localStorage?.removeItem(key);
};

const setStorageValue = (key, value) => {
    if (typeof Taro.setStorageSync === 'function') {
        Taro.setStorageSync(key, value);
        return;
    }
    globalThis.localStorage?.setItem(key, value);
};

const normalizeUserInfoAliases = (userInfo = {}) => {
    const normalized = { ...userInfo };
    [
        ['nickName', 'nickname'],
        ['realName', 'realname'],
    ].forEach(([canonicalField, legacyField]) => {
        if (hasOwn(userInfo, canonicalField)) {
            normalized[legacyField] = userInfo[canonicalField];
        } else if (hasOwn(userInfo, legacyField)) {
            normalized[canonicalField] = userInfo[legacyField];
        }
    });
    return normalized;
};

// 获取用户信息
const getUserInfo = () => {
    try {
        const data = getStorageValue(kUserInfo);
        if (typeof data !== 'string' || data.length === 0) {
            return {};
        }

        const parsedData = JSON.parse(data);
        return normalizeUserInfoAliases(parsedData);
    } catch (err) {
        console.error('解析用户数据出错:', err);
        // 如果解析出错，返回空对象并清除可能损坏的数据
        removeStorageValue(kUserInfo);
        return {};
    }
};

// 更新本地用户信息缓存
const updateUserInfoCache = (userInfo) => {
    if (!userInfo) {
        console.error('尝试缓存空用户数据');
        return {};
    }

    try {
        const currentUserInfo = getUserInfo();
        const updatedUserInfo = {
            ...currentUserInfo,
            ...normalizeUserInfoAliases(userInfo),
        };

        // 确保token存在
        if (!updatedUserInfo.token && currentUserInfo.token) {
            updatedUserInfo.token = currentUserInfo.token;
        }

        if (identityOf(currentUserInfo) !== identityOf(updatedUserInfo)) ScheduleManager.clearAll();
        setStorageValue(kUserInfo, JSON.stringify(updatedUserInfo));
        return updatedUserInfo;
    } catch (err) {
        console.error('缓存用户数据失败:', err);
        return userInfo;
    }
};

// 获取 Token
const getToken = () => {
    return getUserInfo().token || '';
};

// 是否已登录
const isLogin = () => {
    return getToken().length > 0;
};

const getRole = () => {
    const role = getUserInfo().role;
    return role === 'teacher' ? 'teacher' : 'student';
};

// 清空用户信息（登出）
const logout = () => {
    ScheduleManager.clearAll();
    removeStorageValue(kUserInfo);
};

const identityOf = (user = {}) => `${user.role === 'teacher' ? 'teacher' : 'student'}:${user.id || user.userId || ''}`;

const UserManager = {
    getUserInfo,
    updateUserInfoCache,
    getToken,
    getRole,
    isLogin,
    logout,
};

export { UserManager };
