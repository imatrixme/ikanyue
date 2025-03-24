import { UserManager } from './usermanager';

const Request = (method = 'GET', url, data = {}, header = {}, authcheck = true) => {
    var url_ = url.indexOf('http') === -1 ? SERVICE_URL + url : url;
    var headers_ = header || {};
    headers_['X-Ca-Stage'] = 'STAGE';
    headers_['X-Ca-Nonce'] = Math.floor(Date.now());
    headers_['X-Ca-Source'] = 'wechat_mp';
    return new Promise((resolve, reject) => {
        if (authcheck && !UserManager.isLogin()) {
            UserManager.login()
                .then((res) => resolve(undefined))
                .catch((err) => reject(new Error('Login...')));
            return;
        }
        headers_.token = UserManager.getToken();
        wx.request({
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
                        const err = new Error(res.data.code, res.data.message);
                        reject(err);
                        return;
                    }
                }
                resolve(res.data);
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

const post = (url, data = {}, authcheck = true) => {
    return Request('POST', url, data, null, authcheck);
};

const iNet = {
    Request,
    get,
    post,
};

export { iNet };
