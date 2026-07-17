import { UserManager } from './usermanager';
import Taro from '@tarojs/taro';

const requestWithFetch = ({ data, fail, header, method, success, url }) => {
    const requestUrl = new URL(url);
    const normalizedMethod = String(method || 'GET').toUpperCase();
    if (normalizedMethod === 'GET') {
        Object.entries(data || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null) requestUrl.searchParams.set(key, String(value));
        });
    }

    globalThis.fetch(requestUrl.toString(), {
        body: normalizedMethod === 'GET' ? undefined : JSON.stringify(data || {}),
        headers: header,
        method: normalizedMethod,
    })
        .then(async (response) => {
            success({ data: await response.json(), statusCode: response.status });
        })
        .catch(fail);
};

const sendRequest = (options) => {
    if (typeof Taro.request === 'function') {
        return Taro.request(options);
    }
    return requestWithFetch(options);
};

const Request = (method = 'GET', url, data = {}, header = {}, authcheck = true) => {
    var url_ = url.indexOf('http') === -1 ? SERVICE_URL + url : url;
    var headers_ = header || {};
    headers_['X-Ca-Stage'] = STAGE;
    headers_['X-Ca-Nonce'] = Math.floor(Date.now());
    headers_['X-Ca-Source'] = 'wechat_mp';
    headers_['Content-Type'] = 'application/json';

    return new Promise((resolve, reject) => {
        if (authcheck) {
            headers_.token = UserManager.getToken();
        }
        sendRequest({
            url: url_,
            data: data,
            header: headers_,
            method: method,
            success: (res) => {
                console.log(res.data);
                if (res.data.code !== undefined && res.data.message !== undefined) {
                    if (parseInt(res.data.code) === 10000) {
                        resolve(res.data.data);
                        return;
                    } else {
                        const err = new Error(res.data.message);
                        err.code = res.data.code;
                        reject(err);
                        return;
                    }
                }
                resolve(res.data);
            },
            fail: (err) => {
                // console.log('请求失败:', err);
                reject(err);
                return;
            },
        });
    });
};

const get = (url, data = {}, authcheck = true) => {
    return Request('GET', url, data, null, authcheck);
};

const post = (url, data = {}, authcheck = true) => {
    return Request('POST', url, data, null, authcheck);
};

const iNet = {
    Request,
    get,
    post,
};

export { iNet };
