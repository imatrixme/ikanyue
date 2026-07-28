const { createRecordId, invariant } = require('./domain');
const { buildStudentSettlementRequests } = require('./settlementPlanning');
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
const { releaseClaimPlan } = require('./booking/claimPlanning');

class CourseCreditSessionCancellationService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async cancelSession(input = {}) {
        validateInput(input);
        const command = await prepareTeachingCommand(this, 'cancelSession', input, {
            cancellationType: input.cancellationType || 'admin',
            reason: input.reason,
            sessionId: input.sessionId,
        });
        if (command.replay) return command.replay;
        const session = await this.repository.get('sessions', input.sessionId);
        invariant(session && ['scheduled', 'enrollment_closed'].includes(session.status),
            'SESSION_NOT_CANCELLABLE', '只有未开始的已排课课堂可以取消');
        invariant(!relationId(session.appointmentId),
            'APPOINTMENT_CANCELLATION_COMMAND_REQUIRED', '预约课堂必须通过预约取消流程处理');
        const filter = `sessionId="${escapeFilter(session.id)}"`;
        const [roster, claims] = await Promise.all([
            this.repository.list('session_students', { filter, sort: 'id' }),
            this.repository.list('schedule_claims', {
                filter: `sourceType="session" && sourceId="${escapeFilter(session.id)}" && status="active"`,
                sort: 'ownerType,ownerId,cellStartAt',
            }),
        ]);
        const studentPlans = [];
        for (const student of roster.filter((record) => record.creditStatus === 'reserved')) {
            studentPlans.push(await this.planStudent(command, input, session, student));
        }
        const result = {
            operationId: command.operationId,
            releasedStudentIds: studentPlans.map((plan) => plan.studentId),
            sessionId: session.id,
            status: 'cancelled',
        };
        const context = { ...command, input, result };
        const version = positiveVersion(session.version);
        const plan = [
            teachingOperation({
                ...context,
                sourceType: 'session', sourceId: session.id, type: 'cancel_session',
                requestSnapshot: {
                    cancellationType: input.cancellationType || 'admin', reason: input.reason, sessionId: session.id,
                },
            }),
            ...releaseClaimPlan(claims, {
                idFactory: this.idFactory, now: command.at, operationId: command.operationId,
            }),
            ...studentPlans.flatMap((item) => item.requests),
            versionClaim(this.idFactory, 'session', session.id, version, command.operationId),
            update('sessions', session.id, {
                cancellationType: input.cancellationType || 'admin',
                cancelledAt: command.at,
                status: 'cancelled',
                version: version + 1,
            }),
            outbox(this.idFactory, 'course-credit.session-cancelled', 'session', session.id, result),
        ];
        return commitTeachingPlan(this, context, plan);
    }

    async planStudent(command, input, session, sessionStudent) {
        const allocations = await this.repository.list('session_credit_allocations', {
            filter: `sessionStudentId="${escapeFilter(sessionStudent.id)}" && status="reserved"`,
            sort: 'batchId,id',
        });
        const batchesById = new Map();
        for (const allocation of allocations) {
            const batchId = relationId(allocation.batchId);
            if (!batchesById.has(batchId)) {
                batchesById.set(batchId, await this.repository.get('credit_batches', batchId));
            }
        }
        const planning = buildStudentSettlementRequests({
            actor: input,
            allocations,
            batchesById,
            idFactory: this.idFactory,
            now: command.at,
            operationId: command.operationId,
            session: { ...session, status: 'cancelled' },
            sessionStudent,
        });
        return { requests: planning.requests, studentId: sessionStudent.studentId };
    }
}

function validateInput(input) {
    invariant(typeof input.sessionId === 'string' && input.sessionId,
        'SESSION_ID_REQUIRED', '课堂编号不能为空');
    invariant(typeof input.reason === 'string' && input.reason.trim().length >= 2,
        'SESSION_CANCEL_REASON_REQUIRED', '请填写课堂取消原因');
    invariant(!input.cancellationType || ['teacher', 'institution', 'admin'].includes(input.cancellationType),
        'SESSION_CANCELLATION_TYPE_INVALID', '课堂取消类型无效');
}

function relationId(value) {
    return typeof value === 'string' ? value : value?.id || '';
}

module.exports = { CourseCreditSessionCancellationService, validateInput };
