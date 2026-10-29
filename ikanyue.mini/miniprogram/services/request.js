import { request } from '../kit/api.js';
import { env } from '../kit/env.js';
import { UserManager } from './usermanager.js';

const SESSION_INVALID = 'AUTH_SESSION_INVALID';
const SUCCESS = 10000;

function envelopeError(body) {
    const err = new Error(body.message);
    err.code = body.code;
    err.errorCode = body.errorCode || '';
    err.details = body.details || {};
    err.operationId = body.operationId || null;
    err.traceId = body.traceId || null;
    return err;
}

// Unwraps the API envelope `{ code, message, data }`; transport failures reject with code NETWORK (see kit/api).
const Request = async (method = 'GET', url, data = {}, header = {}, authcheck = true) => {
    const headers = {
        ...(header || {}),
        'X-Ca-Stage': env.stage,
        'X-Ca-Nonce': String(Date.now()),
        'X-Ca-Source': 'wechat_mp',
        'Content-Type': 'application/json',
    };
    if (authcheck) headers.token = UserManager.getToken();

    const res = await request({ url: url.indexOf('http') === -1 ? env.baseUrl + url : url, method, data, headers });
    const body = res.data;
    if (body && body.code !== undefined && body.message !== undefined) {
        if (parseInt(body.code) === SUCCESS) return body.data;
        const err = envelopeError(body);
        // The server no longer recognises this session; drop it so pages fall back to signed-out.
        if (authcheck && err.errorCode === SESSION_INVALID) UserManager.logout();
        throw err;
    }
    if (res.status >= 400) {
        const err = new Error('服务暂时不可用，请稍后重试');
        err.httpStatus = res.status;
        throw err;
    }
    return body;
};

const get = (url, data = {}, authcheck = true) => Request('GET', url, data, null, authcheck);
const post = (url, data = {}, authcheck = true, header = {}) => Request('POST', url, data, header, authcheck);
const put = (url, data = {}, authcheck = true, header = {}) => Request('PUT', url, data, header, authcheck);
const patch = (url, data = {}, authcheck = true, header = {}) => Request('PATCH', url, data, header, authcheck);

const iNet = { Request, get, patch, post, put };

export { iNet };
