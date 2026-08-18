const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseCreditMigrationInventoryService,
    hasLegacyHours,
    mergeSessions,
    optionalList,
    projectAttendance,
    projectHours,
    projectProgram,
    projectSession,
    projectTarget,
    recordLabel,
} = require('../src/services/courseCredits/migrationInventoryService');
const { normalizeMigrationPlan, previewMigrationPlan } = require('../src/services/courseCredits/migrationPlan');

test('migration inventory discovers optional legacy sources without exposing account payloads', async () => {
    const repository = {
        async list(collection) {
            if (collection === 'students') return [
                { id: 'student', realname: '学员甲', hours: 4, password: 'private' },
                { id: 'student-empty', nickname: '学员乙' },
            ];
            if (collection === 'teachers') return [{ id: 'teacher', nickName: '教师甲', hours: 2.5 }];
            if (collection === 'learning_programs') return [{ id: 'program', title: '旧声乐项目' }];
            if (collection === 'lesson_records') return [{
                id: 'session', name: '历史课次', startTime: '2026-01-01T10:00:00Z',
                endTime: '2026-01-01T11:00:00Z', userId: ['student'], teacherId: 'teacher',
            }];
            if (collection === 'attendance_records') return [{
                id: 'attendance', lessonId: 'session', userId: 'student', status: 'present',
            }];
            if (collection === 'credit_types') return [
                { id: 'credit', code: 'VOICE', name: '声乐课时', kind: 'course', consumable: true, status: 'active' },
                { id: 'universal', kind: 'universal', consumable: false, status: 'active' },
            ];
            if (collection === 'packages') return [{ id: 'package', name: '声乐课包', status: 'active' }];
            if (collection === 'classes') return [{ id: 'class', code: 'CLASS-A', status: 'active' }];
            throw Object.assign(new Error('missing'), { status: 404 });
        },
    };
    const inventory = await new CourseCreditMigrationInventoryService(repository).inventory();

    assert.equal(inventory.availability.sessions, false);
    assert.equal(inventory.availability.lessons, true);
    assert.deepEqual(inventory.studentHours, [{ id: 'student', label: '学员甲', hours: 4 }]);
    assert.deepEqual(inventory.teacherHours, [{ id: 'teacher', label: '教师甲', hours: 2.5 }]);
    assert.equal(inventory.programs[0].name, '旧声乐项目');
    assert.equal(inventory.sessions[0].studentId, 'student');
    assert.equal(inventory.attendance[0].sessionId, 'session');
    assert.deepEqual(inventory.targets.creditTypes, [{
        code: 'VOICE', id: 'credit', name: '声乐课时', status: 'active',
    }]);
    assert.equal(inventory.targets.classes[0].name, 'CLASS-A');
    assert.deepEqual(inventory.totals, {
        attendance: 1, programs: 1, sessions: 1, studentHours: 4,
        students: 1, teacherHours: 2.5, teachers: 1,
    });
    assert.equal(JSON.stringify(inventory).includes('password'), false);
});

test('zero-difference explicit mappings are release-ready', () => {
    const preview = previewMigrationPlan(inventory(), fullPlan());
    assert.equal(preview.ready, true);
    assert.equal(preview.report.differences.length, 0);
    assert.deepEqual(preview.report.unmapped, {
        attendance: [], programs: [], sessions: [], studentHours: [], teacherHours: [],
    });
    assert.equal(preview.report.mapped.studentHours, 4);
    assert.equal(preview.report.mapped.teacherHours, 2.5);
    assert.equal(preview.plan.sessions[0].attendees[0].attendanceStatus, 'present');
});

test('preview reports unexplained quantities and every unmapped legacy source', () => {
    const preview = previewMigrationPlan(inventory(), {
        studentHours: [{
            studentId: 'student', allocations: [{
                creditTypeId: 'credit', quantity: 3, activationMode: 'GRANT_TIME',
                expiryPolicy: 'NO_EXPIRY', reason: '人工核对旧课时',
            }],
        }],
    });
    assert.equal(preview.ready, false);
    assert.deepEqual(preview.report.differences[0], {
        sourceId: 'student', sourceQuantity: 4, mappedQuantity: 3, difference: -1, type: 'student_hours',
    });
    assert.deepEqual(preview.report.unmapped.programs, ['program']);
    assert.deepEqual(preview.report.unmapped.sessions, ['session']);
    assert.deepEqual(preview.report.unmapped.teacherHours, ['teacher']);
    assert.deepEqual(preview.report.unmapped.attendance, ['attendance']);
});

test('migration plan rejects guesses, duplicates, invalid dates, and incomplete policies', () => {
    const baseAllocation = {
        creditTypeId: 'credit', quantity: 4, activationMode: 'GRANT_TIME',
        expiryPolicy: 'NO_EXPIRY', reason: '人工核对旧课时',
    };
    assert.throws(() => normalizeMigrationPlan(null), hasCode('MIGRATION_PLAN_REQUIRED'));
    assert.throws(() => normalizeMigrationPlan({
        studentHours: [{ studentId: 'student', allocations: [] }],
    }), hasCode('MIGRATION_ALLOCATION_REQUIRED'));
    assert.throws(() => normalizeMigrationPlan({
        studentHours: [{ studentId: 'student', allocations: [{ ...baseAllocation, quantity: 0 }] }],
    }), hasCode('MIGRATION_QUANTITY_INVALID'));
    assert.throws(() => normalizeMigrationPlan({
        studentHours: [{ studentId: 'student', allocations: [{
            ...baseAllocation, activationMode: 'FIRST_CHECK_IN',
        }] }],
    }), hasCode('MIGRATION_ACTIVATION_DEADLINE_INVALID'));
    assert.throws(() => normalizeMigrationPlan({
        studentHours: [{ studentId: 'student', allocations: [{
            ...baseAllocation, expiryPolicy: 'FIXED_DURATION',
        }] }],
    }), hasCode('MIGRATION_VALIDITY_INVALID'));
    assert.throws(() => normalizeMigrationPlan({
        programs: [{ legacyProgramId: 'program', targetType: 'guess', targetId: 'target', reason: '人工确认分类' }],
    }), hasCode('MIGRATION_PROGRAM_TYPE_INVALID'));
    assert.throws(() => normalizeMigrationPlan({
        sessions: [{ ...fullPlan().sessions[0], endAt: 'invalid' }],
    }), hasCode('MIGRATION_SESSION_END_INVALID'));
    assert.throws(() => normalizeMigrationPlan({
        sessions: [{ ...fullPlan().sessions[0], attendees: [
            { studentId: 'student', attendanceStatus: 'present' },
            { studentId: 'student', attendanceStatus: 'late' },
        ] }],
    }), hasCode('MIGRATION_SESSION_STUDENT_DUPLICATE'));
});

test('preview rejects unknown and multiply-used source records', () => {
    assert.throws(() => previewMigrationPlan(inventory(), {
        ...fullPlan(),
        sessions: [{ ...fullPlan().sessions[0], attendanceRecordIds: ['missing'] }],
    }), hasCode('MIGRATION_ATTENDANCE_UNKNOWN'));
    assert.throws(() => previewMigrationPlan(inventory(), {
        ...fullPlan(), studentHours: [fullPlan().studentHours[0], fullPlan().studentHours[0]],
    }), hasCode('MIGRATION_STUDENT_DUPLICATE'));
    assert.throws(() => previewMigrationPlan(inventory(), {
        ...fullPlan(), programs: [{ ...fullPlan().programs[0], legacyProgramId: 'missing' }],
    }), hasCode('MIGRATION_PROGRAM_UNKNOWN'));
});

test('inventory helper contracts handle alternate legacy shapes and real errors', async () => {
    assert.equal(hasLegacyHours({ hours: '1.5' }), true);
    assert.equal(hasLegacyHours({ hours: 0 }), false);
    assert.equal(recordLabel({ username: 'account' }), 'account');
    assert.equal(recordLabel({}), '未命名');
    assert.deepEqual(projectHours({ id: 'id', sn: 'S1', hours: '2' }), { id: 'id', label: 'S1', hours: 2 });
    assert.equal(projectProgram({ id: 'id' }).name, 'id');
    assert.equal(projectSession({ id: 'id', created: '2026-01-01' }).title, '历史课堂 id');
    assert.equal(projectAttendance({ id: 'id', studentId: ['student'] }).studentId, 'student');
    assert.equal(projectTarget({ id: 'id', code: 'CODE' }).name, 'CODE');
    assert.deepEqual(projectTarget({}), { code: '', id: '', name: '', status: '' });
    assert.equal(mergeSessions([{ id: 'same', title: 'first' }], [{ id: 'same', title: 'second' }])[0].title, 'second');
    await assert.rejects(optionalList({ async list() { throw new Error('storage'); } }, 'x'), /storage/);
});

function inventory() {
    return {
        availability: { students: true, teachers: true, programs: true, sessions: true, lessons: false, attendance: true },
        attendance: [{ id: 'attendance', sessionId: 'session', studentId: 'student', status: 'present' }],
        programs: [{ id: 'program', name: '旧项目' }],
        sessions: [{ id: 'session', title: '旧课堂' }],
        studentHours: [{ id: 'student', label: '学员', hours: 4 }],
        teacherHours: [{ id: 'teacher', label: '教师', hours: 2.5 }],
        totals: {
            attendance: 1, programs: 1, sessions: 1, studentHours: 4,
            students: 1, teacherHours: 2.5, teachers: 1,
        },
    };
}

function fullPlan() {
    return {
        studentHours: [{
            studentId: 'student', allocations: [{
                creditTypeId: 'credit', quantity: 4, activationMode: 'GRANT_TIME',
                expiryPolicy: 'FIXED_DURATION', validityDurationDays: 180, reason: '人工核对旧课时',
            }],
        }],
        teacherHours: [{ teacherId: 'teacher', quantity: 2.5, reason: '人工核对教师旧课时' }],
        programs: [{
            legacyProgramId: 'program', targetType: 'class', targetId: 'class', reason: '教务人工确认分类',
        }],
        sessions: [{
            legacySessionId: 'session', code: 'MIG-SESSION', title: '历史课堂',
            startAt: '2026-01-01T10:00:00Z', endAt: '2026-01-01T11:00:00Z', location: '旧教室',
            requiredCreditTypeId: 'credit', requiredQuantity: 1, reason: '历史课堂无扣点导入',
            attendanceRecordIds: ['attendance'],
            attendees: [{ studentId: 'student', attendanceStatus: 'present' }],
            teachers: [{ teacherId: 'teacher', role: 'lead', actualStatus: 'confirmed' }],
        }],
    };
}

function hasCode(code) {
    return (error) => error.code === code;
}
