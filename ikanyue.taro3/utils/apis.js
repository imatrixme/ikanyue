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
            '/v1/user/login',
            {
                cellphone,
                password,
            },
            false
        )
            .then((res) => {
                console.log('登录API返回结果:', res);
                // 登录成功，更新用户信息缓存
                UserManager.updateUserInfoCache(res);
                resolve(res);
            })
            .catch((err) => {
                console.error('登录API错误:', err);
                reject(err);
            });
    });
};

/**
 * 微信授权登录
 * @param {Object} payload - 微信登录参数
 * @param {string} payload.code - wx.login 返回的 code
 * @param {Object} payload.userInfo - getUserProfile 返回的用户资料
 * @param {Object} payload.phone - 微信加密手机号数据
 * @returns {Promise}
 */
const loginWithWechat = (payload) => {
    return new Promise((resolve, reject) => {
        iNet.post('/v1/user/wechat-login', payload, false)
            .then((res) => {
                console.log('微信登录API返回结果:', res);
                UserManager.updateUserInfoCache(res);
                resolve(res);
            })
            .catch((err) => {
                console.error('微信登录API错误:', err);
                reject(err);
            });
    });
};

const updateUserInfo = async (userInfo) => {
    try {
        const result = await iNet.post('/v1/user/update', userInfo);
        UserManager.updateUserInfoCache(result || userInfo);
        return result;
    } catch (error) {
        console.error('更新用户信息API错误:', error);
        throw error;
    }
};

/**
 * 刷新登录状态
 * @returns {Promise} - 刷新结果Promise
 */
const refreshLogin = () => {
    return new Promise((resolve, reject) => {
        if (!UserManager.isLogin()) {
            console.log('未登录状态，无法刷新登录');
            reject(new Error('未登录状态'));
            return;
        }

        console.log('开始刷新登录状态');
        iNet.post('/v1/user/refresh')
            .then((res) => {
                console.log('刷新登录API返回:', res);
                // 登录成功，缓存用户信息
                UserManager.updateUserInfoCache(res);
                resolve(res);
            })
            .catch((err) => {
                console.error('刷新登录API错误:', err);
                // 如果刷新失败，清除登录状态
                if ([401, 403, 404, 10401, 10403, 10404].includes(Number(err.code))) {
                    console.log('Token无效，清除登录状态');
                    UserManager.logout();
                }
                reject(err);
            });
    });
};

const findActivities = (params = {}) => {
    return iNet.get('/v1/activity/find', params);
};

const getMyPointSummary = (params = {}) => {
    return iNet.get('/v1/points/me', params);
};

const listRewardItems = (params = {}) => {
    return iNet.get('/v1/reward-items', params);
};

const Api = {
    loginWithPassword,
    loginWithWechat,
    updateUserInfo,
    refreshLogin,
    findActivities,
    getMyPointSummary,
    listRewardItems,
};

export { Api };
