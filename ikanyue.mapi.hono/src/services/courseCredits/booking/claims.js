const { invariant } = require('../domain');

function buildScheduleClaims(input = {}, idFactory) {
    invariant(['teacher', 'student', 'room'].includes(input.ownerType),
        'BOOKING_CLAIM_OWNER_INVALID', '日历占位所有者类型无效');
    invariant(typeof input.ownerId === 'string' && input.ownerId,
        'BOOKING_CLAIM_OWNER_REQUIRED', '日历占位所有者不能为空');
    invariant(typeof idFactory === 'function', 'BOOKING_CLAIM_ID_FACTORY_REQUIRED', '缺少占位编号生成器');
    const start = Date.parse(input.startAt);
    const end = Date.parse(input.endAt);
    const granularity = Number(input.granularityMinutes);
    invariant(Number.isInteger(granularity) && granularity > 0,
        'BOOKING_CLAIM_GRANULARITY_INVALID', '占位粒度无效');
    invariant(Number.isFinite(start) && Number.isFinite(end) && end > start,
        'BOOKING_CLAIM_TIME_INVALID', '占位时间无效');
    const cellMs = granularity * 60000;
    const firstCell = Math.floor(start / cellMs) * cellMs;
    const lastCell = Math.ceil(end / cellMs) * cellMs;
    const claims = [];
    for (let cell = firstCell; cell < lastCell; cell += cellMs) {
        claims.push({
            id: idFactory(),
            ownerType: input.ownerType,
            ownerId: input.ownerId,
            cellStartAt: new Date(cell).toISOString(),
            cellEndAt: new Date(cell + cellMs).toISOString(),
            sourceType: input.sourceType || 'session',
            sourceId: input.sourceId,
            appointmentId: input.appointmentId || '',
            status: 'active',
            releasedAt: '',
            version: 1,
        });
    }
    return claims;
}

function claimKey(claim) {
    return `${claim.ownerType}:${claim.ownerId}:${normalizedCellStart(claim.cellStartAt)}`;
}

function normalizedCellStart(value) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : String(value || '');
}

function findClaimConflicts(requested, existing) {
    const active = new Set(existing.filter((claim) => claim.status === 'active').map(claimKey));
    return requested.filter((claim) => active.has(claimKey(claim)));
}

module.exports = { buildScheduleClaims, claimKey, findClaimConflicts, normalizedCellStart };
