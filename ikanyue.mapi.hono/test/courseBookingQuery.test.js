const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseBookingQueryService,
    appendStatusFilter,
    bookingBatchFilter,
    claims,
    courseIdFromBatch,
    related,
} = require('../src/services/courseCredits/booking/queryService');
const { bookingOption, studentAppointment, teacherAppointment } = require('../src/services/courseCredits/booking/projection');

test('student booking options expose courses and teachers without internal credit data', async () => {
    const repository = queryRepository();
    const result = await service(repository).studentOptions('student');
    assert.equal(result.length, 1);
    assert.equal(result[0].course.name, '一对一声乐');
    assert.equal(result[0].teacher.name, '林老师');
    assert.equal(result[0].creditTypeId, undefined);
    assert.match(repository.queries.credit_batches.filter, /availableQuantity>0/);
});

test('slot query combines teacher rules, overrides, claims, and exact lesson eligibility', async () => {
    const repository = queryRepository();
    const result = await service(repository).availableSlots('student', {
        offeringId: 'offering', from: START, to: END, excludeSourceId: 'current-session',
    });
    assert.deepEqual(result.slots, [{ startAt: START, endAt: END }]);
    assert.match(repository.queries.schedule_claims[0].filter, /sourceId!="current-session"/);
    // PocketBase compares stored 'YYYY-MM-DD HH:MM:SS.sssZ' text, so ISO 'T' literals must be normalized.
    assert.ok(repository.queries.schedule_claims[0].filter.includes(`cellEndAt>"${START.replace('T', ' ')}"`));
    assert.equal(repository.queries.schedule_claims[0].filter.includes('T0'), false);
    assert.match(repository.queries.credit_batches.filter, /status="active"/);
});

test('appointment lists are ownership-safe and project role-specific actions', async () => {
    const repository = queryRepository();
    const query = service(repository);
    const studentPage = await query.listStudentAppointments('student', { page: 1, perPage: 10 });
    assert.equal(studentPage.items[0].canWithdraw, true);
    assert.equal(studentPage.items[0].student, undefined);
    const teacherPage = await query.listTeacherAppointments('teacher', { status: 'pending' });
    assert.equal(teacherPage.items[0].student.name, '学员甲');
    assert.equal(teacherPage.items[0].canConfirm, true);
    const dashboard = await query.teacherDashboard('teacher');
    assert.equal(dashboard.pendingCount, 1);
    assert.equal(dashboard.offerings[0].offeringId, 'offering');
    assert.match(repository.queries.lastPage.filter, /status="confirmed" \|\| status="rescheduled"/);
    await assert.rejects(query.getStudentAppointment('other', 'appointment'), hasCode('APPOINTMENT_STUDENT_FORBIDDEN'));
    await assert.rejects(query.getTeacherAppointment('other', 'appointment'), hasCode('APPOINTMENT_TEACHER_FORBIDDEN'));
});

test('booking projection helpers tolerate relation fallbacks and stable filters', async () => {
    assert.equal(bookingBatchFilter('student"x', 'credit').includes('student\\"x'), true);
    assert.equal(bookingOption({ id: 'offering', courseSpecId: 'course', teacherId: 'teacher' }).course.courseId, 'course');
    assert.equal(studentAppointment(appointment({ status: 'confirmed', sessionId: 'session' })).canCancel, true);
    assert.equal(teacherAppointment(appointment()).student.studentId, 'student');
    const repository = queryRepository();
    await claims(repository, 'teacher', 'teacher', START, END, 'session');
    assert.match(repository.queries.schedule_claims.at(-1).filter, /ownerType="teacher"/);
    const filters = [];
    appendStatusFilter(filters, 'pending,confirmed');
    assert.match(filters[0], /status="pending" \|\| status="confirmed"/);
    assert.throws(() => appendStatusFilter([], new Array(11).fill('pending').join(',')),
        hasCode('BOOKING_STATUS_FILTER_INVALID'));
});

test('booking projections cover display fallbacks without exposing internal entitlement data', () => {
    const projected = studentAppointment({
        id: 'fallback', status: 'rescheduled', courseSpecId: '', teacherId: '', sessionId: '',
        requestedStartAt: START, requestedEndAt: END,
        expand: {
            offeringId: { courseName: '视唱练耳', location: '' },
            teacherId: { id: 'teacher', realname: '周老师', avatar: 'avatar.png' },
            sessionId: { id: 'lesson', location: '线上教室' },
        },
    });
    assert.equal(projected.course.name, '视唱练耳');
    assert.equal(projected.teacher.name, '周老师');
    assert.equal(projected.teacher.avatar, 'avatar.png');
    assert.equal(projected.location, '线上教室');
    assert.equal(projected.lessonId, 'lesson');
    assert.equal(projected.responseDeadline, null);
    assert.equal(projected.canWithdraw, false);

    const teacher = teacherAppointment({
        ...appointment({ expand: {} }), version: 0,
        studentId: '', expand: { studentId: { id: 'student', nickname: '小林', avatar: 'student.png' } },
    });
    assert.equal(teacher.student.name, '小林');
    assert.equal(teacher.student.avatar, 'student.png');
    assert.equal(teacher.version, 1);
    const option = bookingOption({
        id: 'option', location: '', courseSpecId: '', teacherId: '',
        expand: { courseSpecId: { name: '', durationMinutes: '' }, teacherId: { nickName: '陈老师' } },
    });
    assert.equal(option.course.name, '课程');
    assert.equal(option.course.durationMinutes, 0);
    assert.equal(option.teacher.name, '陈老师');
});

test('booking query edge paths handle empty eligibility, filters, calendar ranges, and relation fallback', async () => {
    const empty = queryRepositoryWith({ batches: [] });
    assert.deepEqual(await service(empty).studentOptions('student'), []);

    const eligible = queryRepositoryWith();
    assert.equal((await service(eligible).studentOptions('student', { courseId: 'course' })).length, 1);
    await assert.rejects(service(eligible).studentOptions('student', { courseId: 'other' }),
        hasCode('BOOKING_COURSE_NOT_ELIGIBLE'));

    const query = service(queryRepository());
    const calendar = await query.teacherCalendar('teacher', { from: START, to: END });
    assert.equal(calendar.items.length, 1);
    assert.match(query.repository.queries.lastPage.filter, /requestedEndAt/);
    assert.match(query.repository.queries.lastPage.filter, /requestedStartAt/);

    const availability = await query.teacherAvailability('teacher', 'offering');
    assert.equal(availability.policy.timezone, 'Asia/Shanghai');
    await assert.rejects(query.teacherAvailability('other', 'offering'), hasCode('BOOKING_OFFERING_FORBIDDEN'));

    const fallbackRepository = { async get(collection, id) { return { id, collection }; } };
    assert.equal((await related(fallbackRepository, { field: 'record' }, 'field', 'records')).id, 'record');
    assert.equal((await related(fallbackRepository, {
        field: 'record', expand: { field: { id: 'expanded' } },
    }, 'field', 'records')).id, 'expanded');
    assert.equal(courseIdFromBatch(batch()), 'course');

    const noExclude = queryRepository();
    await claims(noExclude, 'student', 'student', START, END);
    assert.equal(noExclude.queries.schedule_claims.at(-1).filter.includes('sourceId!='), false);
});

const NOW = '2026-08-01T00:00:00.000Z';
const START = '2026-08-03T01:00:00.000Z';
const END = '2026-08-03T02:00:00.000Z';

function service(repository) {
    return new CourseBookingQueryService(repository, { clock: () => Date.parse(NOW) });
}

function queryRepository() {
    return queryRepositoryWith();
}

function queryRepositoryWith(config = {}) {
    const queries = { schedule_claims: [] };
    return {
        queries,
        async get(collection) {
            if (collection === 'teacher_course_offerings') return offering();
            if (collection === 'appointment_requests') return appointment();
            throw new Error(`Unexpected get ${collection}`);
        },
        async list(collection, queryOptions) {
            if (collection === 'credit_batches') {
                queries.credit_batches = queryOptions;
                return config.batches === undefined ? [batch()] : config.batches;
            }
            if (collection === 'teacher_course_offerings') return [offering()];
            if (collection === 'teacher_availability_rules') return config.rules || [];
            if (collection === 'teacher_availability_overrides') return config.overrides || [];
            if (collection === 'schedule_claims') {
                queries.schedule_claims.push(queryOptions);
                return [];
            }
            throw new Error(`Unexpected list ${collection}`);
        },
        async page(_collection, _page, _perPage, pageOptions) {
            queries.lastPage = pageOptions;
            return { page: 1, perPage: 20, totalItems: 1, totalPages: 1, items: [appointment()] };
        },
    };
}

function offering() {
    const course = { id: 'course', name: '一对一声乐', durationMinutes: 60 };
    const teacher = { id: 'teacher', realName: '林老师', avatarUrl: 'teacher.png' };
    const creditType = { id: 'credit-type', kind: 'course', consumable: true, courseSpecId: 'course' };
    const policy = {
        id: 'policy', timezone: 'Asia/Shanghai',
        defaultWindows: [{ startMinute: 540, endMinute: 660 }, { startMinute: 840, endMinute: 1140 }],
        slotStepMinutes: 30, claimGranularityMinutes: 15, minLeadMinutes: 0, maxAdvanceDays: 30,
        responseTtlMinutes: 1440, responseCutoffMinutes: 360, cancellationCutoffMinutes: 720, version: 1,
    };
    return {
        id: 'offering', teacherId: 'teacher', courseSpecId: 'course', creditTypeId: 'credit-type', policyId: 'policy',
        status: 'active', location: '第一教室', availabilityMode: 'default',
        expand: { teacherId: teacher, courseSpecId: course, creditTypeId: creditType, policyId: policy },
    };
}

function batch() {
    return {
        id: 'batch', studentId: 'student', creditTypeId: 'credit-type', originalQuantity: 2,
        availableQuantity: 2, frozenQuantity: 0, consumedQuantity: 0, expiredQuantity: 0,
        reversedQuantity: 0, status: 'active', validFrom: '2026-01-01T00:00:00.000Z',
        effectiveExpiresAt: '2026-12-31T00:00:00.000Z', activationMode: 'GRANT_TIME',
        activatedAt: '2026-01-01T00:00:00.000Z', version: 1,
        expand: {
            creditTypeId: {
                id: 'credit-type', kind: 'course', consumable: true,
                expand: { courseSpecId: { id: 'course', name: '一对一声乐' } },
            },
        },
    };
}

function appointment(changes = {}) {
    return {
        id: 'appointment', studentId: 'student', teacherId: 'teacher', offeringId: 'offering',
        courseSpecId: 'course', sessionId: '', status: 'pending', requestedStartAt: START,
        requestedEndAt: END, responseDeadline: '2026-08-02T00:00:00.000Z', note: '', responseReason: '', version: 1,
        expand: {
            studentId: { id: 'student', realName: '学员甲' },
            teacherId: { id: 'teacher', realName: '林老师' },
            offeringId: { id: 'offering', location: '第一教室' },
            courseSpecId: { id: 'course', name: '一对一声乐' },
        },
        ...changes,
    };
}

function hasCode(code) {
    return (error) => error?.code === code;
}
