import { iNet } from './request';

const kUserInfo = 'com.ikanyue.cache.userinfo';

// 获取用户信息
const getUserInfo = () => {
    const data = wx.getStorageSync(kUserInfo);
    const result = typeof data === 'string' && data.length > 0 ? JSON.parse(data) : {};
    // console.log("获取缓存用户信息", result);
    return result;
};

// 获取 Token
const getToken = () => {
    const info = getUserInfo();
    const result = info.token || '';
    // console.log("获取缓存用户Token", result);
    return result;
};

// 是否已登录
const isLogin = () => {
    const result = getToken().length > 0;
    // console.log("判断用户是否已登录", result);
    return result;
};

const refresh_login = () => {
    return new Promise((resolve, reject) => {
        iNet.post('/v1/user/refresh', {}, false)
            .then((res) => {
                // console.log("用户使用Code登录/注册成功");
                wx.setStorageSync(kUserInfo, JSON.stringify(res));
                resolve(true);
            })
            .catch((err) => {
                // console.log("用户使用Code登录/注册失败", err);
                reject(false);
            });
    });
};

const signup_login = () => {
    return new Promise((resolve, reject) => {
        // console.log("getUserInfo");
        wx.getUserInfo({
            withCredentials: true,
            success: (userInfo) => {
                // console.log(userInfo);
                wx.login({
                    success: (res) => {
                        // 得到微信 Code
                        // console.log(res);
                        userInfo.code = res.code;
                        iNet.post('/v1/user/wechat/signuplogin', userInfo, false)
                            .then((res) => {
                                // console.log("用户使用Code登录/注册成功");
                                wx.setStorageSync(kUserInfo, JSON.stringify(res));
                                resolve(true);
                            })
                            .catch((err) => {
                                // console.log("用户使用Code登录/注册失败", err);
                                reject(false);
                            });
                    },
                    failure: (err) => {
                        // console.log("用户登录Code获取失败", err);
                        reject(false);
                    },
                });
            },
            failure: (err) => {
                // console.log("用户登录态信息获取失败", err);
                reject(false);
            },
        });
    });
};

// 刷新 Token
const login = () => {
    return new Promise((resolve, reject) => {
        wx.checkSession({
            success: () => {
                if (!isLogin()) {
                    signup_login()
                        .then((res) => resolve(res))
                        .catch((err) => reject(false));
                    return;
                }
                refresh_login()
                    .then((res) => resolve(res))
                    .catch((err) => reject(false));
            },
            failure: () => {
                signup_login()
                    .then((res) => resolve(res))
                    .catch((err) => reject(false));
            },
        });
    });
};

const UserManager = {
    getUserInfo,
    login,
    isLogin,
    getToken,
    refreshLogin: refresh_login,
};

export { UserManager };
