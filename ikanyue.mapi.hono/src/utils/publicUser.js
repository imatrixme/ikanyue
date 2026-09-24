'use strict';

// Credential and third-party identity fields never leave the API, whichever route returns a user record.
const PRIVATE_USER_FIELDS = Object.freeze([
    'password',
    'passwordHash',
    'tokenKey',
    'wechatId',
    'wechatOpenId',
    'wechatUnionId',
    'wechatUserInfo',
    'lastLoginIp',
]);

function publicUser(record) {
    if (!record || typeof record !== 'object') return record;
    const copy = { ...record };
    for (const field of PRIVATE_USER_FIELDS) delete copy[field];
    return copy;
}

// Quote a value for a PocketBase filter string literal.
function filterLiteral(value) {
    return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

module.exports = { PRIVATE_USER_FIELDS, filterLiteral, publicUser };
