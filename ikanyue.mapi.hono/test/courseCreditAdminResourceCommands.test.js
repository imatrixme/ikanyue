const test = require('node:test');
const assert = require('node:assert/strict');

const {
    AdminResourceCommandService,
    validateLessonStatusTransition,
} = require('../src/services/courseCredits/adminResourceCommandService');
const {
    normalizeResourceInput,
    resourceSchema,
    validateStatus,
} = require('../src/services/courseCredits/adminResourceSchemas');

test('admin resource commands create every supported explicit resource with audit records', async () => {
    const repository = mockRepository();
    const service = createService(repository);
    const resources = [
        ['courseSpecs', courseSpec()],
        ['packages', packageData()],
        ['grantLines', grantLine()],
        ['priceVersions', priceVersion()],
        ['conversionRules', conversionRule()],
        ['classes', classData()],
        ['lessons', lessonData()],
    ];

    for (const [name, data] of resources) {
        const result = await service.createResource(name, command(data));
        assert.equal(result.resource, name);
    }

    assert.equal(repository.plans.length, resources.length);
    repository.plans.forEach((plan) => {
        assert.equal(plan.length, 2);
        assert.equal(plan[0].action, 'create');
        assert.equal(plan[1].collection, 'ops_audit_logs');
        assert.equal(plan[1].data.outcome, 'success');
    });
    assert.equal(repository.plans[2][0].data.status, undefined);
    assert.equal((await service.createResource('grantLines', command(grantLine()))).status, 'active');
});

test('resource updates are explicit, price changes create revisions, and lesson updates are version claimed', async () => {
    const repository = mockRepository({
        records: {
            course_specs: courseSpec({ id: 'course', name: '旧名称' }),
            price_versions: priceVersion({ id: 'price', version: 2 }),
            sessions: lessonData({ id: 'lesson', version: 4, rosterVersion: 2 }),
        },
    });
    const service = createService(repository);

    const course = await service.updateResource('courseSpecs', 'course', command({ name: '新名称' }));
    assert.equal(course.id, 'course');
    assert.equal(lastPlan(repository)[0].action, 'update');
    assert.equal(lastPlan(repository)[0].data.name, '新名称');

    const revision = await service.updateResource('priceVersions', 'price', command({ saleAmount: 800 }));
    assert.equal(revision.previousId, 'price');
    assert.equal(revision.version, 3);
    assert.equal(lastPlan(repository)[0].action, 'create');
    assert.equal(lastPlan(repository)[0].data.saleAmount, 800);

    const statusRevision = await service.setStatus('priceVersions', 'price', 'inactive', metadata());
    assert.equal(statusRevision.status, 'inactive');

    const lesson = await service.updateResource('lessons', 'lesson', command({ title: '新课堂' }));
    assert.equal(lesson.operationId, 'id-6');
    assert.ok(lastPlan(repository).some((item) => item.collection === 'credit_version_claims'));
    assert.deepEqual(lastPlan(repository).find((item) => item.collection === 'sessions').data.version, 5);

    const replayCurrent = lessonData({ id: 'lesson' });
    const replayData = normalizeResourceInput('lessons', { title: '新课堂' }, replayCurrent);
    const replayRepository = mockRepository({
        records: { sessions: replayCurrent },
        existingOperation: {
            requestSnapshot: { requestHash: require('../src/services/courseCredits/repositories/operationRepository')
                .fingerprintRequest({ id: 'lesson', data: replayData }) },
            resultSnapshot: { id: 'lesson', operationId: 'stored' },
        },
    });
    const replay = await createService(replayRepository).updateResource('lessons', 'lesson', command({ title: '新课堂' }));
    assert.equal(replay.replayed, true);
});

test('resource validation rejects unsupported fields, invalid statuses, and unsafe lesson edits', async () => {
    assert.throws(() => resourceSchema('unknown'), hasCode('ADMIN_RESOURCE_UNSUPPORTED'));
    assert.throws(() => normalizeResourceInput('courseSpecs', null), hasCode('ADMIN_RESOURCE_BODY_REQUIRED'));
    assert.throws(() => normalizeResourceInput('courseSpecs', { ...courseSpec(), secret: true }),
        hasCode('ADMIN_RESOURCE_FIELD_INVALID'));
    assert.throws(() => validateStatus('grantLines', 'active'), hasCode('ADMIN_RESOURCE_STATUS_INVALID'));
    await assert.rejects(createService(mockRepository()).updateResource('courseSpecs', '', command({ name: 'x' })),
        hasCode('ADMIN_RESOURCE_ID_REQUIRED'));

    const locked = mockRepository({ records: { sessions: lessonData({ id: 'lesson', status: 'settled' }) } });
    await assert.rejects(createService(locked).updateResource('lessons', 'lesson', command({ title: 'x' })),
        hasCode('LESSON_IMMUTABLE_AFTER_SETTLEMENT'));
    await assert.rejects(createService(mockRepository()).createResource('lessons', command(lessonData({ status: 'scheduled' }))),
        hasCode('LESSON_MUST_START_DRAFT'));

    const invalidCases = [
        ['courseSpecs', courseSpec({ code: '' }), 'COURSE_CODE_REQUIRED'],
        ['courseSpecs', courseSpec({ name: '' }), 'COURSE_NAME_REQUIRED'],
        ['courseSpecs', courseSpec({ deliveryMode: 'x' }), 'COURSE_DELIVERY_MODE_INVALID'],
        ['courseSpecs', courseSpec({ durationMinutes: 0 }), 'COURSE_DURATION_INVALID'],
        ['courseSpecs', courseSpec({ status: 'x' }), 'COURSE_STATUS_INVALID'],
        ['packages', packageData({ code: '' }), 'PACKAGE_CODE_REQUIRED'],
        ['packages', packageData({ name: '' }), 'PACKAGE_NAME_REQUIRED'],
        ['packages', packageData({ saleChannel: 'x' }), 'PACKAGE_CHANNEL_INVALID'],
        ['packages', packageData({ activationMode: 'x' }), 'PACKAGE_ACTIVATION_MODE_INVALID'],
        ['packages', packageData({ expiryPolicy: 'x' }), 'PACKAGE_EXPIRY_POLICY_INVALID'],
        ['packages', packageData({ status: 'x' }), 'PACKAGE_STATUS_INVALID'],
        ['packages', packageData({ activationDeadlineDays: -1 }), 'PACKAGE_ACTIVATION_DEADLINE_INVALID'],
        ['packages', packageData({ validityDurationDays: -1 }), 'PACKAGE_VALIDITY_INVALID'],
        ['packages', packageData({ activationMode: 'FIRST_RESERVATION', activationDeadlineDays: '' }), 'PACKAGE_ACTIVATION_DEADLINE_REQUIRED'],
        ['packages', packageData({ expiryPolicy: 'FIXED_DURATION', validityDurationDays: '' }), 'PACKAGE_VALIDITY_REQUIRED'],
        ['grantLines', grantLine({ packageId: '' }), 'PACKAGE_ID_REQUIRED'],
        ['grantLines', grantLine({ creditTypeId: '' }), 'CREDIT_TYPE_ID_REQUIRED'],
        ['grantLines', grantLine({ quantity: 0 }), 'GRANT_QUANTITY_INVALID'],
        ['priceVersions', priceVersion({ packageId: '' }), 'PACKAGE_ID_REQUIRED'],
        ['priceVersions', priceVersion({ currency: 'cny' }), 'PRICE_CURRENCY_INVALID'],
        ['priceVersions', priceVersion({ listAmount: -1 }), 'PRICE_LIST_AMOUNT_INVALID'],
        ['priceVersions', priceVersion({ saleAmount: -1 }), 'PRICE_SALE_AMOUNT_INVALID'],
        ['priceVersions', priceVersion({ listAmount: 100, saleAmount: 101 }), 'PRICE_SALE_AMOUNT_INVALID'],
        ['priceVersions', priceVersion({ validFrom: 'bad' }), 'PRICE_VALID_FROM_INVALID'],
        ['priceVersions', priceVersion({ validTo: '2026-01-01', validFrom: '2026-02-01' }), 'PRICE_VALID_TO_INVALID'],
        ['priceVersions', priceVersion({ version: 0 }), 'PRICE_VERSION_INVALID'],
        ['priceVersions', priceVersion({ status: 'x' }), 'PRICE_STATUS_INVALID'],
        ['classes', classData({ code: '' }), 'CLASS_CODE_REQUIRED'],
        ['classes', classData({ name: '' }), 'CLASS_NAME_REQUIRED'],
        ['classes', classData({ courseSpecId: '' }), 'COURSE_ID_REQUIRED'],
        ['classes', classData({ defaultCreditTypeId: '' }), 'CREDIT_TYPE_ID_REQUIRED'],
        ['classes', classData({ capacity: 0 }), 'CLASS_CAPACITY_INVALID'],
        ['classes', classData({ termEnd: '2026-01-01', termStart: '2026-02-01' }), 'CLASS_TERM_INVALID'],
        ['classes', classData({ status: 'x' }), 'CLASS_STATUS_INVALID'],
        ['lessons', lessonData({ code: '' }), 'LESSON_CODE_REQUIRED'],
        ['lessons', lessonData({ title: '' }), 'LESSON_TITLE_REQUIRED'],
        ['lessons', lessonData({ status: 'settled' }), 'LESSON_STATUS_INVALID'],
        ['lessons', lessonData({ startAt: 'bad' }), 'LESSON_START_INVALID'],
        ['lessons', lessonData({ endAt: '2026-08-01T09:00:00Z' }), 'LESSON_END_INVALID'],
        ['lessons', lessonData({ requiredCreditTypeId: '' }), 'CREDIT_TYPE_ID_REQUIRED'],
        ['lessons', lessonData({ requiredQuantity: 0 }), 'LESSON_QUANTITY_INVALID'],
        ['lessons', lessonData({ attendanceRuleSnapshot: {} }), 'ATTENDANCE_RULE_SNAPSHOT_REQUIRED'],
        ['lessons', lessonData({ settlementRuleSnapshot: [] }), 'SETTLEMENT_RULE_SNAPSHOT_REQUIRED'],
        ['lessons', lessonData({ teacherRuleSnapshot: null }), 'TEACHER_RULE_SNAPSHOT_REQUIRED'],
        ['lessons', lessonData({ rosterVersion: 0 }), 'LESSON_ROSTER_VERSION_INVALID'],
        ['lessons', lessonData({ version: 0 }), 'LESSON_VERSION_INVALID'],
    ];
    invalidCases.forEach(([name, data, code]) => {
        assert.throws(() => normalizeResourceInput(name, data), hasCode(code), `${name}:${code}`);
    });

    assert.throws(() => normalizeResourceInput('packages', packageData({
        activationMode: 'FIRST_RESERVATION', activationDeadlineDays: null,
    })), hasCode('PACKAGE_ACTIVATION_DEADLINE_REQUIRED'));
    assert.throws(() => normalizeResourceInput('packages', packageData({
        activationMode: 'FIRST_RESERVATION', activationDeadlineDays: undefined,
    })), hasCode('PACKAGE_ACTIVATION_DEADLINE_REQUIRED'));
    assert.throws(() => normalizeResourceInput('priceVersions', priceVersion({ currency: undefined })),
        hasCode('PRICE_CURRENCY_INVALID'));
    assert.throws(() => validateLessonStatusTransition('draft', 'scheduled'),
        hasCode('LESSON_STATUS_TRANSITION_INVALID'));
    assert.throws(() => validateLessonStatusTransition('unknown', 'completed'),
        hasCode('LESSON_STATUS_TRANSITION_INVALID'));
    assert.doesNotThrow(() => validateLessonStatusTransition('draft', 'draft'));
    assert.doesNotThrow(() => validateLessonStatusTransition('scheduled', 'in_progress'));
    assert.equal(normalizeResourceInput(
        'lessons',
        { title: '预约课堂完成态' },
        lessonData({ originType: 'appointment' })
    ).originType, 'appointment');
});

test('resource defaults support direct inputs, default service dependencies, and status-less updates', async () => {
    const repository = mockRepository({ records: { package_grant_lines: grantLine() } });
    const defaults = new AdminResourceCommandService(repository);
    assert.equal(typeof defaults.clock, 'function');
    assert.equal(typeof defaults.idFactory, 'function');

    const service = createService(repository);
    const createdResult = await service.createResource('courseSpecs', courseSpec());
    assert.equal(createdResult.status, 'draft');
    const updatedResult = await service.updateResource('grantLines', 'line', { quantity: 12 });
    assert.equal(updatedResult.status, 'active');
    assert.equal(lastPlan(repository)[1].data.actorId, '');
    assert.equal(lastPlan(repository)[1].data.actorRole, 'admin');
});

test('package activation requires grant lines and an active price', async () => {
    const records = { packages: packageData({ id: 'package', status: 'draft' }) };
    await assert.rejects(createService(mockRepository({ records, lists: { package_grant_lines: [], price_versions: [] } }))
        .setStatus('packages', 'package', 'active', metadata()), hasCode('PACKAGE_GRANT_LINES_REQUIRED'));
    await assert.rejects(createService(mockRepository({
        records, lists: { package_grant_lines: [grantLine()], price_versions: [] },
    })).setStatus('packages', 'package', 'active', metadata()), hasCode('PACKAGE_ACTIVE_PRICE_REQUIRED'));

    const repository = mockRepository({
        records, lists: { package_grant_lines: [grantLine()], price_versions: [priceVersion()] },
    });
    assert.equal((await createService(repository).setStatus('packages', 'package', 'active', metadata())).status, 'active');
});

test('conversion publication creates immutable versions and rejects profitable graphs', async () => {
    const current = conversionRule({
        id: 'rule', sourceCreditTypeId: 'B', targetCreditTypeId: 'A',
        sourceQuantity: 1, targetQuantity: 1, minSourceQuantity: 1, maxSourceQuantity: 100,
    });
    const safeRepository = mockRepository({
        records: { conversion_rules: current },
        lists: {
            conversion_rules: [current],
            credit_types: [creditType('A'), creditType('B')],
        },
    });
    const published = await createService(safeRepository)
        .setStatus('conversionRules', 'rule', 'active', metadata());
    assert.equal(published.previousId, 'rule');
    assert.equal(published.version, 2);
    assert.equal(lastPlan(safeRepository)[0].action, 'create');
    assert.equal(lastPlan(safeRepository)[0].data.status, 'active');

    const cycleRepository = mockRepository({
        records: { conversion_rules: current },
        lists: {
            conversion_rules: [
                conversionRule({ id: 'forward', sourceCreditTypeId: 'A', targetCreditTypeId: 'B', sourceQuantity: 1, targetQuantity: 2, referenceValueLimit: 2, status: 'active' }),
                current,
            ],
            credit_types: [creditType('A'), creditType('B')],
        },
    });
    await assert.rejects(
        createService(cycleRepository).setStatus('conversionRules', 'rule', 'active', metadata()),
        hasCode('CONVERSION_PROFITABLE_CYCLE')
    );

    const deactivated = await createService(safeRepository)
        .setStatus('conversionRules', 'rule', 'inactive', metadata());
    assert.equal(deactivated.status, 'inactive');
    assert.equal(lastPlan(safeRepository)[0].data.version, 2);
});

function mockRepository(options = {}) {
    return {
        plans: [],
        async get(collection) {
            return options.records?.[collection];
        },
        async findFirst(collection) {
            return collection === 'credit_operations' ? options.existingOperation || null : null;
        },
        async list(collection) {
            return options.lists?.[collection] || [];
        },
        async send(plan) {
            this.plans.push(plan);
            if (options.sendError) throw options.sendError;
            return plan;
        },
    };
}

function createService(repository) {
    let index = 0;
    return new AdminResourceCommandService(repository, {
        clock: () => Date.parse('2026-07-23T08:00:00Z'),
        idFactory: () => `id-${++index}`,
    });
}

function command(data) {
    return { ...metadata(), data };
}

function metadata() {
    return { actorId: 'admin', actorRole: 'admin', idempotencyKey: 'key', traceId: 'trace' };
}

function courseSpec(overrides = {}) {
    return { code: 'VOCAL', name: '声乐', deliveryMode: 'one_to_one', durationMinutes: 45, status: 'draft', ...overrides };
}

function packageData(overrides = {}) {
    return {
        code: 'P10', name: '声乐十课时', saleChannel: 'admin', activationMode: 'GRANT_TIME',
        activationDeadlineDays: 0, validityDurationDays: 180, expiryPolicy: 'FIXED_DURATION', status: 'draft',
        ...overrides,
    };
}

function grantLine(overrides = {}) {
    return { packageId: 'package', creditTypeId: 'type', quantity: 10, ...overrides };
}

function priceVersion(overrides = {}) {
    return {
        packageId: 'package', currency: 'CNY', listAmount: 3000, saleAmount: 2800,
        validFrom: '2026-01-01T00:00:00Z', validTo: '', version: 1, status: 'active', grantSnapshot: {},
        ...overrides,
    };
}

function conversionRule(overrides = {}) {
    return {
        sourceCreditTypeId: 'universal', targetCreditTypeId: 'course', sourceQuantity: 100,
        targetQuantity: 1, minSourceQuantity: 100, maxSourceQuantity: 1000,
        expiryPolicy: 'INHERIT_SOURCE', activationMode: 'GRANT_TIME', validityDurationDays: 0,
        activationDeadlineDays: 0, reversible: false, referenceValueLimit: 1,
        validFrom: '2026-01-01T00:00:00Z', validTo: '', version: 1, status: 'draft',
        ...overrides,
    };
}

function creditType(id) {
    return { id, referenceUnitValue: 1 };
}

function classData(overrides = {}) {
    return {
        code: 'C1', name: '周末班', courseSpecId: 'course', defaultCreditTypeId: 'type',
        termStart: '2026-02-01T00:00:00Z', termEnd: '2026-08-01T00:00:00Z', capacity: 10,
        location: 'A教室', status: 'draft', ...overrides,
    };
}

function lessonData(overrides = {}) {
    return {
        code: 'L1', title: '第一课', status: 'draft', startAt: '2026-08-01T10:00:00Z',
        endAt: '2026-08-01T11:00:00Z', requiredCreditTypeId: 'type', requiredQuantity: 1,
        attendanceRuleSnapshot: { version: 1 }, settlementRuleSnapshot: { version: 1 },
        teacherRuleSnapshot: { version: 1 }, rosterVersion: 1, version: 1, ...overrides,
    };
}

function lastPlan(repository) {
    return repository.plans.at(-1);
}

function hasCode(code) {
    return (error) => error?.code === code;
}

test('new lessons receive server-owned rule snapshots and versions', () => {
    const data = normalizeResourceInput('lessons', {
        code: 'SCH-1', title: '声乐课', status: 'draft', startAt: '2026-09-24T02:00:00.000Z', endAt: '2026-09-24T03:00:00.000Z',
        requiredCreditTypeId: 'credit', requiredQuantity: 1,
    });
    assert.deepEqual(data.attendanceRuleSnapshot, { version: 1 });
    assert.deepEqual(data.settlementRuleSnapshot, { version: 1 });
    assert.deepEqual(data.teacherRuleSnapshot, { version: 1 });
    assert.equal(data.rosterVersion, 1);
    assert.equal(data.version, 1);
    assert.equal(data.originType, 'admin');
});

test('scheduled lessons can be completed only after they start', async () => {
    assert.doesNotThrow(() => validateLessonStatusTransition('scheduled', 'completed'));
    assert.doesNotThrow(() => validateLessonStatusTransition('enrollment_closed', 'completed'));
    assert.throws(() => validateLessonStatusTransition('draft', 'completed'),
        hasCode('LESSON_STATUS_TRANSITION_INVALID'));

    const future = mockRepository({ records: { sessions: lessonData({ id: 'lesson', status: 'scheduled' }) } });
    await assert.rejects(createService(future).updateResource('lessons', 'lesson', command({ status: 'completed' })),
        hasCode('LESSON_NOT_STARTED'));

    const started = mockRepository({ records: { sessions: lessonData({
        id: 'lesson', status: 'scheduled', startAt: '2026-07-23T07:00:00Z', endAt: '2026-07-23T08:00:00Z',
    }) } });
    const result = await createService(started).updateResource('lessons', 'lesson', command({ status: 'completed' }));
    assert.equal(result.status, 'completed');
});
