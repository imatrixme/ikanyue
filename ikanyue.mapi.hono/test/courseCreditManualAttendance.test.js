const test = require('node:test');
const assert = require('node:assert/strict');

const {
    ManualAttendanceService,
    attendancePlan,
    authorizeSessionActor,
    isAssignedTeachingActor,
    previewStudent,
    validateAttendanceInput,
    validateEditableSession,
} = require('../src/services/courseCredits/manualAttendanceService');

const NOW = Date.parse('2026-07-23T08:00:00Z');

test('manual attendance updates one roster entry with version claim, audit, and outbox', async () => {
    const repository = mockRepository();
    const result = await service(repository).setAttendance(command({ attendanceStatus: 'late' }));

    assert.equal(result.attendanceStatus, 'late');
    assert.equal(result.replayed, false);
    assert.equal(updated(repository.plan, 'session_students').data.attendanceStatus, 'late');
    assert.equal(updated(repository.plan, 'session_students').data.checkedInAt, new Date(NOW).toISOString());
    assert.equal(created(repository.plan, 'credit_version_claims').data.expectedVersion, 2);
    assert.equal(created(repository.plan, 'ops_audit_logs').data.action, 'course_operations.lesson.attendance');
    assert.equal(created(repository.plan, 'outbox_events').data.topic, 'course-session.attendance-updated');
});

test('bulk present updates every non-cancelled roster entry and preserves explicit exceptions later', async () => {
    const repository = mockRepository({ roster: [roster(), roster({ id: 'roster-2', studentId: 'student-2', version: 4 })] });
    const result = await service(repository).markAllPresent(command({ sessionStudentId: undefined, attendanceStatus: undefined }));

    assert.equal(result.updatedCount, 2);
    assert.equal(repository.plan.filter((item) => item.collection === 'session_students').length, 2);
    assert.deepEqual(repository.plan.filter((item) => item.collection === 'credit_version_claims')
        .map((item) => item.data.expectedVersion), [2, 4]);
    assert.match(repository.calls.find((call) => call.collection === 'session_students').options.filter,
        /attendanceStatus!="cancelled"/);
});

test('actual teacher confirmation is atomic and assigned teachers can operate only their lessons', async () => {
    const repository = mockRepository({ assignment: { id: 'assigned' } });
    const result = await service(repository).setActualTeacher(command({
        sessionStudentId: undefined, attendanceStatus: undefined, sessionTeacherId: 'teacher-row',
        actualStatus: 'confirmed', actorRole: 'teacher', actorId: 'teacher-1',
    }));

    assert.equal(result.actualStatus, 'confirmed');
    assert.equal(updated(repository.plan, 'session_teachers').data.actualStatus, 'confirmed');
    assert.match(repository.findFilters.at(-1), /teacherId="teacher-1"/);

    await assert.rejects(service(mockRepository({
        assignment: { id: 'assigned' },
        teacherRecord: teacher({ teacherId: 'teacher-2' }),
    })).setActualTeacher(command({
        sessionStudentId: undefined, attendanceStatus: undefined, sessionTeacherId: 'teacher-row',
        actualStatus: 'confirmed', actorRole: 'teacher', actorId: 'teacher-1',
    })), hasCode('SESSION_TEACHER_TARGET_FORBIDDEN'));

    const forbidden = mockRepository({ assignment: null });
    await assert.rejects(service(forbidden).setAttendance(command({ actorRole: 'teacher', actorId: 'other' })),
        hasCode('SESSION_TEACHER_FORBIDDEN'));
    await assert.doesNotReject(authorizeSessionActor(forbidden, { actorRole: 'admin' }, 'session-1'));
    await assert.doesNotReject(authorizeSessionActor(forbidden, {
        actorRole: 'teacher', actorTeachingScope: 'global',
    }, 'session-1'));
    assert.equal(isAssignedTeachingActor({ actorRole: 'teacher', actorTeachingScope: 'global' }), false);
});

test('settlement preview reports consume, release, unresolved rows, and teacher workload without writes', async () => {
    const repository = mockRepository({
        session: completedSession(),
        roster: [
            roster({ attendanceStatus: 'present' }),
            roster({ id: 'leave', studentId: 'student-2', attendanceStatus: 'leave' }),
            roster({ id: 'missing', studentId: 'student-3', attendanceStatus: 'absent', creditStatus: 'credit_insufficient' }),
        ],
        teachers: [teacher()],
    });
    const result = await service(repository).previewSettlement('session-1');

    assert.equal(result.canSettle, false);
    assert.deepEqual(result.students.map((item) => item.action), ['consume', 'release', 'exception']);
    assert.match(result.students[2].exception, /课时不足/);
    assert.equal(result.teachers[0].action, 'earn');
    assert.equal(result.teachers[0].quantity, 1.2);
    assert.equal(repository.plan.length, 0);
});

test('settlement preview handles unfinished attendance and cancellation compensation', async () => {
    const pending = previewStudent(completedSession(), roster({ attendanceStatus: 'scheduled' }));
    assert.equal(pending.action, 'exception');
    assert.match(pending.exception, /出勤登记/);

    const invalidRules = previewStudent(completedSession({ attendanceRuleSnapshot: {} }), roster({ attendanceStatus: 'present' }));
    assert.match(invalidRules.exception, /规则/);

    const cancelled = mockRepository({
        session: completedSession({ status: 'cancelled' }),
        roster: [roster({ attendanceStatus: 'cancelled' })],
        teachers: [teacher()],
    });
    const result = await service(cancelled).previewSettlement('session-1');
    assert.equal(result.students[0].action, 'release');
    assert.equal(result.teachers[0].action, 'compensate');
    assert.equal(result.teachers[0].quantity, 0.5);

    const correction = mockRepository({
        session: completedSession({ status: 'correction_pending', correctionBaseStatus: 'completed', settlementOperationId: 'old' }),
        roster: [roster({ attendanceStatus: 'present' })], teachers: [teacher()],
    });
    assert.equal((await service(correction).previewSettlement('session-1')).sessionStatus, 'completed');
});

test('manual attendance validation rejects invalid ids, states, mismatches, and empty rosters', async () => {
    for (const [input, code] of [
        [{}, 'SESSION_ID_REQUIRED'],
        [{ sessionId: 'session-1' }, 'SESSION_STUDENT_ID_REQUIRED'],
        [{ sessionId: 'session-1', sessionStudentId: 'row', attendanceStatus: 'scheduled' }, 'ATTENDANCE_STATUS_INVALID'],
    ]) assert.throws(() => validateAttendanceInput(input), hasCode(code));

    assert.throws(() => validateEditableSession(completedSession({ status: 'settled' })), hasCode('SESSION_ATTENDANCE_LOCKED'));
    assert.throws(() => validateEditableSession(null), hasCode('SESSION_ATTENDANCE_LOCKED'));

    await assert.rejects(service(mockRepository({ rosterRecord: roster({ sessionId: 'other' }) })).setAttendance(command()),
        hasCode('ATTENDANCE_ROSTER_MISMATCH'));
    await assert.rejects(service(mockRepository({ roster: [] })).markAllPresent(command({ sessionStudentId: undefined })),
        hasCode('SESSION_ROSTER_REQUIRED'));
    await assert.rejects(service(mockRepository()).setActualTeacher(command({
        sessionStudentId: undefined, sessionTeacherId: '', actualStatus: 'confirmed',
    })), hasCode('SESSION_TEACHER_ID_REQUIRED'));
    await assert.rejects(service(mockRepository()).setActualTeacher(command({
        sessionStudentId: undefined, sessionTeacherId: 'row', actualStatus: 'planned',
    })), hasCode('ACTUAL_TEACHER_STATUS_INVALID'));
    await assert.rejects(service(mockRepository({ teacherRecord: teacher({ sessionId: 'other' }) })).setActualTeacher(command({
        sessionStudentId: undefined, sessionTeacherId: 'teacher-row', actualStatus: 'absent',
    })), hasCode('ACTUAL_TEACHER_SESSION_MISMATCH'));
    await assert.rejects(service(mockRepository({ session: completedSession({ status: 'scheduled' }) })).previewSettlement('session-1'),
        hasCode('SESSION_NOT_SETTLEABLE'));
    await assert.rejects(service(mockRepository()).previewSettlement(''), hasCode('SESSION_ID_REQUIRED'));
});

test('attendance helpers cover leave timestamp preservation, unknown status, and replay', async () => {
    assert.equal(previewStudent(completedSession(), roster({ creditStatus: 'pending' })).exception, '课时状态尚未准备完成');
    const repository = mockRepository();
    const context = {
        at: new Date(NOW).toISOString(), operationId: 'operation', input: command(),
        result: { sessionId: 'session-1' }, requestHash: 'hash', scopedKey: 'key',
    };
    const plan = attendancePlan({ idFactory: () => 'id' }, context, [roster({ checkedInAt: 'old' })], 'leave');
    assert.equal(updated(plan, 'session_students').data.checkedInAt, 'old');
    const emptyTimestamp = attendancePlan({ idFactory: () => 'id' }, {
        ...context, input: { ...context.input, actorRole: '' },
    }, [roster({ checkedInAt: '' })], 'leave');
    assert.equal(updated(emptyTimestamp, 'session_students').data.checkedInAt, '');
    assert.equal(created(emptyTimestamp, 'ops_audit_logs').data.actorRole, 'admin');

    const replayHash = require('../src/services/courseCredits/repositories/operationRepository').fingerprintRequest({
        sessionId: 'session-1', sessionStudentId: 'roster-1', attendanceStatus: 'present',
    });
    const replay = await service(mockRepository({ existingOperation: {
        requestSnapshot: { requestHash: replayHash }, resultSnapshot: { operationId: 'stored' },
    } })).setAttendance(command());
    assert.equal(replay.replayed, true);

    const allPresentHash = require('../src/services/courseCredits/repositories/operationRepository').fingerprintRequest({
        sessionId: 'session-1',
    });
    const bulkReplay = await service(mockRepository({ existingOperation: {
        requestSnapshot: { requestHash: allPresentHash }, resultSnapshot: { operationId: 'bulk-stored' },
    } })).markAllPresent(command({ sessionStudentId: undefined, attendanceStatus: undefined }));
    assert.equal(bulkReplay.replayed, true);

    const teacherHash = require('../src/services/courseCredits/repositories/operationRepository').fingerprintRequest({
        sessionId: 'session-1', sessionTeacherId: 'teacher-row', actualStatus: 'confirmed',
    });
    const teacherReplay = await service(mockRepository({ existingOperation: {
        requestSnapshot: { requestHash: teacherHash }, resultSnapshot: { operationId: 'teacher-stored' },
    } })).setActualTeacher(command({
        sessionStudentId: undefined, attendanceStatus: undefined,
        sessionTeacherId: 'teacher-row', actualStatus: 'confirmed',
    }));
    assert.equal(teacherReplay.replayed, true);
});

test('manual attendance constructor defaults remain callable', () => {
    const defaults = new ManualAttendanceService(mockRepository());
    assert.equal(typeof defaults.clock, 'function');
    assert.equal(typeof defaults.idFactory, 'function');
});

function mockRepository(options = {}) {
    return {
        calls: [],
        findFilters: [],
        plan: [],
        async get(collection) {
            if (collection === 'sessions') return options.session || session();
            if (collection === 'session_students') return options.rosterRecord || roster();
            if (collection === 'session_teachers') return options.teacherRecord || teacher();
            if (collection === 'credit_types') return { id: 'type-1', courseSpecId: 'course-1' };
            return null;
        },
        async list(collection, requestOptions) {
            this.calls.push({ collection, options: requestOptions });
            if (collection === 'session_students') return options.roster === undefined ? [roster()] : options.roster;
            if (collection === 'session_teachers') return options.teachers || [teacher()];
            return [];
        },
        async findFirst(collection, filter) {
            this.findFilters.push(filter);
            if (collection === 'credit_operations') return options.existingOperation || null;
            if (collection === 'session_teachers') return options.assignment === undefined ? { id: 'assigned' } : options.assignment;
            return null;
        },
        async send(plan) {
            this.plan = plan;
            return plan;
        },
    };
}

function service(repository) {
    let index = 0;
    return new ManualAttendanceService(repository, {
        clock: () => NOW,
        idFactory: () => `id-${++index}`,
    });
}

function command(overrides = {}) {
    return {
        sessionId: 'session-1', sessionStudentId: 'roster-1', attendanceStatus: 'present',
        idempotencyKey: 'attendance-key', actorId: 'admin', actorRole: 'admin', traceId: 'trace', ...overrides,
    };
}

function session(overrides = {}) {
    return { id: 'session-1', status: 'scheduled', requiredQuantity: 1, requiredCreditTypeId: 'type-1', ...overrides };
}

function completedSession(overrides = {}) {
    return {
        ...session(), status: 'completed', startAt: '2026-07-23T06:00:00Z', endAt: '2026-07-23T07:00:00Z',
        attendanceRuleSnapshot: { version: 1, present: 'consume', late: 'consume', leave: 'release', absent: 'consume' },
        settlementRuleSnapshot: { version: 1, cancelled: 'release' },
        teacherRuleSnapshot: {
            version: 1,
            rules: {
                lead: {
                    ruleId: 'rule-1', courseSpecId: 'course-1', baseQuantity: 1,
                    durationFactor: 0.1, participantFactor: 0.1,
                    cancellationCompensation: { quantity: 0.5, eligibleActualStatuses: ['confirmed'] },
                },
            },
        },
        ...overrides,
    };
}

function roster(overrides = {}) {
    return {
        id: 'roster-1', sessionId: 'session-1', studentId: 'student-1', attendanceStatus: 'present',
        creditStatus: 'reserved', checkedInAt: '', version: 2, ...overrides,
    };
}

function teacher(overrides = {}) {
    return {
        id: 'teacher-row', sessionId: 'session-1', teacherId: 'teacher-1', role: 'lead',
        actualStatus: 'confirmed', creditStatus: 'not_eligible', ...overrides,
    };
}

function created(plan, collection) {
    return plan.find((item) => item.action === 'create' && item.collection === collection);
}

function updated(plan, collection) {
    return plan.find((item) => item.action === 'update' && item.collection === collection);
}

function hasCode(code) {
    return (error) => error?.code === code;
}
