import { UserManager } from './usermanager';
import Taro from '@tarojs/taro';

const SESSION_INVALID = 'AUTH_SESSION_INVALID';

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
                const body = res.data;
                if (body && body.code !== undefined && body.message !== undefined) {
                    if (parseInt(body.code) === 10000) {
                        resolve(body.data);
                        return;
                    } else {
                        const err = new Error(body.message);
                        err.code = body.code;
                        err.errorCode = body.errorCode || '';
                        err.details = body.details || {};
                        err.operationId = body.operationId || null;
                        err.traceId = body.traceId || null;
                        // The server no longer recognises this session; drop it so pages fall back to signed-out.
                        if (authcheck && err.errorCode === SESSION_INVALID) UserManager.logout();
                        reject(err);
                        return;
                    }
                }
                if (Number(res.statusCode) >= 400) {
                    const err = new Error('服务暂时不可用，请稍后重试');
                    err.httpStatus = Number(res.statusCode);
                    reject(err);
                    return;
                }
                resolve(body);
            },
            fail: (err) => {
                reject(err);
                return;
            },
        });
    });
};

const get = (url, data = {}, authcheck = true) => {
    return Request('GET', url, data, null, authcheck);
};

const post = (url, data = {}, authcheck = true, header = {}) => {
    return Request('POST', url, data, header, authcheck);
};

const put = (url, data = {}, authcheck = true, header = {}) => {
    return Request('PUT', url, data, header, authcheck);
};

const patch = (url, data = {}, authcheck = true, header = {}) => {
    return Request('PATCH', url, data, header, authcheck);
};

const iNet = {
    Request,
    get,
    patch,
    post,
    put,
};

export { iNet };
