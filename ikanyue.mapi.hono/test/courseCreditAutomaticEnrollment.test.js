const test = require('node:test');
const assert = require('node:assert/strict');

const {
    AutomaticEnrollmentService,
    buildGrantSnapshot,
    buildOrder,
    enrollmentRequest,
    enrollmentResult,
    roundMoney,
    validateEnrollmentInput,
    validateEnrollmentResources,
} = require('../src/services/courseCredits/enrollmentService');
const { fingerprintRequest } = require('../src/services/courseCredits/repositories/operationRepository');
const { scopedIdempotencyKey } = require('../src/services/courseCredits/domain');

const NOW = Date.parse('2026-07-23T08:00:00.000Z');

test('automatic enrollment atomically creates order, payment, grants, membership, audit, and sync outbox', async () => {
    const repository = mockRepository({ futureLessons: [futureLesson()] });
    const result = await service(repository).enroll(command());

    assert.equal(result.status, 'synchronizing_future_lessons');
    assert.equal(result.sync.requiresConfirmation, true);
    assert.equal(result.sync.futureLessonCount, 1);
    assert.equal(result.grants.length, 1);
    assert.equal(result.replayed, false);

    const collections = repository.plan.map((item) => item.collection);
    assert.ok(collections.includes('orders'));
    assert.ok(collections.includes('payment_events'));
    assert.ok(collections.includes('credit_operations'));
    assert.ok(collections.includes('credit_batches'));
    assert.ok(collections.includes('credit_events'));
    assert.ok(collections.includes('class_students'));
    assert.ok(collections.includes('ops_audit_logs'));
    assert.ok(collections.includes('outbox_events'));
    assert.equal(collections.includes('session_students'), false);
    assert.equal(created(repository.plan, 'orders').status, 'granted');
    assert.equal(created(repository.plan, 'orders').productSnapshot.classId, 'class-1');
    assert.equal(created(repository.plan, 'class_students').sourceOrderId, result.orderId);
    assert.equal(created(repository.plan, 'outbox_events').topic, 'course-enrollment.activated');
});

test('enrollment without class completes as awaiting assignment and uses configured package values', async () => {
    const repository = mockRepository();
    const result = await service(repository).enroll(command({ classId: '', paidAmount: 2600 }));

    assert.equal(result.status, 'awaiting_class_assignment');
    assert.equal(result.classId, null);
    assert.equal(result.sync.status, 'not_required');
    assert.equal(repository.plan.some((item) => item.collection === 'class_students'), false);
    const order = created(repository.plan, 'orders');
    assert.equal(order.paidAmount, 2600);
    assert.equal(order.channel, 'admin');
    assert.equal(order.grantSnapshot.lines[0].paidUnitCost, 260);
});

test('enrollment replays immutable results and rejects conflicting duplicate keys', async () => {
    const request = enrollmentRequest(command());
    const existing = storedOperation(fingerprintRequest(request), { orderId: 'stored', status: 'completed' });
    const replay = await service(mockRepository({ existingOperation: existing })).enroll(command());
    assert.deepEqual(replay, { orderId: 'stored', status: 'completed', replayed: true });

    await assert.rejects(service(mockRepository({ existingOperation: storedOperation('different', {}) })).enroll(command()),
        hasCode('IDEMPOTENCY_CONFLICT'));
});

test('enrollment batch failure rolls back and can resolve a raced replay', async () => {
    const failed = mockRepository({ sendError: new Error('membership write failed') });
    await assert.rejects(service(failed).enroll(command()), hasCode('ENROLLMENT_TRANSACTION_FAILED'));
    assert.equal(failed.sendCount, 1);

    const raceResult = { orderId: 'race-order', status: 'completed' };
    const raced = mockRepository({
        sendError: new Error('unique constraint'),
        operationSequence: [null, storedOperation(fingerprintRequest(enrollmentRequest(command())), raceResult)],
    });
    const result = await service(raced).enroll(command());
    assert.deepEqual(result, { ...raceResult, replayed: true });
});

test('enrollment validates package, price, class, membership, and required request facts', async () => {
    for (const [changes, code] of [
        [{ studentId: '' }, 'STUDENT_ID_REQUIRED'],
        [{ packageId: '' }, 'PACKAGE_ID_REQUIRED'],
        [{ priceVersionId: '' }, 'PRICE_VERSION_ID_REQUIRED'],
        [{ idempotencyKey: '' }, 'IDEMPOTENCY_KEY_REQUIRED'],
        [{ actorId: '' }, 'ACTOR_ID_REQUIRED'],
        [{ channel: 'wechat' }, 'ENROLLMENT_CHANNEL_INVALID'],
    ]) {
        await assert.rejects(service(mockRepository()).enroll(command(changes)), hasCode(code));
    }

    await assert.rejects(service(mockRepository({ packageRecord: packageRecord({ status: 'draft' }) })).enroll(command()),
        hasCode('ENROLLMENT_PACKAGE_INACTIVE'));
    await assert.rejects(service(mockRepository({ price: price({ packageId: 'other' }) })).enroll(command()),
        hasCode('ENROLLMENT_PRICE_INVALID'));
    await assert.rejects(service(mockRepository({ price: price({ validTo: '2026-01-01T00:00:00Z' }) })).enroll(command()),
        hasCode('ENROLLMENT_PRICE_EXPIRED'));
    await assert.rejects(service(mockRepository({ lines: [] })).enroll(command()), hasCode('ENROLLMENT_PACKAGE_EMPTY'));
    await assert.rejects(service(mockRepository({ classRecord: classRecord({ status: 'completed' }) })).enroll(command()),
        hasCode('ENROLLMENT_CLASS_CLOSED'));
    await assert.rejects(service(mockRepository({ classRecord: classRecord({ defaultCreditTypeId: 'other' }) })).enroll(command()),
        hasCode('ENROLLMENT_CLASS_COURSE_MISMATCH'));
    await assert.rejects(service(mockRepository({ membership: { id: 'existing' } })).enroll(command()),
        hasCode('ENROLLMENT_CLASS_MEMBERSHIP_EXISTS'));
    await assert.rejects(service(mockRepository({
        creditType: creditType({ kind: 'universal', consumable: false, courseSpecId: '' }),
    })).enroll(command()), hasCode('ORDER_CREDIT_TYPE_MISMATCH'));
    await assert.rejects(service(mockRepository()).enroll(command({ paidAmount: -1 })),
        hasCode('ENROLLMENT_PAID_AMOUNT_INVALID'));
});

test('enrollment helpers allocate weighted course values and cover expiry boundaries', () => {
    const lines = [
        { creditTypeId: 'a', quantity: 2 },
        { creditTypeId: 'b', quantity: 1 },
    ];
    const types = new Map([
        ['a', creditType({ id: 'a', referenceUnitValue: 100 })],
        ['b', creditType({ id: 'b', referenceUnitValue: 200 })],
    ]);
    const snapshot = buildGrantSnapshot(packageRecord(), price({ listAmount: 400, saleAmount: 320 }), lines, types);
    assert.equal(snapshot.lines[0].paidUnitCost, 80);
    assert.equal(snapshot.lines[1].paidUnitCost, 160);
    const fallbackSnapshot = buildGrantSnapshot(
        packageRecord({ activationDeadlineDays: 10, validityDurationDays: undefined }),
        price(),
        [{ creditTypeId: 'fallback', quantity: 1 }],
        new Map([['fallback', creditType({ id: 'fallback', referenceUnitValue: 0 })]])
    );
    assert.equal(fallbackSnapshot.activationDeadlineDays, 10);
    assert.equal(fallbackSnapshot.validityDurationDays, 0);
    assert.equal(fallbackSnapshot.lines[0].paidUnitCost, 2800);
    assert.equal(roundMoney(1.005), 1.01);
    assert.deepEqual(enrollmentRequest(command({ classId: undefined, paidAmount: undefined })), {
        studentId: 'student-1', packageId: 'package-1', priceVersionId: 'price-1', classId: '',
        paidAmount: undefined, payerId: '', channel: 'admin', paymentReference: 'cash-1',
    });

    assert.throws(() => validateEnrollmentResources(packageRecord(), price({ validFrom: '2027-01-01T00:00:00Z' }), 'package-1', NOW),
        hasCode('ENROLLMENT_PRICE_EXPIRED'));
    assert.doesNotThrow(() => validateEnrollmentResources(packageRecord(), price({ validTo: '' }), 'package-1', NOW));
    assert.doesNotThrow(() => validateEnrollmentResources(
        packageRecord(), price({ validTo: '2026-12-31T00:00:00Z' }), 'package-1', NOW
    ));
    assert.throws(() => buildOrder({
        at: new Date(NOW).toISOString(), grantSnapshot: snapshot, input: command({ paidAmount: Number.NaN }),
        orderId: 'order', packageRecord: packageRecord(), price: price(), scopedKey: 'key', student: student(),
    }), hasCode('ENROLLMENT_PAID_AMOUNT_INVALID'));

    const noClass = enrollmentResult({
        classRecord: null, futureLessons: [], grants: [], membershipId: '', operationId: 'op', orderId: 'order', student: student(),
    });
    assert.equal(noClass.status, 'awaiting_class_assignment');
    const completed = enrollmentResult({
        classRecord: classRecord(), futureLessons: [], grants: [], membershipId: 'm', operationId: 'op', orderId: 'order', student: student(),
    });
    assert.equal(completed.status, 'completed');
    assert.doesNotThrow(() => validateEnrollmentInput(command()));
    assert.doesNotThrow(() => validateEnrollmentInput(command({ channel: undefined })));
});

test('enrollment defaults cover generated dependencies and optional payment metadata', async () => {
    const repository = mockRepository({
        packageRecord: packageRecord({ activationDeadlineDays: 5, validityDurationDays: undefined }),
        creditType: creditType({ referenceUnitValue: 0 }),
    });
    const defaults = new AutomaticEnrollmentService(repository);
    assert.equal(typeof defaults.clock, 'function');
    assert.equal(typeof defaults.idFactory, 'function');

    const result = await service(repository).enroll(command({
        classId: '', channel: undefined, paymentReference: '', payerId: '', actorRole: '', traceId: '', reason: '',
    }));
    assert.equal(result.status, 'awaiting_class_assignment');
    const order = created(repository.plan, 'orders');
    assert.equal(order.channel, 'admin');
    assert.equal(order.payerId, 'student-1');
    assert.match(created(repository.plan, 'payment_events').providerEventId, /^admin:/);
    assert.equal(created(repository.plan, 'credit_operations').actorRole, 'admin');
    assert.equal(created(repository.plan, 'credit_operations').traceId, '');
    assert.equal(created(repository.plan, 'credit_operations').reason, 'admin_enrollment');
});

function mockRepository(options = {}) {
    const sequence = [...(options.operationSequence || [])];
    return {
        plan: [],
        sendCount: 0,
        async get(collection) {
            const records = {
                students: options.student || student(),
                packages: options.packageRecord || packageRecord(),
                price_versions: options.price || price(),
                credit_types: options.creditType || creditType(),
                classes: options.classRecord || classRecord(),
            };
            return records[collection];
        },
        async list(collection) {
            if (collection === 'package_grant_lines') return options.lines === undefined ? [grantLine()] : options.lines;
            if (collection === 'session_classes') return options.futureLessons || [];
            return [];
        },
        async findFirst(collection) {
            if (collection === 'credit_operations') {
                return sequence.length ? sequence.shift() : options.existingOperation || null;
            }
            if (collection === 'class_students') return options.membership || null;
            return null;
        },
        async send(plan) {
            this.plan = plan;
            this.sendCount += 1;
            if (options.sendError) throw options.sendError;
            return plan;
        },
    };
}

function service(repository) {
    let index = 0;
    return new AutomaticEnrollmentService(repository, {
        clock: () => NOW,
        idFactory: () => `id-${++index}`,
    });
}

function command(overrides = {}) {
    return {
        studentId: 'student-1', packageId: 'package-1', priceVersionId: 'price-1', classId: 'class-1',
        channel: 'admin', paymentReference: 'cash-1', idempotencyKey: 'enroll-1', actorId: 'admin-1',
        actorRole: 'admin', traceId: 'trace', reason: '线下报名', ...overrides,
    };
}

function student(overrides = {}) {
    return { id: 'student-1', name: '学员', ...overrides };
}

function packageRecord(overrides = {}) {
    return {
        id: 'package-1', code: 'P10', name: '十课时', status: 'active', activationMode: 'GRANT_TIME',
        activationDeadlineDays: 0, validityDurationDays: 180, expiryPolicy: 'FIXED_DURATION', ...overrides,
    };
}

function price(overrides = {}) {
    return {
        id: 'price-1', packageId: 'package-1', currency: 'CNY', listAmount: 3000, saleAmount: 2800,
        validFrom: '2026-01-01T00:00:00Z', validTo: '', version: 1, status: 'active', ...overrides,
    };
}

function grantLine(overrides = {}) {
    return { id: 'line-1', packageId: 'package-1', creditTypeId: 'type-1', quantity: 10, ...overrides };
}

function creditType(overrides = {}) {
    return {
        id: 'type-1', kind: 'course', consumable: true, courseSpecId: 'course-1', referenceUnitValue: 300, ...overrides,
    };
}

function classRecord(overrides = {}) {
    return { id: 'class-1', status: 'active', defaultCreditTypeId: 'type-1', ...overrides };
}

function futureLesson() {
    return { sessionId: 'lesson-1', expand: { sessionId: { id: 'lesson-1', status: 'scheduled' } } };
}

function storedOperation(requestHash, resultSnapshot) {
    return { requestSnapshot: { requestHash }, resultSnapshot };
}

function created(plan, collection) {
    return plan.find((item) => item.collection === collection)?.data;
}

function hasCode(code) {
    return (error) => error?.code === code;
}
