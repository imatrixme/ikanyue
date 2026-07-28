const test = require('node:test');
const assert = require('node:assert/strict');

const {
    BookingAdminService,
    policyPayload,
    validateOfferingInput,
    validateOfferingRelations,
    validatePolicyInput,
} = require('../src/services/courseCredits/booking/adminService');

test('policy revision deactivates the previous active policy and persists the next version atomically', async () => {
    const repository = repositoryMock({
        lists: {
            booking_policies: [policy({ id: 'old-policy', status: 'active', version: 2 })],
        },
    });
    const result = await service(repository).createPolicyRevision(policyCommand());

    assert.equal(result.version, 3);
    assert.equal(result.status, 'active');
    assert.equal(repository.plan.find((item) => item.collection === 'booking_policies'
        && item.action === 'update').data.status, 'inactive');
    const created = repository.plan.find((item) => item.collection === 'booking_policies'
        && item.action === 'create');
    assert.equal(created.data.version, 3);
    assert.deepEqual(created.data.defaultWindows, [
        { startMinute: 540, endMinute: 660 },
        { startMinute: 840, endMinute: 1140 },
    ]);
});

test('offering creation binds a verified teacher to an exact one-to-one course credit', async () => {
    const repository = repositoryMock({ records: relations() });
    const result = await service(repository).saveOffering(offeringCommand());

    assert.equal(result.status, 'active');
    const created = repository.plan.find((item) => item.collection === 'teacher_course_offerings');
    assert.equal(created.action, 'create');
    assert.equal(created.data.teacherId, 'teacher');
    assert.equal(created.data.courseSpecId, 'course');
    assert.equal(created.data.creditTypeId, 'credit');
});

test('offering update uses a version claim and keeps teacher-course identity immutable', async () => {
    const repository = repositoryMock({
        records: {
            ...relations(),
            teacher_course_offerings: {
                id: 'offering', teacherId: 'teacher', courseSpecId: 'course',
                availabilityMode: 'custom', version: 4,
            },
        },
    });
    const result = await service(repository).saveOffering(offeringCommand({
        offeringId: 'offering', status: 'inactive', location: '二号教室',
    }));

    assert.equal(result.version, 5);
    const claim = repository.plan.find((item) => item.collection === 'credit_version_claims');
    const update = repository.plan.find((item) => item.collection === 'teacher_course_offerings');
    assert.equal(claim.data.expectedVersion, 4);
    assert.equal(update.data.availabilityMode, 'custom');
    assert.equal(update.data.version, 5);

    repository.records.teacher_course_offerings.courseSpecId = 'other-course';
    await assert.rejects(service(repository).saveOffering(offeringCommand({ offeringId: 'offering' })),
        hasCode('BOOKING_OFFERING_IDENTITY_IMMUTABLE'));
});

test('conflict resolution is version guarded and active offerings reject unsafe relations', async () => {
    const repository = repositoryMock({
        records: {
            ...relations(),
            booking_conflicts: { id: 'conflict', status: 'open', version: 3 },
        },
    });
    const result = await service(repository).resolveConflict({
        actorId: 'admin', actorRole: 'admin', conflictId: 'conflict',
        idempotencyKey: 'resolve-key', resolution: '已调整历史课程时间',
    });
    assert.equal(result.status, 'resolved');
    const update = repository.plan.find((item) => item.collection === 'booking_conflicts');
    assert.equal(update.data.version, 4);

    assert.throws(() => validateOfferingRelations({
        ...relationInput(), conflicts: [{ id: 'open' }], status: 'active',
    }), hasCode('BOOKING_CONFLICTS_UNRESOLVED'));
    assert.throws(() => validateOfferingRelations({
        ...relationInput(), course: { ...relations().course_specs, deliveryMode: 'group' }, status: 'active',
    }), hasCode('BOOKING_COURSE_NOT_ONE_TO_ONE'));
});

test('booking policy normalization rejects mutable claim granularity and invalid effective periods', async () => {
    assert.throws(() => policyPayload({ claimGranularityMinutes: 30 }),
        hasCode('BOOKING_CLAIM_GRANULARITY_IMMUTABLE'));
    await assert.rejects(service(repositoryMock()).createPolicyRevision(policyCommand({
        effectiveTo: '2026-08-01T00:00:00.000Z',
    })), hasCode('BOOKING_POLICY_EFFECTIVE_TO_INVALID'));
});

test('Admin booking validation rejects incomplete policies, offerings, and unsafe activation', async () => {
    assert.throws(() => validatePolicyInput({}), hasCode('BOOKING_POLICY_CODE_REQUIRED'));
    assert.throws(() => validatePolicyInput({ code: 'code' }), hasCode('BOOKING_POLICY_NAME_REQUIRED'));
    assert.throws(() => validatePolicyInput({ code: 'code', name: 'name', status: 'unknown' }),
        hasCode('BOOKING_POLICY_STATUS_INVALID'));
    assert.throws(() => validatePolicyInput({
        code: 'code', name: 'name', status: 'draft', effectiveFrom: 'invalid',
    }), hasCode('BOOKING_POLICY_EFFECTIVE_FROM_INVALID'));
    assert.throws(() => validateOfferingInput({}), hasCode('BOOKING_OFFERING_FIELD_REQUIRED'));
    assert.throws(() => validateOfferingInput({
        teacherId: 'teacher', courseSpecId: 'course', creditTypeId: 'credit', policyId: 'policy', status: 'unknown',
    }), hasCode('BOOKING_OFFERING_STATUS_INVALID'));

    const base = relationInput();
    assert.throws(() => validateOfferingRelations({
        ...base, teacher: { ...base.teacher, verified: false }, status: 'active',
    }), hasCode('BOOKING_TEACHER_UNAVAILABLE'));
    assert.throws(() => validateOfferingRelations({
        ...base, creditType: { ...base.creditType, consumable: false }, status: 'active',
    }), hasCode('BOOKING_CREDIT_TYPE_INVALID'));
    assert.throws(() => validateOfferingRelations({
        ...base, policy: { ...base.policy, status: 'draft' }, status: 'active',
    }), hasCode('BOOKING_POLICY_NOT_ACTIVE'));
    assert.doesNotThrow(() => validateOfferingRelations({
        ...base, policy: { ...base.policy, status: 'draft' }, status: 'draft',
    }));

    const noActive = repositoryMock({ lists: { booking_policies: [policy({ status: 'draft', version: 3 })] } });
    const created = await service(noActive).createPolicyRevision(policyCommand({
        idempotencyKey: 'draft-policy', status: 'draft', effectiveTo: '2026-09-01T00:00:00.000Z',
    }));
    assert.equal(created.version, 4);
    assert.equal(noActive.plan.some((item) => item.collection === 'booking_policies'
        && item.action === 'update'), false);

    const closed = repositoryMock({ records: {
        ...relations(), booking_conflicts: { id: 'conflict', status: 'resolved', version: 2 },
    } });
    await assert.rejects(service(closed).resolveConflict({
        actorId: 'admin', idempotencyKey: 'closed-conflict', conflictId: 'conflict', resolution: '已经处理完成',
    }), hasCode('BOOKING_CONFLICT_NOT_OPEN'));
});

function service(repository) {
    return new BookingAdminService(repository, {
        clock: () => Date.parse('2026-08-01T00:00:00.000Z'), idFactory: ids(),
    });
}

function repositoryMock(options = {}) {
    const repository = {
        records: { ...(options.records || {}) },
        lists: { ...(options.lists || {}) },
        plan: null,
        async findFirst() { return null; },
        async get(collection) {
            const value = this.records[collection];
            if (!value) throw new Error(`Unexpected get ${collection}`);
            return value;
        },
        async list(collection) { return this.lists[collection] || []; },
        async send(plan) { this.plan = plan; },
    };
    return repository;
}

function relations() {
    return {
        teachers: { id: 'teacher', verified: true, blocked: false },
        course_specs: { id: 'course', status: 'active', deliveryMode: 'one_to_one' },
        credit_types: { id: 'credit', kind: 'course', consumable: true, courseSpecId: 'course' },
        booking_policies: policy(),
    };
}

function relationInput() {
    const values = relations();
    return {
        teacher: values.teachers,
        course: values.course_specs,
        creditType: values.credit_types,
        policy: values.booking_policies,
        conflicts: [],
    };
}

function policy(changes = {}) {
    return { id: 'policy', status: 'active', version: 1, ...changes };
}

function policyCommand(changes = {}) {
    return {
        actorId: 'admin', actorRole: 'admin', idempotencyKey: 'policy-key',
        code: 'default', name: '默认预约策略', status: 'active',
        effectiveFrom: '2026-08-02T00:00:00.000Z',
        ...changes,
    };
}

function offeringCommand(changes = {}) {
    return {
        actorId: 'admin', actorRole: 'admin', idempotencyKey: `offering-key-${changes.status || 'active'}`,
        teacherId: 'teacher', courseSpecId: 'course', creditTypeId: 'credit', policyId: 'policy',
        location: '一号教室', status: 'active', ...changes,
    };
}

function ids() {
    let value = 0;
    return () => `booking-admin-${++value}`;
}

function hasCode(code) {
    return (error) => error?.code === code;
}
