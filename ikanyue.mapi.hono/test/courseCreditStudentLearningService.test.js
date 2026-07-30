const test = require('node:test');
const assert = require('node:assert/strict');

const {
    StudentLearningService,
    attendanceResult,
    buildCourseSummaries,
    eventPresentation,
    isUpcomingLesson,
    learningNotice,
    lessonHourResult,
    lessonQueryOptions,
    lessonStatus,
    mapCourseSource,
    mapLesson,
    mapLessonRecord,
    recordQueryOptions,
    sourceStatus,
} = require('../src/services/courseCredits/studentLearningService');
const {
    assertStudentLearningProjection,
    sanitizeStudentText,
} = require('../src/services/courseCredits/studentLearningContract');

const NOW = Date.parse('2026-07-23T08:00:00.000Z');

test('learning overview returns course language, next lesson, warnings, and recent records', async () => {
    const repository = mockRepository({
        batches: [batch(), batch({
            id: 'later', availableQuantity: 2, frozenQuantity: 1, consumedQuantity: 2,
            effectiveExpiresAt: '2026-09-01T00:00:00.000Z',
        })],
        lessons: [lesson(), lesson({
            id: 'needs-help', creditStatus: 'credit_insufficient',
            session: session({ id: 'lesson-help', title: '补充课程点', startAt: '2026-07-25T08:00:00.000Z' }),
        })],
        events: [event()],
        teachers: [lessonTeacher()],
        classes: [lessonClass()],
    });

    const result = await new StudentLearningService(repository, {
        clock: () => NOW, recentLimit: 2, expiryWarningDays: 30,
    }).overview('student-1');

    assert.equal(result.nextLesson.lessonId, 'lesson-1');
    assert.equal(result.upcomingLessons.length, 2);
    assert.equal(result.nextLesson.teacherSummary.label, '周老师');
    assert.equal(result.nextLesson.classSummary.label, '少儿声乐 A 班');
    assert.equal(result.courses[0].courseName, '声乐一对一');
    assert.equal(result.courses[0].remainingLessons, 5);
    assert.equal(result.courses[0].scheduledLessons, 2);
    assert.equal(result.courses[0].completedLessons, 3);
    assert.equal(result.courses[0].expiringSoon, true);
    assert.equal(result.warnings[0].lessonId, 'lesson-help');
    assert.equal(result.warnings[0].title, '补充课时');
    assert.equal(result.recentRecords[0].title, '已完成课程');
    assert.doesNotMatch(JSON.stringify(result), /课程点|batchId|creditTypeId|frozenQuantity|operationNo/);
    assert.match(repository.calls.find((call) => call.collection === 'credit_batches').options.filter,
        /studentId="student-1"/);

    const empty = await new StudentLearningService(mockRepository(), { clock: () => NOW }).overview('student-1');
    assert.equal(empty.nextLesson, null);
    assert.deepEqual(empty.recentRecords, []);
});

test('course detail aggregates sources and filters related lessons and records', async () => {
    const repository = mockRepository({
        batches: [batch(), batch({
            id: 'other', creditType: creditType({ id: 'other-type', courseSpec: courseSpec({ id: 'other-course', name: '合唱' }) }),
        })],
        lessons: [lesson(), lesson({
            session: session({
                id: 'other-lesson',
                creditType: creditType({ id: 'other-type', courseSpec: courseSpec({ id: 'other-course', name: '合唱' }) }),
            }),
        })],
        events: [event(), event({
            id: 'other-event',
            creditType: creditType({ id: 'other-type', courseSpec: courseSpec({ id: 'other-course', name: '合唱' }) }),
        })],
    });
    const service = new StudentLearningService(repository, { clock: () => NOW });

    const result = await service.getCourse('student-1', 'course-1');

    assert.equal(result.courseId, 'course-1');
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].initialLessons, 4);
    assert.equal(result.recentLessons.length, 1);
    assert.equal(result.recentRecords.length, 1);
    await assert.rejects(service.getCourse('student-1', 'missing'), hasCode('LEARNING_COURSE_NOT_FOUND'));
    await assert.rejects(service.getCourse('student-1', ''), hasCode('LEARNING_COURSE_ID_REQUIRED'));
});

test('lesson and record lists preserve pagination and authenticated ownership filters', async () => {
    const repository = mockRepository({ lessons: [lesson()], events: [event()] });
    const service = new StudentLearningService(repository, { clock: () => NOW });

    const upcoming = await service.listLessons('student-1', {
        page: '2', perPage: '5', scope: 'upcoming', courseId: 'course-1',
    });
    assert.deepEqual([upcoming.page, upcoming.perPage, upcoming.totalItems], [2, 5, 1]);
    const lessonPages = () => repository.calls.filter((call) => (
        call.method === 'page' && call.collection === 'session_students'
    ));
    assert.match(lessonPages()[0].options.filter, /studentId="student-1"/);
    assert.match(lessonPages()[0].options.filter, /courseSpecId="course-1"/);
    assert.match(lessonPages()[0].options.filter, /startAt>=/);

    await service.listLessons('student-1', { scope: 'completed' });
    assert.match(lessonPages()[1].options.filter, /status="completed"/);
    await service.listLessons('student-1');
    assert.doesNotMatch(lessonPages()[2].options.filter, /startAt|completed/);
    await assert.rejects(service.listLessons('student-1', { scope: 'future' }), hasCode('LEARNING_LESSON_SCOPE_INVALID'));

    const records = await service.listRecords('student-1', { page: 3, perPage: 4, courseId: 'course-1' });
    assert.equal(records.items[0].impact, 'used');
    const recordCall = repository.calls.find((call) => call.collection === 'credit_events');
    assert.match(recordCall.options.filter, /courseSpecId="course-1"/);
});

test('lesson detail enforces ownership and produces experience-safe states', async () => {
    const repository = mockRepository({ lessons: [lesson()] });
    const service = new StudentLearningService(repository);
    const result = await service.getLesson('student-1', 'lesson-1');

    assert.equal(result.lessonId, 'lesson-1');
    assert.equal(result.attendanceResult, 'pending');
    assert.equal(result.lessonHourResult, 'scheduled');
    assert.equal(result.notice, '');
    assert.match(repository.calls[0].filter, /studentId="student-1"/);
    assert.match(repository.calls[0].filter, /sessionId="lesson-1"/);

    repository.first = null;
    await assert.rejects(service.getLesson('student-1', 'missing'), hasCode('LEARNING_LESSON_NOT_FOUND'));
    await assert.rejects(service.getLesson('student-1', ''), hasCode('LEARNING_LESSON_ID_REQUIRED'));
    await assert.rejects(service.overview(''), hasCode('STUDENT_ID_REQUIRED'));
});

test('projection contract sanitizes configured text and rejects internal keys and terms', () => {
    assert.equal(sanitizeStudentText('课程点批次被冻结，需要冲正操作号'), '课时来源被已安排，需要更正记录编号');
    assert.equal(sanitizeStudentText(null), '');
    assert.deepEqual(assertStudentLearningProjection({ items: [{ title: '声乐课' }] }), {
        items: [{ title: '声乐课' }],
    });
    assert.rejects(async () => assertStudentLearningProjection({ batchId: 'secret' }),
        hasCode('STUDENT_LEARNING_CONTRACT_VIOLATION'));
    assert.rejects(async () => assertStudentLearningProjection({ title: '查看 conversion rule' }),
        hasCode('STUDENT_LEARNING_CONTRACT_VIOLATION'));
    assert.equal(assertStudentLearningProjection(null), null);
    assert.equal(assertStudentLearningProjection(2), 2);
});

test('projection helpers cover statuses, fallback data, ordering, and event presentation', () => {
    const courses = buildCourseSummaries([
        batch({
            status: 'unactivated', availableQuantity: 1, frozenQuantity: -1,
            consumedQuantity: 0, expiredQuantity: 2, effectiveExpiresAt: '',
            creditType: creditType({ courseSpec: courseSpec({ id: 'b', name: 'B课程' }) }),
        }),
        batch({
            status: 'active', availableQuantity: 1, effectiveExpiresAt: '2026-07-20T00:00:00Z',
            creditType: creditType({ courseSpec: courseSpec({ id: 'a', name: 'A课程' }) }),
        }),
        { creditTypeId: 'missing' },
    ], NOW, 30);
    assert.deepEqual(courses.map((course) => course.courseId), ['a', 'b']);
    assert.equal(courses[1].awaitingActivation, true);
    assert.equal(courses[1].validUntil, null);

    assert.deepEqual(mapCourseSource({}), {
        grantedAt: null, initialLessons: 0, remainingLessons: 0, scheduledLessons: 0,
        completedLessons: 0, validFrom: null, validUntil: null, status: 'pending',
    });
    assert.equal(mapLesson({}).title, '课程');
    const contextualLesson = mapLesson(lesson(), {
        teachers: [
            { teacherId: 't1', expand: { teacherId: { realname: '甲老师' } } },
            { teacherId: 't2', expand: { teacherId: { nickName: '乙老师' } } },
            { teacherId: 't3', expand: { teacherId: { nickname: '丙老师' } } },
            { teacherId: 't4', expand: { teacherId: { name: '丁老师' } } },
            { teacherId: '' },
        ],
        classes: [{ classId: 'c1', expand: { classId: { code: 'C1' } } }],
    });
    assert.equal(contextualLesson.teacherSummary.count, 4);
    assert.equal(contextualLesson.teacherSummary.overflow, 1);
    assert.equal(contextualLesson.classSummary.label, 'C1');
    assert.equal(mapLessonRecord({}).title, '课时记录');

    const presentations = ['GRANT', 'CONVERT_IN', 'CONVERT_OUT', 'FREEZE', 'ACTIVATE', 'CONSUME',
        'RELEASE', 'EXPIRE', 'EXTEND', 'REVERSE', 'ADJUST', 'UNKNOWN']
        .map((type) => eventPresentation(type, type === 'ADJUST' ? -2 : 1));
    assert.equal(presentations[0].impact, 'added');
    assert.equal(presentations[10].impact, 'used');
    assert.equal(presentations[11].impact, 'neutral');
    assert.equal(eventPresentation('ADJUST', 2).impact, 'added');

    assert.deepEqual(['settled', 'completed', 'weird'].map(lessonStatus), ['completed', 'completed', 'scheduled']);
    assert.deepEqual(['scheduled', 'checked_in', 'present', 'late', 'leave', 'absent', 'cancelled', 'x'].map(attendanceResult),
        ['pending', 'present', 'present', 'late', 'leave', 'absent', 'cancelled', 'pending']);
    assert.deepEqual(['pending', 'credit_insufficient', 'conversion_required', 'reserved', 'consumed', 'released', 'reversed', 'x'].map(lessonHourResult),
        ['pending', 'needs_help', 'needs_help', 'scheduled', 'completed', 'returned', 'corrected', 'pending']);
    assert.match(learningNotice('credit_insufficient'), /教务/);
    assert.equal(learningNotice('reserved'), '');
    assert.deepEqual(['pending', 'unactivated', 'active', 'depleted', 'expired', 'cancelled', 'x'].map(sourceStatus),
        ['pending', 'awaiting_activation', 'active', 'completed', 'expired', 'cancelled', 'pending']);
    assert.equal(isUpcomingLesson({ startAt: '2026-07-24T00:00:00Z', status: 'scheduled' }, NOW), true);
    assert.equal(isUpcomingLesson({ startAt: 'invalid', status: 'scheduled' }, NOW), false);
    assert.equal(isUpcomingLesson({ startAt: null, status: 'scheduled' }, NOW), false);
    assert.equal(isUpcomingLesson({ startAt: '2026-07-24T00:00:00Z', status: 'cancelled' }, NOW), false);

    assert.doesNotMatch(lessonQueryOptions('s').filter, /courseSpecId/);
    assert.match(recordQueryOptions('s').filter, /studentId/);

    const typeNameFallback = buildCourseSummaries([batch({
        creditType: creditType({ name: '合唱课程点', courseSpec: { id: 'fallback-course' } }),
    })], NOW, 30);
    assert.equal(typeNameFallback[0].courseName, '合唱课时');
    assert.equal(typeNameFallback[0].deliveryMode, '');
});

test('learning overview tolerates sparse lessons and deterministically orders equal start times', async () => {
    const sameStart = '2026-07-24T00:00:00.000Z';
    const repository = mockRepository({
        lessons: [
            lesson({ session: session({ id: 'lesson-b', startAt: sameStart }) }),
            lesson({ session: session({ id: 'lesson-a', startAt: sameStart }) }),
            {},
        ],
    });
    const result = await new StudentLearningService(repository, { clock: () => NOW }).overview('student-1');
    assert.deepEqual(result.upcomingLessons.map((item) => item.lessonId), ['lesson-a', 'lesson-b']);
    assert.equal(result.courses.length, 0);
});

function mockRepository(options = {}) {
    return {
        calls: [],
        first: options.lessons?.[0] || lesson(),
        async list(collection, requestOptions) {
            this.calls.push({ method: 'list', collection, options: requestOptions });
            if (collection === 'credit_batches') return options.batches || [];
            if (collection === 'session_students') return options.lessons || [];
            if (collection === 'session_teachers') return options.teachers || [];
            if (collection === 'session_classes') return options.classes || [];
            return [];
        },
        async page(collection, page, perPage, requestOptions) {
            this.calls.push({ method: 'page', collection, page, perPage, options: requestOptions });
            const items = collection === 'credit_events' ? options.events || [] : options.lessons || [];
            return { page, perPage, totalItems: items.length, totalPages: items.length ? 1 : 0, items };
        },
        async findFirst(collection, filter, requestOptions) {
            this.calls.push({ method: 'findFirst', collection, filter, options: requestOptions });
            return this.first;
        },
    };
}

function lessonTeacher() {
    return {
        sessionId: 'lesson-1', teacherId: 'teacher-1',
        expand: { teacherId: { id: 'teacher-1', realName: '周老师' } },
    };
}

function lessonClass() {
    return {
        sessionId: 'lesson-1', classId: 'class-1',
        expand: { classId: { id: 'class-1', name: '少儿声乐 A 班' } },
    };
}

function batch(overrides = {}) {
    const type = overrides.creditType || creditType();
    return {
        id: 'batch-1', creditTypeId: type.id, originalQuantity: 4, availableQuantity: 3,
        frozenQuantity: 1, consumedQuantity: 1, expiredQuantity: 0, status: 'active',
        validFrom: '2026-07-01T00:00:00.000Z', effectiveExpiresAt: '2026-08-01T00:00:00.000Z',
        created: '2026-07-01T00:00:00.000Z', expand: { creditTypeId: type }, ...overrides,
        creditType: undefined,
    };
}

function creditType(overrides = {}) {
    const spec = overrides.courseSpec || courseSpec();
    return {
        id: 'type-1', name: '声乐课程点', kind: 'course', courseSpecId: spec.id,
        expand: { courseSpecId: spec }, ...overrides, courseSpec: undefined,
    };
}

function courseSpec(overrides = {}) {
    return {
        id: 'course-1', name: '声乐一对一', deliveryMode: 'one_to_one', durationMinutes: 45, ...overrides,
    };
}

function lesson(overrides = {}) {
    const sessionRecord = overrides.session || session();
    return {
        id: 'roster-1', sessionId: sessionRecord.id, studentId: 'student-1', attendanceStatus: 'scheduled',
        creditStatus: 'reserved', expand: { sessionId: sessionRecord }, ...overrides, session: undefined,
    };
}

function session(overrides = {}) {
    const type = overrides.creditType || creditType();
    return {
        id: 'lesson-1', title: '声乐课', status: 'scheduled', startAt: '2026-07-24T08:00:00.000Z',
        endAt: '2026-07-24T09:00:00.000Z', location: 'A教室', requiredCreditTypeId: type.id,
        expand: { requiredCreditTypeId: type }, ...overrides, creditType: undefined,
    };
}

function event(overrides = {}) {
    const type = overrides.creditType || creditType();
    return {
        id: 'event-1', creditTypeId: type.id, eventType: 'CONSUME', quantityDelta: -1,
        businessTime: '2026-07-22T08:00:00.000Z', expand: { creditTypeId: type }, ...overrides,
        creditType: undefined,
    };
}

function hasCode(code) {
    return (error) => error?.code === code;
}
