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
const { normalizeBookingPolicy } = require('./policy');

class BookingAdminService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async createPolicyRevision(input = {}) {
        validatePolicyInput(input);
        const command = await prepareTeachingCommand(this, 'configureBookingPolicy', input, {
            code: input.code, policy: policyPayload(input), status: input.status,
        });
        if (command.replay) return command.replay;
        const existing = await this.repository.list('booking_policies', {
            filter: `code="${escapeFilter(input.code.trim())}"`, sort: '-version',
        });
        const currentActive = existing.find((record) => record.status === 'active');
        const version = Math.max(0, ...existing.map((record) => Number(record.version || 0))) + 1;
        const policyId = this.idFactory();
        const data = {
            id: policyId,
            code: input.code.trim(),
            name: input.name.trim(),
            ...policyPayload(input),
            version,
            effectiveFrom: new Date(input.effectiveFrom).toISOString(),
            effectiveTo: input.effectiveTo ? new Date(input.effectiveTo).toISOString() : '',
            status: input.status,
        };
        const result = { operationId: command.operationId, policyId, status: input.status, version };
        const context = { ...command, input, result };
        const deactivate = input.status === 'active' && currentActive
            ? deactivatePolicy(currentActive, data.effectiveFrom)
            : [];
        return commitTeachingPlan(this, context, [
            teachingOperation({
                ...context,
                sourceType: 'booking_policy', sourceId: policyId, type: 'configure_booking',
                requestSnapshot: { code: data.code, status: data.status, version },
            }),
            ...deactivate,
            create('booking_policies', data),
            outbox(this.idFactory, 'course-booking.policy-revised', 'booking_policy', policyId, result),
        ]);
    }

    async saveOffering(input = {}) {
        validateOfferingInput(input);
        const command = await prepareTeachingCommand(this, 'configureBookingOffering', input, {
            courseSpecId: input.courseSpecId,
            offeringId: input.offeringId || '',
            status: input.status,
            teacherId: input.teacherId,
        });
        if (command.replay) return command.replay;
        const [teacher, course, creditType, policy, conflicts] = await Promise.all([
            this.repository.get('teachers', input.teacherId),
            this.repository.get('course_specs', input.courseSpecId),
            this.repository.get('credit_types', input.creditTypeId),
            this.repository.get('booking_policies', input.policyId),
            this.repository.list('booking_conflicts', {
                filter: `teacherId="${escapeFilter(input.teacherId)}" && status="open"`, sort: 'startAt',
            }),
        ]);
        validateOfferingRelations({ conflicts, course, creditType, policy, status: input.status, teacher });
        const current = input.offeringId
            ? await this.repository.get('teacher_course_offerings', input.offeringId)
            : null;
        if (current) {
            invariant(relationId(current.teacherId) === input.teacherId
                && relationId(current.courseSpecId) === input.courseSpecId,
            'BOOKING_OFFERING_IDENTITY_IMMUTABLE', '教师与课程不能在原配置上替换');
        }
        const offeringId = current?.id || this.idFactory();
        const version = current ? positiveVersion(current.version) + 1 : 1;
        const data = {
            teacherId: input.teacherId,
            courseSpecId: input.courseSpecId,
            creditTypeId: input.creditTypeId,
            policyId: input.policyId,
            location: normalizeText(input.location, 160),
            availabilityMode: current?.availabilityMode || 'default',
            version,
            status: input.status,
        };
        const result = { offeringId, operationId: command.operationId, status: input.status, version };
        const context = { ...command, input, result };
        const mutation = current
            ? [
                versionClaim(this.idFactory, 'teacher_offering', current.id,
                    positiveVersion(current.version), command.operationId),
                update('teacher_course_offerings', current.id, data),
            ]
            : [create('teacher_course_offerings', { id: offeringId, ...data })];
        return commitTeachingPlan(this, context, [
            teachingOperation({
                ...context,
                sourceType: 'teacher_offering', sourceId: offeringId, type: 'configure_booking',
                requestSnapshot: { courseSpecId: input.courseSpecId, status: input.status, teacherId: input.teacherId },
            }),
            ...mutation,
            outbox(this.idFactory, 'course-booking.offering-configured', 'teacher_offering', offeringId, result),
        ]);
    }

    async resolveConflict(input = {}) {
        invariant(typeof input.conflictId === 'string' && input.conflictId,
            'BOOKING_CONFLICT_ID_REQUIRED', '冲突编号不能为空');
        invariant(typeof input.resolution === 'string' && input.resolution.trim().length >= 4,
            'BOOKING_CONFLICT_RESOLUTION_REQUIRED', '请填写明确的处理结果');
        const command = await prepareTeachingCommand(this, 'resolveBookingConflict', input, {
            conflictId: input.conflictId, resolution: input.resolution,
        });
        if (command.replay) return command.replay;
        const conflict = await this.repository.get('booking_conflicts', input.conflictId);
        invariant(conflict.status === 'open', 'BOOKING_CONFLICT_NOT_OPEN', '冲突已被处理');
        const version = positiveVersion(conflict.version);
        const result = { conflictId: conflict.id, operationId: command.operationId, status: 'resolved' };
        const context = { ...command, input, result };
        return commitTeachingPlan(this, context, [
            teachingOperation({
                ...context,
                sourceType: 'booking_conflict', sourceId: conflict.id, type: 'resolve_booking_conflict',
                requestSnapshot: { conflictId: conflict.id, resolution: input.resolution.trim() },
            }),
            versionClaim(this.idFactory, 'booking_conflict', conflict.id, version, command.operationId),
            update('booking_conflicts', conflict.id, {
                resolution: input.resolution.trim().slice(0, 500),
                resolvedAt: command.at,
                status: 'resolved',
                version: version + 1,
            }),
            outbox(this.idFactory, 'course-booking.conflict-resolved', 'booking_conflict', conflict.id, result),
        ]);
    }
}

function policyPayload(input) {
    const normalized = normalizeBookingPolicy(input);
    return {
        timezone: normalized.timezone,
        defaultWindows: normalized.defaultWindows,
        slotStepMinutes: normalized.slotStepMinutes,
        claimGranularityMinutes: normalized.claimGranularityMinutes,
        minLeadMinutes: normalized.minLeadMinutes,
        maxAdvanceDays: normalized.maxAdvanceDays,
        responseTtlMinutes: normalized.responseTtlMinutes,
        responseCutoffMinutes: normalized.responseCutoffMinutes,
        cancellationCutoffMinutes: normalized.cancellationCutoffMinutes,
    };
}

function validatePolicyInput(input) {
    invariant(typeof input.code === 'string' && input.code.trim(), 'BOOKING_POLICY_CODE_REQUIRED', '策略编码不能为空');
    invariant(typeof input.name === 'string' && input.name.trim(), 'BOOKING_POLICY_NAME_REQUIRED', '策略名称不能为空');
    invariant(['draft', 'active', 'inactive'].includes(input.status),
        'BOOKING_POLICY_STATUS_INVALID', '策略状态无效');
    invariant(Number.isFinite(Date.parse(input.effectiveFrom)),
        'BOOKING_POLICY_EFFECTIVE_FROM_INVALID', '策略生效时间无效');
    invariant(!input.effectiveTo || Date.parse(input.effectiveTo) > Date.parse(input.effectiveFrom),
        'BOOKING_POLICY_EFFECTIVE_TO_INVALID', '策略失效时间必须晚于生效时间');
    policyPayload(input);
}

function validateOfferingInput(input) {
    for (const field of ['teacherId', 'courseSpecId', 'creditTypeId', 'policyId']) {
        invariant(typeof input[field] === 'string' && input[field],
            'BOOKING_OFFERING_FIELD_REQUIRED', `缺少 ${field}`);
    }
    invariant(['draft', 'active', 'inactive'].includes(input.status),
        'BOOKING_OFFERING_STATUS_INVALID', '课程预约状态无效');
}

function validateOfferingRelations(input) {
    invariant(truthy(input.teacher?.verified) && !truthy(input.teacher?.blocked),
        'BOOKING_TEACHER_UNAVAILABLE', '教师账号未通过审核或已停用');
    invariant(input.course?.status === 'active' && input.course.deliveryMode === 'one_to_one',
        'BOOKING_COURSE_NOT_ONE_TO_ONE', '只有启用中的一对一课程可以开放预约');
    invariant(input.creditType?.kind === 'course' && input.creditType.consumable === true
        && relationId(input.creditType.courseSpecId) === input.course.id,
    'BOOKING_CREDIT_TYPE_INVALID', '预约必须绑定该课程的精确课时');
    invariant(input.policy?.status === 'active' || input.status !== 'active',
        'BOOKING_POLICY_NOT_ACTIVE', '启用预约前必须选择生效策略');
    invariant(input.status !== 'active' || input.conflicts.length === 0,
        'BOOKING_CONFLICTS_UNRESOLVED', '该教师仍有未处理的排课冲突');
}

function deactivatePolicy(policy, effectiveTo) {
    return [update('booking_policies', policy.id, { effectiveTo, status: 'inactive' })];
}

function relationId(value) {
    return typeof value === 'string' ? value : value?.id || '';
}

function normalizeText(value, max) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function truthy(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
}

module.exports = {
    BookingAdminService,
    deactivatePolicy,
    policyPayload,
    validateOfferingInput,
    validateOfferingRelations,
    validatePolicyInput,
};
