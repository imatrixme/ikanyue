const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildRescheduleStudentRequests,
    mergeBatchRecords,
    planRescheduledStudent,
    validateInput,
} = require('../src/services/courseCredits/reschedulePlanning');

const NOW = '2026-08-15T10:00:00.000Z';
const NEW_START = '2026-08-20T10:00:00.000Z';

test('reschedule releases expired allocation and atomically freezes a new FEFO batch', () => {
    const result = buildRescheduleStudentRequests(context({
        candidateBatches: [candidateBatch()],
    }));

    assert.equal(result.creditStatus, 'reserved');
    assert.equal(result.missingQuantity, 0);
    assert.equal(result.releasedMovements[0].targetBucket, 'expiredQuantity');
    assert.equal(result.newMovements[0].nextBatch.id, 'candidate');
    assert.deepEqual(updateFor(result.requests, 'credit_batches', 'old').data, {
        availableQuantity: 0, expiredQuantity: 1, frozenQuantity: 0,
        status: 'expired', version: 3,
    });
    assert.equal(updateFor(result.requests, 'session_credit_allocations', 'old-allocation').data.status, 'expired');
    assert.equal(updateFor(result.requests, 'credit_batches', 'candidate').data.frozenQuantity, 1);
    const createdAllocation = createFor(result.requests, 'session_credit_allocations').data;
    assert.equal(createdAllocation.batchId, 'candidate');
    assert.equal(createdAllocation.reservedForStartAt, NEW_START);
    assert.deepEqual(events(result.requests).map((event) => event.eventType), ['RELEASE', 'FREEZE']);
    assert.equal(events(result.requests)[0].metadata.oldStartAt, '2026-08-10T10:00:00.000Z');
    assert.equal(events(result.requests)[1].metadata.newStartAt, NEW_START);
});

test('valid reservation is retained and only its protected service time changes', () => {
    const result = buildRescheduleStudentRequests(context({
        batchesById: { old: oldBatch({ effectiveExpiresAt: '2026-09-01T00:00:00.000Z' }) },
    }));
    assert.equal(result.creditStatus, 'reserved');
    assert.deepEqual(result.retainedAllocations.map((item) => item.id), ['old-allocation']);
    assert.equal(result.releasedMovements.length, 0);
    assert.equal(result.newMovements.length, 0);
    assert.deepEqual(updateFor(result.requests, 'session_credit_allocations', 'old-allocation').data, {
        reservedForStartAt: NEW_START,
    });
    assert.equal(result.requests.some((item) => item.collection === 'credit_batches'), false);
    assert.equal(events(result.requests).length, 0);
});

test('reschedule activates a FIRST_RESERVATION replacement before freezing it', () => {
    const result = buildRescheduleStudentRequests(context({
        actor: undefined,
        candidateBatches: [candidateBatch({
            activatedAt: '',
            activationDeadline: '2026-09-10T00:00:00.000Z',
            activationMode: 'FIRST_RESERVATION',
            effectiveExpiresAt: '',
            status: 'unactivated',
            validityDurationDays: 30,
        })],
    }));
    assert.equal(result.newMovements[0].activated, true);
    assert.deepEqual(events(result.requests).map((event) => event.eventType), [
        'RELEASE', 'ACTIVATE', 'FREEZE',
    ]);
    assert.equal(events(result.requests)[0].actorId, '');
    assert.equal(events(result.requests)[1].quantityDelta, 0);
});

test('insufficient replacement releases invalid credit without freezing a partial candidate', () => {
    const result = buildRescheduleStudentRequests(context({
        batchesById: new Map([['old', oldBatch({
            effectiveExpiresAt: '2026-08-18T00:00:00.000Z',
        })]]),
        candidateBatches: [candidateBatch({ availableQuantity: 0, frozenQuantity: 1 })],
    }));
    assert.equal(result.creditStatus, 'credit_insufficient');
    assert.equal(result.missingQuantity, 1);
    assert.equal(result.newMovements.length, 0);
    assert.equal(result.releasedMovements[0].targetBucket, 'availableQuantity');
    assert.equal(updateFor(result.requests, 'session_credit_allocations', 'old-allocation').data.status, 'released');
    assert.deepEqual(updateFor(result.requests, 'session_students', 'session-student').data, {
        creditStatus: 'credit_insufficient',
        eligibilityReason: 'reschedule_credit_insufficient',
        version: 5,
    });
});

test('session start equal to batch expiry is outside the half-open validity interval', () => {
    const result = planRescheduledStudent(context({
        batchesById: new Map([['old', oldBatch({ effectiveExpiresAt: '2026-08-15T00:00:00.000Z' })]]),
        newStartAt: '2026-08-15T00:00:00.000Z',
        now: '2026-08-14T00:00:00.000Z',
    }));
    assert.equal(result.retainedAllocations.length, 0);
    assert.equal(result.releasedMovements[0].targetBucket, 'availableQuantity');
});

test('reschedule planning rejects unsafe session, allocation, and batch inputs', () => {
    const cases = [
        [{ sessionStudent: student({ creditStatus: 'pending' }) }, 'RESCHEDULE_STUDENT_NOT_RESERVED'],
        [{ session: { ...session(), requiredQuantity: 0 } }, 'SESSION_CREDIT_QUANTITY_INVALID'],
        [{ creditType: { kind: 'universal', consumable: false } }, 'SESSION_CREDIT_TYPE_INVALID'],
        [{ newStartAt: 'invalid' }, 'SESSION_START_INVALID'],
        [{ now: 'invalid' }, 'RESCHEDULE_TIME_INVALID'],
        [{ allocations: [] }, 'SESSION_ALLOCATION_REQUIRED'],
        [{ idFactory: null }, 'ID_FACTORY_REQUIRED'],
        [{ allocations: [{ ...allocation(), status: 'released' }] }, 'SESSION_ALLOCATION_NOT_RESERVED'],
        [{ allocations: [{ ...allocation(), id: '' }] }, 'SESSION_ALLOCATION_ID_REQUIRED'],
        [{ allocations: [{ ...allocation(), batchId: '' }] }, 'RESCHEDULE_BATCH_ID_REQUIRED'],
        [{ allocations: [{ ...allocation(), quantity: 0 }] }, 'INVALID_CREDIT_QUANTITY'],
        [{ batchesById: new Map() }, 'RESCHEDULE_BATCH_NOT_FOUND'],
        [{ batchesById: new Map([['old', oldBatch({ studentId: 'other' })]]) }, 'RESCHEDULE_BATCH_STUDENT_MISMATCH'],
        [{ allocations: [allocation(), { ...allocation(), id: 'duplicate' }] }, 'DUPLICATE_RESCHEDULE_BATCH'],
        [{ session: { ...session(), requiredQuantity: 0 }, allocations: [allocation()] }, 'SESSION_CREDIT_QUANTITY_INVALID'],
    ];
    for (const [changes, code] of cases) {
        assertCode(() => planRescheduledStudent(context(changes)), code);
    }

    const excess = context({
        session: { ...session(), requiredQuantity: 1 },
        allocations: [
            allocation(),
            { ...allocation(), id: 'second', batchId: 'second' },
        ],
        batchesById: new Map([
            ['old', oldBatch({ effectiveExpiresAt: '2026-09-01T00:00:00.000Z' })],
            ['second', oldBatch({ id: 'second', effectiveExpiresAt: '2026-09-01T00:00:00.000Z' })],
        ]),
    });
    assertCode(() => validateInput({ ...excess, allocations: [] }), 'SESSION_ALLOCATION_REQUIRED');
    assertCode(() => planRescheduledStudent(excess), 'RESCHEDULE_ALLOCATION_EXCESS');
});

test('batch merge prefers authoritative allocated records over query candidates', () => {
    const merged = mergeBatchRecords(
        [oldBatch({ version: 1 })],
        { old: oldBatch({ version: 9 }) }
    );
    assert.equal(merged.get('old').version, 9);
});

function context(changes = {}) {
    return {
        actor: { actorId: 'operator' },
        allocations: [allocation()],
        batchesById: new Map([['old', oldBatch()]]),
        candidateBatches: [],
        creditType: { id: 'course', kind: 'course', consumable: true },
        idFactory: ids(),
        newStartAt: NEW_START,
        now: NOW,
        operationId: 'operation',
        session: session(),
        sessionStudent: student(),
        ...changes,
    };
}

function session() {
    return {
        id: 'session', startAt: '2026-08-10T10:00:00.000Z',
        requiredCreditTypeId: 'course', requiredQuantity: 1,
    };
}

function student(changes = {}) {
    return { id: 'session-student', studentId: 'student', creditStatus: 'reserved', version: 4, ...changes };
}

function allocation() {
    return { id: 'old-allocation', batchId: 'old', quantity: 1, status: 'reserved' };
}

function oldBatch(changes = {}) {
    return batch({
        id: 'old', availableQuantity: 0, frozenQuantity: 1,
        effectiveExpiresAt: '2026-08-15T10:00:00.000Z', version: 2,
        ...changes,
    });
}

function candidateBatch(changes = {}) {
    return batch({
        id: 'candidate', availableQuantity: 1, frozenQuantity: 0,
        effectiveExpiresAt: '2026-09-01T00:00:00.000Z', version: 7,
        ...changes,
    });
}

function batch(changes = {}) {
    return {
        id: 'batch', studentId: 'student', creditTypeId: 'course', originalQuantity: 1,
        availableQuantity: 0, frozenQuantity: 0, consumedQuantity: 0,
        expiredQuantity: 0, reversedQuantity: 0, activatedAt: NOW,
        activationMode: 'GRANT_TIME', status: 'active', priority: 0, version: 1,
        ...changes,
    };
}

function events(plan) {
    return plan.filter((item) => item.collection === 'credit_events').map((item) => item.data);
}

function updateFor(plan, collection, id) {
    return plan.find((item) => item.action === 'update' && item.collection === collection && item.id === id);
}

function createFor(plan, collection) {
    return plan.find((item) => item.action === 'create' && item.collection === collection);
}

function assertCode(callback, code) {
    assert.throws(callback, (error) => error.code === code);
}

function ids() {
    let index = 0;
    return () => `reschedule${String(++index).padStart(5, '0')}`;
}
