const test = require('node:test');
const assert = require('node:assert/strict');

const {
    MAX_STRING_LENGTH,
    operationAudit,
    privacySafeSummary,
} = require('../src/services/courseCredits/operationAudit');
const { teachingOperation } = require('../src/services/courseCredits/teachingCommand');
const { baseOperationPlan } = require('../src/services/courseCredits/reservationRequests');

test('operation audit removes sensitive fields and bounds persisted summaries', () => {
    const longValue = 'x'.repeat(MAX_STRING_LENGTH + 10);
    const summary = privacySafeSummary({
        cellphone: '13800000000',
        displayName: 'private',
        accessToken: 'private',
        safe: longValue,
        batches: [{ id: 'one' }, { id: 'two' }],
        nested: {
            email: 'private@example.com',
            status: 'active',
            child: { code: 'kept', payload: { private: true } },
        },
    });

    assert.equal(summary.cellphone, undefined);
    assert.equal(summary.displayName, undefined);
    assert.equal(summary.accessToken, undefined);
    assert.equal(summary.safe.length, MAX_STRING_LENGTH);
    assert.equal(summary.batchesCount, 2);
    assert.deepEqual(summary.nested, { status: 'active', child: { code: 'kept' } });
    assert.deepEqual(privacySafeSummary(null), {});
    assert.deepEqual(privacySafeSummary('not-an-object'), {});
});

test('operation audit normalizes reason, outcome, and empty summaries', () => {
    assert.deepEqual(operationAudit(), {
        reason: 'business_command',
        outcome: 'committed',
        beforeSummary: {},
        afterSummary: {},
    });
    const audit = operationAudit({
        reason: `  ${'r'.repeat(MAX_STRING_LENGTH + 5)}  `,
        outcome: 'denied',
    });
    assert.equal(audit.reason.length, MAX_STRING_LENGTH);
    assert.equal(audit.outcome, 'denied');
});

test('teaching commands persist traceable privacy-safe audit metadata', () => {
    const operation = teachingOperation({
        operationId: 'operation',
        type: 'settle_session',
        at: '2026-07-17T10:00:00.000Z',
        scopedKey: 'settle:key',
        sourceType: 'session',
        sourceId: 'session',
        requestHash: 'hash',
        requestSnapshot: { participantIds: ['one', 'two'], phone: 'private' },
        result: { settledCount: 2, metadata: { private: true } },
        input: { actorId: 'admin', actorRole: 'admin', traceId: 'trace', reason: 'lesson complete' },
    }).data;

    assert.equal(operation.id, 'operation');
    assert.equal(operation.traceId, 'trace');
    assert.equal(operation.reason, 'lesson complete');
    assert.equal(operation.outcome, 'committed');
    assert.deepEqual(operation.beforeSummary, { participantIdsCount: 2 });
    assert.deepEqual(operation.afterSummary, { settledCount: 2 });
});

test('reservation commands use the same audit contract', () => {
    const operation = baseOperationPlan({
        operationId: 'operation',
        operationType: 'reserve',
        now: '2026-07-17T10:00:00.000Z',
        scopedKey: 'reserve:key',
        requestHash: 'hash',
        sessionStudent: { id: 'session-student', studentId: 'student', creditStatus: 'eligible' },
        outcome: { operationId: 'operation', allocations: [{ id: 'allocation' }] },
        actor: { actorId: 'student', actorRole: 'student', traceId: 'trace' },
    })[0].data;

    assert.equal(operation.traceId, 'trace');
    assert.equal(operation.reason, 'reserve');
    assert.deepEqual(operation.beforeSummary, {
        creditStatus: 'eligible',
        sessionStudentId: 'session-student',
    });
    assert.deepEqual(operation.afterSummary, { operationId: 'operation', allocationsCount: 1 });
});
