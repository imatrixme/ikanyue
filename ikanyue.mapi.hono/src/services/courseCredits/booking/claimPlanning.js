const { buildScheduleClaims } = require('./claims');
const { create, update, versionClaim } = require('../reservationRequests');
const { positiveVersion } = require('../reservationPlanning');

function appointmentClaimPlan(input = {}) {
    const common = {
        appointmentId: input.appointmentId,
        endAt: input.endAt,
        granularityMinutes: input.granularityMinutes,
        sourceId: input.sessionId,
        sourceType: 'session',
        startAt: input.startAt,
    };
    const claims = [
        ...buildScheduleClaims({ ...common, ownerType: 'teacher', ownerId: input.teacherId }, input.idFactory),
        ...buildScheduleClaims({ ...common, ownerType: 'student', ownerId: input.studentId }, input.idFactory),
    ];
    return { claims, requests: claims.map((claim) => create('schedule_claims', claim)) };
}

function sessionClaimPlan(input = {}) {
    const owners = [
        ...(input.teacherIds || []).map((ownerId) => ({ ownerId, ownerType: 'teacher' })),
        ...(input.studentIds || []).map((ownerId) => ({ ownerId, ownerType: 'student' })),
    ];
    const claims = owners.flatMap((owner) => buildScheduleClaims({
        ...owner,
        appointmentId: input.appointmentId || '',
        endAt: input.endAt,
        granularityMinutes: input.granularityMinutes,
        sourceId: input.sessionId,
        sourceType: 'session',
        startAt: input.startAt,
    }, input.idFactory));
    return { claims, requests: claims.map((claim) => create('schedule_claims', claim)) };
}

function releaseClaimPlan(claims = [], input = {}) {
    const now = input.now;
    const active = claims.filter((claim) => claim.status === 'active');
    return active.flatMap((claim) => {
        const version = positiveVersion(claim.version);
        return [
            versionClaim(input.idFactory, 'schedule_claim', claim.id, version, input.operationId),
            update('schedule_claims', claim.id, {
                status: 'released',
                releasedAt: now,
                version: version + 1,
            }),
        ];
    });
}

module.exports = { appointmentClaimPlan, releaseClaimPlan, sessionClaimPlan };
