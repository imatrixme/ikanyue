const { createRecordId, invariant } = require('../domain');
const {
    commitTeachingPlan,
    create,
    escapeFilter,
    outbox,
    positiveVersion,
    prepareTeachingCommand,
    teachingOperation,
    update,
    versionClaim,
} = require('../teachingCommand');
const { localParts } = require('./time');
const { normalizeBookingPolicy } = require('./policy');

class TeacherAvailabilityService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async saveWeekly(input = {}) {
        validateBaseInput(input);
        invariant(Array.isArray(input.rules), 'BOOKING_WEEKLY_RULES_REQUIRED', '每周可预约时间必须是数组');
        const command = await prepareTeachingCommand(this, 'saveTeacherAvailability', input, {
            effectiveFrom: input.effectiveFrom || '', offeringId: input.offeringId, rules: input.rules,
        });
        if (command.replay) return command.replay;
        const { offering, policy } = await this.context(input);
        const rules = normalizeWeeklyRules(input.rules, policy);
        const existing = await this.repository.list('teacher_availability_rules', {
            filter: `teacherId="${escapeFilter(input.teacherId)}" && offeringId="${escapeFilter(offering.id)}"`
                + ' && status="active"',
            sort: 'weekday,startMinute,id',
        });
        const result = {
            availabilityMode: rules.length ? 'custom' : 'default',
            offeringId: offering.id,
            operationId: command.operationId,
            ruleCount: rules.length,
        };
        const context = { ...command, input, result };
        const offeringVersion = positiveVersion(offering.version);
        const plan = [
            teachingOperation({
                ...context,
                sourceType: 'teacher_offering',
                sourceId: offering.id,
                type: 'configure_availability',
                requestSnapshot: { offeringId: offering.id, rules },
            }),
            ...existing.flatMap((rule) => deactivateRule(this, command, rule)),
            ...rules.map((rule) => create('teacher_availability_rules', {
                id: this.idFactory(),
                teacherId: input.teacherId,
                offeringId: offering.id,
                ...rule,
                effectiveFrom: input.effectiveFrom || command.at,
                effectiveTo: '',
                version: 1,
                status: 'active',
            })),
            versionClaim(this.idFactory, 'teacher_offering', offering.id, offeringVersion, command.operationId),
            update('teacher_course_offerings', offering.id, {
                availabilityMode: result.availabilityMode,
                version: offeringVersion + 1,
            }),
            outbox(this.idFactory, 'course-booking.availability-updated', 'teacher_offering', offering.id, result),
        ];
        return commitTeachingPlan(this, context, plan);
    }

    async createOverride(input = {}) {
        validateBaseInput(input);
        invariant(['available', 'unavailable'].includes(input.type),
            'BOOKING_OVERRIDE_TYPE_INVALID', '临时时间类型无效');
        const command = await prepareTeachingCommand(this, 'createAvailabilityOverride', input, {
            endAt: input.endAt, offeringId: input.offeringId, startAt: input.startAt, type: input.type,
        });
        if (command.replay) return command.replay;
        const { offering, policy } = await this.context(input);
        validateOverride(input, policy, command.at);
        const overrideId = this.idFactory();
        const result = { offeringId: offering.id, operationId: command.operationId, overrideId, status: 'active' };
        const context = { ...command, input, result };
        const plan = [
            teachingOperation({
                ...context,
                sourceType: 'availability_override',
                sourceId: overrideId,
                type: 'configure_availability',
                requestSnapshot: { endAt: input.endAt, offeringId: offering.id, startAt: input.startAt, type: input.type },
            }),
            create('teacher_availability_overrides', {
                id: overrideId,
                teacherId: input.teacherId,
                offeringId: offering.id,
                type: input.type,
                startAt: new Date(input.startAt).toISOString(),
                endAt: new Date(input.endAt).toISOString(),
                reason: normalizeText(input.reason),
                version: 1,
                status: 'active',
            }),
            outbox(this.idFactory, 'course-booking.availability-override-created',
                'availability_override', overrideId, result),
        ];
        return commitTeachingPlan(this, context, plan);
    }

    async cancelOverride(input = {}) {
        invariant(typeof input.overrideId === 'string' && input.overrideId,
            'BOOKING_OVERRIDE_ID_REQUIRED', '临时时间编号不能为空');
        invariant(typeof input.teacherId === 'string' && input.teacherId,
            'BOOKING_TEACHER_REQUIRED', '教师编号不能为空');
        const command = await prepareTeachingCommand(this, 'cancelAvailabilityOverride', input, {
            overrideId: input.overrideId,
        });
        if (command.replay) return command.replay;
        const record = await this.repository.get('teacher_availability_overrides', input.overrideId);
        invariant(relationId(record.teacherId) === input.teacherId,
            'BOOKING_OVERRIDE_FORBIDDEN', '不能修改其他教师的临时时间');
        invariant(record.status === 'active', 'BOOKING_OVERRIDE_NOT_ACTIVE', '临时时间已失效');
        const version = positiveVersion(record.version);
        const result = { operationId: command.operationId, overrideId: record.id, status: 'cancelled' };
        const context = { ...command, input, result };
        return commitTeachingPlan(this, context, [
            teachingOperation({
                ...context,
                sourceType: 'availability_override', sourceId: record.id,
                type: 'configure_availability', requestSnapshot: { overrideId: record.id },
            }),
            versionClaim(this.idFactory, 'availability_override', record.id, version, command.operationId),
            update('teacher_availability_overrides', record.id, { status: 'cancelled', version: version + 1 }),
            outbox(this.idFactory, 'course-booking.availability-override-cancelled',
                'availability_override', record.id, result),
        ]);
    }

    async saveWeeklyForOperator(input = {}) {
        const teacherId = await this.teacherIdForOffering(input.offeringId);
        return this.saveWeekly({ ...input, teacherId });
    }

    async createOverrideForOperator(input = {}) {
        const teacherId = await this.teacherIdForOffering(input.offeringId);
        return this.createOverride({ ...input, teacherId });
    }

    async cancelOverrideForOperator(input = {}) {
        invariant(typeof input.overrideId === 'string' && input.overrideId,
            'BOOKING_OVERRIDE_ID_REQUIRED', '临时时间编号不能为空');
        const record = await this.repository.get('teacher_availability_overrides', input.overrideId);
        return this.cancelOverride({ ...input, teacherId: relationId(record.teacherId) });
    }

    async teacherIdForOffering(offeringId) {
        invariant(typeof offeringId === 'string' && offeringId,
            'BOOKING_OFFERING_REQUIRED', '课程预约配置不能为空');
        const offering = await this.repository.get('teacher_course_offerings', offeringId);
        return relationId(offering.teacherId);
    }

    async context(input) {
        const offering = await this.repository.get('teacher_course_offerings', input.offeringId);
        invariant(relationId(offering.teacherId) === input.teacherId,
            'BOOKING_OFFERING_FORBIDDEN', '不能配置其他教师的课程');
        invariant(offering.status === 'active', 'BOOKING_OFFERING_INACTIVE', '课程预约尚未启用');
        const policy = normalizeBookingPolicy(await this.repository.get('booking_policies', relationId(offering.policyId)));
        return { offering, policy };
    }
}

function normalizeWeeklyRules(rules, policy) {
    const normalized = rules.map((rule) => ({
        weekday: integer(rule.weekday, 1, 7, 'BOOKING_WEEKDAY_INVALID'),
        startMinute: integer(rule.startMinute, 0, 1439, 'BOOKING_WINDOW_START_INVALID'),
        endMinute: integer(rule.endMinute, 1, 1440, 'BOOKING_WINDOW_END_INVALID'),
    })).sort((left, right) => left.weekday - right.weekday || left.startMinute - right.startMinute);
    normalized.forEach((rule, index) => {
        invariant(rule.endMinute > rule.startMinute,
            'BOOKING_WINDOW_RANGE_INVALID', '结束时间必须晚于开始时间');
        invariant(policy.defaultWindows.some((window) => rule.startMinute >= window.startMinute
            && rule.endMinute <= window.endMinute),
        'BOOKING_WINDOW_OUTSIDE_POLICY', '教师可预约时间不能超出机构开放时间');
        const previous = normalized[index - 1];
        invariant(!previous || previous.weekday !== rule.weekday || previous.endMinute <= rule.startMinute,
            'BOOKING_WINDOWS_OVERLAP', '同一天的可预约时间不能重叠');
    });
    return normalized;
}

function validateOverride(input, policy, now) {
    const start = Date.parse(input.startAt);
    const end = Date.parse(input.endAt);
    invariant(Number.isFinite(start) && Number.isFinite(end) && end > start && start > Date.parse(now),
        'BOOKING_OVERRIDE_TIME_INVALID', '临时时间必须是未来的有效时段');
    const startLocal = localParts(input.startAt);
    const endLocal = localParts(input.endAt);
    invariant(startLocal.date === endLocal.date,
        'BOOKING_OVERRIDE_DAY_INVALID', '临时时间必须在同一自然日内');
    if (input.type === 'available') {
        invariant(policy.defaultWindows.some((window) => startLocal.minute >= window.startMinute
            && endLocal.minute <= window.endMinute),
        'BOOKING_OVERRIDE_OUTSIDE_POLICY', '临时开放不能超出机构开放时间');
    }
}

function deactivateRule(service, command, rule) {
    const version = positiveVersion(rule.version);
    return [
        versionClaim(service.idFactory, 'availability_rule', rule.id, version, command.operationId),
        update('teacher_availability_rules', rule.id, {
            effectiveTo: command.at, status: 'inactive', version: version + 1,
        }),
    ];
}

function validateBaseInput(input) {
    invariant(typeof input.teacherId === 'string' && input.teacherId,
        'BOOKING_TEACHER_REQUIRED', '教师编号不能为空');
    invariant(typeof input.offeringId === 'string' && input.offeringId,
        'BOOKING_OFFERING_REQUIRED', '课程预约配置不能为空');
}

function integer(value, min, max, code) {
    const number = Number(value);
    invariant(Number.isInteger(number) && number >= min && number <= max, code, '时间配置无效');
    return number;
}

function relationId(value) {
    return typeof value === 'string' ? value : value?.id || '';
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim().slice(0, 500) : '';
}

module.exports = {
    TeacherAvailabilityService,
    deactivateRule,
    normalizeWeeklyRules,
    validateOverride,
};
