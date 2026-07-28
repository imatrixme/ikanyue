const { createRecordId, invariant } = require('../domain');
const {
    commitTeachingPlan,
    create,
    escapeFilter,
    outbox,
    positiveVersion,
    prepareTeachingCommand,
    teachingOperation,
    update,
    versionClaim,
} = require('../teachingCommand');
const { claimKey } = require('./claims');
const { sessionClaimPlan } = require('./claimPlanning');
const { SCHEDULE_CLAIM_GRANULARITY_MINUTES } = require('./policy');

const BACKFILL_BATCH_LIMIT = 400;

class ScheduleClaimBackfillService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async preview(input = {}) {
        const from = input.from ? new Date(input.from).toISOString() : new Date(this.clock()).toISOString();
        const to = input.to ? new Date(input.to).toISOString() : '';
        const sessions = await this.repository.list('sessions', {
            filter: '(status="scheduled" || status="enrollment_closed")'
                + ` && startAt>="${escapeFilter(from)}"`
                + (to ? ` && startAt<"${escapeFilter(to)}"` : ''),
            sort: 'startAt,id',
        });
        const existing = await this.repository.list('schedule_claims', {
            filter: `status="active" && cellEndAt>"${escapeFilter(from)}"`
                + (to ? ` && cellStartAt<"${escapeFilter(to)}"` : ''),
            sort: 'cellStartAt,ownerType,ownerId',
        });
        return buildReport(await this.materialize(sessions), existing);
    }

    async apply(input = {}) {
        const command = await prepareTeachingCommand(this, 'backfillScheduleClaims', input, {
            from: input.from || '', to: input.to || '',
        });
        if (command.replay) return command.replay;
        const report = await this.preview(input);
        const conflictTeacherIds = [...new Set(report.conflicts
            .filter((item) => item.ownerType === 'teacher').map((item) => item.ownerId))];
        const offerings = [];
        for (const teacherId of conflictTeacherIds) {
            offerings.push(...await this.repository.list('teacher_course_offerings', {
                filter: `teacherId="${escapeFilter(teacherId)}" && status="active"`, sort: 'courseSpecId,id',
            }));
        }
        const result = {
            claimedSessionIds: report.ready.map((item) => item.sessionId),
            conflictCount: report.conflicts.length,
            disabledOfferingIds: offerings.map((item) => item.id),
            operationId: command.operationId,
            scannedCount: report.scannedCount,
        };
        const context = { ...command, input, result };
        const plan = [
            teachingOperation({
                ...context,
                sourceType: 'schedule_backfill', sourceId: command.at, type: 'backfill_schedule_claims',
                requestSnapshot: { from: input.from || '', to: input.to || '' },
            }),
            ...report.ready.flatMap((item) => item.requests),
            ...report.conflicts.map((item) => create('booking_conflicts', conflictRecord(this.idFactory, item))),
            ...offerings.flatMap((offering) => disableOffering(this, command, offering)),
            outbox(this.idFactory, 'course-booking.schedule-backfilled', 'schedule_backfill', command.at, result),
        ];
        invariant(plan.length <= BACKFILL_BATCH_LIMIT, 'BOOKING_BACKFILL_BATCH_TOO_LARGE',
            '回填数据量过大，请缩小时间范围', { requestCount: plan.length });
        return commitTeachingPlan(this, context, plan);
    }

    async materialize(sessions) {
        const result = [];
        for (const session of sessions) {
            const filter = `sessionId="${escapeFilter(session.id)}"`;
            const [students, teachers] = await Promise.all([
                this.repository.list('session_students', { filter, sort: 'studentId,id' }),
                this.repository.list('session_teachers', { filter, sort: 'teacherId,role,id' }),
            ]);
            result.push({
                session,
                plan: sessionClaimPlan({
                    appointmentId: relationId(session.appointmentId),
                    endAt: session.endAt,
                    granularityMinutes: SCHEDULE_CLAIM_GRANULARITY_MINUTES,
                    idFactory: this.idFactory,
                    sessionId: session.id,
                    startAt: session.startAt,
                    studentIds: unique(students.map((item) => relationId(item.studentId))),
                    teacherIds: unique(teachers.map((item) => relationId(item.teacherId))),
                }),
            });
        }
        return result;
    }
}

function buildReport(entries, existingClaims) {
    const occupied = new Map(existingClaims.filter((claim) => claim.status === 'active')
        .map((claim) => [claimKey(claim), claim]));
    const ready = [];
    const claimed = [];
    const conflicts = [];
    for (const entry of entries) {
        const claims = entry.plan.claims;
        if (claims.length === 0) {
            conflicts.push(missingRosterConflict(entry.session));
            continue;
        }
        const collisions = claims.flatMap((claim) => {
            const occupiedClaim = occupied.get(claimKey(claim));
            if (!occupiedClaim || occupiedClaim.sourceId === entry.session.id) return [];
            return [{
                ...claim,
                conflictingSourceId: occupiedClaim.sourceId,
                endAt: entry.session.endAt,
                sessionId: entry.session.id,
                startAt: entry.session.startAt,
            }];
        });
        if (collisions.length) {
            conflicts.push(...collisions);
            continue;
        }
        const alreadyClaimed = claims.every((claim) => occupied.get(claimKey(claim))?.sourceId === entry.session.id);
        if (alreadyClaimed) claimed.push({ sessionId: entry.session.id });
        else {
            const requests = entry.plan.requests.filter((request) => !occupied.has(claimKey(request.data)));
            ready.push({ requests, sessionId: entry.session.id });
            for (const request of requests) occupied.set(claimKey(request.data), request.data);
        }
    }
    return { claimed, conflicts, ready, scannedCount: entries.length };
}

function conflictRecord(idFactory, item) {
    return {
        id: idFactory(),
        type: 'backfill_overlap',
        status: 'open',
        teacherId: item.ownerType === 'teacher' ? item.ownerId : '',
        studentId: item.ownerType === 'student' ? item.ownerId : '',
        sessionId: item.sessionId,
        appointmentId: '',
        startAt: item.startAt,
        endAt: item.endAt,
        details: {
            cellStartAt: item.cellStartAt || '',
            conflictingSourceId: item.conflictingSourceId || '',
            reason: item.reason || 'schedule_overlap',
        },
        resolution: '',
        resolvedAt: '',
        version: 1,
    };
}

function missingRosterConflict(session) {
    return {
        ownerType: 'room', ownerId: session.id, sessionId: session.id,
        startAt: session.startAt, endAt: session.endAt, reason: 'missing_teacher_or_student',
    };
}

function disableOffering(service, command, offering) {
    const version = positiveVersion(offering.version);
    return [
        versionClaim(service.idFactory, 'teacher_offering', offering.id, version, command.operationId),
        update('teacher_course_offerings', offering.id, { status: 'inactive', version: version + 1 }),
    ];
}

function relationId(value) {
    return typeof value === 'string' ? value : value?.id || '';
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

module.exports = {
    BACKFILL_BATCH_LIMIT,
    ScheduleClaimBackfillService,
    buildReport,
    conflictRecord,
    disableOffering,
    missingRosterConflict,
};
