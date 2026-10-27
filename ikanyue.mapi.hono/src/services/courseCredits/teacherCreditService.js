const { createRecordId, invariant } = require('./domain');
const {
    commitTeachingPlan,
    create,
    escapeFilter,
    outbox,
    prepareTeachingCommand,
    teachingOperation,
    update,
} = require('./teachingCommand');

class CourseCreditTeacherCreditService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async confirmTeacherCredit(input = {}) {
        validateCommand(input);
        const request = {
            reason: input.reason.trim(),
            teacherCreditEventId: input.teacherCreditEventId,
        };
        const command = await prepareTeachingCommand(this, 'confirmTeacherCredit', input, request);
        if (command.replay) return command.replay;

        const earning = await this.repository.get('teacher_credit_events', input.teacherCreditEventId);
        validatePendingEarning(earning);
        const eventId = escapeFilter(earning.id);
        const [existingConfirmation, existingReversal] = await Promise.all([
            this.repository.findFirst('teacher_credit_events', `confirmationOfEventId="${eventId}"`),
            this.repository.findFirst('teacher_credit_events', `reversalOfEventId="${eventId}"`),
        ]);
        invariant(!existingConfirmation,
            'TEACHER_CREDIT_ALREADY_CONFIRMED', 'Teacher earning already has a confirmation event');
        invariant(!existingReversal,
            'TEACHER_CREDIT_REVERSED', 'Reversed teacher earning cannot be confirmed');
        const assignment = await this.repository.get('session_teachers', earning.sessionTeacherId);
        validateAssignment(assignment, earning);

        const confirmationEventId = this.idFactory();
        const result = {
            confirmationEventId,
            earningEventId: earning.id,
            operationId: command.operationId,
            quantity: Number(earning.quantityDelta),
            sessionTeacherId: assignment.id,
            teacherId: earning.teacherId,
        };
        const context = { ...command, input, result };
        const plan = [
            teachingOperation({
                ...context,
                sourceId: earning.id,
                sourceType: 'teacher_credit_event',
                type: 'confirm_teacher_credit',
                requestSnapshot: request,
            }),
            create('teacher_credit_events', {
                id: confirmationEventId,
                sessionTeacherId: earning.sessionTeacherId,
                teacherId: earning.teacherId,
                ruleId: earning.ruleId || '',
                eventType: 'confirm',
                quantityDelta: Number(earning.quantityDelta),
                status: 'confirmed',
                operationId: command.operationId,
                confirmationOfEventId: earning.id,
                reason: request.reason,
            }),
            update('session_teachers', assignment.id, { creditStatus: 'confirmed' }),
            outbox(this.idFactory, 'course-credit.teacher-credit-confirmed', 'teacher_credit_event', earning.id, result),
        ];
        return commitTeachingPlan(this, context, plan);
    }
}

function validateCommand(input) {
    invariant(typeof input.teacherCreditEventId === 'string' && input.teacherCreditEventId,
        'TEACHER_CREDIT_EVENT_ID_REQUIRED', 'teacherCreditEventId is required');
    invariant(input.actorRole === 'admin',
        'TEACHER_CREDIT_CONFIRM_FORBIDDEN', 'Only an authorized administrator can confirm teacher credit');
    invariant(typeof input.reason === 'string' && input.reason.trim().length >= 4,
        'TEACHER_CREDIT_CONFIRM_REASON_REQUIRED', 'Teacher credit confirmation requires a meaningful reason');
}

function validatePendingEarning(event) {
    invariant(event && ['earn', 'compensate'].includes(event.eventType) && event.status === 'pending',
        'TEACHER_CREDIT_NOT_PENDING', 'Only a pending teacher earning can be confirmed');
    invariant(Number.isFinite(Number(event.quantityDelta)) && Number(event.quantityDelta) > 0,
        'TEACHER_CREDIT_QUANTITY_INVALID', 'Pending teacher earning quantity must be positive');
    invariant(typeof event.sessionTeacherId === 'string' && event.sessionTeacherId
        && typeof event.teacherId === 'string' && event.teacherId,
    'TEACHER_CREDIT_RELATION_INVALID', 'Pending teacher earning must identify its teacher assignment');
}

function validateAssignment(assignment, earning) {
    invariant(assignment && assignment.id === earning.sessionTeacherId
        && assignment.teacherId === earning.teacherId,
    'TEACHER_CREDIT_ASSIGNMENT_MISMATCH', 'Teacher earning does not match its session assignment');
    invariant(assignment.creditStatus === 'pending',
        'TEACHER_CREDIT_ASSIGNMENT_NOT_PENDING', 'Teacher assignment is not pending confirmation');
}

module.exports = {
    CourseCreditTeacherCreditService,
    validateAssignment,
    validateCommand,
    validatePendingEarning,
};
