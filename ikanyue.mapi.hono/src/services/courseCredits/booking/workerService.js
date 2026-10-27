const { createRecordId, invariant } = require('../domain');
const {
    commitTeachingPlan,
    escapeFilter,
    outbox,
    prepareTeachingCommand,
    teachingOperation,
} = require('../teachingCommand');
const { appointmentUpdatePlan } = require('./decisionService');
const { filterTime } = require('../repositories/operationRepository');

class AppointmentWorkerService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async expirePending(input = {}) {
        const command = await prepareTeachingCommand(this, 'expireAppointments', input, {
            cutoffAt: input.cutoffAt || '',
        });
        if (command.replay) return command.replay;
        const cutoffAt = input.cutoffAt ? new Date(input.cutoffAt).toISOString() : command.at;
        const appointments = await this.repository.list('appointment_requests', {
            filter: `status="pending" && responseDeadline<="${escapeFilter(filterTime(cutoffAt))}"`,
            sort: 'responseDeadline,id',
        });
        return this.commitTransitions(command, input, appointments, 'expired', 'expire_appointment', cutoffAt);
    }

    async fulfillCompleted(input = {}) {
        const command = await prepareTeachingCommand(this, 'fulfillAppointments', input, {
            cutoffAt: input.cutoffAt || '',
        });
        if (command.replay) return command.replay;
        const appointments = await this.repository.list('appointment_requests', {
            filter: '(status="confirmed" || status="rescheduled")'
                + ' && (sessionId.status="completed" || sessionId.status="settled")',
            sort: 'requestedStartAt,id',
        });
        return this.commitTransitions(
            command, input, appointments, 'fulfilled', 'fulfill_appointment', input.cutoffAt || command.at
        );
    }

    async commitTransitions(command, input, appointments, status, operationType, cutoffAt) {
        invariant(Array.isArray(appointments), 'APPOINTMENT_WORKER_RESULT_INVALID', '预约 worker 查询结果无效');
        const result = {
            appointmentIds: appointments.map((appointment) => appointment.id),
            cutoffAt,
            operationId: command.operationId,
            processedCount: appointments.length,
            status,
        };
        const context = { ...command, input, result };
        const plan = [
            teachingOperation({
                ...context,
                sourceType: 'appointment_worker',
                sourceId: cutoffAt,
                type: operationType,
                requestSnapshot: { cutoffAt },
            }),
            ...appointments.flatMap((appointment) => [
                ...appointmentUpdatePlan(this, appointment, {
                    ...input,
                    reason: status === 'expired' ? '教师未在响应期限内处理' : '关联课堂已完成',
                }, command, status, status === 'expired' ? { respondedAt: command.at } : {}, { cutoffAt }),
                outbox(this.idFactory, `course-booking.${status}`, 'appointment', appointment.id, {
                    appointmentId: appointment.id, status,
                }),
            ]),
            outbox(this.idFactory, `course-booking.worker-${status}`, 'appointment_worker', cutoffAt, result),
        ];
        return commitTeachingPlan(this, context, plan);
    }
}

module.exports = { AppointmentWorkerService };
