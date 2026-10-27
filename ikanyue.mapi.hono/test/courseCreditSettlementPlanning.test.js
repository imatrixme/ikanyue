const test = require('node:test');
const assert = require('node:assert/strict');

const {
    settlementDecision,
    validateSettlementRuleSnapshots,
} = require('../src/services/courseCredits/domain');
const {
    buildStudentSettlementRequests,
    planStudentCreditSettlement,
    resolveBatch,
} = require('../src/services/courseCredits/settlementPlanning');

const NOW = '2026-08-10T11:05:00.000Z';

test('snapshotted rules decide all final attendance states without changing attendance', () => {
    const expected = {
        present: 'consumed',
        late: 'consumed',
        leave: 'released',
        absent: 'consumed',
        cancelled: 'released',
    };
    for (const [attendanceStatus, creditStatus] of Object.entries(expected)) {
        const result = settlementDecision(session(), student({ attendanceStatus }));
        assert.equal(result.creditStatus, creditStatus);
        assert.equal(result.ruleSource, attendanceStatus);
        assert.equal(result.ruleVersion, attendanceStatus === 'cancelled' ? 3 : 2);
    }

    const releasedAbsent = settlementDecision(
        session({ attendanceRuleSnapshot: rules({ absent: 'release' }).attendance }),
        student({ attendanceStatus: 'absent' })
    );
    assert.equal(releasedAbsent.action, 'release');
});

test('institution cancellation always releases regardless of student attendance rules', () => {
    const result = settlementDecision(session({ status: 'cancelled' }), student({ attendanceStatus: 'present' }));
    assert.deepEqual(result, {
        action: 'release',
        creditStatus: 'released',
        eventType: 'RELEASE',
        ruleSource: 'institution_cancelled',
        ruleVersion: 3,
        targetBucket: 'availableQuantity',
    });
});

test('consume planning moves frozen quantity and creates reusable SDK batch requests', () => {
    const context = settlementContext();
    const result = buildStudentSettlementRequests(context);

    assert.equal(result.decision.creditStatus, 'consumed');
    assert.equal(result.movements[0].nextBatch.frozenQuantity, 0);
    assert.equal(result.movements[0].nextBatch.consumedQuantity, 2);
    assert.equal(result.movements[0].nextBatch.status, 'depleted');
    assert.deepEqual(request(result.requests, 'credit_batches').data, {
        availableQuantity: 0,
        consumedQuantity: 2,
        expiredQuantity: 0,
        frozenQuantity: 0,
        status: 'depleted',
        version: 5,
    });
    assert.deepEqual(request(result.requests, 'session_credit_allocations').data, { status: 'consumed' });
    assert.deepEqual(request(result.requests, 'session_students').data, {
        creditStatus: 'consumed', settledAt: NOW, version: 4,
    });
    const event = request(result.requests, 'credit_events').data;
    assert.equal(event.eventType, 'CONSUME');
    assert.equal(event.quantityDelta, -1);
    assert.equal(event.bucketFrom, 'frozenQuantity');
    assert.equal(event.bucketTo, 'consumedQuantity');
    assert.deepEqual(event.metadata, {
        allocationId: 'allocation',
        attendanceStatus: 'present',
        immediateExpiry: false,
        ruleSource: 'present',
        ruleVersion: 2,
        sessionId: 'session',
        sessionStudentId: 'session-student',
    });
    assert.equal(requests(result.requests, 'credit_version_claims').length, 2);
});

test('delayed settlement consumes a reservation that was valid at service time after batch expiry', () => {
    const context = settlementContext({
        now: '2026-08-20T10:00:00.000Z',
        batchesById: new Map([['batch', batch({
            effectiveExpiresAt: '2026-08-10T10:30:00.000Z',
        })]]),
    });
    const result = buildStudentSettlementRequests(context);

    assert.equal(result.decision.creditStatus, 'consumed');
    assert.equal(result.movements[0].nextBatch.consumedQuantity, 2);
    assert.equal(result.movements[0].nextBatch.expiredQuantity, 0);
    assert.equal(request(result.requests, 'session_credit_allocations').data.status, 'consumed');
});

test('release planning restores available quantity and supports object batch lookup', () => {
    const context = settlementContext({
        sessionStudent: student({ attendanceStatus: 'leave' }),
        batchesById: { batch: batch() },
        actor: undefined,
    });
    const result = buildStudentSettlementRequests(context);
    const next = result.movements[0].nextBatch;
    assert.equal(next.availableQuantity, 1);
    assert.equal(next.frozenQuantity, 0);
    assert.equal(next.status, 'active');
    const event = request(result.requests, 'credit_events').data;
    assert.equal(event.eventType, 'RELEASE');
    assert.equal(event.quantityDelta, 1);
    assert.equal(event.actorId, '');
    assert.equal(event.metadata.immediateExpiry, false);
    assert.equal(resolveBatch(context.batchesById, 'batch').id, 'batch');
});

test('release after expiry moves frozen quantity directly to expired', () => {
    const result = buildStudentSettlementRequests(settlementContext({
        sessionStudent: student({ attendanceStatus: 'leave' }),
        batchesById: new Map([['batch', batch({ effectiveExpiresAt: '2026-08-10T11:00:00.000Z' })]]),
    }));
    const next = result.movements[0].nextBatch;
    assert.equal(next.availableQuantity, 0);
    assert.equal(next.expiredQuantity, 1);
    assert.equal(next.status, 'depleted');
    assert.equal(request(result.requests, 'session_credit_allocations').data.status, 'expired');
    const event = request(result.requests, 'credit_events').data;
    assert.equal(event.bucketTo, 'expiredQuantity');
    assert.equal(event.metadata.immediateExpiry, true);
});

test('settlement rules reject incomplete snapshots and non-final facts', () => {
    assertCode(() => validateSettlementRuleSnapshots(null, rules().settlement),
        'ATTENDANCE_RULE_SNAPSHOT_REQUIRED');
    assertCode(() => validateSettlementRuleSnapshots([], rules().settlement),
        'ATTENDANCE_RULE_SNAPSHOT_REQUIRED');
    assertCode(() => validateSettlementRuleSnapshots(rules().attendance, {}),
        'SETTLEMENT_RULE_SNAPSHOT_REQUIRED');
    assertCode(() => validateSettlementRuleSnapshots({ ...rules().attendance, version: 0 }, rules().settlement),
        'RULE_SNAPSHOT_VERSION_INVALID');
    assertCode(() => validateSettlementRuleSnapshots({ ...rules().attendance, late: 'waive' }, rules().settlement),
        'SETTLEMENT_ACTION_INVALID');
    assertCode(() => settlementDecision(session({ status: 'scheduled' }), student()),
        'SESSION_NOT_SETTLEABLE');
    assertCode(() => settlementDecision(session(), null), 'ATTENDANCE_STATUS_REQUIRED');
    assertCode(() => settlementDecision(session(), student({ attendanceStatus: 'checked_in' })),
        'ATTENDANCE_NOT_FINAL');
    assertCode(() => settlementDecision(session(), student({ attendanceStatus: 'unknown' })),
        'INVALID_ATTENDANCE_STATUS');
});

test('settlement planning rejects unsafe allocation and batch states', () => {
    const cases = [
        [{ sessionStudent: student({ creditStatus: 'pending' }) }, 'SESSION_STUDENT_NOT_RESERVED'],
        [{ allocations: [] }, 'SESSION_ALLOCATION_REQUIRED'],
        [{ allocations: [{ ...allocation(), status: 'consumed' }] }, 'SESSION_ALLOCATION_NOT_RESERVED'],
        [{ allocations: [{ ...allocation(), id: '' }] }, 'SESSION_ALLOCATION_ID_REQUIRED'],
        [{ allocations: [{ ...allocation(), batchId: '' }] }, 'SETTLEMENT_BATCH_ID_REQUIRED'],
        [{ allocations: [{ ...allocation(), quantity: 0 }] }, 'INVALID_CREDIT_QUANTITY'],
        [{ batchesById: new Map() }, 'SETTLEMENT_BATCH_NOT_FOUND'],
        [{ batchesById: new Map([['batch', batch({ studentId: 'other' })]]) }, 'SETTLEMENT_BATCH_STUDENT_MISMATCH'],
        [{ batchesById: new Map([['batch', batch({
            effectiveExpiresAt: '2026-08-10T10:00:00.000Z',
        })]]) }, 'RESERVATION_SERVICE_TIME_INVALID'],
        [{ batchesById: new Map([['batch', batch({ frozenQuantity: 0, availableQuantity: 1 })]]) }, 'CREDIT_INSUFFICIENT'],
        [{ allocations: [allocation(), { ...allocation(), id: 'second' }] }, 'DUPLICATE_SETTLEMENT_BATCH'],
    ];
    for (const [changes, code] of cases) {
        assertCode(() => planStudentCreditSettlement(settlementContext(changes)), code);
    }
});

function settlementContext(changes = {}) {
    return {
        operationId: 'operation',
        session: session(),
        sessionStudent: student(),
        allocations: [allocation()],
        batchesById: new Map([['batch', batch()]]),
        now: NOW,
        actor: { actorId: 'operator' },
        idFactory: ids(),
        ...changes,
    };
}

function session(changes = {}) {
    const snapshots = rules();
    return {
        id: 'session', status: 'completed',
        attendanceRuleSnapshot: snapshots.attendance,
        settlementRuleSnapshot: snapshots.settlement,
        ...changes,
    };
}

function student(changes = {}) {
    return {
        id: 'session-student', studentId: 'student', attendanceStatus: 'present',
        creditStatus: 'reserved', version: 3, ...changes,
    };
}

function allocation() {
    return {
        id: 'allocation', batchId: 'batch', quantity: 1, status: 'reserved',
        reservedForStartAt: '2026-08-10T10:00:00.000Z',
    };
}

function batch(changes = {}) {
    return {
        id: 'batch', studentId: 'student', creditTypeId: 'course', originalQuantity: 2,
        availableQuantity: 0, frozenQuantity: 1, consumedQuantity: 1,
        expiredQuantity: 0, reversedQuantity: 0, activatedAt: NOW, version: 4,
        validFrom: '2026-08-01T00:00:00.000Z',
        ...changes,
    };
}

function rules(changes = {}) {
    return {
        attendance: {
            version: 2, present: 'consume', late: 'consume', leave: 'release',
            absent: changes.absent || 'consume',
        },
        settlement: { version: 3, cancelled: 'release' },
    };
}

function request(plan, collection) {
    return plan.find((item) => item.collection === collection && item.action === 'update')
        || plan.find((item) => item.collection === collection);
}

function requests(plan, collection) {
    return plan.filter((item) => item.collection === collection);
}

function assertCode(callback, code) {
    assert.throws(callback, (error) => error.code === code);
}

function ids() {
    let index = 0;
    return () => `settlement${String(++index).padStart(5, '0')}`;
}
