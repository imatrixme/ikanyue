'use strict';
const { randomBytes } = require('node:crypto');
const jwt = require('jsonwebtoken');

const APP_TOKEN_TTL = '30d';
const OPS_TOKEN_TTL = '12h';
const OPS_SCOPE = 'ops';
let fallbackSecret = '';

// Production must supply JWT_SECRET; other environments get a per-process key so no key lives in source.
function secret(env = process.env) {
    const value = env.JWT_SECRET || '';
    if (value.length >= 32) return value;
    if (env.NODE_ENV === 'production') throw new Error('JWT_SECRET (>=32 chars) is required in production');
    if (!fallbackSecret) {
        fallbackSecret = randomBytes(32).toString('hex');
        console.warn('JWT_SECRET is not configured; using an ephemeral development key.');
    }
    return fallbackSecret;
}

var sign = (_req, id, sn, role = 'user', isAdmin = false, claims = {}, options = {}) => {
    const data = { id, sn, role, isAdmin, ...claims };
    return jwt.sign(data, secret(), { expiresIn: options.expiresIn || APP_TOKEN_TTL });
};

var check = (jwtToken) => {
    try {
        return jwt.verify(jwtToken, secret());
    } catch (error) {
        if (!(error instanceof jwt.JsonWebTokenError)) throw error;
        return undefined;
    }
};

module.exports = {
    APP_TOKEN_TTL,
    OPS_SCOPE,
    OPS_TOKEN_TTL,
    jwtAuth: {
        sign: sign,
        check: check,
    },
};
