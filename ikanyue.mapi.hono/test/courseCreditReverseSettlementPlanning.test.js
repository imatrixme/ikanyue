const test = require('node:test');
const assert = require('node:assert/strict');

const {
    allocationStatusFor,
    buildCreditReversalRequests,
    buildTeacherReversalRequests,
    validateCreditEvent,
} = require('../src/services/courseCredits/reverseSettlementPlanning');

const NOW = '2026-08-16T10:00:00.000Z';

test('credit reversal restores frozen buckets and appends linked reverse facts', () => {
    const context = creditContext();
    const result = buildCreditReversalRequests(context);

    assert.equal(result.movements.length, 2);
    assert.equal(result.movements[0].nextBatch.frozenQuantity, 1);
    assert.equal(result.movements[0].nextBatch.consumedQuantity, 0);
    assert.equal(result.movements[1].nextBatch.expiredQuantity, 0);
    assert.deepEqual(updates(result.requests, 'session_credit_allocations').map((item) => item.data.status), [
        'reversed', 'reversed',
    ]);
    const replacements = creates(result.requests, 'session_credit_allocations');
    assert.equal(replacements.length, 2);
    assert.ok(replacements.every((item) => item.data.status === 'reserved'));
    const events = creates(result.requests, 'credit_events').map((item) => item.data);
    assert.deepEqual(events.map((event) => event.quantityDelta), [1, -1]);
    assert.deepEqual(events.map((event) => event.reversalOfEventId), ['consume-event', 'release-event']);
    assert.deepEqual(events.map((event) => event.bucketFrom), ['consumedQuantity', 'expiredQuantity']);
    assert.equal(result.requests.some((item) => item.action === 'update' && item.collection === 'credit_events'), false);
    assert.deepEqual(updates(result.requests, 'session_students').map((item) => item.data.creditStatus), [
        'reserved', 'reserved',
    ]);
});

test('teacher reversal appends negative events and never mutates original earnings', () => {
    const result = buildTeacherReversalRequests({
        ...common(),
        teacherEvents: [teacherEvent('lead-event', 'assignment-lead', 'pending', 1.25),
            teacherEvent('assistant-event', 'assignment-assistant', 'confirmed', 0.5)],
    });
    const events = creates(result.requests, 'teacher_credit_events').map((item) => item.data);
    assert.deepEqual(events.map((event) => event.quantityDelta), [-1.25, -0.5]);
    assert.deepEqual(events.map((event) => event.reversalOfEventId), ['lead-event', 'assistant-event']);
    assert.ok(events.every((event) => event.status === 'reversed'));
    assert.equal(result.requests.some((item) => item.action === 'update'
        && item.collection === 'teacher_credit_events'), false);
    assert.deepEqual(updates(result.requests, 'session_teachers').map((item) => item.data.creditStatus), [
        'reversed', 'reversed',
    ]);
});

test('teacher cancellation compensation is reversible through the same immutable event path', () => {
    const result = buildTeacherReversalRequests({
        ...common(),
        teacherEvents: [{
            ...teacherEvent('compensation', 'assignment', 'pending', 0.75),
            eventType: 'compensate',
        }],
    });
    const reversal = creates(result.requests, 'teacher_credit_events')[0].data;

    assert.equal(reversal.quantityDelta, -0.75);
    assert.equal(reversal.reversalOfEventId, 'compensation');
});

test('reversal preserves legacy event links when allocation or teacher rule fields are absent', () => {
    const allocationsById = new Map([
        ['allocation-consume', { ...allocation('consume', 'consumed'), sessionStudentId: '' }],
        ['allocation-release', allocation('release', 'expired')],
    ]);
    const creditResult = buildCreditReversalRequests({ ...creditContext(), allocationsById });
    assert.equal(
        creates(creditResult.requests, 'session_credit_allocations')[0].data.sessionStudentId,
        'student-consume'
    );

    const teacherResult = buildTeacherReversalRequests({
        ...common(),
        teacherEvents: [{ ...teacherEvent('event', 'assignment', 'pending', 1), ruleId: '' }],
    });
    assert.equal(creates(teacherResult.requests, 'teacher_credit_events')[0].data.ruleId, '');
});

test('reversal status mapping distinguishes consumed, released, and expired allocations', () => {
    assert.equal(allocationStatusFor(creditEvent('consume', 'CONSUME', 'consumedQuantity', -1)), 'consumed');
    assert.equal(allocationStatusFor(creditEvent('release', 'RELEASE', 'availableQuantity', 1)), 'released');
    assert.equal(allocationStatusFor(creditEvent('expire', 'RELEASE', 'expiredQuantity', 1)), 'expired');
    assert.doesNotThrow(() => validateCreditEvent(
        creditEvent('event', 'CONSUME', 'consumedQuantity', -1), new Set()
    ));
});

test('credit reversal rejects missing, duplicate, or inconsistent original facts', () => {
    const cases = [
        [{ creditEvents: [{ ...creditEvents()[0], eventType: 'FREEZE' }] }, 'CREDIT_EVENT_NOT_REVERSIBLE'],
        [{ creditEvents: [{ ...creditEvents()[0], reversalOfEventId: 'prior' }] }, 'CREDIT_EVENT_ALREADY_REVERSED'],
        [{ creditEvents: [{ ...creditEvents()[0], bucketTo: 'frozenQuantity' }] }, 'REVERSAL_BUCKET_INVALID'],
        [{ creditEvents: [{ ...creditEvents()[0], metadata: {} }] }, 'REVERSAL_ALLOCATION_ID_REQUIRED'],
        [{ creditEvents: [creditEvents()[0], { ...creditEvents()[0], id: 'duplicate' }] }, 'DUPLICATE_REVERSAL_BATCH'],
        [{ allocationsById: new Map() }, 'REVERSAL_ALLOCATION_NOT_FOUND'],
        [{ allocationsById: new Map([['allocation-consume', {
            ...allocation('consume', 'consumed'), status: 'released',
        }], ['allocation-release', allocation('release', 'expired')]]) }, 'REVERSAL_ALLOCATION_STATUS_INVALID'],
        [{ batchesById: new Map() }, 'REVERSAL_BATCH_NOT_FOUND'],
        [{ sessionStudentsById: new Map() }, 'REVERSAL_SESSION_STUDENT_NOT_FOUND'],
        [{ batchesById: new Map([['batch-consume', batch('consume', 'other', 'consumedQuantity')],
            ['batch-release', batch('release', 'account-release', 'expiredQuantity')]]) },
        'REVERSAL_BATCH_STUDENT_MISMATCH'],
        [{ creditEvents: [{ ...creditEvents()[0], quantityDelta: -2 }, creditEvents()[1]] },
        'REVERSAL_QUANTITY_MISMATCH'],
        [{ batchesById: new Map([['batch-consume', batch('consume', 'account-consume', 'availableQuantity')],
            ['batch-release', batch('release', 'account-release', 'expiredQuantity')]]) }, 'CREDIT_INSUFFICIENT'],
    ];
    for (const [changes, code] of cases) {
        assertCode(() => buildCreditReversalRequests({ ...creditContext(), ...changes }), code);
    }
});

test('teacher reversal rejects invalid, repeated, or non-positive earning events', () => {
    const cases = [
        [[{ ...teacherEvent('event', 'assignment', 'pending', 1), eventType: 'confirm' }], 'TEACHER_EVENT_NOT_REVERSIBLE'],
        [[{ ...teacherEvent('event', 'assignment', 'pending', 1), reversalOfEventId: 'prior' }], 'TEACHER_EVENT_ALREADY_REVERSED'],
        [[teacherEvent('one', 'assignment', 'pending', 1), teacherEvent('two', 'assignment', 'pending', 1)],
            'DUPLICATE_TEACHER_REVERSAL'],
        [[teacherEvent('event', 'assignment', 'pending', 0)], 'TEACHER_REVERSAL_QUANTITY_INVALID'],
    ];
    for (const [teacherEvents, code] of cases) {
        assertCode(() => buildTeacherReversalRequests({ ...common(), teacherEvents }), code);
    }
    assert.deepEqual(buildTeacherReversalRequests({ ...common(), teacherEvents: [] }).requests, []);
});

function creditContext(changes = {}) {
    return {
        ...common(),
        creditEvents: creditEvents(),
        allocationsById: new Map([
            ['allocation-consume', allocation('consume', 'consumed')],
            ['allocation-release', allocation('release', 'expired')],
        ]),
        batchesById: new Map([
            ['batch-consume', batch('consume', 'account-consume', 'consumedQuantity')],
            ['batch-release', batch('release', 'account-release', 'expiredQuantity')],
        ]),
        sessionStudentsById: new Map([
            ['student-consume', student('consume', 'consumed')],
            ['student-release', student('release', 'released')],
        ]),
        ...changes,
    };
}

function common() {
    return {
        actor: { actorId: 'operator' }, idFactory: ids(), now: NOW,
        operationId: 'reversal-operation', originalOperationId: 'settlement-operation',
        reason: 'attendance correction', session: { id: 'session' },
    };
}

function creditEvents() {
    return [
        creditEvent('consume-event', 'CONSUME', 'consumedQuantity', -1, 'consume'),
        creditEvent('release-event', 'RELEASE', 'expiredQuantity', 1, 'release'),
    ];
}

function creditEvent(id, eventType, bucketTo, quantityDelta, suffix = 'consume') {
    return {
        id, eventType, bucketTo, quantityDelta, batchId: `batch-${suffix}`,
        metadata: { allocationId: `allocation-${suffix}`, sessionStudentId: `student-${suffix}` },
    };
}

function allocation(suffix, status) {
    return {
        id: `allocation-${suffix}`, sessionStudentId: `student-${suffix}`,
        batchId: `batch-${suffix}`, quantity: 1, status,
        reservedForStartAt: '2026-08-10T10:00:00.000Z',
    };
}

function batch(suffix, studentId, terminalBucket) {
    return {
        id: `batch-${suffix}`, studentId, creditTypeId: 'course', originalQuantity: 1,
        availableQuantity: terminalBucket === 'availableQuantity' ? 1 : 0,
        frozenQuantity: 0,
        consumedQuantity: terminalBucket === 'consumedQuantity' ? 1 : 0,
        expiredQuantity: terminalBucket === 'expiredQuantity' ? 1 : 0,
        reversedQuantity: 0, activatedAt: NOW, version: 4,
    };
}

function student(suffix, creditStatus) {
    return { id: `student-${suffix}`, studentId: `account-${suffix}`, creditStatus, version: 3 };
}

function teacherEvent(id, assignment, status, quantityDelta) {
    return {
        id, sessionTeacherId: assignment, teacherId: `teacher-${assignment}`,
        ruleId: 'rule', eventType: 'earn', status, quantityDelta,
    };
}

function creates(plan, collection) {
    return plan.filter((item) => item.action === 'create' && item.collection === collection);
}

function updates(plan, collection) {
    return plan.filter((item) => item.action === 'update' && item.collection === collection);
}

function assertCode(callback, code) {
    assert.throws(callback, (error) => error.code === code);
}

function ids() {
    let index = 0;
    return () => `reverseplan${String(++index).padStart(4, '0')}`;
}
