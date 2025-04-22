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
 * 更新用户信息
 * @param {Object} userInfo - 要更新的用户信息
 * @returns {Promise} - 更新结果Promise
 */
const updateUserInfo = (userInfo) => {
    return new Promise((resolve, reject) => {
        iNet.post('/v1/user/update', userInfo)
            .then((res) => {
                console.log('更新用户信息API返回:', res);
                // 更新成功后，更新本地缓存
                UserManager.updateUserInfoCache(userInfo);
                resolve(res);
            })
            .catch((err) => {
                console.error('更新用户信息API错误:', err);
                reject(err);
            });
    });
};

/**
 * 查询活动列表或活动详情
 * @param {Object} params - 查询参数
 * @param {string} [params.id] - 活动ID，如果提供则返回单个活动详情
 * @param {number} [params.page=1] - 页码
 * @param {number} [params.perPage=20] - 每页数量
 * @param {string} [params.status='active'] - 活动状态过滤
 * @param {string} [params.sort='-sequence'] - 排序字段
 * @param {string} [params.tags] - 标签过滤，多个标签用逗号分隔
 * @returns {Promise} - 查询结果Promise
 */
const findActivities = (params = {}) => {
    return new Promise((resolve, reject) => {
        iNet.get('/v1/activity/find', params)
            .then((res) => {
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
                if (err.code === 10401 || err.code === 10403) {
                    console.log('Token无效，清除登录状态');
                    UserManager.logout();
                }
                reject(err);
            });
    });
};

/**
 * 查询音频材料列表
 * @param {Object} params - 查询参数
 * @param {number} [params.page=1] - 页码
 * @param {number} [params.perPage=20] - 每页数量
 * @param {string} [params.status='published'] - 状态筛选
 * @param {string} [params.sort='-sequence'] - 排序字段
 * @param {string} [params.type] - 类型筛选
 * @param {string} [params.language] - 语言筛选
 * @param {number} [params.difficulty] - 难度等级筛选
 * @returns {Promise} - 查询结果Promise
 */
const findAudioMaterials = (params = {}) => {
    return new Promise((resolve, reject) => {
        iNet.get('/v1/audio-material/list', params)
            .then((res) => {
                resolve(res);
            })
            .catch((err) => {
                reject(err);
            });
    });
};

/**
 * 查询单个音频材料详情
 * @param {Object} params - 查询参数
 * @param {string} params.id - 音频材料ID
 * @returns {Promise} - 查询结果Promise
 */
const findAudioMaterialDetail = (params = {}) => {
    return new Promise((resolve, reject) => {
        iNet.get('/v1/audio-material/find', params)
            .then((res) => {
                resolve(res);
            })
            .catch((err) => {
                reject(err);
            });
    });
};

/**
 * 查询视频材料列表
 * @param {Object} params - 查询参数
 * @param {number} [params.page=1] - 页码
 * @param {number} [params.perPage=20] - 每页数量
 * @param {string} [params.status='published'] - 状态筛选
 * @param {string} [params.sort='-sequence'] - 排序字段
 * @param {string} [params.type] - 类型筛选
 * @param {string} [params.language] - 语言筛选
 * @param {number} [params.difficulty] - 难度等级筛选
 * @returns {Promise} - 查询结果Promise
 */
const findVideoMaterials = (params = {}) => {
    return new Promise((resolve, reject) => {
        iNet.get('/v1/video-material/list', params)
            .then((res) => {
                resolve(res);
            })
            .catch((err) => {
                reject(err);
            });
    });
};

/**
 * 查询单个视频材料详情
 * @param {Object} params - 查询参数
 * @param {string} params.id - 视频材料ID
 * @returns {Promise} - 查询结果Promise
 */
const findVideoMaterialDetail = (params = {}) => {
    return new Promise((resolve, reject) => {
        iNet.get('/v1/video-material/find', params)
            .then((res) => {
                resolve(res);
            })
            .catch((err) => {
                reject(err);
            });
    });
};

const Api = {
    loginWithPassword,
    updateUserInfo,
    refreshLogin,
    findActivities,
    findAudioMaterials,
    findAudioMaterialDetail,
    findVideoMaterials,
    findVideoMaterialDetail,
};

export { Api };
