const { createOperationNo, createRecordId, invariant, scopedIdempotencyKey } = require('../domain');
const { create } = require('../reservationRequests');
const { escapeFilter, fingerprintRequest } = require('../repositories/operationRepository');
const { relationId } = require('../queryService');
const { normalizeBookingPolicy, responseDeadline } = require('./policy');
const { sameRange } = require('./time');

class AppointmentRequestService {
    constructor(repository, queryService, options = {}) {
        this.repository = repository;
        this.queryService = queryService;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async createRequest(input = {}) {
        requireCommand(input);
        const key = scopedIdempotencyKey('requestAppointment', input.idempotencyKey);
        const requestFingerprint = fingerprintRequest({
            endAt: input.endAt,
            note: normalizeText(input.note, 500),
            offeringId: input.offeringId,
            startAt: input.startAt,
            studentId: input.studentId,
        });
        const existing = await this.repository.findFirst('appointment_requests',
            `idempotencyKey="${escapeFilter(key)}"`);
        if (existing) {
            invariant(existing.requestFingerprint === requestFingerprint,
                'IDEMPOTENCY_CONFLICT', '幂等键已用于另一条预约申请');
            return result(existing, true);
        }
        const offering = await this.repository.get('teacher_course_offerings', input.offeringId, {
            expand: 'teacherId,courseSpecId,creditTypeId,policyId',
        });
        invariant(offering.status === 'active', 'BOOKING_OFFERING_INACTIVE', '该教师暂未开放预约');
        const courseId = relationId(offering.courseSpecId);
        const duplicate = await this.repository.findFirst('appointment_requests',
            `studentId="${escapeFilter(input.studentId)}" && courseSpecId="${escapeFilter(courseId)}" && status="pending"`);
        invariant(!duplicate, 'APPOINTMENT_PENDING_DUPLICATE', '这门课程已有待确认预约');
        const slots = await this.queryService.availableSlots(input.studentId, {
            offeringId: input.offeringId,
            from: input.startAt,
            to: input.endAt,
        });
        invariant(slots.slots.some((slot) => sameRange(slot.startAt, slot.endAt, input.startAt, input.endAt)),
            'BOOKING_SLOT_UNAVAILABLE', '所选时间当前不可预约');
        const policy = await this.repository.get('booking_policies', relationId(offering.policyId));
        const now = new Date(this.clock()).toISOString();
        const appointmentId = this.idFactory();
        const data = {
            id: appointmentId,
            code: createOperationNo('APT', now, appointmentId),
            studentId: input.studentId,
            teacherId: relationId(offering.teacherId),
            offeringId: offering.id,
            courseSpecId: courseId,
            creditTypeId: relationId(offering.creditTypeId),
            policyId: relationId(offering.policyId),
            sessionId: '',
            status: 'pending',
            requestedStartAt: input.startAt,
            requestedEndAt: input.endAt,
            responseDeadline: responseDeadline(now, input.startAt, policy),
            note: normalizeText(input.note, 500),
            responseReason: '',
            policySnapshot: normalizeBookingPolicy(policy),
            idempotencyKey: key,
            requestFingerprint,
            version: 1,
            requestedAt: now,
            respondedAt: '', confirmedAt: '', cancelledAt: '',
        };
        const plan = [
            create('appointment_requests', data),
            event(this.idFactory, data, 'requested', '', 'pending', input, now),
            create('outbox_events', {
                id: this.idFactory(), topic: 'course-booking.requested', aggregateType: 'appointment',
                aggregateId: appointmentId, payload: { appointmentId, teacherId: data.teacherId, startAt: data.requestedStartAt },
                status: 'pending', attempts: 0,
            }),
        ];
        await this.repository.send(plan);
        return result(data, false);
    }
}

function event(idFactory, appointment, eventType, fromStatus, toStatus, input, now, metadata = {}) {
    return create('appointment_events', {
        id: idFactory(), appointmentId: appointment.id, eventType, fromStatus, toStatus,
        actorId: input.actorId || input.studentId || '', actorRole: input.actorRole || 'student',
        reason: normalizeText(input.reason || eventType, 500), traceId: input.traceId || '',
        metadata: { ...metadata, occurredAt: now },
    });
}

function result(record, replayed) {
    return {
        appointmentId: record.id,
        status: record.status,
        startAt: record.requestedStartAt,
        endAt: record.requestedEndAt,
        responseDeadline: record.responseDeadline,
        replayed,
    };
}

function requireCommand(input) {
    for (const [field, code] of [
        ['studentId', 'BOOKING_STUDENT_REQUIRED'], ['offeringId', 'BOOKING_OFFERING_REQUIRED'],
        ['startAt', 'BOOKING_START_REQUIRED'], ['endAt', 'BOOKING_END_REQUIRED'],
    ]) invariant(typeof input[field] === 'string' && input[field], code, '预约信息不完整');
    invariant(Date.parse(input.endAt) > Date.parse(input.startAt),
        'BOOKING_REQUEST_TIME_INVALID', '预约结束时间必须晚于开始时间');
}

function normalizeText(value, max) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

module.exports = { AppointmentRequestService, event, normalizeText, result };
