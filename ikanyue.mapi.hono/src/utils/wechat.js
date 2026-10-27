/**
 * 微信相关工具方法
 * - 交换 jsCode 获取 session_key/openid
 * - 解密微信加密手机号
 * - 校验 rawData 签名
 */

const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');

const wechatApi = process.env.WECHAT_JSCODE2SESSION || 'https://api.weixin.qq.com/sns/jscode2session';
const wechatAppId = process.env.WECHAT_APPID || '';
const wechatSecret = process.env.WECHAT_SECRET || '';

/**
 * GET 请求微信接口并解析 JSON
 * @param {URL|string} targetUrl
 * @returns {Promise<object>}
 */
function requestWechatJSON(targetUrl) {
    return new Promise((resolve, reject) => {
        const urlInstance = typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl;

        https
            .get(urlInstance, (res) => {
                let raw = '';
                res.on('data', (chunk) => {
                    raw += chunk;
                });
                res.on('end', () => {
                    try {
                        const payload = raw.length ? JSON.parse(raw) : {};

                        if (res.statusCode !== 200) {
                            const err = new Error(payload.errmsg || '微信接口请求失败');
                            err.code = payload.errcode || res.statusCode;
                            return reject(err);
                        }

                        if (payload.errcode && payload.errcode !== 0) {
                            const err = new Error(payload.errmsg || '微信接口返回错误');
                            err.code = payload.errcode;
                            return reject(err);
                        }

                        resolve(payload);
                    } catch (error) {
                        const err = new Error('解析微信返回数据失败');
                        err.original = error;
                        reject(err);
                    }
                });
            })
            .on('error', (error) => reject(error));
    });
}

/**
 * 通过 jsCode 交换 session_key/openid
 * @param {string} code
 */
async function exchangeCodeForSession(code) {
    if (!wechatAppId || !wechatSecret) {
        throw new Error('未配置微信小程序的 APPID 或 SECRET');
    }
    if (!code) {
        throw new Error('缺少微信 code');
    }

    const url = new URL(wechatApi);
    url.searchParams.set('appid', wechatAppId);
    url.searchParams.set('secret', wechatSecret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');

    return requestWechatJSON(url);
}

/**
 * 解密微信手机号
 * @param {string} sessionKey
 * @param {string} encryptedData
 * @param {string} iv
 */
function decryptPhoneNumber(sessionKey, encryptedData, iv) {
    if (!sessionKey || !encryptedData || !iv) {
        throw new Error('缺少解密微信手机号所需的参数');
    }

    try {
        const decipher = crypto.createDecipheriv(
            'aes-128-cbc',
            Buffer.from(sessionKey, 'base64'),
            Buffer.from(iv, 'base64')
        );
        decipher.setAutoPadding(true);

        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(encryptedData, 'base64')),
            decipher.final(),
        ]);

        return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
        const err = new Error('解密微信手机号失败');
        err.original = error;
        throw err;
    }
}

/**
 * 校验 rawData + session_key 的签名
 * @param {string} rawData
 * @param {string} sessionKey
 * @param {string} signature
 */
function validateUserSignature(rawData, sessionKey, signature) {
    if (!rawData || !sessionKey || !signature) {
        return true;
    }

    const sha1 = crypto.createHash('sha1');
    sha1.update(rawData + sessionKey, 'utf8');
    const digest = sha1.digest('hex');
    return digest === signature;
}

module.exports = {
    exchangeCodeForSession,
    decryptPhoneNumber,
    validateUserSignature,
};
