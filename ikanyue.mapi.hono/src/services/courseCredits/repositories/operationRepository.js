const crypto = require('node:crypto');

const { stableJson } = require('../domain/catalog');
const { resolveIdempotentOperation, scopedIdempotencyKey } = require('../domain/idempotency');

async function findIdempotentOperation(pb, scope, key) {
    const idempotencyKey = scopedIdempotencyKey(scope, key);
    try {
        return await pb.collection('credit_operations').getFirstListItem(
            `idempotencyKey="${escapeFilter(idempotencyKey)}"`
        );
    } catch (error) {
        if (error?.status === 404) return null;
        throw error;
    }
}

async function resolveStoredOperation(pb, scope, key, request) {
    const existing = await findIdempotentOperation(pb, scope, key);
    return resolveIdempotentOperation(normalizeOperation(existing), fingerprintRequest(request));
}

function fingerprintRequest(request) {
    return crypto.createHash('sha256').update(stableJson(request)).digest('hex');
}

function normalizeOperation(record) {
    if (!record) return null;
    return {
        id: record.id,
        status: record.status,
        requestHash: record.requestSnapshot?.requestHash,
        resultSnapshot: record.resultSnapshot,
    };
}

function escapeFilter(value) {
    return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

// PocketBase stores dates as "YYYY-MM-DD HH:MM:SS.sssZ" and compares filter literals as text,
// so an ISO "T" literal mis-orders against stored values on the same UTC day.
function filterTime(value) {
    const parsed = value === null || value === undefined || value === '' ? NaN : new Date(value).getTime();
    return Number.isFinite(parsed) ? new Date(parsed).toISOString().replace('T', ' ') : String(value ?? '');
}

module.exports = {
    escapeFilter,
    filterTime,
    findIdempotentOperation,
    fingerprintRequest,
    normalizeOperation,
    resolveStoredOperation,
};
