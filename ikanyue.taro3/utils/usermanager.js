import { iNet } from './request';
import Taro from '@tarojs/taro';

const kUserInfo = 'com.ikanyue.cache.userinfo';

// 获取用户信息
const getUserInfo = () => {
    const data = Taro.getStorageSync(kUserInfo);
    const result = typeof data === 'string' && data.length > 0 ? JSON.parse(data) : {};
    return result;
};

// 更新本地用户信息缓存
const updateUserInfoCache = (userInfo) => {
    const currentUserInfo = getUserInfo();
    const updatedUserInfo = { ...currentUserInfo, ...userInfo };
    Taro.setStorageSync(kUserInfo, JSON.stringify(updatedUserInfo));
    return updatedUserInfo;
};

// 获取 Token
const getToken = () => {
    const info = getUserInfo();
    const result = info.token || '';
    return result;
};

// 是否已登录
const isLogin = () => {
    const result = getToken().length > 0;
    return result;
};

// 清空用户信息（登出）
const logout = () => {
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
