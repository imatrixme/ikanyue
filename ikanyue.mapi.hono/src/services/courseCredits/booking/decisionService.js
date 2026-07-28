const {
    buildReservationMovements,
    planReservation,
    positiveVersion,
} = require('../reservationPlanning');
const { buildFefoFilter, FEFO_SORT } = require('../repositories/batchRepository');
const {
    commitTeachingPlan,
    create,
    escapeFilter,
    outbox,
    prepareTeachingCommand,
    teachingOperation,
    update,
    versionClaim,
} = require('../teachingCommand');
const { createRecordId, invariant } = require('../domain');
const { reservationMovementPlan } = require('../reservationRequests');
const { appointmentClaimPlan } = require('./claimPlanning');
const { materializeAppointment } = require('./materialization');
const { event } = require('./requestService');
const { transitionAppointment } = require('./state');

class AppointmentDecisionService {
    constructor(repository, queryService, options = {}) {
        this.repository = repository;
        this.queryService = queryService;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async confirm(input = {}) {
        validateDecisionInput(input);
        const command = await prepareTeachingCommand(this, 'confirmAppointment', input, {
            appointmentId: input.appointmentId,
        });
        if (command.replay) return command.replay;
        const appointment = await this.repository.get('appointment_requests', input.appointmentId);
        requireTeacherAppointment(appointment, input.teacherId);
        if (Date.parse(appointment.responseDeadline) <= Date.parse(command.at)) {
            return this.closePending(command, appointment, input, 'expired', '教师响应期限已过');
        }

        const offering = await this.repository.get('teacher_course_offerings', relationId(appointment.offeringId));
        invariant(offering.status === 'active', 'BOOKING_OFFERING_INACTIVE', '该课程已停止接受预约');
        const [course, creditType, teacherRule, batches] = await Promise.all([
            this.repository.get('course_specs', relationId(appointment.courseSpecId)),
            this.repository.get('credit_types', relationId(appointment.creditTypeId)),
            findTeacherRule(this.repository, relationId(appointment.courseSpecId), appointment.requestedStartAt),
            this.repository.list('credit_batches', {
                filter: buildFefoFilter({
                    creditTypeId: relationId(appointment.creditTypeId),
                    sessionStart: appointment.requestedStartAt,
                    studentId: relationId(appointment.studentId),
                }),
                sort: FEFO_SORT,
            }),
        ]);
        invariant(creditType?.kind === 'course' && creditType.consumable === true,
            'BOOKING_CREDIT_TYPE_INVALID', '预约课程配置无效');
        const planning = planReservation(batches, 1, {
            creditType,
            now: command.at,
            requiredCreditTypeId: relationId(appointment.creditTypeId),
            sessionStart: appointment.requestedStartAt,
        });
        if (planning.missingQuantity > 0) {
            return this.closePending(command, appointment, input, 'eligibility_lost', '可用课时已不足');
        }
        const availability = await this.queryService.availableSlots(relationId(appointment.studentId), {
            offeringId: relationId(appointment.offeringId),
            from: appointment.requestedStartAt,
            to: appointment.requestedEndAt,
        });
        invariant(availability.slots.some((slot) => slot.startAt === appointment.requestedStartAt
            && slot.endAt === appointment.requestedEndAt),
        'BOOKING_SLOT_TAKEN', '该时段已不可预约');
        return this.commitConfirmation({ appointment, batches, command, course, input, offering, planning, teacherRule });
    }

    async commitConfirmation(context) {
        const { appointment, command, course, input, offering, planning, teacherRule } = context;
        const materialized = materializeAppointment({
            appointment,
            course,
            offering,
            teacherRule,
            now: command.at,
            sessionId: this.idFactory(),
            sessionStudentId: this.idFactory(),
            sessionTeacherId: this.idFactory(),
        });
        const movements = buildReservationMovements(planning, this.idFactory);
        const claimPlan = appointmentClaimPlan({
            appointmentId: appointment.id,
            endAt: appointment.requestedEndAt,
            granularityMinutes: Number(appointment.policySnapshot?.claimGranularityMinutes || 15),
            idFactory: this.idFactory,
            sessionId: materialized.session.id,
            startAt: appointment.requestedStartAt,
            studentId: relationId(appointment.studentId),
            teacherId: relationId(appointment.teacherId),
        });
        const competing = await overlappingPending(this.repository, appointment);
        const result = confirmationResult(command.operationId, appointment, materialized, movements, competing);
        const operationContext = {
            ...command,
            actor: input,
            idFactory: this.idFactory,
            input,
            movements,
            now: command.at,
            operationId: command.operationId,
            result,
            session: materialized.session,
            sessionStudent: materialized.sessionStudent,
            studentId: relationId(appointment.studentId),
        };
        const plan = [
            teachingOperation({
                ...operationContext,
                sourceType: 'appointment',
                sourceId: appointment.id,
                type: 'confirm_appointment',
                requestSnapshot: { appointmentId: appointment.id, version: positiveVersion(appointment.version) },
            }),
            create('sessions', materialized.session),
            create('session_students', materialized.sessionStudent),
            create('session_teachers', materialized.sessionTeacher),
            ...reservationMovementPlan(operationContext),
            ...claimPlan.requests,
            ...appointmentUpdatePlan(this, appointment, input, command, 'confirmed', {
                confirmedAt: command.at,
                respondedAt: command.at,
                sessionId: materialized.session.id,
            }),
            ...competing.flatMap((record) => appointmentUpdatePlan(
                this, record, input, command, 'slot_taken', { respondedAt: command.at },
                { winningAppointmentId: appointment.id }
            )),
            outbox(this.idFactory, 'course-booking.confirmed', 'appointment', appointment.id, result),
        ];
        try {
            return await commitTeachingPlan(this, operationContext, plan);
        } catch (error) {
            if (isScheduleConflict(error)) error.code = 'BOOKING_SLOT_TAKEN';
            throw error;
        }
    }

    async closePending(command, appointment, input, status, reason) {
        const result = {
            appointmentId: appointment.id,
            operationId: command.operationId,
            status,
        };
        const context = { ...command, input, result };
        const plan = [
            teachingOperation({
                ...context,
                studentId: relationId(appointment.studentId),
                sourceType: 'appointment',
                sourceId: appointment.id,
                type: 'confirm_appointment',
                requestSnapshot: { appointmentId: appointment.id },
            }),
            ...appointmentUpdatePlan(this, appointment, { ...input, reason }, command, status, {
                respondedAt: command.at,
            }),
            outbox(this.idFactory, `course-booking.${status.replaceAll('_', '-')}`, 'appointment', appointment.id, result),
        ];
        return commitTeachingPlan(this, context, plan);
    }
}

function appointmentUpdatePlan(service, appointment, input, command, nextStatus, changes = {}, metadata = {}) {
    transitionAppointment(appointment.status, nextStatus);
    const version = positiveVersion(appointment.version);
    return [
        versionClaim(service.idFactory, 'appointment', appointment.id, version, command.operationId),
        update('appointment_requests', appointment.id, {
            ...changes,
            responseReason: input.reason || '',
            status: nextStatus,
            version: version + 1,
        }),
        event(service.idFactory, appointment, nextStatus, appointment.status, nextStatus, input, command.at, metadata),
    ];
}

async function findTeacherRule(repository, courseSpecId, at) {
    const safeAt = escapeFilter(new Date(at).toISOString());
    const rules = await repository.list('teacher_credit_rules', {
        filter: `courseSpecId="${escapeFilter(courseSpecId)}" && role="lead" && status="active"`
            + ` && validFrom<="${safeAt}" && (validTo="" || validTo>"${safeAt}")`,
        sort: '-version',
    });
    invariant(rules.length > 0, 'BOOKING_TEACHER_RULE_REQUIRED', '该课程缺少有效的教师课酬规则');
    return rules[0];
}

async function overlappingPending(repository, appointment) {
    const records = await repository.list('appointment_requests', {
        filter: `teacherId="${escapeFilter(relationId(appointment.teacherId))}" && status="pending"`
            + ` && requestedStartAt<"${escapeFilter(appointment.requestedEndAt)}"`
            + ` && requestedEndAt>"${escapeFilter(appointment.requestedStartAt)}"`,
        sort: 'requestedAt,id',
    });
    return records.filter((record) => record.id !== appointment.id);
}

function confirmationResult(operationId, appointment, materialized, movements, competing) {
    return {
        appointmentId: appointment.id,
        closedAppointmentIds: competing.map((record) => record.id),
        endAt: appointment.requestedEndAt,
        lessonId: materialized.session.id,
        operationId,
        reservationAllocationIds: movements.map((movement) => movement.allocationId),
        startAt: appointment.requestedStartAt,
        status: 'confirmed',
    };
}

function requireTeacherAppointment(appointment, teacherId) {
    invariant(appointment && relationId(appointment.teacherId) === teacherId,
        'APPOINTMENT_TEACHER_FORBIDDEN', '不能处理其他教师的预约');
    invariant(appointment.status === 'pending', 'APPOINTMENT_NOT_PENDING', '预约已被处理');
}

function validateDecisionInput(input) {
    invariant(typeof input.appointmentId === 'string' && input.appointmentId,
        'APPOINTMENT_ID_REQUIRED', '预约编号不能为空');
    invariant(typeof input.teacherId === 'string' && input.teacherId,
        'BOOKING_TEACHER_REQUIRED', '教师编号不能为空');
}

function relationId(value) {
    return typeof value === 'string' ? value : value?.id || '';
}

function isScheduleConflict(error = {}) {
    const text = `${error.code || ''} ${error.message || ''} ${JSON.stringify(error.response || {})}`;
    return [400, 409].includes(error.status) && /schedule_claim|idx_schedule_claims_active_cell|unique/i.test(text);
}

module.exports = {
    AppointmentDecisionService,
    appointmentUpdatePlan,
    confirmationResult,
    findTeacherRule,
    isScheduleConflict,
    overlappingPending,
    requireTeacherAppointment,
    validateDecisionInput,
};
