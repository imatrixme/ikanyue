const { WITH_CTX } = require('_@vue_compiler-core@3.2.40@@vue/compiler-core');

const STAGE = process.env.NODE_ENV !== 'production' ? 'TEST' : 'RELEASE';
const HOST = 'https://sing.ommapp.com';

const Request = (method = 'GET', url, data = {}, header = {}) => {
  var url_ = url.indexOf('http') === -1 ? HOST + url : url;
  var headers_ = header || {};
  headers_['X-Ca-Stage'] = STAGE;
  headers_['X-Ca-Nonce'] = Math.floor(Date.now());
  return new Promise((resolve, reject) => {
    wx.request({
      url: url_,
      data: data,
      header: headers_,
      method: method,
      success: (res) => {
        if (res.data.code !== undefined && res.data.msg !== undefined) {
          if (parseInt(res.data.code) === 10000) {
            resolve(res.data.data);
            return;
          }
        }
        resolve(res.data);
      },
      fail: (err) => {
        reject(err);
      },
    });
  });
};

const get = (url, data = {}) => {
  return Request('GET', url, data);
};

const post = (url, data = {}) => {
  return Request('POST', url, data);
};

const iNet = {
  Request,
  get,
  post,
};

module.exports = { iNet };
