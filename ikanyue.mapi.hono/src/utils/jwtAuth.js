'use strict';
const dayjs = require('dayjs');
const jwt = require('jsonwebtoken');

const authKey = 'V_NY6*rF-j.P';

var sign = (req, id, sn, role = 'user', isAdmin = false) => {
    var data_ = { id: id, sn: sn, role: role, isAdmin: isAdmin };
    if (req.headers['sec-fetch-mode'] && req.headers['sec-fetch-site']) {
        let secondoft = dayjs().second() + 24 * 3600 * 7;
        data_ = { id: id, sn: sn, role: role, isAdmin: isAdmin, expiredAt: secondoft };
    }
    let rst = jwt.sign(data_, authKey);
    return rst;
};

var check = (jwtToken) => {
    try {
        let rst = jwt.verify(jwtToken, authKey);
        return rst;
    } catch (error) {
        return undefined;
    }
};

module.exports = {
    jwtAuth: {
        sign: sign,
        check: check,
    },
};
