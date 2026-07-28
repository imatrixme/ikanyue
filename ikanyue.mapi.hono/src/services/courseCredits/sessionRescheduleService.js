const { createRecordId, invariant } = require('./domain');
const { buildFefoFilter, FEFO_SORT } = require('./repositories/batchRepository');
const { buildRescheduleStudentRequests } = require('./reschedulePlanning');
const {
    commitTeachingPlan,
    escapeFilter,
    outbox,
    positiveVersion,
    prepareTeachingCommand,
    teachingOperation,
    update,
    versionClaim,
} = require('./teachingCommand');
const { releaseClaimPlan, sessionClaimPlan } = require('./booking/claimPlanning');
const { isScheduleConflict } = require('./booking/decisionService');
const { SCHEDULE_CLAIM_GRANULARITY_MINUTES } = require('./booking/policy');

class CourseCreditSessionRescheduleService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async rescheduleSession(input = {}) {
        validateCommand(input);
        const command = await prepareTeachingCommand(this, 'rescheduleSession', input, {
            newEndAt: input.newEndAt,
            newStartAt: input.newStartAt,
            sessionId: input.sessionId,
        });
        if (command.replay) return command.replay;

        const session = await this.repository.get('sessions', input.sessionId);
        validateSession(session, input);
        const creditType = await this.repository.get('credit_types', session.requiredCreditTypeId);
        invariant(creditType?.kind === 'course' && creditType.consumable === true,
            'SESSION_CREDIT_TYPE_INVALID', 'Session must require an exact consumable course credit');
        const sessionFilter = `sessionId="${escapeFilter(session.id)}"`;
        const [roster, teachers, claims] = await Promise.all([
            this.repository.list('session_students', { filter: sessionFilter, sort: 'id' }),
            this.repository.list('session_teachers', { filter: sessionFilter, sort: 'role,teacherId,id' }),
            this.repository.list('schedule_claims', {
                filter: `sourceType="session" && sourceId="${escapeFilter(session.id)}" && status="active"`,
                sort: 'ownerType,ownerId,cellStartAt',
            }),
        ]);

        const studentPlans = [];
        for (const sessionStudent of roster.filter((student) => student.creditStatus === 'reserved')) {
            studentPlans.push(await this.planStudent({
                command,
                creditType,
                input,
                session,
                sessionStudent,
            }));
        }

        const result = {
            operationId: command.operationId,
            sessionId: session.id,
            newStartAt: new Date(input.newStartAt).toISOString(),
            newEndAt: new Date(input.newEndAt).toISOString(),
            studentOutcomes: studentPlans.map(({ outcome }) => outcome),
        };
        const newClaims = sessionClaimPlan({
            appointmentId: session.appointmentId || '',
            endAt: result.newEndAt,
            granularityMinutes: SCHEDULE_CLAIM_GRANULARITY_MINUTES,
            idFactory: this.idFactory,
            sessionId: session.id,
            startAt: result.newStartAt,
            studentIds: roster.map((student) => student.studentId),
            teacherIds: teachers.map((teacher) => teacher.teacherId),
        });
        result.claimCount = newClaims.claims.length;
        const context = { ...command, input, result };
        const sessionVersion = positiveVersion(session.version);
        const plan = [
            teachingOperation({
                ...context,
                sourceId: session.id,
                sourceType: 'session',
                type: 'reschedule_session',
                requestSnapshot: {
                    newEndAt: result.newEndAt,
                    newStartAt: result.newStartAt,
                    oldEndAt: session.endAt,
                    oldStartAt: session.startAt,
                },
            }),
            versionClaim(this.idFactory, 'session', session.id, sessionVersion, command.operationId),
            ...releaseClaimPlan(claims, {
                idFactory: this.idFactory, now: command.at, operationId: command.operationId,
            }),
            ...newClaims.requests,
            update('sessions', session.id, {
                endAt: result.newEndAt,
                startAt: result.newStartAt,
                version: sessionVersion + 1,
            }),
            ...studentPlans.flatMap(({ requests }) => requests),
            outbox(this.idFactory, 'course-credit.session-rescheduled', 'session', session.id, result),
        ];
        try {
            return await commitTeachingPlan(this, context, plan);
        } catch (error) {
            if (isScheduleConflict(error)) error.code = 'SESSION_SCHEDULE_CONFLICT';
            throw error;
        }
    }

    async planStudent({ command, creditType, input, session, sessionStudent }) {
        const filterId = escapeFilter(sessionStudent.id);
        const allocations = await this.repository.list('session_credit_allocations', {
            filter: `sessionStudentId="${filterId}" && status="reserved"`,
            sort: 'batchId,id',
        });
        const allocatedBatches = new Map();
        for (const allocation of allocations) {
            if (!allocatedBatches.has(allocation.batchId)) {
                allocatedBatches.set(
                    allocation.batchId,
                    await this.repository.get('credit_batches', allocation.batchId)
                );
            }
        }
        const candidateBatches = await this.repository.list('credit_batches', {
            filter: buildFefoFilter({
                creditTypeId: session.requiredCreditTypeId,
                sessionStart: input.newStartAt,
                studentId: sessionStudent.studentId,
            }),
            sort: FEFO_SORT,
        });
        const planning = buildRescheduleStudentRequests({
            actor: input,
            allocations,
            batchesById: allocatedBatches,
            candidateBatches,
            creditType,
            idFactory: this.idFactory,
            newStartAt: new Date(input.newStartAt).toISOString(),
            now: command.at,
            operationId: command.operationId,
            session,
            sessionStudent,
        });
        return {
            outcome: {
                creditStatus: planning.creditStatus,
                missingQuantity: planning.missingQuantity,
                newAllocationIds: planning.newMovements.map((movement) => movement.allocationId),
                releasedAllocationIds: planning.releasedMovements.map((movement) => movement.allocation.id),
                retainedAllocationIds: planning.retainedAllocations.map((allocation) => allocation.id),
                sessionStudentId: sessionStudent.id,
            },
            requests: planning.requests,
        };
    }
}

function validateCommand(input) {
    invariant(typeof input.sessionId === 'string' && input.sessionId,
        'SESSION_ID_REQUIRED', 'sessionId is required');
    invariant(Number.isFinite(Date.parse(input.newStartAt)) && Number.isFinite(Date.parse(input.newEndAt)),
        'SESSION_TIME_INVALID', 'New session start and end times are required');
    invariant(Date.parse(input.newEndAt) > Date.parse(input.newStartAt),
        'SESSION_TIME_INVALID', 'New session end must be later than start');
}

function validateSession(session, input) {
    invariant(session && ['scheduled', 'enrollment_closed'].includes(session.status),
        'SESSION_NOT_RESCHEDULABLE', 'Only scheduled sessions can be rescheduled');
    invariant(Number.isFinite(Date.parse(session.startAt)) && Number.isFinite(Date.parse(session.endAt)),
        'SESSION_TIME_INVALID', 'Existing session time is invalid');
    invariant(Date.parse(session.startAt) !== Date.parse(input.newStartAt)
        || Date.parse(session.endAt) !== Date.parse(input.newEndAt),
    'SESSION_TIME_UNCHANGED', 'New session time must differ from the current time');
}

module.exports = {
    CourseCreditSessionRescheduleService,
    validateCommand,
    validateSession,
};
