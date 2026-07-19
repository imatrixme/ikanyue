const {
    createRecordId,
    invariant,
    planTeacherEarnings,
} = require('./domain');
const { buildStudentSettlementRequests } = require('./settlementPlanning');
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
} = require('./teachingCommand');

class CourseCreditSessionSettlementService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async settleSession(input = {}) {
        validateCommand(input);
        const command = await prepareTeachingCommand(this, 'settleSession', input, {
            sessionId: input.sessionId,
        });
        if (command.replay) return command.replay;

        const session = await this.repository.get('sessions', input.sessionId);
        validateSession(session);
        const effectiveSession = effectiveSettlementSession(session);
        const creditType = await this.repository.get('credit_types', session.requiredCreditTypeId);
        invariant(creditType?.kind === 'course' && creditType.consumable === true && creditType.courseSpecId,
            'SESSION_CREDIT_TYPE_INVALID', 'Session must require an exact course credit with course specification');
        const filter = `sessionId="${escapeFilter(session.id)}"`;
        const [roster, teachers] = await Promise.all([
            this.repository.list('session_students', { filter, sort: 'id' }),
            this.repository.list('session_teachers', { filter, sort: 'role,teacherId,id' }),
        ]);
        invariant(roster.length > 0, 'SESSION_ROSTER_REQUIRED', 'Session settlement requires a roster snapshot');
        if (session.status === 'completed') validateCompletedRoster(roster);

        const studentPlans = [];
        for (const sessionStudent of roster.filter((student) => student.creditStatus === 'reserved')) {
            studentPlans.push(await this.planStudent({
                command, input, session: effectiveSession, sessionStudent,
            }));
        }
        const earnings = planTeacherEarnings(effectiveSession, teachers, roster, creditType.courseSpecId)
            .map((earning) => ({ ...earning, eventId: this.idFactory() }));
        const result = settlementResult(command.operationId, session, studentPlans, earnings);
        const context = { ...command, input, result };
        const sessionVersion = positiveVersion(session.version);
        const plan = [
            teachingOperation({
                ...context,
                sourceId: session.id,
                sourceType: 'session',
                type: 'settle_session',
                requestSnapshot: {
                    correctionBaseStatus: session.correctionBaseStatus || '',
                    priorSettlementOperationId: session.settlementOperationId || '',
                    rosterVersion: session.rosterVersion,
                    sessionId: session.id,
                    sessionStatus: effectiveSession.status,
                },
            }),
            versionClaim(this.idFactory, 'session', session.id, sessionVersion, command.operationId),
            ...studentPlans.flatMap(({ requests }) => requests),
            ...teacherEarningRequests(command.operationId, earnings),
            update('sessions', session.id, {
                correctionBaseStatus: '',
                settlementOperationId: command.operationId,
                status: 'settled',
                version: sessionVersion + 1,
            }),
            outbox(this.idFactory, 'course-credit.session-settled', 'session', session.id, result),
        ];
        return commitTeachingPlan(this, context, plan);
    }

    async planStudent({ command, input, session, sessionStudent }) {
        const studentId = escapeFilter(sessionStudent.id);
        const allocations = await this.repository.list('session_credit_allocations', {
            filter: `sessionStudentId="${studentId}" && status="reserved"`,
            sort: 'batchId,id',
        });
        const allocatedQuantity = allocations.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0);
        invariant(allocatedQuantity === session.requiredQuantity,
            'SESSION_ALLOCATION_QUANTITY_MISMATCH', 'Reserved quantity must equal the session requirement', {
                allocatedQuantity,
                requiredQuantity: session.requiredQuantity,
                sessionStudentId: sessionStudent.id,
            });
        const batchesById = new Map();
        for (const allocation of allocations) {
            if (!batchesById.has(allocation.batchId)) {
                batchesById.set(allocation.batchId,
                    await this.repository.get('credit_batches', allocation.batchId));
            }
        }
        const planning = buildStudentSettlementRequests({
            actor: input,
            allocations,
            batchesById,
            idFactory: this.idFactory,
            now: command.at,
            operationId: command.operationId,
            session,
            sessionStudent,
        });
        return {
            outcome: {
                allocationIds: allocations.map((allocation) => allocation.id),
                attendanceStatus: sessionStudent.attendanceStatus,
                creditStatus: planning.decision.creditStatus,
                sessionStudentId: sessionStudent.id,
            },
            requests: planning.requests,
        };
    }
}

function teacherEarningRequests(operationId, earnings) {
    return earnings.flatMap((earning) => [
        create('teacher_credit_events', {
            id: earning.eventId,
            sessionTeacherId: earning.sessionTeacherId,
            teacherId: earning.teacherId,
            ruleId: earning.ruleId,
            eventType: earning.eventType || 'earn',
            quantityDelta: earning.quantity,
            status: 'pending',
            operationId,
            reason: earning.eventType === 'compensate'
                ? 'session_cancellation_compensation'
                : 'session_settlement',
        }),
        update('session_teachers', earning.sessionTeacherId, { creditStatus: 'pending' }),
    ]);
}

function settlementResult(operationId, session, studentPlans, earnings) {
    return {
        operationId,
        sessionId: session.id,
        studentOutcomes: studentPlans.map(({ outcome }) => outcome),
        teacherEarnings: earnings.map((earning) => ({
            eventId: earning.eventId,
            eventType: earning.eventType || 'earn',
            quantity: earning.quantity,
            roleRuleId: earning.ruleId,
            sessionTeacherId: earning.sessionTeacherId,
            teacherId: earning.teacherId,
        })),
    };
}

function validateCommand(input) {
    invariant(typeof input.sessionId === 'string' && input.sessionId,
        'SESSION_ID_REQUIRED', 'sessionId is required');
}

function validateSession(session) {
    invariant(session && ['completed', 'cancelled', 'correction_pending'].includes(session.status),
        'SESSION_NOT_SETTLEABLE', 'Only completed, cancelled, or correction-pending sessions can be settled');
    invariant(Number.isInteger(session.requiredQuantity) && session.requiredQuantity > 0,
        'SESSION_CREDIT_QUANTITY_INVALID', 'Session required quantity must be a positive integer');
    if (session.status === 'correction_pending') {
        invariant(['completed', 'cancelled'].includes(session.correctionBaseStatus),
            'CORRECTION_BASE_STATUS_REQUIRED', 'Correction-pending session requires its original terminal status');
        invariant(session.settlementOperationId,
            'PRIOR_SETTLEMENT_OPERATION_REQUIRED', 'Correction-pending session requires its prior settlement operation');
    } else {
        invariant(!session.settlementOperationId,
            'SESSION_ALREADY_SETTLED', 'Session already references a settlement operation');
    }
}

function effectiveSettlementSession(session) {
    return session.status === 'correction_pending'
        ? { ...session, status: session.correctionBaseStatus }
        : session;
}

function validateCompletedRoster(roster) {
    const unresolved = roster.find((student) => student.creditStatus !== 'reserved');
    invariant(!unresolved, 'SESSION_STUDENT_CREDIT_UNRESOLVED',
        'Completed session has a student without a reserved credit', {
            creditStatus: unresolved?.creditStatus,
            sessionStudentId: unresolved?.id,
        });
}

module.exports = {
    CourseCreditSessionSettlementService,
    effectiveSettlementSession,
    settlementResult,
    teacherEarningRequests,
    validateCommand,
    validateCompletedRoster,
    validateSession,
};
