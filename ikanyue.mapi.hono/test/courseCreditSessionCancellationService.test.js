const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseCreditSessionCancellationService,
    validateInput,
} = require('../src/services/courseCredits/sessionCancellationService');

test('admin session cancellation releases every reserved student and active calendar claim', async () => {
    const repository = mockRepository();
    const result = await service(repository).cancelSession(command());
    assert.equal(result.status, 'cancelled');
    assert.deepEqual(result.releasedStudentIds, ['student']);
    assert.equal(updated(repository.plan, 'sessions').cancellationType, 'institution');
    assert.equal(updated(repository.plan, 'credit_batches').frozenQuantity, 0);
    assert.equal(updated(repository.plan, 'schedule_claims').status, 'released');
    assert.equal(repository.plan.find((item) => item.collection === 'credit_operations').data.type, 'cancel_session');
});

test('generic cancellation rejects appointment sessions and invalid states', async () => {
    await assert.rejects(
        service(mockRepository({ session: { appointmentId: 'appointment' } })).cancelSession(command()),
        hasCode('APPOINTMENT_CANCELLATION_COMMAND_REQUIRED')
    );
    await assert.rejects(
        service(mockRepository({ session: { status: 'completed' } })).cancelSession(command()),
        hasCode('SESSION_NOT_CANCELLABLE')
    );
    await assert.rejects(service(mockRepository()).cancelSession(command({ reason: '' })), hasCode('SESSION_CANCEL_REASON_REQUIRED'));
});

test('generic cancellation supports defaults, skips unreserved roster rows, and validates cancellation type', async () => {
    const repository = mockRepository({
        roster: [student(), student({ id: 'pending', studentId: 'other', creditStatus: 'pending' })],
        allocations: [allocation()],
        session: { status: 'enrollment_closed' },
    });
    const result = await service(repository).cancelSession(command({ cancellationType: undefined }));
    assert.deepEqual(result.releasedStudentIds, ['student']);
    assert.equal(updated(repository.plan, 'sessions').cancellationType, 'admin');
    assert.equal(repository.batchReads, 1);
    assert.throws(() => validateInput({ sessionId: '', reason: '取消课程' }), hasCode('SESSION_ID_REQUIRED'));
    assert.throws(() => validateInput({ sessionId: 'session', reason: '取消课程', cancellationType: 'student' }),
        hasCode('SESSION_CANCELLATION_TYPE_INVALID'));
});

const NOW = '2026-08-01T00:00:00.000Z';

function service(repository) {
    return new CourseCreditSessionCancellationService(repository, {
        clock: () => Date.parse(NOW), idFactory: ids(),
    });
}

function mockRepository(options = {}) {
    const lesson = { ...session(), ...(options.session || {}) };
    return {
        plan: null,
        batchReads: 0,
        async findFirst() { return null; },
        async get(collection) {
            if (collection === 'sessions') return lesson;
            if (collection === 'credit_batches') { this.batchReads += 1; return options.batch || batch(); }
            throw new Error(`Unexpected get ${collection}`);
        },
        async list(collection) {
            if (collection === 'session_students') return options.roster || [student()];
            if (collection === 'schedule_claims') return [claim()];
            if (collection === 'session_credit_allocations') return options.allocations || [allocation()];
            throw new Error(`Unexpected list ${collection}`);
        },
        async send(plan) { this.plan = plan; return plan; },
    };
}

function session() {
    return {
        id: 'session', status: 'scheduled', appointmentId: '', version: 1,
        attendanceRuleSnapshot: { version: 1, present: 'consume', late: 'consume', leave: 'release', absent: 'consume' },
        settlementRuleSnapshot: { version: 1, cancelled: 'release' },
    };
}

function student(changes = {}) {
    return {
        id: 'session-student', studentId: 'student', creditStatus: 'reserved', attendanceStatus: 'scheduled', version: 1,
        ...changes,
    };
}

function allocation(changes = {}) {
    return { id: 'allocation', batchId: 'batch', quantity: 1, status: 'reserved', ...changes };
}

function batch(changes = {}) {
    return {
        id: 'batch', studentId: 'student', creditTypeId: 'course', originalQuantity: 1,
        availableQuantity: 0, frozenQuantity: 1, consumedQuantity: 0, expiredQuantity: 0,
        reversedQuantity: 0, status: 'active', activationMode: 'GRANT_TIME', activatedAt: NOW,
        effectiveExpiresAt: '2026-12-31T00:00:00.000Z', version: 1,
        ...changes,
    };
}

function claim() {
    return { id: 'claim', status: 'active', version: 1 };
}

function command(changes = {}) {
    return {
        sessionId: 'session', reason: '机构临时调整', cancellationType: 'institution',
        actorId: 'admin', actorRole: 'admin', idempotencyKey: 'cancel-session', ...changes,
    };
}

function ids() {
    let value = 0;
    return () => `cancel-id-${++value}`;
}

function updated(plan, collection) {
    return plan.find((item) => item.action === 'update' && item.collection === collection)?.data;
}

function hasCode(code) {
    return (error) => error?.code === code;
}
