const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseCreditError,
    classifyCourseSpecChange,
    classifyProductChange,
    createOperationNo,
    createRecordId,
    resolveIdempotentOperation,
    scopedIdempotencyKey,
    stableJson,
    validateCreditType,
    validatePackageGrantLines,
    validatePriceVersion,
} = require('../src/services/courseCredits/domain');

test('credit types enforce universal and exact-course semantics', () => {
    const universal = { kind: 'universal', courseSpecId: null, consumable: false };
    const course = { kind: 'course', courseSpecId: 'vocal-60', consumable: true };
    assert.equal(validateCreditType(universal), universal);
    assert.equal(validateCreditType(course), course);
    assertCode(() => validateCreditType({ ...universal, kind: 'other' }), 'INVALID_CREDIT_TYPE_KIND');
    assertCode(() => validateCreditType({ ...universal, courseSpecId: 'vocal' }), 'UNIVERSAL_CREDIT_HAS_COURSE_SPEC');
    assertCode(() => validateCreditType({ ...universal, consumable: true }), 'UNIVERSAL_CREDIT_CONSUMABLE');
    assertCode(() => validateCreditType({ ...course, courseSpecId: null }), 'COURSE_SPEC_REQUIRED');
    assertCode(() => validateCreditType({ ...course, consumable: false }), 'COURSE_CREDIT_NOT_CONSUMABLE');
});

test('package grant lines require unique positive integer quantities', () => {
    const lines = [{ creditTypeId: 'A', quantity: 8 }, { creditTypeId: 'B', quantity: 2 }];
    assert.equal(validatePackageGrantLines(lines), lines);
    assertCode(() => validatePackageGrantLines([]), 'PACKAGE_GRANTS_REQUIRED');
    assertCode(() => validatePackageGrantLines([{ quantity: 1 }]), 'CREDIT_TYPE_REQUIRED');
    assertCode(() => validatePackageGrantLines([{ creditTypeId: 'A', quantity: 0 }]), 'INVALID_CREDIT_QUANTITY');
    assertCode(() => validatePackageGrantLines([{ creditTypeId: 'A', quantity: 1 }, { creditTypeId: 'A', quantity: 2 }]), 'DUPLICATE_PACKAGE_GRANT');
});

test('course entitlement changes require a new credit type while display metadata does not', () => {
    const previous = courseSpec();
    assert.deepEqual(classifyCourseSpecChange(previous, { ...previous, metadata: { color: 'green' } }), {
        changedFields: [],
        requiresNewCreditType: false,
        kind: 'no_entitlement_change',
    });
    for (const field of ['code', 'name', 'deliveryMode', 'durationMinutes', 'teacherTier']) {
        const change = classifyCourseSpecChange(previous, { ...previous, [field]: `${previous[field]}-changed` });
        assert.equal(change.requiresNewCreditType, true);
        assert.deepEqual(change.changedFields, [field]);
    }
});

test('product classification distinguishes price-only changes from entitlement changes', () => {
    const previous = product();
    const priceOnly = classifyProductChange(previous, {
        ...previous,
        price: { ...previous.price, saleAmount: 2800, version: 2 },
    });
    assert.equal(priceOnly.priceOnly, true);
    assert.equal(priceOnly.entitlementChanged, false);

    const packageChange = classifyProductChange(previous, {
        ...previous,
        package: { ...previous.package, validityDurationDays: 120 },
    });
    assert.equal(packageChange.priceOnly, false);
    assert.deepEqual(packageChange.packageChanges, ['validityDurationDays']);

    const grantsChange = classifyProductChange(previous, {
        ...previous,
        grantLines: [{ creditTypeId: 'A', quantity: 9 }],
    });
    assert.equal(grantsChange.grantsChanged, true);

    const courseChange = classifyProductChange(previous, {
        ...previous,
        courseSpec: { ...previous.courseSpec, durationMinutes: 45 },
    });
    assert.equal(courseChange.courseChange.requiresNewCreditType, true);
});

test('stable JSON and price validation are deterministic', () => {
    assert.equal(stableJson({ b: 2, a: [1, { d: 4, c: 3 }] }), stableJson({ a: [1, { c: 3, d: 4 }], b: 2 }));
    const price = { currency: 'CNY', listAmount: 3000, saleAmount: 2800, version: 1 };
    assert.equal(validatePriceVersion(price), price);
    assertCode(() => validatePriceVersion({ ...price, currency: 'cny' }), 'INVALID_CURRENCY');
    assertCode(() => validatePriceVersion({ ...price, listAmount: 1.5 }), 'INVALID_CREDIT_QUANTITY');
    assertCode(() => validatePriceVersion({ ...price, version: 0 }), 'INVALID_PRICE_VERSION');
});

test('idempotency keys execute once and replay original immutable results', () => {
    assert.equal(scopedIdempotencyKey(' reserve ', ' abc '), 'reserve:abc');
    assertCode(() => scopedIdempotencyKey('', 'abc'), 'IDEMPOTENCY_SCOPE_REQUIRED');
    assertCode(() => scopedIdempotencyKey('reserve', ''), 'IDEMPOTENCY_KEY_REQUIRED');
    assert.deepEqual(resolveIdempotentOperation(null, 'hash'), { action: 'execute', replayed: false });
    assert.deepEqual(resolveIdempotentOperation({ id: 'op', requestHash: 'hash', status: 'pending' }, 'hash'), {
        action: 'wait', replayed: false, operationId: 'op',
    });
    const snapshot = { batches: [{ id: 'batch', quantity: 10 }] };
    const operation = { id: 'op', requestHash: 'hash', status: 'committed', resultSnapshot: snapshot };
    const replay = resolveIdempotentOperation(operation, 'hash');
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.result, snapshot);
    replay.result.batches[0].quantity = 0;
    assert.equal(snapshot.batches[0].quantity, 10);
    for (const status of ['failed', 'reversed']) {
        assert.equal(resolveIdempotentOperation({ ...operation, status }, 'hash').status, status);
    }
    assertCode(() => resolveIdempotentOperation(operation, 'different'), 'IDEMPOTENCY_CONFLICT');
    assertCode(() => resolveIdempotentOperation({ ...operation, status: 'unknown' }, 'hash'), 'INVALID_OPERATION_STATUS');
    assert.equal(resolveIdempotentOperation({ ...operation, resultSnapshot: undefined }, 'hash').result, undefined);
});

test('course-credit identifiers are PocketBase-compatible and operation numbers are traceable', () => {
    const generated = createRecordId();
    assert.match(generated, /^[a-f0-9]{15}$/);
    assert.equal(createRecordId(() => Buffer.from('abcdefghijkl')), '616263646566676');
    assert.equal(createOperationNo('reserve', '2026-07-17T10:00:00Z', 'record'),
        `reserve-${Date.parse('2026-07-17T10:00:00Z')}-record`);
});

function courseSpec() {
    return {
        code: 'VOCAL-ADULT-1V1-60',
        name: '成人声乐一对一',
        deliveryMode: 'one_to_one',
        durationMinutes: 60,
        teacherTier: 'standard',
        metadata: {},
    };
}

function product() {
    return {
        courseSpec: courseSpec(),
        package: {
            activationMode: 'FIRST_CHECK_IN',
            activationDeadlineDays: 90,
            validityDurationDays: 180,
            expiryPolicy: 'FIXED_DURATION',
        },
        grantLines: [{ creditTypeId: 'A', quantity: 10 }],
        price: { currency: 'CNY', listAmount: 3000, saleAmount: 3000, version: 1 },
    };
}

function assertCode(action, code) {
    assert.throws(action, (error) => error instanceof CourseCreditError && error.code === code);
}
