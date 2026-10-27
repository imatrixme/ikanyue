const {
    createOperationNo,
    createRecordId,
    invariant,
    scopedIdempotencyKey,
} = require('./domain');
const { CourseCreditMigrationInventoryService } = require('./migrationInventoryService');
const { previewMigrationPlan } = require('./migrationPlan');
const { operationAudit } = require('./operationAudit');
const { fingerprintRequest, normalizeOperation } = require('./repositories/operationRepository');
const { balanceSnapshot } = require('./grantService');
const { create, escapeFilter } = require('./teachingCommand');

const ATTENDANCE_RULES = Object.freeze({
    version: 1, present: 'consume', late: 'consume', leave: 'release', absent: 'consume', cancelled: 'release',
});
const SETTLEMENT_RULES = Object.freeze({ version: 1, cancelled: 'release' });
const TEACHER_RULES = Object.freeze({ version: 1, source: 'historical_import_no_credit' });

class CourseCreditMigrationService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
        this.inventoryService = options.inventoryService || new CourseCreditMigrationInventoryService(repository);
    }

    inventory() {
        return this.inventoryService.inventory();
    }

    async preview(input = {}) {
        const inventory = await this.inventory();
        const preview = previewMigrationPlan(inventory, input.plan || input);
        return {
            ...preview,
            previewHash: fingerprintRequest({ inventory: inventorySignature(inventory), plan: preview.plan }),
        };
    }

    async apply(input = {}) {
        validateApplyInput(input);
        const preview = await this.preview({ plan: input.plan });
        invariant(preview.previewHash === input.previewHash,
            'MIGRATION_PREVIEW_STALE', '迁移预览已变化，请重新预览后再提交');
        invariant(preview.ready, 'MIGRATION_UNEXPLAINED_DIFFERENCE', '迁移仍有未解释差异', preview.report);
        const scopedKey = scopedIdempotencyKey('applyCourseCreditMigration', input.idempotencyKey);
        const requestHash = fingerprintRequest({ plan: preview.plan, previewHash: preview.previewHash });
        const replay = await resolveReplay(this.repository, scopedKey, requestHash);
        if (replay) return replay;
        await validateReferences(this.repository, preview.plan);

        const at = new Date(this.clock()).toISOString();
        const rootOperationId = this.idFactory();
        const result = migrationResult(rootOperationId, preview);
        const context = { at, input, requestHash, result, rootOperationId, scopedKey };
        const plan = [rootOperation(context, preview.report)];
        for (const mapping of preview.plan.studentHours) plan.push(...studentMigration(this, context, mapping));
        for (const mapping of preview.plan.teacherHours) plan.push(...teacherMigration(this, context, mapping));
        for (const mapping of preview.plan.programs) plan.push(programMigration(this, context, mapping));
        for (const mapping of preview.plan.sessions) plan.push(...sessionMigration(this, context, mapping));
        plan.push(create('outbox_events', {
            id: this.idFactory(),
            topic: 'course-credit.migration-completed',
            aggregateType: 'migration_run',
            aggregateId: rootOperationId,
            payload: result,
            status: 'pending',
            attempts: 0,
        }));
        try {
            await this.repository.send(plan);
        } catch (error) {
            const racedReplay = await resolveReplay(this.repository, scopedKey, requestHash);
            if (racedReplay) return racedReplay;
            error.code = error.code || 'COURSE_CREDIT_BATCH_FAILED';
            throw error;
        }
        return { ...result, replayed: false };
    }
}

function studentMigration(service, context, mapping) {
    const operationId = service.idFactory();
    const result = { batchCount: mapping.allocations.length, studentId: mapping.studentId };
    const requests = [migrationOperation(context, {
        operationId, result, sourceId: mapping.studentId, sourceType: 'legacy_student_hours',
        studentId: mapping.studentId,
    })];
    for (const allocation of mapping.allocations) {
        const active = allocation.activationMode === 'GRANT_TIME';
        const batchId = service.idFactory();
        const effectiveExpiresAt = expiryAt(context.at, allocation, active);
        const batch = {
            id: batchId,
            studentId: mapping.studentId,
            creditTypeId: allocation.creditTypeId,
            sourceOperationId: operationId,
            originalQuantity: allocation.quantity,
            availableQuantity: allocation.quantity,
            frozenQuantity: 0,
            consumedQuantity: 0,
            expiredQuantity: 0,
            reversedQuantity: 0,
            status: active ? 'active' : 'unactivated',
            validFrom: context.at,
            originalExpiresAt: effectiveExpiresAt,
            effectiveExpiresAt,
            activationMode: allocation.activationMode,
            expiryPolicy: allocation.expiryPolicy,
            activationDeadline: active ? '' : addDays(context.at, allocation.activationDeadlineDays),
            activatedAt: active ? context.at : '',
            validityDurationDays: allocation.validityDurationDays || 0,
            grantSnapshot: { ...allocation, sourceType: 'legacy_student_hours' },
            listUnitValue: 0,
            paidUnitCost: 0,
            currency: 'CNY',
            priority: 0,
            version: 1,
        };
        requests.push(create('credit_batches', batch), create('credit_events', {
            id: service.idFactory(), operationId, batchId, studentId: mapping.studentId,
            creditTypeId: allocation.creditTypeId, eventType: 'ADJUST', quantityDelta: allocation.quantity,
            bucketFrom: '', bucketTo: 'availableQuantity', balanceSnapshot: balanceSnapshot(batch),
            businessTime: context.at, actorId: context.input.actorId,
            reason: allocation.reason, metadata: { sourceType: 'legacy_student_hours' },
        }));
    }
    return requests;
}

function teacherMigration(service, context, mapping) {
    const operationId = service.idFactory();
    const result = { quantity: mapping.quantity, teacherId: mapping.teacherId };
    return [
        migrationOperation(context, {
            operationId, result, sourceId: mapping.teacherId, sourceType: 'legacy_teacher_hours',
        }),
        create('teacher_credit_events', {
            id: service.idFactory(), sessionTeacherId: '', teacherId: mapping.teacherId, ruleId: '',
            eventType: 'adjust', quantityDelta: mapping.quantity, status: 'confirmed', operationId,
            confirmationOfEventId: '', reversalOfEventId: '', reason: mapping.reason,
        }),
    ];
}

function programMigration(service, context, mapping) {
    const operationId = service.idFactory();
    return migrationOperation(context, {
        operationId,
        result: { targetId: mapping.targetId, targetType: mapping.targetType },
        sourceId: mapping.legacyProgramId,
        sourceType: 'legacy_learning_program',
    });
}

function sessionMigration(service, context, mapping) {
    const operationId = service.idFactory();
    const sessionId = service.idFactory();
    const result = {
        attendeeCount: mapping.attendees.length,
        sessionId,
        teacherCount: mapping.teachers.length,
    };
    const requests = [
        migrationOperation(context, {
            operationId, result, sourceId: mapping.legacySessionId, sourceType: 'legacy_session',
        }),
        create('sessions', {
            id: sessionId,
            code: migrationSessionCode(mapping),
            title: mapping.title,
            status: 'completed',
            startAt: mapping.startAt,
            endAt: mapping.endAt,
            location: mapping.location,
            requiredCreditTypeId: mapping.requiredCreditTypeId,
            requiredQuantity: mapping.requiredQuantity,
            attendanceRuleSnapshot: ATTENDANCE_RULES,
            settlementRuleSnapshot: SETTLEMENT_RULES,
            teacherRuleSnapshot: TEACHER_RULES,
            rosterVersion: 1,
            version: 1,
            settlementOperationId: '',
            correctionBaseStatus: '',
            originType: 'migration',
        }),
    ];
    for (const attendee of mapping.attendees) requests.push(create('session_students', {
        id: service.idFactory(), sessionId, studentId: attendee.studentId, sourceClassIds: [],
        attendanceStatus: attendee.attendanceStatus, creditStatus: 'not_charged',
        eligibilityReason: 'historical_import_no_charge',
        checkedInAt: ['present', 'late'].includes(attendee.attendanceStatus) ? mapping.startAt : '',
        settledAt: '', version: 1,
    }));
    for (const teacher of mapping.teachers) requests.push(create('session_teachers', {
        id: service.idFactory(), sessionId, teacherId: teacher.teacherId, role: teacher.role,
        assignmentSource: 'session_override', actualStatus: teacher.actualStatus, creditStatus: 'not_eligible',
    }));
    return requests;
}

function rootOperation(context, report) {
    return create('credit_operations', {
        id: context.rootOperationId,
        operationNo: createOperationNo('migration', context.at, context.rootOperationId),
        studentId: '',
        type: 'adjust',
        status: 'committed',
        idempotencyKey: context.scopedKey,
        sourceType: 'legacy_migration_run',
        sourceId: context.result.previewHash,
        requestSnapshot: { requestHash: context.requestHash, previewHash: context.result.previewHash },
        resultSnapshot: context.result,
        actorId: context.input.actorId,
        actorRole: context.input.actorRole || 'admin',
        traceId: context.input.traceId || '',
        ...operationAudit({ reason: 'legacy_migration_run', beforeSummary: report.source, afterSummary: context.result }),
    });
}

function migrationOperation(context, input) {
    return create('credit_operations', {
        id: input.operationId,
        operationNo: createOperationNo('adjust', context.at, input.operationId),
        studentId: input.studentId || '',
        type: 'adjust',
        status: 'committed',
        idempotencyKey: `${context.scopedKey}:${input.sourceType}:${input.sourceId}`,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        requestSnapshot: { migrationRunId: context.rootOperationId, requestHash: context.requestHash },
        resultSnapshot: input.result,
        actorId: context.input.actorId,
        actorRole: context.input.actorRole || 'admin',
        traceId: context.input.traceId || '',
        ...operationAudit({ reason: 'legacy_migration', beforeSummary: { sourceId: input.sourceId }, afterSummary: input.result }),
    });
}

async function validateReferences(repository, plan) {
    const students = new Set([
        ...plan.studentHours.map((item) => item.studentId),
        ...plan.sessions.flatMap((item) => item.attendees.map((entry) => entry.studentId)),
    ]);
    const teachers = new Set([
        ...plan.teacherHours.map((item) => item.teacherId),
        ...plan.sessions.flatMap((item) => item.teachers.map((entry) => entry.teacherId)),
    ]);
    const creditTypeIds = new Set([
        ...plan.studentHours.flatMap((item) => item.allocations.map((entry) => entry.creditTypeId)),
        ...plan.sessions.map((item) => item.requiredCreditTypeId),
    ]);
    await Promise.all([...students].map((id) => repository.get('students', id)));
    await Promise.all([...teachers].map((id) => repository.get('teachers', id)));
    const creditTypes = await Promise.all([...creditTypeIds].map((id) => repository.get('credit_types', id)));
    for (const creditType of creditTypes) invariant(
        creditType.kind === 'course' && creditType.consumable === true,
        'MIGRATION_CREDIT_TYPE_INVALID', '历史课时只能映射到可消费的特定课程点'
    );
    await Promise.all(plan.programs.map((item) => repository.get(
        item.targetType === 'package' ? 'packages' : 'classes', item.targetId
    )));
}

function validateApplyInput(input) {
    invariant(typeof input.previewHash === 'string' && input.previewHash,
        'MIGRATION_PREVIEW_HASH_REQUIRED', '提交迁移前必须提供预览哈希');
    invariant(typeof input.idempotencyKey === 'string' && input.idempotencyKey.trim(),
        'IDEMPOTENCY_KEY_REQUIRED', '提交迁移必须提供幂等键');
    invariant(typeof input.actorId === 'string' && input.actorId,
        'ACTOR_ID_REQUIRED', '提交迁移必须识别操作人');
}

async function resolveReplay(repository, scopedKey, requestHash) {
    const existing = normalizeOperation(await repository.findFirst(
        'credit_operations', `idempotencyKey="${escapeFilter(scopedKey)}"`
    ));
    if (!existing) return null;
    invariant(existing.requestHash === requestHash,
        'IDEMPOTENCY_CONFLICT', '幂等键对应了不同迁移计划');
    return { ...existing.resultSnapshot, replayed: true };
}

function migrationResult(operationId, preview) {
    return {
        counts: {
            programs: preview.plan.programs.length,
            sessions: preview.plan.sessions.length,
            studentMappings: preview.plan.studentHours.length,
            teacherAdjustments: preview.plan.teacherHours.length,
        },
        differenceCount: preview.report.differences.length,
        operationId,
        previewHash: preview.previewHash,
        unexplainedCount: Object.values(preview.report.unmapped).reduce((total, items) => total + items.length, 0),
    };
}

function inventorySignature(inventory) {
    return {
        availability: inventory.availability,
        attendanceIds: inventory.attendance.map((item) => item.id),
        programIds: inventory.programs.map((item) => item.id),
        sessionIds: inventory.sessions.map((item) => item.id),
        studentHours: inventory.studentHours.map((item) => ({ id: item.id, hours: item.hours })),
        targets: Object.fromEntries(Object.entries(inventory.targets || {}).map(([name, items]) => [
            name, items.map((item) => ({ id: item.id, status: item.status })),
        ])),
        teacherHours: inventory.teacherHours.map((item) => ({ id: item.id, hours: item.hours })),
        totals: inventory.totals,
    };
}

function expiryAt(at, allocation, active) {
    if (allocation.expiryPolicy === 'TERM_END') return new Date(allocation.termEnd).toISOString();
    if (allocation.expiryPolicy === 'FIXED_DURATION' && active) {
        return addDays(at, allocation.validityDurationDays);
    }
    return '';
}

function addDays(value, days) {
    return new Date(Date.parse(value) + Number(days || 0) * 86_400_000).toISOString();
}

function migrationSessionCode(mapping) {
    const fallback = `MIG-${mapping.legacySessionId}`.replace(/[^A-Za-z0-9_-]/g, '-');
    return String(mapping.code || fallback).slice(0, 120);
}

module.exports = {
    ATTENDANCE_RULES,
    CourseCreditMigrationService,
    SETTLEMENT_RULES,
    TEACHER_RULES,
    addDays,
    expiryAt,
    inventorySignature,
    migrationResult,
    migrationSessionCode,
    resolveReplay,
    validateApplyInput,
    validateReferences,
};
