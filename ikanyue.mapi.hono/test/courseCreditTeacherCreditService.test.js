const test = require('node:test');
const assert = require('node:assert/strict');

const { fingerprintRequest } = require('../src/services/courseCredits/repositories/operationRepository');
const { assertBatchPlanPolicy } = require('../src/services/courseCredits/repositories/sdkBatchRepository');
const {
    CourseCreditTeacherCreditService,
    validateAssignment,
    validateCommand,
    validatePendingEarning,
} = require('../src/services/courseCredits/teacherCreditService');

const NOW = '2026-08-20T10:00:00.000Z';

test('authorized confirmation appends a linked event and updates the assignment in one batch', async () => {
    const repository = mockRepository();
    const result = await service(repository).confirmTeacherCredit(command());

    assert.equal(result.replayed, false);
    assert.equal(result.quantity, 1.25);
    assert.equal(repository.sendCount, 1);
    assert.doesNotThrow(() => assertBatchPlanPolicy(repository.plan));
    const operation = created(repository.plan, 'credit_operations')[0];
    assert.equal(operation.type, 'confirm_teacher_credit');
    assert.equal(operation.sourceId, 'earning');
    const confirmation = created(repository.plan, 'teacher_credit_events')[0];
    assert.equal(confirmation.eventType, 'confirm');
    assert.equal(confirmation.status, 'confirmed');
    assert.equal(confirmation.quantityDelta, 1.25);
    assert.equal(confirmation.confirmationOfEventId, 'earning');
    assert.equal(repository.plan.some((item) => item.action === 'update'
        && item.collection === 'teacher_credit_events'), false);
    assert.equal(updated(repository.plan, 'session_teachers', 'assignment').creditStatus, 'confirmed');
    assert.equal(created(repository.plan, 'outbox_events')[0].topic,
        'course-credit.teacher-credit-confirmed');
});

test('compensation earnings use the same authorized confirmation transition', async () => {
    const repository = mockRepository({ earning: { eventType: 'compensate', quantityDelta: 0.75 } });
    const result = await service(repository).confirmTeacherCredit(command({ idempotencyKey: 'compensate-key' }));

    assert.equal(result.quantity, 0.75);
    assert.equal(created(repository.plan, 'teacher_credit_events')[0].quantityDelta, 0.75);
});

test('confirmation replays immutable results and resolves same-request races', async () => {
    const request = { reason: 'finance approved', teacherCreditEventId: 'earning' };
    const hash = fingerprintRequest(request);
    const replayRepository = mockRepository({ existingOperation: storedOperation(hash) });
    assert.equal((await service(replayRepository).confirmTeacherCredit(command())).replayed, true);
    assert.equal(replayRepository.plan, null);

    const raced = mockRepository({ raceReplayAfterSend: true });
    assert.equal((await service(raced).confirmTeacherCredit(command())).replayed, true);

    await assert.rejects(
        service(mockRepository({ existingOperation: storedOperation('different') })).confirmTeacherCredit(command()),
        hasCode('IDEMPOTENCY_CONFLICT')
    );
});

test('confirmation rejects an earning already confirmed under another command', async () => {
    await assert.rejects(
        service(mockRepository({ confirmation: { id: 'prior-confirmation' } })).confirmTeacherCredit(command()),
        hasCode('TEACHER_CREDIT_ALREADY_CONFIRMED')
    );
});

test('confirmation rejects a historical earning that was already reversed', async () => {
    await assert.rejects(
        service(mockRepository({ reversal: { id: 'reversal' } })).confirmTeacherCredit(command()),
        hasCode('TEACHER_CREDIT_REVERSED')
    );
});

test('confirmation validates authorization, reason, event state, quantity, and relations', async () => {
    await reject({}, { teacherCreditEventId: '' }, 'TEACHER_CREDIT_EVENT_ID_REQUIRED');
    await reject({}, { actorRole: 'teacher' }, 'TEACHER_CREDIT_CONFIRM_FORBIDDEN');
    await reject({}, { reason: 'x' }, 'TEACHER_CREDIT_CONFIRM_REASON_REQUIRED');
    await reject({ earning: { eventType: 'confirm' } }, {}, 'TEACHER_CREDIT_NOT_PENDING');
    await reject({ earning: { status: 'confirmed' } }, {}, 'TEACHER_CREDIT_NOT_PENDING');
    await reject({ earning: { quantityDelta: 0 } }, {}, 'TEACHER_CREDIT_QUANTITY_INVALID');
    await reject({ earning: { sessionTeacherId: '' } }, {}, 'TEACHER_CREDIT_RELATION_INVALID');
    await reject({ earning: { teacherId: '' } }, {}, 'TEACHER_CREDIT_RELATION_INVALID');
    await reject({ assignment: { teacherId: 'other' } }, {}, 'TEACHER_CREDIT_ASSIGNMENT_MISMATCH');
    await reject({ assignment: { creditStatus: 'confirmed' } }, {}, 'TEACHER_CREDIT_ASSIGNMENT_NOT_PENDING');
});

test('confirmation keeps storage failure atomic and visible', async () => {
    const repository = mockRepository({ sendError: new Error('storage unavailable') });
    await assert.rejects(service(repository).confirmTeacherCredit(command()), hasCode('COURSE_CREDIT_BATCH_FAILED'));
    assert.equal(repository.sendCount, 1);
    assert.ok(created(repository.plan, 'teacher_credit_events').length > 0);
});

test('teacher credit helper validation exposes stable contracts', () => {
    assert.doesNotThrow(() => validateCommand(command()));
    assert.doesNotThrow(() => validatePendingEarning(earning()));
    assert.doesNotThrow(() => validateAssignment(assignment(), earning()));
});

function service(repository) {
    return new CourseCreditTeacherCreditService(repository, {
        clock: () => Date.parse(NOW),
        idFactory: ids(),
    });
}

function mockRepository(options = {}) {
    const state = {
        earning: { ...earning(), ...(options.earning || {}) },
        assignment: { ...assignment(), ...(options.assignment || {}) },
        confirmation: options.confirmation || null,
        reversal: options.reversal || null,
    };
    return {
        existingOperation: options.existingOperation || null,
        plan: null,
        sendCount: 0,
        async findFirst(collection, filter) {
            if (collection === 'credit_operations') return this.existingOperation;
            return filter.includes('confirmationOfEventId') ? state.confirmation : state.reversal;
        },
        async get(collection) {
            if (collection === 'teacher_credit_events') return state.earning;
            if (collection === 'session_teachers') return state.assignment;
            throw new Error(`Unexpected get ${collection}`);
        },
        async send(plan) {
            this.plan = plan;
            this.sendCount += 1;
            if (options.raceReplayAfterSend) {
                this.existingOperation = plan.find((item) => item.collection === 'credit_operations').data;
                throw Object.assign(new Error('race'), { status: 409 });
            }
            if (options.sendError) throw options.sendError;
            return plan;
        },
    };
}

async function reject(repositoryChanges, commandChanges, code) {
    await assert.rejects(
        service(mockRepository(repositoryChanges)).confirmTeacherCredit(command(commandChanges)),
        hasCode(code)
    );
}

function command(changes = {}) {
    return {
        actorId: 'admin',
        actorRole: 'admin',
        idempotencyKey: 'confirm-key',
        reason: 'finance approved',
        teacherCreditEventId: 'earning',
        traceId: 'trace',
        ...changes,
    };
}

function earning() {
    return {
        id: 'earning',
        eventType: 'earn',
        quantityDelta: 1.25,
        ruleId: 'rule',
        sessionTeacherId: 'assignment',
        status: 'pending',
        teacherId: 'teacher',
    };
}

function assignment() {
    return { id: 'assignment', creditStatus: 'pending', teacherId: 'teacher' };
}

function storedOperation(requestHash) {
    return {
        id: 'stored',
        requestSnapshot: { requestHash },
        resultSnapshot: {
            confirmationEventId: 'confirmation',
            earningEventId: 'earning',
            operationId: 'stored',
            quantity: 1.25,
            sessionTeacherId: 'assignment',
            teacherId: 'teacher',
        },
    };
}

function created(plan, collection) {
    return plan.filter((item) => item.action === 'create' && item.collection === collection)
        .map((item) => item.data);
}

function updated(plan, collection, id) {
    return plan.find((item) => item.action === 'update' && item.collection === collection && item.id === id).data;
}

function hasCode(code) {
    return (error) => error.code === code;
}

function ids() {
    let index = 0;
    return () => `teachercredit${String(++index).padStart(4, '0')}`;
}
