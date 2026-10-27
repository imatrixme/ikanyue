const crypto = require('node:crypto');

const PUBLIC_REPORT_PRIVATE_KEYS = [
    'cellphone',
    'phone',
    'password',
    'token',
    'tokenKey',
    'wechatId',
    'wechatUnionId',
    'openid',
    'unionid',
    'rawAuth',
    'internalNotes',
    'privateNotes',
];

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeBoolean(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
}

function parseJsonField(value, fallback = null) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }
    if (typeof value === 'object') {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
}

async function readRequestBody(c) {
    const contentType = c.req.header('content-type') || '';
    if (contentType.includes('application/json')) {
        try {
            return await c.req.json();
        } catch (error) {
            return {};
        }
    }
    return c.req.parseBody();
}

function getBearerToken(c) {
    const bearer = c.req.header('authorization') || '';
    const tokenHeader = c.req.header('token') || c.req.header('jwtoken') || '';
    if (tokenHeader) {
        return tokenHeader.trim();
    }
    if (bearer.toLowerCase().startsWith('bearer ')) {
        return bearer.slice(7).trim();
    }
    return bearer.trim();
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function createShareToken(seed = '') {
    const entropy = `${seed}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`;
    return crypto.createHash('sha256').update(entropy).digest('hex').slice(0, 32);
}

function sanitizePrivateFields(value) {
    if (Array.isArray(value)) {
        return value.map((item) => sanitizePrivateFields(item));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }

    return Object.entries(value).reduce((acc, [key, item]) => {
        if (!PUBLIC_REPORT_PRIVATE_KEYS.includes(key)) {
            acc[key] = sanitizePrivateFields(item);
        }
        return acc;
    }, {});
}

function mapRecord(record = {}, fields = []) {
    if (!record) {
        return null;
    }
    if (fields.length === 0) {
        return { ...record };
    }
    return fields.reduce((acc, field) => {
        if (record[field] !== undefined) {
            acc[field] = record[field];
        }
        return acc;
    }, {});
}

function buildPagination(result = {}, page, perPage) {
    return {
        page: result.page ?? page,
        perPage: result.perPage ?? perPage,
        totalItems: result.totalItems ?? 0,
        totalPages: result.totalPages ?? 0,
    };
}

module.exports = {
    buildPagination,
    createShareToken,
    getBearerToken,
    hashToken,
    mapRecord,
    normalizeBoolean,
    normalizeString,
    parseJsonField,
    readRequestBody,
    sanitizePrivateFields,
};
