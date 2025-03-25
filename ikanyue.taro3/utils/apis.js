import { iNet } from './request';
import { UserManager } from './usermanager';

/**
 * 手机号密码登录
 * @param {string} cellphone - 手机号
 * @param {string} password - 密码
 * @returns {Promise} - 登录结果Promise
 */
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
                // 登录成功，更新用户信息缓存
                UserManager.updateUserInfoCache(res);
                resolve(res);
            })
            .catch((err) => {
                reject(err);
            });
    });
};

/**
 * 更新用户信息
 * @param {Object} userInfo - 要更新的用户信息
 * @returns {Promise} - 更新结果Promise
 */
const updateUserInfo = (userInfo) => {
    return new Promise((resolve, reject) => {
        iNet.post('/v1/user/update', userInfo)
            .then((res) => {
                // 更新成功后，更新本地缓存
                UserManager.updateUserInfoCache(userInfo);
                resolve(res);
            })
            .catch((err) => {
                reject(err);
            });
    });
};

/**
 * 刷新登录状态
 * @returns {Promise} - 刷新结果Promise
 */
const refresh_login = () => {
    return new Promise((resolve, reject) => {
        iNet.post('/v1/user/refresh', {}, false)
            .then((res) => {
                // 登录成功，缓存用户信息
                UserManager.updateUserInfoCache(res);
                resolve(true);
            })
            .catch((err) => {
                reject(false);
            });
    });
};

const Api = {
    loginWithPassword,
    updateUserInfo,
    refreshLogin: refresh_login,
};

export { Api };
