const { invariant } = require('../domain');
const { planReservation } = require('../reservationPlanning');
const { FEFO_SORT } = require('../repositories/batchRepository');
const { escapeFilter } = require('../repositories/operationRepository');
const { mapPage, pagination, relation, relationId } = require('../queryService');
const { generateAvailableSlots } = require('./availability');
const { normalizeBookingPolicy } = require('./policy');
const { bookingOption, studentAppointment, teacherAppointment } = require('./projection');
const { filterTime } = require('../repositories/operationRepository');

const APPOINTMENT_EXPAND = 'studentId,teacherId,offeringId,courseSpecId,sessionId';

class CourseBookingQueryService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
    }

    async studentOptions(studentId, query = {}) {
        requiredId(studentId, 'BOOKING_STUDENT_REQUIRED');
        const batches = await this.repository.list('credit_batches', {
            filter: `studentId="${escapeFilter(studentId)}" && availableQuantity>0 && creditTypeId.kind="course"`,
            sort: 'effectiveExpiresAt,priority,created',
            expand: 'creditTypeId,creditTypeId.courseSpecId',
        });
        const courseIds = new Set(batches.map(courseIdFromBatch).filter(Boolean));
        if (query.courseId) {
            invariant(courseIds.has(query.courseId), 'BOOKING_COURSE_NOT_ELIGIBLE', '当前课程没有可预约课时');
            courseIds.clear();
            courseIds.add(query.courseId);
        }
        if (courseIds.size === 0) return [];
        const offerings = await this.repository.list('teacher_course_offerings', {
            filter: 'status="active"',
            sort: 'courseSpecId,teacherId',
            expand: 'teacherId,courseSpecId,policyId',
        });
        return offerings.filter((offering) => courseIds.has(relationId(offering.courseSpecId)))
            .map(bookingOption);
    }

    async availableSlots(studentId, query = {}) {
        requiredId(studentId, 'BOOKING_STUDENT_REQUIRED');
        requiredId(query.offeringId, 'BOOKING_OFFERING_REQUIRED');
        const offering = await this.repository.get('teacher_course_offerings', query.offeringId, {
            expand: 'teacherId,courseSpecId,creditTypeId,policyId',
        });
        invariant(offering.status === 'active', 'BOOKING_OFFERING_INACTIVE', '该教师暂未开放预约');
        const [course, creditType, policyRecord, rules, overrides, teacherClaims, studentClaims, batches] = await Promise.all([
            related(this.repository, offering, 'courseSpecId', 'course_specs'),
            related(this.repository, offering, 'creditTypeId', 'credit_types'),
            related(this.repository, offering, 'policyId', 'booking_policies'),
            this.repository.list('teacher_availability_rules', {
                filter: `teacherId="${escapeFilter(relationId(offering.teacherId))}" && status="active"`, sort: 'weekday,startMinute',
            }),
            this.repository.list('teacher_availability_overrides', {
                filter: `teacherId="${escapeFilter(relationId(offering.teacherId))}" && status="active"`, sort: 'startAt',
            }),
            claims(this.repository, 'teacher', relationId(offering.teacherId), query.from, query.to, query.excludeSourceId),
            claims(this.repository, 'student', studentId, query.from, query.to, query.excludeSourceId),
            this.repository.list('credit_batches', {
                filter: bookingBatchFilter(studentId, relationId(offering.creditTypeId)),
                sort: FEFO_SORT,
            }),
        ]);
        invariant(creditType?.kind === 'course' && creditType?.consumable === true,
            'BOOKING_CREDIT_TYPE_INVALID', '预约课程配置无效');
        const policy = normalizeBookingPolicy(policyRecord);
        const slots = generateAvailableSlots({
            availabilityMode: offering.availabilityMode,
            claims: [...teacherClaims, ...studentClaims],
            durationMinutes: Number(course.durationMinutes),
            from: query.from,
            now: this.clock(),
            overrides,
            policy,
            rules: rules.filter((rule) => !relationId(rule.offeringId) || relationId(rule.offeringId) === offering.id),
            to: query.to,
            isStudentEligible: (startAt) => planReservation(batches, 1, {
                creditType,
                now: new Date(this.clock()).toISOString(),
                requiredCreditTypeId: relationId(offering.creditTypeId),
                sessionStart: startAt,
            }).missingQuantity === 0,
        });
        return { offering: bookingOption({ ...offering, expand: { ...(offering.expand || {}), courseSpecId: course } }), slots };
    }

    async listStudentAppointments(studentId, query = {}) {
        const page = pagination(query);
        const filters = [`studentId="${escapeFilter(studentId)}"`];
        appendStatusFilter(filters, query.status);
        const result = await this.repository.page('appointment_requests', page.page, page.perPage, {
            filter: filters.join(' && '), sort: '-requestedStartAt', expand: APPOINTMENT_EXPAND,
        });
        return mapPage(result, studentAppointment);
    }

    async getStudentAppointment(studentId, appointmentId) {
        const record = await this.repository.get('appointment_requests', appointmentId, { expand: APPOINTMENT_EXPAND });
        invariant(relationId(record.studentId) === studentId,
            'APPOINTMENT_STUDENT_FORBIDDEN', '不能查看其他学员的预约');
        return studentAppointment(record);
    }

    async listTeacherAppointments(teacherId, query = {}) {
        const page = pagination(query);
        const filters = [`teacherId="${escapeFilter(teacherId)}"`];
        appendStatusFilter(filters, query.status);
        const result = await this.repository.page('appointment_requests', page.page, page.perPage, {
            filter: filters.join(' && '), sort: 'requestedStartAt', expand: APPOINTMENT_EXPAND,
        });
        return mapPage(result, teacherAppointment);
    }

    async getTeacherAppointment(teacherId, appointmentId) {
        const record = await this.repository.get('appointment_requests', appointmentId, { expand: APPOINTMENT_EXPAND });
        invariant(relationId(record.teacherId) === teacherId,
            'APPOINTMENT_TEACHER_FORBIDDEN', '不能查看其他教师的预约');
        return teacherAppointment(record);
    }

    async teacherDashboard(teacherId) {
        const [pending, confirmed, offerings] = await Promise.all([
            this.listTeacherAppointments(teacherId, { status: 'pending', page: 1, perPage: 5 }),
            this.listTeacherAppointments(teacherId, { status: 'confirmed,rescheduled', page: 1, perPage: 8 }),
            this.repository.list('teacher_course_offerings', {
                filter: `teacherId="${escapeFilter(teacherId)}" && status="active"`,
                sort: 'courseSpecId',
                expand: 'teacherId,courseSpecId',
            }),
        ]);
        return {
            pending: pending.items,
            confirmed: confirmed.items,
            pendingCount: pending.totalItems,
            offerings: offerings.map(bookingOption),
        };
    }

    async teacherCalendar(teacherId, query = {}) {
        const page = pagination(query);
        const filters = [
            `teacherId="${escapeFilter(teacherId)}"`,
            '(status="confirmed" || status="rescheduled" || status="fulfilled")',
        ];
        if (query.from) filters.push(`requestedEndAt>"${escapeFilter(filterTime(query.from))}"`);
        if (query.to) filters.push(`requestedStartAt<"${escapeFilter(filterTime(query.to))}"`);
        const result = await this.repository.page('appointment_requests', page.page, page.perPage, {
            filter: filters.join(' && '), sort: 'requestedStartAt', expand: APPOINTMENT_EXPAND,
        });
        return mapPage(result, teacherAppointment);
    }

    async teacherAvailability(teacherId, offeringId) {
        const offering = await this.repository.get('teacher_course_offerings', offeringId, {
            expand: 'courseSpecId,policyId',
        });
        invariant(relationId(offering.teacherId) === teacherId,
            'BOOKING_OFFERING_FORBIDDEN', '不能查看其他教师的可预约时间');
        const [policy, rules, overrides] = await Promise.all([
            related(this.repository, offering, 'policyId', 'booking_policies'),
            this.repository.list('teacher_availability_rules', {
                filter: `teacherId="${escapeFilter(teacherId)}" && offeringId="${escapeFilter(offeringId)}"`
                    + ' && status="active"',
                sort: 'weekday,startMinute',
            }),
            this.repository.list('teacher_availability_overrides', {
                filter: `teacherId="${escapeFilter(teacherId)}" && offeringId="${escapeFilter(offeringId)}"`
                    + ' && status="active"',
                sort: 'startAt',
            }),
        ]);
        return {
            offering: bookingOption(offering),
            policy: normalizeBookingPolicy(policy),
            rules: rules.map(({ id, weekday, startMinute, endMinute, effectiveFrom, effectiveTo }) => ({
                id, weekday: Number(weekday), startMinute: Number(startMinute), endMinute: Number(endMinute),
                effectiveFrom, effectiveTo: effectiveTo || null,
            })),
            overrides: overrides.map(({ id, type, startAt, endAt, reason }) => ({ id, type, startAt, endAt, reason })),
        };
    }
}

async function related(repository, record, field, collection) {
    const expanded = relation(record, field);
    return expanded.id ? expanded : repository.get(collection, relationId(record[field]));
}

function claims(repository, ownerType, ownerId, from, to, excludeSourceId = '') {
    return repository.list('schedule_claims', {
        filter: `ownerType="${ownerType}" && ownerId="${escapeFilter(ownerId)}" && status="active"`
            + ` && cellStartAt<"${escapeFilter(filterTime(to))}" && cellEndAt>"${escapeFilter(filterTime(from))}"`
            + (excludeSourceId ? ` && sourceId!="${escapeFilter(excludeSourceId)}"` : ''),
        sort: 'cellStartAt',
    });
}

function courseIdFromBatch(batch) {
    const type = relation(batch, 'creditTypeId');
    const course = relation(type, 'courseSpecId');
    return course.id || relationId(type.courseSpecId);
}

function bookingBatchFilter(studentId, creditTypeId) {
    return `studentId="${escapeFilter(studentId)}" && creditTypeId="${escapeFilter(creditTypeId)}"`
        + ' && availableQuantity>0 && (status="active" || status="unactivated")';
}

function requiredId(value, code) {
    invariant(typeof value === 'string' && value, code, '编号不能为空');
}

function appendStatusFilter(filters, value) {
    if (!value) return;
    const statuses = String(value).split(',').filter(Boolean);
    invariant(statuses.length <= 10, 'BOOKING_STATUS_FILTER_INVALID', '预约状态筛选无效');
    filters.push(statuses.length === 1
        ? `status="${escapeFilter(statuses[0])}"`
        : `(${statuses.map((status) => `status="${escapeFilter(status)}"`).join(' || ')})`);
}

module.exports = {
    APPOINTMENT_EXPAND,
    CourseBookingQueryService,
    appendStatusFilter,
    bookingBatchFilter,
    claims,
    courseIdFromBatch,
    related,
};
