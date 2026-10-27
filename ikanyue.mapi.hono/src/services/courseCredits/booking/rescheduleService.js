const { createRecordId, invariant } = require('../domain');
const { buildFefoFilter, FEFO_SORT } = require('../repositories/batchRepository');
const { buildRescheduleStudentRequests } = require('../reschedulePlanning');
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
const { appointmentClaimPlan, releaseClaimPlan } = require('./claimPlanning');
const { appointmentUpdatePlan, isScheduleConflict } = require('./decisionService');
const { sameRange } = require('./time');

class AppointmentRescheduleService {
    constructor(repository, queryService, options = {}) {
        this.repository = repository;
        this.queryService = queryService;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async reschedule(input = {}) {
        validateInput(input);
        const command = await prepareTeachingCommand(this, 'rescheduleAppointment', input, {
            appointmentId: input.appointmentId,
            newEndAt: input.newEndAt,
            newStartAt: input.newStartAt,
            reason: input.reason,
        });
        if (command.replay) return command.replay;
        const appointment = await this.repository.get('appointment_requests', input.appointmentId);
        authorize(appointment, input);
        const session = await this.repository.get('sessions', relationId(appointment.sessionId));
        invariant(['scheduled', 'enrollment_closed'].includes(session.status),
            'APPOINTMENT_SESSION_NOT_RESCHEDULABLE', '关联课堂当前不能改期');
        invariant(Date.parse(session.startAt) !== Date.parse(input.newStartAt)
            || Date.parse(session.endAt) !== Date.parse(input.newEndAt),
        'APPOINTMENT_TIME_UNCHANGED', '新时间与原时间相同');
        const availability = await this.queryService.availableSlots(relationId(appointment.studentId), {
            excludeSourceId: session.id,
            offeringId: relationId(appointment.offeringId),
            from: input.newStartAt,
            to: input.newEndAt,
        });
        invariant(availability.slots.some((slot) => sameRange(
            slot.startAt, slot.endAt, input.newStartAt, input.newEndAt
        )),
        'BOOKING_SLOT_TAKEN', '新时段已不可预约');
        return this.commitReschedule({ appointment, command, input, session });
    }

    async commitReschedule(context) {
        const { appointment, command, input, session } = context;
        const roster = await this.repository.list('session_students', {
            filter: `sessionId="${escapeFilter(session.id)}"`, sort: 'id',
        });
        invariant(roster.length === 1 && roster[0].creditStatus === 'reserved',
            'APPOINTMENT_ROSTER_INVALID', '预约课堂学员记录无效');
        const sessionStudent = roster[0];
        const [creditType, allocations, candidateBatches, claims] = await Promise.all([
            this.repository.get('credit_types', session.requiredCreditTypeId),
            this.repository.list('session_credit_allocations', {
                filter: `sessionStudentId="${escapeFilter(sessionStudent.id)}" && status="reserved"`,
                sort: 'batchId,id',
            }),
            this.repository.list('credit_batches', {
                filter: buildFefoFilter({
                    creditTypeId: session.requiredCreditTypeId,
                    sessionStart: input.newStartAt,
                    studentId: sessionStudent.studentId,
                }),
                sort: FEFO_SORT,
            }),
            this.repository.list('schedule_claims', {
                filter: `sourceType="session" && sourceId="${escapeFilter(session.id)}" && status="active"`,
                sort: 'ownerType,ownerId,cellStartAt',
            }),
        ]);
        const batchesById = new Map();
        for (const allocation of allocations) {
            const batchId = relationId(allocation.batchId);
            if (!batchesById.has(batchId)) {
                batchesById.set(batchId, await this.repository.get('credit_batches', batchId));
            }
        }
        const studentPlan = buildRescheduleStudentRequests({
            actor: input,
            allocations,
            batchesById,
            candidateBatches,
            creditType,
            idFactory: this.idFactory,
            newStartAt: new Date(input.newStartAt).toISOString(),
            now: command.at,
            operationId: command.operationId,
            session,
            sessionStudent,
        });
        invariant(studentPlan.creditStatus === 'reserved',
            'APPOINTMENT_ELIGIBILITY_LOST', '新时间没有可用的对应课时');
        const newClaims = appointmentClaimPlan({
            appointmentId: appointment.id,
            endAt: new Date(input.newEndAt).toISOString(),
            granularityMinutes: Number(appointment.policySnapshot?.claimGranularityMinutes || 15),
            idFactory: this.idFactory,
            sessionId: session.id,
            startAt: new Date(input.newStartAt).toISOString(),
            studentId: relationId(appointment.studentId),
            teacherId: relationId(appointment.teacherId),
        });
        const result = {
            appointmentId: appointment.id,
            lessonId: session.id,
            newEndAt: new Date(input.newEndAt).toISOString(),
            newStartAt: new Date(input.newStartAt).toISOString(),
            operationId: command.operationId,
            status: 'rescheduled',
        };
        const operationContext = { ...command, input, result };
        const sessionVersion = positiveVersion(session.version);
        const plan = [
            teachingOperation({
                ...operationContext,
                studentId: relationId(appointment.studentId),
                sourceType: 'appointment',
                sourceId: appointment.id,
                type: 'reschedule_appointment',
                requestSnapshot: {
                    appointmentId: appointment.id,
                    newEndAt: result.newEndAt,
                    newStartAt: result.newStartAt,
                    reason: input.reason,
                },
            }),
            ...releaseClaimPlan(claims, {
                idFactory: this.idFactory, now: command.at, operationId: command.operationId,
            }),
            ...newClaims.requests,
            ...studentPlan.requests,
            versionClaim(this.idFactory, 'session', session.id, sessionVersion, command.operationId),
            update('sessions', session.id, {
                endAt: result.newEndAt,
                startAt: result.newStartAt,
                version: sessionVersion + 1,
            }),
            ...appointmentUpdatePlan(this, appointment, input, command, 'rescheduled', {
                requestedEndAt: result.newEndAt,
                requestedStartAt: result.newStartAt,
                respondedAt: command.at,
            }, { oldEndAt: appointment.requestedEndAt, oldStartAt: appointment.requestedStartAt }),
            outbox(this.idFactory, 'course-booking.rescheduled', 'appointment', appointment.id, result),
        ];
        try {
            return await commitTeachingPlan(this, operationContext, plan);
        } catch (error) {
            if (isScheduleConflict(error)) error.code = 'BOOKING_SLOT_TAKEN';
            throw error;
        }
    }
}

function authorize(appointment, input) {
    invariant(appointment && ['confirmed', 'rescheduled'].includes(appointment.status),
        'APPOINTMENT_NOT_RESCHEDULABLE', '预约当前不能改期');
    if (input.actorRole === 'teacher') {
        invariant(relationId(appointment.teacherId) === input.teacherId,
            'APPOINTMENT_TEACHER_FORBIDDEN', '不能修改其他教师的预约');
        return;
    }
    invariant(input.actorRole === 'admin', 'APPOINTMENT_RESCHEDULE_FORBIDDEN', '无权修改预约时间');
}

function validateInput(input) {
    invariant(typeof input.appointmentId === 'string' && input.appointmentId,
        'APPOINTMENT_ID_REQUIRED', '预约编号不能为空');
    invariant(Number.isFinite(Date.parse(input.newStartAt)) && Number.isFinite(Date.parse(input.newEndAt))
        && Date.parse(input.newEndAt) > Date.parse(input.newStartAt),
    'APPOINTMENT_TIME_INVALID', '改期时间无效');
    invariant(typeof input.reason === 'string' && input.reason.trim().length >= 2,
        'APPOINTMENT_RESCHEDULE_REASON_REQUIRED', '请填写改期原因');
}

function relationId(value) {
    return typeof value === 'string' ? value : value?.id || '';
}

module.exports = { AppointmentRescheduleService, authorize, validateInput };
