const test = require('node:test');
const assert = require('node:assert/strict');

const { CourseCreditError } = require('../src/services/courseCredits/domain');
const { fingerprintRequest } = require('../src/services/courseCredits/repositories/operationRepository');
const { assertBatchPlanPolicy } = require('../src/services/courseCredits/repositories/sdkBatchRepository');
const {
    materializeSessionRoster,
    materializeSessionTeachers,
    normalizeClassTeacher,
    normalizeTeacherOverride,
    teacherKey,
} = require('../src/services/courseCredits/sessionPublicationPlanning');
const {
    CourseCreditSessionPublicationService,
    activeAtFilter,
    isNonEmptyObject,
    uniqueIds,
    validateClasses,
    validateDraftSession,
    validatePublicationInput,
} = require('../src/services/courseCredits/sessionPublicationService');

const NOW = '2026-07-17T10:00:00.000Z';
const START = '2026-08-10T10:00:00.000Z';

test('session publication atomically snapshots combined classes, deduplicated roster, and default teachers', async () => {
    const repository = mockRepository();
    const result = await service(repository).publishSession(command());

    assert.equal(result.replayed, false);
    assert.equal(result.rosterCount, 2);
    assert.deepEqual(result.studentIds, ['student-1', 'student-2']);
    assert.doesNotThrow(() => assertBatchPlanPolicy(repository.plan));
    const roster = createdData(repository.plan, 'session_students');
    assert.equal(roster.length, 2);
    assert.deepEqual(roster.find((row) => row.studentId === 'student-1').sourceClassIds, ['class-a', 'class-b']);
    assert.equal(createdData(repository.plan, 'session_classes').length, 2);
    assert.equal(createdData(repository.plan, 'session_teachers').length, 2);
    assert.deepEqual(updateData(repository.plan, 'sessions'), {
        status: 'scheduled', rosterVersion: 2, version: 3,
    });
    assert.equal(data(repository.plan, 'credit_operations').studentId, '');
    assert.equal(data(repository.plan, 'credit_operations').type, 'publish_session');
    assert.equal(data(repository.plan, 'credit_version_claims').expectedVersion, 2);
});

test('session teacher override replaces the inherited role while preserving other roles', async () => {
    const repository = mockRepository();
    const result = await service(repository).publishSession(command({
        teacherOverrides: [{
            teacherId: 'substitute', role: 'lead', assignmentSource: 'substitute', actualStatus: 'confirmed',
        }],
    }));

    assert.deepEqual(result.teacherAssignments, [
        { assignmentSource: 'class_default', role: 'assistant', teacherId: 'assistant' },
        { assignmentSource: 'substitute', role: 'lead', teacherId: 'substitute' },
    ]);
    const teachers = createdData(repository.plan, 'session_teachers');
    assert.equal(teachers.find((row) => row.teacherId === 'substitute').actualStatus, 'confirmed');
    assert.equal(teachers.some((row) => row.teacherId === 'lead'), false);
});

test('materialized roster remains a historical snapshot after source memberships change', () => {
    const groups = studentGroups();
    const roster = materializeSessionRoster(groups, 'session', ids());
    groups[0].memberships[0].status = 'cancelled';
    groups[1].memberships.push({ studentId: 'student-3', status: 'active' });

    assert.deepEqual(roster.map((row) => row.studentId), ['student-1', 'student-2']);
    assert.deepEqual(roster[0].sourceClassIds, ['class-a', 'class-b']);
});

test('publication replays the original result and resolves a same-request batch race', async () => {
    const requestHash = fingerprintRequest({
        sessionId: 'session', classIds: ['class-a', 'class-b'], teacherOverrides: [],
    });
    const replayRepository = mockRepository({ existing: operation(requestHash) });
    const replay = await service(replayRepository).publishSession(command());
    assert.equal(replay.replayed, true);
    assert.equal(replayRepository.plan, null);

    const raced = mockRepository({ raceReplayAfterSend: true });
    assert.equal((await service(raced).publishSession(command())).replayed, true);

    const conflict = mockRepository({ existing: operation('different') });
    await assert.rejects(service(conflict).publishSession(command()), hasCode('IDEMPOTENCY_CONFLICT'));
});

test('publication rejects invalid sessions, classes, credit types, teachers, and storage failures', async () => {
    await reject({}, { sessionId: '' }, 'SESSION_ID_REQUIRED');
    await reject({}, { classIds: [] }, 'SESSION_CLASSES_REQUIRED');
    await reject({}, { classIds: [''] }, 'CLASS_ID_REQUIRED');
    await reject({}, { teacherOverrides: {} }, 'INVALID_TEACHER_OVERRIDES');
    await reject({ session: { status: 'scheduled' } }, {}, 'SESSION_NOT_DRAFT');
    await reject({ session: { endAt: START } }, {}, 'SESSION_TIME_INVALID');
    await reject({ session: { requiredQuantity: 0 } }, {}, 'SESSION_CREDIT_QUANTITY_INVALID');
    await reject({ session: { attendanceRuleSnapshot: {} } }, {}, 'ATTENDANCE_RULE_SNAPSHOT_REQUIRED');
    await reject({ session: { settlementRuleSnapshot: {} } }, {}, 'SETTLEMENT_RULE_SNAPSHOT_REQUIRED');
    await reject({ session: { teacherRuleSnapshot: null } }, {}, 'TEACHER_RULE_SNAPSHOT_REQUIRED');
    await reject({ classes: { 'class-a': { status: 'completed' } } }, {}, 'CLASS_NOT_ACTIVE');
    await reject({ classes: { 'class-b': { defaultCreditTypeId: 'other' } } }, {}, 'CLASS_CREDIT_TYPE_MISMATCH');
    await reject({ creditType: { kind: 'universal', consumable: false } }, {}, 'SESSION_CREDIT_TYPE_INVALID');
    await reject({ assignments: { 'class-a': [], 'class-b': [] } }, {}, 'SESSION_LEAD_TEACHER_REQUIRED');
    await assert.rejects(
        service(mockRepository({ sendError: new Error('failed') })).publishSession(command()),
        (error) => error.code === 'COURSE_CREDIT_BATCH_FAILED'
    );
});

test('publication planning helpers validate override policies and deterministic keys', () => {
    assert.deepEqual(uniqueIds(['b', 'a', 'a']), ['a', 'b']);
    assert.equal(isNonEmptyObject({ version: 1 }), true);
    assert.equal(isNonEmptyObject([]), false);
    assert.equal(isNonEmptyObject(null), false);
    assert.match(activeAtFilter('classId', 'a"', START, 'active'), /effectiveFrom/);
    assert.doesNotThrow(() => validatePublicationInput(command()));
    assert.doesNotThrow(() => validateDraftSession(baseSession()));
    assert.doesNotThrow(() => validateClasses(Object.values(baseClasses()), 'course'));
    assert.equal(teacherKey({ role: 'lead', teacherId: 'teacher' }), 'lead:teacher');
    assert.deepEqual(normalizeClassTeacher({ teacherId: 'teacher', role: 'lead' }), {
        teacherId: 'teacher', role: 'lead', assignmentSource: 'class_default', actualStatus: 'planned',
    });
    assert.deepEqual(normalizeTeacherOverride({ teacherId: 'teacher', role: 'lead' }), {
        teacherId: 'teacher', role: 'lead', assignmentSource: 'session_override', actualStatus: 'planned',
    });
    assertCode(() => normalizeTeacherOverride({ role: 'lead' }), 'TEACHER_ID_REQUIRED');
    assertCode(() => normalizeTeacherOverride({ teacherId: 'x', role: 'bad' }), 'INVALID_TEACHER_ROLE');
    assertCode(() => normalizeTeacherOverride({
        teacherId: 'x', role: 'lead', assignmentSource: 'class_default',
    }), 'INVALID_ASSIGNMENT_SOURCE');
    assertCode(() => normalizeTeacherOverride({
        teacherId: 'x', role: 'lead', actualStatus: 'bad',
    }), 'INVALID_ACTUAL_TEACHER_STATUS');
    assertCode(() => normalizeClassTeacher({ role: 'lead' }), 'TEACHER_ID_REQUIRED');
    assertCode(() => normalizeClassTeacher({ teacherId: 'x', role: 'bad' }), 'INVALID_TEACHER_ROLE');
    assertCode(() => materializeSessionTeachers([{ assignments: [] }], [], 'session', ids()),
        'SESSION_LEAD_TEACHER_REQUIRED');
});

function service(repository) {
    return new CourseCreditSessionPublicationService(repository, {
        clock: () => Date.parse(NOW), idFactory: ids(),
    });
}

function mockRepository(options = {}) {
    const session = { ...baseSession(), ...(options.session || {}) };
    const classes = Object.fromEntries(Object.entries(baseClasses()).map(([id, record]) => [
        id,
        { ...record, ...(options.classes?.[id] || {}) },
    ]));
    const memberships = options.memberships || Object.fromEntries(studentGroups()
        .map((group) => [group.classId, group.memberships]));
    const assignments = options.assignments || Object.fromEntries(teacherGroups()
        .map((group) => [group.classId, group.assignments]));
    return {
        existing: options.existing || null,
        plan: null,
        async findFirst() { return this.existing; },
        async get(collection, id) {
            if (collection === 'sessions') return session;
            if (collection === 'classes') return classes[id];
            if (collection === 'credit_types') return options.creditType || { id, kind: 'course', consumable: true };
            throw new Error(`Unexpected get ${collection}`);
        },
        async list(collection, query) {
            const classId = query.filter.includes('class-b') ? 'class-b' : 'class-a';
            if (collection === 'class_students') return memberships[classId] || [];
            if (collection === 'class_teachers') return assignments[classId] || [];
            throw new Error(`Unexpected list ${collection}`);
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

function baseSession() {
    return {
        id: 'session', status: 'draft', startAt: START, endAt: '2026-08-10T11:00:00Z',
        requiredCreditTypeId: 'course', requiredQuantity: 1,
        attendanceRuleSnapshot: {
            version: 1, present: 'consume', late: 'consume', leave: 'release', absent: 'consume',
        },
        settlementRuleSnapshot: { version: 1, cancelled: 'release' },
        teacherRuleSnapshot: {
            version: 1,
            rules: {
                lead: {
                    ruleId: 'teacher-rule-v1', courseSpecId: 'course-spec',
                    baseQuantity: 1, durationFactor: 0, participantFactor: 0,
                },
            },
        },
        rosterVersion: 1, version: 2,
    };
}

function baseClasses() {
    return {
        'class-a': { id: 'class-a', status: 'active', defaultCreditTypeId: 'course' },
        'class-b': { id: 'class-b', status: 'active', defaultCreditTypeId: 'course' },
    };
}

function studentGroups() {
    return [
        { classId: 'class-a', memberships: [
            { studentId: 'student-1', status: 'active' },
            { studentId: 'student-2', status: 'active' },
            { studentId: 'student-paused', status: 'paused' },
        ] },
        { classId: 'class-b', memberships: [{ studentId: 'student-1', status: 'active' }] },
    ];
}

function teacherGroups() {
    return [
        { classId: 'class-a', assignments: [
            { teacherId: 'lead', role: 'lead', status: 'active' },
            { teacherId: 'assistant', role: 'assistant', status: 'active' },
            { teacherId: 'inactive', role: 'observer', status: 'inactive' },
        ] },
        { classId: 'class-b', assignments: [{ teacherId: 'lead', role: 'lead', status: 'active' }] },
    ];
}

function command(changes = {}) {
    return {
        sessionId: 'session', classIds: ['class-b', 'class-a', 'class-a'], teacherOverrides: [],
        idempotencyKey: 'publish-key', actorId: 'operator', ...changes,
    };
}

function operation(requestHash) {
    return {
        id: 'stored', requestSnapshot: { requestHash },
        resultSnapshot: { operationId: 'stored', sessionId: 'session', rosterCount: 2 },
    };
}

async function reject(options, changes, code) {
    await assert.rejects(service(mockRepository(options)).publishSession(command(changes)), hasCode(code));
}

function data(plan, collection) {
    return plan.find((item) => item.action === 'create' && item.collection === collection)?.data;
}

function createdData(plan, collection) {
    return plan.filter((item) => item.action === 'create' && item.collection === collection).map((item) => item.data);
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
