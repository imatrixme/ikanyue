const test = require('node:test');
const assert = require('node:assert/strict');

const { CourseCreditError } = require('../src/services/courseCredits/domain');
const {
    CourseCreditClassMembershipService,
    optionalLaterDate,
    validDate,
    validateOpenClass,
    validateTeacherAssignment,
    validateTransitionTime,
    validateTransfer,
} = require('../src/services/courseCredits/classMembershipService');
const { fingerprintRequest } = require('../src/services/courseCredits/repositories/operationRepository');
const { assertBatchPlanPolicy } = require('../src/services/courseCredits/repositories/sdkBatchRepository');

const NOW = '2026-07-17T10:00:00.000Z';
const EFFECTIVE = '2026-08-01T00:00:00.000Z';

test('student membership command writes teaching relation and audit without changing credit quantities', async () => {
    const repository = mockRepository();
    const result = await service(repository).setStudentMembership(studentCommand());

    assert.equal(result.replayed, false);
    assert.doesNotThrow(() => assertBatchPlanPolicy(repository.plan));
    assert.deepEqual(repository.plan.map((item) => item.collection), [
        'credit_operations', 'class_students', 'outbox_events',
    ]);
    assert.equal(repository.plan.some((item) => [
        'credit_batches', 'credit_events', 'conversion_allocations', 'session_credit_allocations',
    ].includes(item.collection)), false);
    assert.equal(data(repository.plan, 'credit_operations').type, 'class_membership');
    assert.deepEqual(data(repository.plan, 'class_students'), {
        id: '000000000000002',
        classId: 'class-a',
        studentId: 'student',
        status: 'active',
        effectiveFrom: EFFECTIVE,
        effectiveTo: '',
        sourceOrderId: '',
    });
});

test('membership transition closes the prior interval and creates the new status atomically', async () => {
    const repository = mockRepository({
        openStudents: { 'class-a': membership() },
    });
    await service(repository).setStudentMembership(studentCommand({
        status: 'paused', effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: '2026-10-01T00:00:00Z',
    }));

    assert.deepEqual(updateData(repository.plan, 'class_students'), {
        effectiveTo: '2026-09-01T00:00:00.000Z',
    });
    const created = data(repository.plan, 'class_students');
    assert.equal(created.status, 'paused');
    assert.equal(created.effectiveTo, '2026-10-01T00:00:00.000Z');
});

test('student transfer closes source and opens target without any ledger movement', async () => {
    const repository = mockRepository({
        openStudents: { 'class-a': membership() },
    });
    const result = await service(repository).transferStudent(transferCommand());

    assert.equal(result.toClassId, 'class-b');
    assert.deepEqual(updateData(repository.plan, 'class_students'), { effectiveTo: EFFECTIVE });
    assert.equal(data(repository.plan, 'class_students').classId, 'class-b');
    assert.equal(repository.plan.some((item) => item.collection === 'credit_events'), false);
});

test('teacher assignment snapshots role and closes a previous effective interval', async () => {
    const repository = mockRepository({ openTeacher: teacherAssignment() });
    const result = await service(repository).setTeacherAssignment(teacherCommand());

    assert.equal(result.role, 'lead');
    assert.deepEqual(updateData(repository.plan, 'class_teachers'), { effectiveTo: EFFECTIVE });
    assert.deepEqual(data(repository.plan, 'class_teachers'), {
        id: '000000000000002',
        classId: 'class-a',
        teacherId: 'teacher',
        role: 'lead',
        status: 'active',
        effectiveFrom: EFFECTIVE,
        effectiveTo: '',
    });
});

test('teaching commands replay committed results and reject conflicting key reuse', async () => {
    const requestHash = fingerprintRequest({
        classId: 'class-a', studentId: 'student', status: 'active',
        effectiveFrom: EFFECTIVE, effectiveTo: '', sourceOrderId: '',
    });
    const replayRepository = mockRepository({ existing: operation(requestHash) });
    const replay = await service(replayRepository).setStudentMembership(studentCommand());
    assert.equal(replay.replayed, true);
    assert.equal(replayRepository.plan, null);

    const conflict = mockRepository({ existing: operation('different') });
    await assert.rejects(service(conflict).setStudentMembership(studentCommand()), hasCode('IDEMPOTENCY_CONFLICT'));

    const raced = mockRepository({ raceReplayAfterSend: true });
    assert.equal((await service(raced).setTeacherAssignment(teacherCommand())).replayed, true);
});

test('membership validation rejects invalid identities, dates, transitions, classes, and transfers', async () => {
    await rejectStudent({}, { classId: '' }, 'CLASS_ID_REQUIRED');
    await rejectStudent({}, { studentId: '' }, 'STUDENT_ID_REQUIRED');
    await rejectStudent({}, { status: 'bad' }, 'INVALID_MEMBERSHIP_STATUS');
    await rejectStudent({}, { effectiveFrom: 'bad' }, 'INVALID_DATE');
    await rejectStudent({}, { effectiveTo: '2026-07-01T00:00:00Z' }, 'INVALID_EFFECTIVE_RANGE');
    await rejectStudent({ classes: { 'class-a': { status: 'completed' } } }, {}, 'CLASS_NOT_OPEN');
    await rejectStudent({ openStudents: { 'class-a': membership({ effectiveFrom: EFFECTIVE }) } }, {},
        'MEMBERSHIP_EFFECTIVE_ORDER_INVALID');
    await assert.rejects(
        service(mockRepository({ sendError: new Error('storage') })).setStudentMembership(studentCommand()),
        (error) => error.code === 'COURSE_CREDIT_BATCH_FAILED'
    );

    await rejectTransfer({}, { fromClassId: '' }, 'SOURCE_CLASS_ID_REQUIRED');
    await rejectTransfer({}, { toClassId: '' }, 'TARGET_CLASS_ID_REQUIRED');
    await rejectTransfer({}, { studentId: '' }, 'STUDENT_ID_REQUIRED');
    await rejectTransfer({}, { toClassId: 'class-a' }, 'TRANSFER_CLASS_MUST_DIFFER');
    await rejectTransfer({ classes: { 'class-b': { defaultCreditTypeId: 'other' } } }, {},
        'TRANSFER_CREDIT_TYPE_MISMATCH');
    await rejectTransfer({}, {}, 'SOURCE_MEMBERSHIP_NOT_ACTIVE');
    await rejectTransfer({
        openStudents: { 'class-a': membership(), 'class-b': membership({ classId: 'class-b' }) },
    }, {}, 'TARGET_MEMBERSHIP_ALREADY_OPEN');
});

test('teacher and date helpers cover policy boundaries', () => {
    assert.equal(validDate(EFFECTIVE, 'date'), EFFECTIVE);
    assert.equal(optionalLaterDate('', EFFECTIVE), '');
    assert.equal(optionalLaterDate('2026-09-01T00:00:00Z', EFFECTIVE), '2026-09-01T00:00:00.000Z');
    assert.doesNotThrow(() => validateOpenClass({ status: 'draft' }));
    assert.doesNotThrow(() => validateTransitionTime(null, EFFECTIVE));
    assertCode(() => validateTransfer({ fromClassId: 'a', toClassId: 'b', studentId: '' }), 'STUDENT_ID_REQUIRED');
    assertCode(() => validateTeacherAssignment({
        classId: 'class', teacherId: '', role: 'lead', status: 'active',
    }), 'TEACHER_ID_REQUIRED');
    assertCode(() => validateTeacherAssignment({
        classId: 'class', teacherId: 'teacher', role: 'bad', status: 'active',
    }), 'INVALID_TEACHER_ROLE');
    assertCode(() => validateTeacherAssignment({
        classId: 'class', teacherId: 'teacher', role: 'lead', status: 'bad',
    }), 'INVALID_TEACHER_STATUS');
});

function service(repository) {
    return new CourseCreditClassMembershipService(repository, {
        clock: () => Date.parse(NOW), idFactory: ids(),
    });
}

function mockRepository(options = {}) {
    const baseClasses = {
        'class-a': { id: 'class-a', status: 'active', defaultCreditTypeId: 'course' },
        'class-b': { id: 'class-b', status: 'active', defaultCreditTypeId: 'course' },
    };
    const classes = Object.fromEntries(Object.entries(baseClasses).map(([id, record]) => [
        id,
        { ...record, ...(options.classes?.[id] || {}) },
    ]));
    return {
        existing: options.existing || null,
        plan: null,
        async get(collection, id) {
            if (collection === 'classes') return { id, ...classes[id] };
            if (collection === 'students') return { id };
            if (collection === 'teachers') return { id };
            throw new Error(`Unexpected get ${collection}`);
        },
        async findFirst(collection, filter) {
            if (collection === 'credit_operations') return this.existing;
            if (collection === 'class_students') {
                const classId = filter.includes('class-b') ? 'class-b' : 'class-a';
                return options.openStudents?.[classId] || null;
            }
            if (collection === 'class_teachers') return options.openTeacher || null;
            throw new Error(`Unexpected find ${collection}`);
        },
        async send(plan) {
            this.plan = plan;
            if (options.raceReplayAfterSend) {
                this.existing = plan.find((item) => item.collection === 'credit_operations').data;
                throw Object.assign(new Error('race'), { status: 409 });
            }
            if (options.sendError) throw options.sendError;
            return plan;
        },
    };
}

function studentCommand(changes = {}) {
    return {
        classId: 'class-a', studentId: 'student', status: 'active', effectiveFrom: EFFECTIVE,
        idempotencyKey: 'student-key', actorId: 'operator', ...changes,
    };
}

function transferCommand(changes = {}) {
    return {
        fromClassId: 'class-a', toClassId: 'class-b', studentId: 'student', effectiveAt: EFFECTIVE,
        idempotencyKey: 'transfer-key', actorId: 'operator', ...changes,
    };
}

function teacherCommand(changes = {}) {
    return {
        classId: 'class-a', teacherId: 'teacher', role: 'lead', status: 'active', effectiveFrom: EFFECTIVE,
        idempotencyKey: 'teacher-key', actorId: 'operator', ...changes,
    };
}

function membership(changes = {}) {
    return {
        id: 'membership', classId: 'class-a', studentId: 'student', status: 'active',
        effectiveFrom: '2026-07-01T00:00:00Z', effectiveTo: '', sourceOrderId: '', ...changes,
    };
}

function teacherAssignment(changes = {}) {
    return {
        id: 'assignment', classId: 'class-a', teacherId: 'teacher', role: 'lead', status: 'active',
        effectiveFrom: '2026-07-01T00:00:00Z', effectiveTo: '', ...changes,
    };
}

function operation(requestHash) {
    return {
        id: 'stored', requestSnapshot: { requestHash },
        resultSnapshot: { operationId: 'stored', membershipId: 'membership' },
    };
}

async function rejectStudent(options, changes, code) {
    await assert.rejects(service(mockRepository(options)).setStudentMembership(studentCommand(changes)), hasCode(code));
}

async function rejectTransfer(options, changes, code) {
    await assert.rejects(service(mockRepository(options)).transferStudent(transferCommand(changes)), hasCode(code));
}

function data(plan, collection) {
    return plan.find((item) => item.action === 'create' && item.collection === collection)?.data;
}

function updateData(plan, collection) {
    return plan.find((item) => item.action === 'update' && item.collection === collection)?.data;
}

function ids() {
    let value = 0;
    return () => String(++value).padStart(15, '0');
}

function assertCode(action, code) {
    assert.throws(action, hasCode(code));
}

function hasCode(code) {
    return (error) => error instanceof CourseCreditError && error.code === code;
}
