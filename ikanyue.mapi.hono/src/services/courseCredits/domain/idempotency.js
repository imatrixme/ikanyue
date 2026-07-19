const { invariant } = require('./errors');

function scopedIdempotencyKey(scope, key) {
    invariant(typeof scope === 'string' && scope.trim(), 'IDEMPOTENCY_SCOPE_REQUIRED', 'idempotency scope is required');
    invariant(typeof key === 'string' && key.trim(), 'IDEMPOTENCY_KEY_REQUIRED', 'idempotency key is required');
    return `${scope.trim()}:${key.trim()}`;
}

function resolveIdempotentOperation(existing, requestHash) {
    if (!existing) return { action: 'execute', replayed: false };
    invariant(existing.requestHash === requestHash, 'IDEMPOTENCY_CONFLICT', 'idempotency key was reused with a different request');
    if (existing.status === 'pending') {
        return { action: 'wait', replayed: false, operationId: existing.id };
    }
    invariant(['committed', 'failed', 'reversed'].includes(existing.status),
        'INVALID_OPERATION_STATUS', 'existing idempotent operation has an unsupported status');
    return {
        action: 'replay',
        replayed: true,
        operationId: existing.id,
        status: existing.status,
        result: clone(existing.resultSnapshot),
    };
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

module.exports = { resolveIdempotentOperation, scopedIdempotencyKey };
