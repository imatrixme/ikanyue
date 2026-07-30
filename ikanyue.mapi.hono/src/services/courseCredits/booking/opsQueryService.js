const { invariant } = require('../domain');
const { escapeFilter } = require('../repositories/operationRepository');
const { mapPage, pagination } = require('../queryService');
const { teacherAppointment } = require('./projection');

const OPS_EXPAND = 'studentId,teacherId,offeringId,courseSpecId,creditTypeId,policyId,sessionId';

class BookingOpsQueryService {
    constructor(repository) {
        this.repository = repository;
    }

    async dashboard() {
        const [pending, upcoming, conflicts] = await Promise.all([
            this.listAppointments({ status: 'pending', page: 1, perPage: 6 }),
            this.listAppointments({ status: 'confirmed,rescheduled', page: 1, perPage: 8 }),
            this.listConflicts({ status: 'open', page: 1, perPage: 6 }),
        ]);
        return {
            pending: pending.items,
            pendingCount: pending.totalItems,
            upcoming: upcoming.items,
            openConflicts: conflicts.items,
            openConflictCount: conflicts.totalItems,
        };
    }

    async referenceData() {
        const [teachers, courses, creditTypes, policies] = await Promise.all([
            this.repository.list('teachers', {
                filter: 'verified=true && blocked=false', sort: 'cellphone',
            }),
            this.repository.list('course_specs', {
                filter: 'status="active" && deliveryMode="one_to_one"', sort: 'name',
            }),
            this.repository.list('credit_types', {
                filter: 'status="active" && kind="course" && consumable=true', sort: 'name',
            }),
            this.repository.list('booking_policies', {
                filter: 'status="active"', sort: '-version',
            }),
        ]);
        return {
            teachers: teachers.map(teacherReference),
            courses: courses.map(courseReference),
            creditTypes: creditTypes.map(creditTypeReference),
            policies: policies.map(policyProjection),
        };
    }

    async listAppointments(query = {}) {
        const page = pagination(query);
        const filters = [];
        statusFilter(filters, query.status);
        relationFilter(filters, 'teacherId', query.teacherId);
        relationFilter(filters, 'studentId', query.studentId);
        relationFilter(filters, 'courseSpecId', query.courseSpecId);
        if (query.from) filters.push(`requestedEndAt>"${escapeFilter(query.from)}"`);
        if (query.to) filters.push(`requestedStartAt<"${escapeFilter(query.to)}"`);
        const result = await this.repository.page('appointment_requests', page.page, page.perPage, {
            filter: filters.join(' && '), sort: query.sort || '-requestedAt', expand: OPS_EXPAND,
        });
        return mapPage(result, teacherAppointment);
    }

    async getAppointment(id) {
        requiredId(id);
        const record = await this.repository.get('appointment_requests', id, { expand: OPS_EXPAND });
        const [events, claims] = await Promise.all([
            this.repository.list('appointment_events', {
                filter: `appointmentId="${escapeFilter(id)}"`, sort: 'created',
            }),
            this.repository.list('schedule_claims', {
                filter: `appointmentId="${escapeFilter(id)}"`, sort: 'ownerType,cellStartAt',
            }),
        ]);
        return { ...teacherAppointment(record), events, claims };
    }

    async listPolicies(query = {}) {
        const page = pagination(query);
        const result = await this.repository.page('booking_policies', page.page, page.perPage, {
            filter: query.status ? `status="${escapeFilter(query.status)}"` : '', sort: '-version',
        });
        return mapPage(result, policyProjection);
    }

    async listOfferings(query = {}) {
        const page = pagination(query);
        const filters = [];
        relationFilter(filters, 'teacherId', query.teacherId);
        relationFilter(filters, 'courseSpecId', query.courseSpecId);
        if (query.status) filters.push(`status="${escapeFilter(query.status)}"`);
        const result = await this.repository.page('teacher_course_offerings', page.page, page.perPage, {
            filter: filters.join(' && '), sort: 'courseSpecId,teacherId',
            expand: 'teacherId,courseSpecId,creditTypeId,policyId',
        });
        return mapPage(result, offeringProjection);
    }

    async listAvailability(query = {}) {
        const filters = [];
        relationFilter(filters, 'teacherId', query.teacherId);
        relationFilter(filters, 'offeringId', query.offeringId);
        if (query.status) filters.push(`status="${escapeFilter(query.status)}"`);
        const [rules, overrides] = await Promise.all([
            this.repository.list('teacher_availability_rules', {
                filter: filters.join(' && '), sort: 'teacherId,weekday,startMinute',
            }),
            this.repository.list('teacher_availability_overrides', {
                filter: filters.join(' && '), sort: 'teacherId,startAt',
            }),
        ]);
        return { rules, overrides };
    }

    async listConflicts(query = {}) {
        const page = pagination(query);
        const filters = [];
        if (query.status) filters.push(`status="${escapeFilter(query.status)}"`);
        relationFilter(filters, 'teacherId', query.teacherId);
        const result = await this.repository.page('booking_conflicts', page.page, page.perPage, {
            filter: filters.join(' && '), sort: '-startAt', expand: 'teacherId,studentId,sessionId,appointmentId',
        });
        return mapPage(result, (record) => ({ ...record }));
    }
}

function policyProjection(record) {
    return {
        id: record.id, code: record.code, name: record.name, timezone: record.timezone,
        defaultWindows: record.defaultWindows, slotStepMinutes: Number(record.slotStepMinutes),
        claimGranularityMinutes: Number(record.claimGranularityMinutes || 15),
        minLeadMinutes: Number(record.minLeadMinutes), maxAdvanceDays: Number(record.maxAdvanceDays),
        responseTtlMinutes: Number(record.responseTtlMinutes), responseCutoffMinutes: Number(record.responseCutoffMinutes),
        cancellationCutoffMinutes: Number(record.cancellationCutoffMinutes), version: Number(record.version),
        effectiveFrom: record.effectiveFrom, effectiveTo: record.effectiveTo || null, status: record.status,
    };
}

function offeringProjection(record) {
    const projected = teacherAppointment({
        ...record,
        id: `offering:${record.id}`,
        status: record.status,
        requestedStartAt: '', requestedEndAt: '', responseDeadline: '',
    });
    return {
        id: record.id,
        teacher: projected.teacher,
        course: projected.course,
        creditTypeId: relationId(record.creditTypeId),
        policyId: relationId(record.policyId),
        location: record.location || '', availabilityMode: record.availabilityMode,
        status: record.status, version: Number(record.version || 1),
    };
}

function teacherReference(record) {
    return {
        id: record.id,
        name: record.realName || record.realname || record.nickName || record.nickname || '授课教师',
        cellphone: record.cellphone || '',
        avatar: record.avatarUrl || record.avatar || '',
    };
}

function courseReference(record) {
    return {
        id: record.id,
        code: record.code || '',
        name: record.name || '课程',
        durationMinutes: Number(record.durationMinutes || 0),
        defaultCreditTypeId: relationId(record.defaultCreditTypeId),
    };
}

function creditTypeReference(record) {
    return {
        id: record.id,
        code: record.code || '',
        name: record.name || '课时类型',
        courseSpecId: relationId(record.courseSpecId),
        unitLabel: record.unitLabel || '课时',
    };
}

function statusFilter(filters, value) {
    if (!value) return;
    const statuses = String(value).split(',').filter(Boolean);
    invariant(statuses.length <= 10, 'BOOKING_STATUS_FILTER_INVALID', '预约状态筛选无效');
    filters.push(statuses.length === 1
        ? `status="${escapeFilter(statuses[0])}"`
        : `(${statuses.map((status) => `status="${escapeFilter(status)}"`).join(' || ')})`);
}

function relationFilter(filters, field, value) {
    if (value) filters.push(`${field}="${escapeFilter(value)}"`);
}

function relationId(value) {
    return typeof value === 'string' ? value : value?.id || '';
}

function requiredId(value) {
    invariant(typeof value === 'string' && value, 'APPOINTMENT_ID_REQUIRED', '预约编号不能为空');
}

module.exports = {
    BookingOpsQueryService,
    courseReference,
    creditTypeReference,
    offeringProjection,
    policyProjection,
    relationFilter,
    statusFilter,
    teacherReference,
};
