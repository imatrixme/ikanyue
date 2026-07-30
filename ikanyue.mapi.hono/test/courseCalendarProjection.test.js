const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildFacets,
    buildScheduleEntry,
    publicName,
    relationGroups,
    relationsForSession,
} = require('../src/services/courseCredits/schedule/projection');

test('calendar projections preserve admin detail while redacting learner participants', () => {
    const session = lesson();
    const relations = related();
    const admin = buildScheduleEntry(session, relations, 'admin');
    const teacher = buildScheduleEntry(session, relations, 'teacher');
    const student = buildScheduleEntry(session, relations, 'student');

    assert.equal(admin.course.name, '少儿声乐');
    assert.equal(admin.rawStatus, 'correction_pending');
    assert.equal(admin.status, 'scheduled');
    assert.equal(admin.adjusted, true);
    assert.equal(admin.attention, '教务处理中');
    assert.deepEqual(admin.relationIds, {
        teacherIds: ['teacher-1'], studentIds: ['student-1', 'student-2'], classIds: ['class-1'],
    });
    assert.equal(teacher.participantSummary.label, '林同学、陈同学');
    assert.equal(student.participantSummary.count, 0);
    assert.deepEqual(student.participantSummary.items, []);
    assert.equal('rawStatus' in teacher, false);
    assert.equal('relationIds' in student, false);
});

test('calendar relation grouping and facets are stable and deduplicated', () => {
    assert.equal(relationGroups().size, 0);
    const teachers = relationGroups([
        { sessionId: 'session-1', teacherId: 'teacher-1' },
        { sessionId: '', teacherId: 'ignored' },
    ]);
    const groups = { teachers, students: new Map(), classes: new Map() };
    assert.equal(relationsForSession('session-1', groups).teachers.length, 1);
    assert.deepEqual(relationsForSession('missing', groups), { teachers: [], students: [], classes: [] });

    const first = buildScheduleEntry(lesson(), related(), 'admin');
    const second = buildScheduleEntry(lesson({ id: 'session-2', title: '合唱' }), related(), 'admin');
    const facets = buildFacets([first, second]);
    assert.deepEqual(facets.teachers, [{ id: 'teacher-1', name: '周老师' }]);
    assert.deepEqual(facets.students.map((item) => item.id), ['student-2', 'student-1']);
    assert.deepEqual(facets.classes, [{ id: 'class-1', name: '少儿声乐 A 班' }]);
    assert.equal(publicName({ nickName: '小周' }), '小周');
    assert.equal(publicName({}), '未命名');
});

test('calendar projection fallbacks remain readable with sparse legacy records', () => {
    const sparse = buildScheduleEntry({
        id: 'legacy', requiredCreditTypeId: 'type-legacy', version: 0,
        expand: { requiredCreditTypeId: { id: 'type-legacy', name: '合唱课程点' } },
    }, {
        teachers: [
            { teacherId: 'teacher-1', expand: { teacherId: { username: 'teacher-a' } } },
            { teacherId: 'teacher-2', expand: { teacherId: { sn: 'T002' } } },
            { teacherId: 'teacher-3', expand: { teacherId: { realname: '王老师' } } },
            { teacherId: 'teacher-4' },
        ],
        students: [],
        classes: [
            { classId: 'class-1', expand: { classId: { code: 'C001' } } },
            { classId: 'class-2' },
        ],
    }, 'admin');
    assert.equal(sparse.title, '合唱课时');
    assert.equal(sparse.course.courseId, 'type-legacy');
    assert.equal(sparse.course.name, '合唱课时');
    assert.equal(sparse.startAt, null);
    assert.equal(sparse.originType, 'admin');
    assert.equal(sparse.adjusted, false);
    assert.equal(sparse.version, 1);
    assert.equal(sparse.teacherSummary.overflow, 1);
    assert.equal(sparse.classSummary.label, 'C001、班级课程');
    assert.equal(sparse.appointmentId, null);

    const empty = buildScheduleEntry({ id: 'empty' }, {
        teachers: [], students: [], classes: [],
    }, 'teacher');
    assert.equal(empty.title, '课程');
    assert.equal(empty.course.name, '课程');
    assert.equal(empty.teacherSummary.label, '');
});

function lesson(overrides = {}) {
    const course = { id: 'course-1', name: '少儿声乐', deliveryMode: 'offline' };
    const type = { id: 'type-1', name: '少儿声乐课时', courseSpecId: course.id, expand: { courseSpecId: course } };
    return {
        id: 'session-1', title: '少儿声乐小课', requiredCreditTypeId: type.id,
        startAt: '2026-08-01T01:00:00.000Z', endAt: '2026-08-01T02:00:00.000Z',
        location: '一号教室', status: 'correction_pending', originType: 'appointment',
        appointmentId: 'appointment-1', version: 2,
        expand: { requiredCreditTypeId: type, appointmentId: { id: 'appointment-1', status: 'rescheduled' } },
        ...overrides,
    };
}

function related() {
    return {
        teachers: [{
            sessionId: 'session-1', teacherId: 'teacher-1', role: 'primary',
            expand: { teacherId: { id: 'teacher-1', realName: '周老师' } },
        }],
        students: [
            { sessionId: 'session-1', studentId: 'student-1', expand: { studentId: { id: 'student-1', nickname: '林同学' } } },
            { sessionId: 'session-1', studentId: 'student-2', expand: { studentId: { id: 'student-2', nickname: '陈同学' } } },
        ],
        classes: [{
            sessionId: 'session-1', classId: 'class-1',
            expand: { classId: { id: 'class-1', name: '少儿声乐 A 班' } },
        }],
    };
}
