const { createRecordId, invariant } = require('../domain');
const { buildStudentSettlementRequests } = require('../settlementPlanning');
const {
    commitTeachingPlan,
    escapeFilter,
    outbox,
    positiveVersion,
    prepareTeachingCommand,
    teachingOperation,
    update,
    versionClaim,
} = require('../teachingCommand');
const { releaseClaimPlan } = require('./claimPlanning');
const { appointmentUpdatePlan } = require('./decisionService');
const { reservationQuote, cashCancellationPlan, previewReservation } = require('../../commerce/reservationCancellation');

class AppointmentCancellationService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    preview(studentId, appointmentId) {
        return previewReservation(this.repository, studentId, appointmentId, this.clock);
    }

    async cancel(input = {}) {
        validateInput(input);
        const command = await prepareTeachingCommand(this, 'cancelAppointment', input, {
            appointmentId: input.appointmentId,
            reason: input.reason,
            expectedRefundAmount: input.expectedRefundAmount,
            expectedFee: input.expectedFee,
            cancellationType: input.cancellationType,
        });
        if (command.replay) return command.replay;
        const appointment = await this.repository.get('appointment_requests', input.appointmentId);
        authorizeCancellation(appointment, input, command.at, true);
        const session = await this.repository.get('sessions', relationId(appointment.sessionId));
        invariant(['scheduled', 'enrollment_closed'].includes(session.status),
            'APPOINTMENT_SESSION_NOT_CANCELLABLE', '关联课堂当前不能取消');
        const sourceFilter = `sourceType="session" && sourceId="${escapeFilter(session.id)}" && status="active"`;
        const rosterFilter = `sessionId="${escapeFilter(session.id)}"`;
        const [roster, claims] = await Promise.all([
            this.repository.list('session_students', { filter: rosterFilter, sort: 'id' }),
            this.repository.list('schedule_claims', { filter: sourceFilter, sort: 'ownerType,ownerId,cellStartAt' }),
        ]);
        invariant(roster.length === 1 && roster[0].creditStatus === 'reserved',
            'APPOINTMENT_ROSTER_INVALID', '预约课堂学员记录无效');
        const allocations = await this.repository.list('session_credit_allocations', {
            filter: `sessionStudentId="${escapeFilter(roster[0].id)}" && status="reserved"`,
            sort: 'batchId,id',
        });
        const batchesById = new Map();
        for (const allocation of allocations) {
            if (!batchesById.has(relationId(allocation.batchId))) {
                batchesById.set(relationId(allocation.batchId),
                    await this.repository.get('credit_batches', relationId(allocation.batchId)));
            }
        }
        const cashQuote = await reservationQuote(this.repository, appointment, allocations, batchesById, command.at,
            input.actorRole === 'teacher' || (input.actorRole === 'admin' && input.cancellationType === 'institution'));
        if (!cashQuote) authorizeCancellation(appointment, input, command.at);
        const result = cancellationResult(command.operationId, appointment, session);
        const context = { ...command, input, result };
        const settlement = cashQuote ? cashCancellationPlan(cashQuote, { appointment, student: roster[0], input, command, idFactory: this.idFactory }) : buildStudentSettlementRequests({
            actor: input,
            allocations,
            batchesById,
            idFactory: this.idFactory,
            now: command.at,
            operationId: command.operationId,
            session: { ...session, status: 'cancelled' },
            sessionStudent: roster[0],
        });
        if (settlement.refund) result.refund = settlement.refund;
        const sessionVersion = positiveVersion(session.version);
        const plan = [
            teachingOperation({
                ...context,
                studentId: relationId(appointment.studentId),
                sourceType: 'appointment',
                sourceId: appointment.id,
                type: 'cancel_appointment',
                requestSnapshot: { appointmentId: appointment.id, reason: input.reason },
            }),
            ...releaseClaimPlan(claims, {
                idFactory: this.idFactory, now: command.at, operationId: command.operationId,
            }),
            ...settlement.requests,
            versionClaim(this.idFactory, 'session', session.id, sessionVersion, command.operationId),
            update('sessions', session.id, {
                cancellationType: cancellationType(input),
                cancelledAt: command.at,
                status: 'cancelled',
                version: sessionVersion + 1,
            }),
            ...appointmentUpdatePlan(this, appointment, input, command, 'cancelled', {
                cancelledAt: command.at,
                respondedAt: command.at,
            }),
            outbox(this.idFactory, 'course-booking.cancelled', 'appointment', appointment.id, result),
        ];
        return commitTeachingPlan(this, context, plan);
    }
}

function authorizeCancellation(appointment, input, now, deferCutoff = false) {
    invariant(appointment && ['confirmed', 'rescheduled'].includes(appointment.status),
        'APPOINTMENT_NOT_CANCELLABLE', '预约当前不能取消');
    if (input.actorRole === 'student') {
        invariant(relationId(appointment.studentId) === input.studentId,
            'APPOINTMENT_STUDENT_FORBIDDEN', '不能取消其他学员的预约');
        const cutoff = Number(appointment.policySnapshot?.cancellationCutoffMinutes || 0) * 60000;
        invariant(deferCutoff || Date.parse(appointment.requestedStartAt) - Date.parse(now) >= cutoff,
            'APPOINTMENT_CANCELLATION_CUTOFF_PASSED', '已超过学员自助取消截止时间');
    } else if (input.actorRole === 'teacher') {
        invariant(relationId(appointment.teacherId) === input.teacherId,
            'APPOINTMENT_TEACHER_FORBIDDEN', '不能取消其他教师的预约');
    } else {
        invariant(input.actorRole === 'admin', 'APPOINTMENT_CANCEL_FORBIDDEN', '无权取消预约');
    }
}

function cancellationResult(operationId, appointment, session) {
    return {
        appointmentId: appointment.id,
        lessonId: session.id,
        operationId,
        status: 'cancelled',
    };
}

function cancellationType(input) {
    if (input.actorRole === 'student') return 'student';
    if (input.actorRole === 'teacher') return 'teacher';
    return input.cancellationType === 'institution' ? 'institution' : 'admin';
}

function validateInput(input) {
    invariant(typeof input.appointmentId === 'string' && input.appointmentId,
        'APPOINTMENT_ID_REQUIRED', '预约编号不能为空');
    invariant(typeof input.reason === 'string' && input.reason.trim().length >= 2,
        'APPOINTMENT_CANCEL_REASON_REQUIRED', '请填写取消原因');
}

function relationId(value) {
    return typeof value === 'string' ? value : value?.id || '';
}

module.exports = {
    AppointmentCancellationService,
    authorizeCancellation,
    cancellationResult,
    cancellationType,
    validateInput,
};
