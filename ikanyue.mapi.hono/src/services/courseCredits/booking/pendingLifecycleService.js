const { createRecordId, invariant } = require('../domain');
const {
    commitTeachingPlan,
    outbox,
    prepareTeachingCommand,
    teachingOperation,
} = require('../teachingCommand');
const { appointmentUpdatePlan } = require('./decisionService');

class PendingAppointmentService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async decline(input = {}) {
        validateInput(input, 'teacherId', true);
        invariant(typeof input.reason === 'string' && input.reason.trim(),
            'APPOINTMENT_DECLINE_REASON_REQUIRED', '请填写拒绝原因');
        return this.transition('declineAppointment', 'decline_appointment', 'declined', input, (appointment) => {
            if (input.actorRole === 'admin') return;
            invariant(relationId(appointment.teacherId) === input.teacherId,
                'APPOINTMENT_TEACHER_FORBIDDEN', '不能处理其他教师的预约');
        });
    }

    async withdraw(input = {}) {
        validateInput(input, 'studentId');
        return this.transition('withdrawAppointment', 'withdraw_appointment', 'withdrawn', input, (appointment) => {
            invariant(relationId(appointment.studentId) === input.studentId,
                'APPOINTMENT_STUDENT_FORBIDDEN', '不能撤回其他学员的预约');
        });
    }

    async transition(scope, operationType, status, input, authorize) {
        const command = await prepareTeachingCommand(this, scope, input, {
            appointmentId: input.appointmentId,
            reason: input.reason || '',
        });
        if (command.replay) return command.replay;
        const appointment = await this.repository.get('appointment_requests', input.appointmentId);
        authorize(appointment);
        invariant(appointment.status === 'pending', 'APPOINTMENT_NOT_PENDING', '预约已被处理');
        const result = { appointmentId: appointment.id, operationId: command.operationId, status };
        const context = { ...command, input, result };
        const plan = [
            teachingOperation({
                ...context,
                studentId: relationId(appointment.studentId),
                sourceType: 'appointment',
                sourceId: appointment.id,
                type: operationType,
                requestSnapshot: { appointmentId: appointment.id, reason: input.reason || '' },
            }),
            ...appointmentUpdatePlan(this, appointment, input, command, status, {
                cancelledAt: status === 'withdrawn' ? command.at : '',
                respondedAt: command.at,
            }),
            outbox(this.idFactory, `course-booking.${status}`, 'appointment', appointment.id, result),
        ];
        return commitTeachingPlan(this, context, plan);
    }
}

function validateInput(input, ownerField, allowAdmin = false) {
    invariant(typeof input.appointmentId === 'string' && input.appointmentId,
        'APPOINTMENT_ID_REQUIRED', '预约编号不能为空');
    if (allowAdmin && input.actorRole === 'admin') return;
    invariant(typeof input[ownerField] === 'string' && input[ownerField],
        'APPOINTMENT_OWNER_REQUIRED', '预约操作人不能为空');
}

function relationId(value) {
    return typeof value === 'string' ? value : value?.id || '';
}

module.exports = { PendingAppointmentService, validateInput };
