/**
 * pocketbase.js
 * PocketBase 客户端单例模式实现
 * 为项目提供全局 PocketBase 访问能力
 */

const to = require('await-to-js').default;
const dotenv = require('dotenv');
const path = require('path');

// 根据环境加载不同的.env文件
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), nodeEnv === 'production' ? '.env' : `.env.${nodeEnv}`);

// 首先尝试加载环境特定的.env文件，如果失败则加载默认的.env文件
try {
    const result = dotenv.config({ path: envPath });
    if (result.error) {
        dotenv.config(); // 加载默认的.env文件
        console.log('使用默认的.env文件');
    } else {
        console.log(`已加载${nodeEnv}环境的配置文件: ${envPath}`);
    }
} catch (error) {
    dotenv.config(); // 加载默认的.env文件
    console.warn('加载环境配置文件失败，使用默认的.env文件', error.message);
}

// PocketBase 配置 - 从环境变量获取
const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const PB_EMAIL = process.env.PB_EMAIL;
const PB_PASSWORD = process.env.PB_PASSWORD;

// 创建一个空的单例对象，后续会填充方法
const pbClient = {};

/**
 * 初始化 PocketBase 客户端
 * 使用动态导入解决 ESM 兼容性问题
 */
async function initPocketBase() {
    try {
        // 动态导入 PocketBase
        const PocketBase = await import('pocketbase');

        // 创建客户端实例
        const pb = new PocketBase.default(PB_URL);

        // 将 pb 实例保存到客户端对象
        pbClient.pb = pb;
        pbClient.isAuthenticated = false;

        // 如果提供了凭据，尝试登录
        if (PB_EMAIL && PB_PASSWORD) {
            try {
                // const authData = await pb.admins.authWithPassword(PB_EMAIL, PB_PASSWORD);
                const authData = await pb.collection('_superusers').authWithPassword(PB_EMAIL, PB_PASSWORD);
                console.log('PocketBase 登录成功');
                pbClient.isAuthenticated = true;
                pbClient.authData = authData;
            } catch (error) {
                console.warn('PocketBase 登录失败，应用将以离线模式运行:', error.message);
                console.warn('确保 PocketBase 服务器已启动，并且配置的 URL、邮箱和密码正确');
                pbClient.isAuthenticated = false;
            }
        } else {
            console.warn('PocketBase 凭据未配置，请在 .env 文件中设置 PB_EMAIL 和 PB_PASSWORD 环境变量');
            console.warn('应用将以离线模式运行，部分功能可能不可用');
            pbClient.isAuthenticated = false;
        }

        // 添加方法到客户端对象
        pbClient.login = async function () {
            if (!PB_EMAIL || !PB_PASSWORD) {
                throw new Error('PocketBase 凭据未配置');
            }

            const [err, authData] = await to(pb.collection('_superusers').authWithPassword(PB_EMAIL, PB_PASSWORD));

            if (err) {
                console.error('PocketBase 登录失败:', err.message);
                pbClient.isAuthenticated = false;
                throw err;
            }

            pbClient.isAuthenticated = true;
            pbClient.authData = authData;
            console.log('PocketBase 登录成功');
            return authData;
        };

        pbClient.getClient = function () {
            return pb;
        };

        pbClient.isLoggedIn = function () {
            return pbClient.isAuthenticated && pb.authStore.isValid;
        };

        pbClient.collection = function (collectionName) {
            return pb.collection(collectionName);
        };

        // 为所有方法添加错误处理，以便在 PocketBase 服务器离线时提供更友好的错误信息
        pbClient.getList = async function (collectionName, page = 1, perPage = 50, filter = {}) {
            try {
                if (!pbClient.isLoggedIn()) {
                    await pbClient.login();
                }

                const [err, result] = await to(pb.collection(collectionName).getList(page, perPage, filter));

                if (err) {
                    console.error(`获取 ${collectionName} 列表失败:`, err.message);
                    throw err;
                }

                return result;
            } catch (error) {
                console.error(`获取 ${collectionName} 列表时出错:`, error.message);
                throw new Error(`无法获取 ${collectionName} 列表，可能是 PocketBase 服务器未运行或配置错误`);
            }
        };

        pbClient.getOne = async function (collectionName, id) {
            try {
                if (!pbClient.isLoggedIn()) {
                    await pbClient.login();
                }

                const [err, record] = await to(pb.collection(collectionName).getOne(id));

                if (err) {
                    console.error(`获取 ${collectionName} 记录失败:`, err.message);
                    throw err;
                }

                return record;
            } catch (error) {
                console.error(`获取 ${collectionName} 记录时出错:`, error.message);
                throw new Error(`无法获取 ${collectionName} 记录，可能是 PocketBase 服务器未运行或配置错误`);
            }
        };

        pbClient.create = async function (collectionName, data) {
            try {
                if (!pbClient.isLoggedIn()) {
                    await pbClient.login();
                }

                const [err, record] = await to(pb.collection(collectionName).create(data));

                if (err) {
                    console.error(`创建 ${collectionName} 记录失败:`, err.message);
                    throw err;
                }

                return record;
            } catch (error) {
                console.error(`创建 ${collectionName} 记录时出错:`, error.message);
                throw new Error(`无法创建 ${collectionName} 记录，可能是 PocketBase 服务器未运行或配置错误`);
            }
        };

        pbClient.update = async function (collectionName, id, data) {
            try {
                if (!pbClient.isLoggedIn()) {
                    await pbClient.login();
                }

                const [err, record] = await to(pb.collection(collectionName).update(id, data));

                if (err) {
                    console.error(`更新 ${collectionName} 记录失败:`, err.message);
                    throw err;
                }

                return record;
            } catch (error) {
                console.error(`更新 ${collectionName} 记录时出错:`, error.message);
                throw new Error(`无法更新 ${collectionName} 记录，可能是 PocketBase 服务器未运行或配置错误`);
            }
        };

        pbClient.delete = async function (collectionName, id) {
            try {
                if (!pbClient.isLoggedIn()) {
                    await pbClient.login();
                }

                const [err] = await to(pb.collection(collectionName).delete(id));

                if (err) {
                    console.error(`删除 ${collectionName} 记录失败:`, err.message);
                    throw err;
                }

                return true;
            } catch (error) {
                console.error(`删除 ${collectionName} 记录时出错:`, error.message);
                throw new Error(`无法删除 ${collectionName} 记录，可能是 PocketBase 服务器未运行或配置错误`);
            }
        };

        console.log('PocketBase 客户端初始化完成');
        return pbClient;
    } catch (error) {
        console.error('初始化 PocketBase 客户端失败:', error.message);
        throw error;
    }
}

// 初始化时立即执行，但不阻止应用启动
initPocketBase().catch((err) => {
    console.warn('PocketBase 初始化错误:', err.message);
    console.warn('应用将以离线模式运行，部分功能可能不可用');
});

// 导出客户端对象
module.exports = pbClient;
