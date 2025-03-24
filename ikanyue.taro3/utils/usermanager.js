import { iNet } from './request';
import Taro from '@tarojs/taro';

const kUserInfo = 'com.ikanyue.cache.userinfo';

// 获取用户信息
const getUserInfo = () => {
    const data = Taro.getStorageSync(kUserInfo);
    const result = typeof data === 'string' && data.length > 0 ? JSON.parse(data) : {};
    return result;
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

const refresh_login = () => {
    return new Promise((resolve, reject) => {
        iNet.post('/v1/user/refresh', {}, false)
            .then((res) => {
                // console.log("用户使用Code登录/注册成功");
                Taro.setStorageSync(kUserInfo, JSON.stringify(res));
                resolve(true);
            })
            .catch((err) => {
                // console.log("用户使用Code登录/注册失败", err);
                reject(false);
            });
    });
};

// 密码登录
const loginWithPassword = (cellphone, password) => {
    return new Promise((resolve, reject) => {
        iNet.post(
            '/v1/auth/login',
            {
                cellphone,
                password,
            },
            false
        )
            .then((res) => {
                // 登录成功，缓存用户信息
                // console.log('密码登录成功', res);
                Taro.setStorageSync(kUserInfo, JSON.stringify(res));
                resolve(res);
            })
            .catch((err) => {
                // console.log('密码登录失败', err);
                reject(err);
            });
    });
};

const UserManager = {
    getUserInfo,
    isLogin,
    getToken,
    loginWithPassword,
};

export { UserManager };
