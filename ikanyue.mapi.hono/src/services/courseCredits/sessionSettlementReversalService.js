const { createRecordId, invariant } = require('./domain');
const {
    buildCreditReversalRequests,
    buildTeacherReversalRequests,
} = require('./reverseSettlementPlanning');
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

class CourseCreditSessionSettlementReversalService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async reverseSessionSettlement(input = {}) {
        validateCommand(input);
        const command = await prepareTeachingCommand(this, 'reverseSessionSettlement', input, {
            reason: input.reason,
            sessionId: input.sessionId,
        });
        if (command.replay) return command.replay;

        const session = await this.repository.get('sessions', input.sessionId);
        validateSession(session);
        const originalOperation = await this.repository.get('credit_operations', session.settlementOperationId);
        const baseStatus = validateOriginalOperation(originalOperation, session.id);
        const operationFilter = `operationId="${escapeFilter(originalOperation.id)}"`;
        const [creditEvents, teacherEvents, roster] = await Promise.all([
            this.repository.list('credit_events', { filter: operationFilter, sort: 'batchId,id' }),
            this.repository.list('teacher_credit_events', { filter: operationFilter, sort: 'sessionTeacherId,id' }),
            this.repository.list('session_students', {
                filter: `sessionId="${escapeFilter(session.id)}"`, sort: 'id',
            }),
        ]);
        const sessionStudentsById = new Map(roster.map((student) => [student.id, student]));
        const allocationsById = new Map();
        const batchesById = new Map();
        for (const event of creditEvents) {
            const allocationId = event.metadata?.allocationId;
            if (allocationId && !allocationsById.has(allocationId)) {
                const allocation = await this.repository.get('session_credit_allocations', allocationId);
                allocationsById.set(allocationId, allocation);
                if (!batchesById.has(allocation.batchId)) {
                    batchesById.set(allocation.batchId,
                        await this.repository.get('credit_batches', allocation.batchId));
                }
            }
        }

        const common = {
            actor: input,
            idFactory: this.idFactory,
            now: command.at,
            operationId: command.operationId,
            originalOperationId: originalOperation.id,
            reason: input.reason,
            session,
        };
        const credit = buildCreditReversalRequests({
            ...common, allocationsById, batchesById, creditEvents, sessionStudentsById,
        });
        const teacher = buildTeacherReversalRequests({ ...common, teacherEvents });
        const result = {
            operationId: command.operationId,
            originalSettlementOperationId: originalOperation.id,
            reversedCreditEventIds: credit.movements.map((movement) => movement.event.id),
            reversedTeacherEventIds: teacher.reversals.map(({ event }) => event.id),
            sessionId: session.id,
        };
        const context = { ...command, input, result };
        const version = positiveVersion(session.version);
        const plan = [
            teachingOperation({
                ...context,
                reversalOfOperationId: originalOperation.id,
                sourceId: originalOperation.id,
                sourceType: 'settlement_operation',
                type: 'reverse_session_settlement',
                requestSnapshot: {
                    baseStatus,
                    originalSettlementOperationId: originalOperation.id,
                    reason: input.reason,
                },
            }),
            versionClaim(this.idFactory, 'session', session.id, version, command.operationId),
            ...credit.requests,
            ...teacher.requests,
            update('sessions', session.id, {
                correctionBaseStatus: baseStatus,
                status: 'correction_pending',
                version: version + 1,
            }),
            outbox(this.idFactory, 'course-credit.session-settlement-reversed', 'session', session.id, result),
        ];
        return commitTeachingPlan(this, context, plan);
    }
}

function validateCommand(input) {
    invariant(typeof input.sessionId === 'string' && input.sessionId,
        'SESSION_ID_REQUIRED', 'sessionId is required');
    invariant(typeof input.reason === 'string' && input.reason.trim().length >= 4,
        'REVERSAL_REASON_REQUIRED', 'Settlement reversal requires a meaningful reason');
}

function validateSession(session) {
    invariant(session?.status === 'settled',
        'SESSION_NOT_REVERSIBLE', 'Only a settled session can be reversed');
    invariant(typeof session.settlementOperationId === 'string' && session.settlementOperationId,
        'SETTLEMENT_OPERATION_REQUIRED', 'Settled session requires its settlement operation');
}

function validateOriginalOperation(operation, sessionId) {
    invariant(operation?.type === 'settle_session' && operation.status === 'committed',
        'SETTLEMENT_OPERATION_INVALID', 'Original settlement operation is invalid');
    invariant(operation.sourceType === 'session' && operation.sourceId === sessionId,
        'SETTLEMENT_OPERATION_SESSION_MISMATCH', 'Settlement operation belongs to another session');
    const baseStatus = operation.requestSnapshot?.sessionStatus;
    invariant(['completed', 'cancelled'].includes(baseStatus),
        'SETTLEMENT_BASE_STATUS_INVALID', 'Original settlement does not preserve its terminal status');
    return baseStatus;
}

module.exports = {
    CourseCreditSessionSettlementReversalService,
    validateCommand,
    validateOriginalOperation,
    validateSession,
};
