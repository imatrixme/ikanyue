const test = require('node:test');
const assert = require('node:assert/strict');

const {
    ScheduleQueryService,
    anyIdFilter,
    chunk,
    matchesFilters,
    mergeFacets,
    serializeFilters,
} = require('../src/services/courseCredits/schedule/queryService');

const RANGE = { from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T00:00:00.000Z' };

test('institution calendar projects formal sessions and applies relation filters', async () => {
    const repository = calendarRepository();
    const result = await new ScheduleQueryService(repository).institution({
        ...RANGE, teacherId: 'teacher-1', classId: 'class-1', status: 'scheduled', originType: 'class',
    });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].lessonId, 'session-1');
    assert.equal(result.range.timezone, 'Asia/Shanghai');
    assert.deepEqual(result.filters.status, ['scheduled']);
    assert.equal(result.facets.teachers.find((teacher) => teacher.id === 'teacher-1').name, '周老师');
    assert.equal(result.facets.teachers.find((teacher) => teacher.id === 'teacher-2').name, '郑老师');
    assert.deepEqual(Object.keys(result.facets.teachers.find((teacher) => teacher.id === 'teacher-2')), ['id', 'name']);
    assert.match(repository.calls.find((call) => call.collection === 'sessions').options.filter, /endAt>/);
});

test('teacher and learner calendars use assignment ownership and role-safe projections', async () => {
    const repository = calendarRepository();
    const service = new ScheduleQueryService(repository);
    const teacher = await service.teacher('teacher-1', RANGE);
    const teacherWithAvailability = await service.teacher('teacher-1', {
        ...RANGE, includeAvailability: 'true',
    });
    const teacherOps = await service.teacherOps('teacher-1', RANGE);
    const learner = await service.learner('student-1', RANGE);

    assert.equal(teacher.items[0].participantSummary.label, '林同学');
    assert.equal(learner.items[0].participantSummary.count, 0);
    assert.equal(learner.items[0].teacherSummary.label, '周老师');
    assert.equal(teacherOps.items[0].relationIds.teacherIds[0], 'teacher-1');
    assert.equal(teacherOps.items[0].version, 1);
    assert.deepEqual(teacher.availability, []);
    assert.deepEqual(teacherWithAvailability.availability, []);
    const teacherScope = repository.calls.find((call) => call.collection === 'session_teachers'
        && call.options.filter.includes('teacherId='));
    const studentScope = repository.calls.find((call) => call.collection === 'session_students'
        && call.options.filter.includes('studentId='));
    assert.match(teacherScope.options.filter, /actualStatus!="cancelled"/);
    assert.match(studentScope.options.filter, /attendanceStatus!="cancelled"/);
    await assert.rejects(service.teacher('', RANGE), hasCode('CALENDAR_TEACHER_REQUIRED'));
    await assert.rejects(service.teacherOps('', RANGE), hasCode('CALENDAR_TEACHER_REQUIRED'));
    await assert.rejects(service.learner('', RANGE), hasCode('CALENDAR_STUDENT_REQUIRED'));
});

test('upcoming schedule limits results, filters statuses, and rejects unsupported roles', async () => {
    const repository = calendarRepository();
    const service = new ScheduleQueryService(repository, {
        clock: () => Date.parse('2026-08-01T00:30:00.000Z'),
    });
    const teacher = await service.upcoming({ id: 'teacher-1', role: 'teacher' }, { limit: 1 });
    const student = await service.upcoming({ id: 'student-1', role: 'student' });

    assert.equal(teacher.items.length, 1);
    assert.equal(student.items[0].lessonId, 'session-1');
    const upcomingCall = repository.calls.find((call) => call.method === 'page'
        && call.collection === 'session_teachers');
    assert.match(upcomingCall.options.filter, /sessionId.status="scheduled"/);
    assert.match(upcomingCall.options.filter, /sessionId.endAt>/);
    await assert.rejects(service.upcoming({ id: 'operator', role: 'admin' }),
        hasCode('CALENDAR_ROLE_UNSUPPORTED'));
    await assert.rejects(service.upcoming({ role: 'teacher' }), hasCode('CALENDAR_PRINCIPAL_REQUIRED'));
});

test('query helpers and density guard cover empty, chunked, and filtered cases', async () => {
    assert.equal(anyIdFilter('id', ['a', 'b']), '(id="a" || id="b")');
    assert.deepEqual(chunk(['a', 'b', 'c'], 2), [['a', 'b'], ['c']]);
    assert.deepEqual(mergeFacets([{ id: 'b', name: '乙' }], [{ id: 'a', name: '甲' }, { id: 'b', name: '重复' }]), [
        { id: 'a', name: '甲' }, { id: 'b', name: '乙' },
    ]);
    assert.deepEqual(serializeFilters({
        teacherId: '', studentId: '', classId: '', courseSpecId: '', statuses: [], origins: [],
    }), {
        teacherId: '', studentId: '', classId: '', courseSpecId: '', status: [], originType: [],
    });
    const entry = {
        relationIds: { teacherIds: ['t'], studentIds: ['s'], classIds: ['c'] },
        course: { courseId: 'course' }, rawStatus: 'completed', originType: 'admin',
    };
    assert.equal(matchesFilters(entry, {
        teacherId: 't', studentId: 's', classId: 'c', courseSpecId: 'course',
        statuses: ['completed'], origins: ['admin'],
    }), true);
    assert.equal(matchesFilters(entry, {
        teacherId: 'other', studentId: '', classId: '', courseSpecId: '', statuses: [], origins: [],
    }), false);

    const service = new ScheduleQueryService(calendarRepository({ sessions: [] }));
    assert.deepEqual(await service.sessionsByIds([]), []);
    assert.deepEqual(await service.projectSessions([], 'admin'), []);
    const dense = calendarRepository();
    dense.pageTotal = 501;
    await assert.rejects(new ScheduleQueryService(dense).institution(RANGE),
        hasCode('CALENDAR_RANGE_TOO_DENSE'));

    const ordered = await new ScheduleQueryService(calendarRepository({ sessions: [
        session({ id: 'session-2', startAt: '' }), session({ id: 'session-1', startAt: '' }),
    ] })).sessionsByIds(['session-2', 'session-1']);
    assert.deepEqual(ordered.map((item) => item.id), ['session-1', 'session-2']);
    const projected = await new ScheduleQueryService(calendarRepository()).projectSessions([
        session({ id: 'session-b' }), session({ id: 'session-a' }),
    ], 'teacher');
    assert.deepEqual(projected.map((item) => item.lessonId), ['session-a', 'session-b']);

    const emptyRepository = calendarRepository();
    emptyRepository.page = async () => ({});
    const emptyService = new ScheduleQueryService(emptyRepository);
    assert.deepEqual(await emptyService.institution(RANGE), {
        range: { ...RANGE, timezone: 'Asia/Shanghai' },
        filters: {
            teacherId: '', studentId: '', classId: '', courseSpecId: '', status: [], originType: [],
        },
        facets: {
            teachers: [{ id: 'teacher-2', name: '郑老师' }], students: [], classes: [], courses: [],
        },
        items: [],
    });
    assert.deepEqual(await emptyService.upcoming({ id: 'student', role: 'student' }), {
        timezone: 'Asia/Shanghai', items: [],
    });
});

function calendarRepository(options = {}) {
    const sessions = options.sessions || [session()];
    const teachers = [{
        sessionId: 'session-1', teacherId: 'teacher-1', role: 'primary', actualStatus: 'assigned',
        expand: { teacherId: { id: 'teacher-1', realName: '周老师' } },
    }];
    const students = [{
        sessionId: 'session-1', studentId: 'student-1', attendanceStatus: 'scheduled',
        expand: { studentId: { id: 'student-1', nickname: '林同学' } },
    }];
    const classes = [{
        sessionId: 'session-1', classId: 'class-1',
        expand: { classId: { id: 'class-1', name: '少儿声乐 A 班' } },
    }];
    return {
        calls: [],
        pageTotal: sessions.length,
        async page(collection, page, perPage, requestOptions) {
            this.calls.push({ method: 'page', collection, page, perPage, options: requestOptions });
            if (collection === 'sessions') {
                return { page, perPage, totalItems: this.pageTotal, items: sessions };
            }
            const items = collection === 'session_teachers' ? teachers : students;
            return { page, perPage, totalItems: items.length, items };
        },
        async list(collection, requestOptions) {
            this.calls.push({ method: 'list', collection, options: requestOptions });
            if (collection === 'sessions') {
                return sessions.filter((item) => requestOptions.filter.includes(`id="${item.id}"`));
            }
            if (collection === 'session_teachers') return teachers;
            if (collection === 'session_students') return students;
            if (collection === 'session_classes') return classes;
            if (collection === 'teachers') return [{
                id: 'teacher-2', realName: '郑老师', cellphone: 'secret', password: 'secret',
            }];
            return [];
        },
    };
}

function session(overrides = {}) {
    const course = { id: 'course-1', name: '少儿声乐' };
    const type = { id: 'type-1', courseSpecId: course.id, expand: { courseSpecId: course } };
    return {
        id: 'session-1', title: '声乐小课', startAt: '2026-08-01T01:00:00.000Z',
        endAt: '2026-08-01T02:00:00.000Z', status: 'scheduled', originType: 'class',
        requiredCreditTypeId: type.id, expand: { requiredCreditTypeId: type }, ...overrides,
    };
}

function hasCode(code) {
    return (error) => error?.code === code;
}
