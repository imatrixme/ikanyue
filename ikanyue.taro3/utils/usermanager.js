import { iNet } from './request';
import Taro from '@tarojs/taro';

const kUserInfo = 'com.ikanyue.cache.userinfo';

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

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
        const data = Taro.getStorageSync(kUserInfo);
        if (typeof data !== 'string' || data.length === 0) {
            console.log('本地无用户数据');
            return {};
        }

        const parsedData = JSON.parse(data);
        console.log('从缓存获取用户数据:', parsedData);
        return normalizeUserInfoAliases(parsedData);
    } catch (err) {
        console.error('解析用户数据出错:', err);
        // 如果解析出错，返回空对象并清除可能损坏的数据
        Taro.removeStorageSync(kUserInfo);
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

        console.log('更新用户缓存:', updatedUserInfo);
        Taro.setStorageSync(kUserInfo, JSON.stringify(updatedUserInfo));
        return updatedUserInfo;
    } catch (err) {
        console.error('缓存用户数据失败:', err);
        return userInfo;
    }
};

// 获取 Token
const getToken = () => {
    const info = getUserInfo();
    const result = info.token || '';

    if (!result) {
        console.log('本地无token');
    } else {
        console.log('获取到本地token:', result.substring(0, 10) + '...');
    }

    return result;
};

// 是否已登录
const isLogin = () => {
    const token = getToken();
    const result = token.length > 0;
    console.log('检查登录状态:', result);
    return result;
};

// 清空用户信息（登出）
const logout = () => {
    console.log('执行登出，清除用户数据');
    Taro.removeStorageSync(kUserInfo);
};

const UserManager = {
    getUserInfo,
    updateUserInfoCache,
    getToken,
    isLogin,
    logout,
};

export { UserManager };
