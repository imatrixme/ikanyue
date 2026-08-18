const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseCreditMigrationService,
    addDays,
    expiryAt,
    inventorySignature,
    migrationResult,
    migrationSessionCode,
    validateApplyInput,
    validateReferences,
} = require('../src/services/courseCredits/migrationService');

const NOW = '2026-08-18T00:00:00.000Z';

test('approved zero-difference migration commits batches, adjustments, classification, and no-charge history atomically', async () => {
    const repository = mockRepository();
    const service = createService(repository);
    const preview = await service.preview({ plan: fullPlan() });
    const result = await service.apply(command(preview.previewHash));
    const requests = repository.plans[0];

    assert.equal(result.replayed, false);
    assert.equal(result.differenceCount, 0);
    assert.equal(result.unexplainedCount, 0);
    assert.deepEqual(result.counts, {
        programs: 1, sessions: 1, studentMappings: 1, teacherAdjustments: 1,
    });
    assert.equal(repository.plans.length, 1);
    assert.equal(requests[0].collection, 'credit_operations');
    assert.equal(requests[0].data.sourceType, 'legacy_migration_run');
    const batch = created(requests, 'credit_batches')[0];
    assert.equal(batch.originalQuantity, 4);
    assert.equal(batch.availableQuantity, 4);
    assert.equal(batch.expiryPolicy, 'FIXED_DURATION');
    assert.equal(batch.effectiveExpiresAt, '2027-02-14T00:00:00.000Z');
    const event = created(requests, 'credit_events')[0];
    assert.equal(event.eventType, 'ADJUST');
    assert.equal(event.quantityDelta, 4);
    const teacherEvent = created(requests, 'teacher_credit_events')[0];
    assert.equal(teacherEvent.eventType, 'adjust');
    assert.equal(teacherEvent.sessionTeacherId, '');
    assert.equal(teacherEvent.status, 'confirmed');
    const session = created(requests, 'sessions')[0];
    assert.equal(session.originType, 'migration');
    assert.equal(session.status, 'completed');
    const sessionStudent = created(requests, 'session_students')[0];
    assert.equal(sessionStudent.creditStatus, 'not_charged');
    assert.equal(sessionStudent.eligibilityReason, 'historical_import_no_charge');
    assert.equal(created(requests, 'session_credit_allocations').length, 0);
    assert.equal(created(requests, 'outbox_events')[0].topic, 'course-credit.migration-completed');
});

test('migration apply replays the committed root operation without writing again', async () => {
    const repository = mockRepository({ storeRoot: true });
    const service = createService(repository);
    const preview = await service.preview({ plan: fullPlan() });
    const first = await service.apply(command(preview.previewHash));
    const second = await service.apply(command(preview.previewHash));

    assert.equal(first.replayed, false);
    assert.equal(second.replayed, true);
    assert.equal(second.operationId, first.operationId);
    assert.equal(repository.plans.length, 1);
});

test('migration rejects stale previews, unexplained differences, and invalid references before writing', async () => {
    const repository = mockRepository();
    const service = createService(repository);
    await assert.rejects(service.apply(command('stale')), hasCode('MIGRATION_PREVIEW_STALE'));

    const incomplete = { ...fullPlan(), teacherHours: [] };
    const preview = await service.preview({ plan: incomplete });
    await assert.rejects(service.apply({ ...command(preview.previewHash), plan: incomplete }),
        hasCode('MIGRATION_UNEXPLAINED_DIFFERENCE'));

    const invalidCredit = mockRepository({ creditType: { id: 'credit', kind: 'universal', consumable: false } });
    const invalidService = createService(invalidCredit);
    const validPreview = await invalidService.preview({ plan: fullPlan() });
    await assert.rejects(invalidService.apply(command(validPreview.previewHash)),
        hasCode('MIGRATION_CREDIT_TYPE_INVALID'));
    assert.equal(repository.plans.length, 0);
    assert.equal(invalidCredit.plans.length, 0);
});

test('migration storage failures retain stable codes and can race into a replay', async () => {
    const failing = mockRepository({ sendError: new Error('storage') });
    const service = createService(failing);
    const preview = await service.preview({ plan: fullPlan() });
    await assert.rejects(service.apply(command(preview.previewHash)), hasCode('COURSE_CREDIT_BATCH_FAILED'));
});

test('empty production inventory produces a valid no-op migration receipt', async () => {
    const repository = mockRepository();
    const service = new CourseCreditMigrationService(repository, {
        clock: () => Date.parse(NOW),
        idFactory: idFactory(),
        inventoryService: { async inventory() { return emptyInventory(); } },
    });
    const preview = await service.preview({ plan: {} });
    assert.equal(preview.ready, true);
    const result = await service.apply({ ...command(preview.previewHash), plan: {} });
    assert.deepEqual(result.counts, {
        programs: 0, sessions: 0, studentMappings: 0, teacherAdjustments: 0,
    });
    assert.equal(created(repository.plans[0], 'credit_batches').length, 0);
});

test('migration helper contracts cover expiry, codes, signatures, validation, and missing references', async () => {
    assert.equal(addDays(NOW, 1), '2026-08-19T00:00:00.000Z');
    assert.equal(expiryAt(NOW, { expiryPolicy: 'TERM_END', termEnd: '2026-12-31T00:00:00Z' }, true),
        '2026-12-31T00:00:00.000Z');
    assert.equal(expiryAt(NOW, { expiryPolicy: 'NO_EXPIRY' }, true), '');
    assert.equal(migrationSessionCode({ legacySessionId: 'legacy id' }), 'MIG-legacy-id');
    assert.equal(migrationSessionCode({ legacySessionId: 'id', code: 'CUSTOM' }), 'CUSTOM');
    assert.equal(inventorySignature(inventory()).studentHours[0].hours, 4);
    assert.equal(migrationResult('operation', {
        previewHash: 'hash', report: { differences: [], unmapped: { a: [], b: ['x'] } },
        plan: { programs: [], sessions: [], studentHours: [], teacherHours: [] },
    }).unexplainedCount, 1);
    assert.throws(() => validateApplyInput({}), hasCode('MIGRATION_PREVIEW_HASH_REQUIRED'));
    assert.throws(() => validateApplyInput({ previewHash: 'hash' }), hasCode('IDEMPOTENCY_KEY_REQUIRED'));
    assert.throws(() => validateApplyInput({ previewHash: 'hash', idempotencyKey: 'key' }),
        hasCode('ACTOR_ID_REQUIRED'));
    await assert.rejects(validateReferences(mockRepository({ getError: new Error('missing') }), fullPlan()), /missing/);
});

function createService(repository) {
    return new CourseCreditMigrationService(repository, {
        clock: () => Date.parse(NOW),
        idFactory: idFactory(),
        inventoryService: { async inventory() { return inventory(); } },
    });
}

function command(previewHash) {
    return {
        actorId: 'admin', actorRole: 'admin', idempotencyKey: 'migration-key',
        plan: fullPlan(), previewHash, traceId: 'trace-migration',
    };
}

function mockRepository(options = {}) {
    const repository = {
        plans: [],
        root: null,
        async findFirst() { return this.root; },
        async get(collection, id) {
            if (options.getError) throw options.getError;
            if (collection === 'credit_types') return options.creditType || {
                id, kind: 'course', consumable: true, courseSpecId: 'course',
            };
            return { id };
        },
        async send(plan) {
            if (options.sendError) throw options.sendError;
            this.plans.push(plan);
            if (options.storeRoot) {
                const root = created(plan, 'credit_operations').find((item) => item.sourceType === 'legacy_migration_run');
                this.root = root;
            }
            return plan;
        },
    };
    return repository;
}

function created(plan, collection) {
    return plan.filter((item) => item.action === 'create' && item.collection === collection)
        .map((item) => item.data);
}

function idFactory() {
    let value = 0;
    return () => `id${String(++value).padStart(13, '0')}`;
}

function inventory() {
    return {
        availability: { students: true, teachers: true, programs: true, sessions: true, lessons: false, attendance: true },
        attendance: [{ id: 'attendance' }],
        programs: [{ id: 'program' }],
        sessions: [{ id: 'session' }],
        studentHours: [{ id: 'student', hours: 4 }],
        targets: { classes: [{ id: 'class', status: 'active' }], creditTypes: [{ id: 'credit', status: 'active' }], packages: [] },
        teacherHours: [{ id: 'teacher', hours: 2.5 }],
        totals: {
            attendance: 1, programs: 1, sessions: 1, studentHours: 4,
            students: 1, teacherHours: 2.5, teachers: 1,
        },
    };
}

function emptyInventory() {
    return {
        availability: { students: true, teachers: true, programs: false, sessions: false, lessons: false, attendance: false },
        attendance: [], programs: [], sessions: [], studentHours: [], teacherHours: [],
        targets: { classes: [], creditTypes: [], packages: [] },
        totals: {
            attendance: 0, programs: 0, sessions: 0, studentHours: 0,
            students: 0, teacherHours: 0, teachers: 0,
        },
    };
}

function fullPlan() {
    return {
        studentHours: [{
            studentId: 'student', allocations: [{
                creditTypeId: 'credit', quantity: 4, activationMode: 'GRANT_TIME',
                expiryPolicy: 'FIXED_DURATION', validityDurationDays: 180, reason: '人工核对旧课时',
            }],
        }],
        teacherHours: [{ teacherId: 'teacher', quantity: 2.5, reason: '人工核对教师旧课时' }],
        programs: [{
            legacyProgramId: 'program', targetType: 'class', targetId: 'class', reason: '教务人工确认分类',
        }],
        sessions: [{
            legacySessionId: 'session', title: '历史课堂',
            startAt: '2026-01-01T10:00:00Z', endAt: '2026-01-01T11:00:00Z',
            requiredCreditTypeId: 'credit', requiredQuantity: 1, reason: '历史课堂无扣点导入',
            attendanceRecordIds: ['attendance'],
            attendees: [{ studentId: 'student', attendanceStatus: 'present' }],
            teachers: [{ teacherId: 'teacher', role: 'lead', actualStatus: 'confirmed' }],
        }],
    };
}

function hasCode(code) {
    return (error) => error.code === code;
}
