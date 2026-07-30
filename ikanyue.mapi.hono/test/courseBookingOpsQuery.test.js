const test = require('node:test');
const assert = require('node:assert/strict');

const {
    BookingOpsQueryService,
    courseReference,
    creditTypeReference,
    offeringProjection,
    policyProjection,
    statusFilter,
    teacherReference,
} = require('../src/services/courseCredits/booking/opsQueryService');

test('operations dashboard combines pending, upcoming, and open-conflict work queues', async () => {
    const repository = repositoryMock();
    const result = await new BookingOpsQueryService(repository).dashboard();
    assert.equal(result.pendingCount, 1);
    assert.equal(result.upcoming.length, 1);
    assert.equal(result.openConflictCount, 1);
    assert.equal(repository.pageCalls.length, 3);
});

test('appointment operations queries escape filters and include events and claims in detail', async () => {
    const repository = repositoryMock();
    const service = new BookingOpsQueryService(repository);
    const page = await service.listAppointments({
        status: 'pending,confirmed', teacherId: 'teacher"x', studentId: 'student',
        courseSpecId: 'course', from: '2026-08-01', to: '2026-09-01', page: 2, perPage: 20,
    });
    assert.equal(page.page, 2);
    assert.match(repository.pageCalls.at(-1).options.filter, /teacherId="teacher\\"x"/);
    assert.match(repository.pageCalls.at(-1).options.filter, /status="pending" \|\| status="confirmed"/);
    const detail = await service.getAppointment('appointment');
    assert.equal(detail.events[0].id, 'event');
    assert.equal(detail.claims[0].id, 'claim');
});

test('policy, offering, availability, and conflict projections remain pagination-safe', async () => {
    const repository = repositoryMock();
    const service = new BookingOpsQueryService(repository);
    const policies = await service.listPolicies({ status: 'active' });
    const offerings = await service.listOfferings({ teacherId: 'teacher', status: 'active' });
    const availability = await service.listAvailability({ offeringId: 'offering', status: 'active' });
    const conflicts = await service.listConflicts({ teacherId: 'teacher', status: 'open' });

    assert.equal(policies.items[0].slotStepMinutes, 30);
    assert.equal(offerings.items[0].teacher.name, '林老师');
    assert.equal(availability.rules[0].id, 'rule');
    assert.equal(availability.overrides[0].id, 'override');
    assert.equal(conflicts.items[0].id, 'conflict');
});

test('Admin reference data exposes selectable academic labels without raw teacher records', async () => {
    const repository = repositoryMock();
    const result = await new BookingOpsQueryService(repository).referenceData();
    assert.deepEqual(result.teachers[0], {
        id: 'teacher', name: '林老师', cellphone: '13800000000', avatar: 'teacher.png',
    });
    assert.equal(repository.listCalls.find((call) => call.collection === 'teachers').options.sort, 'cellphone');
    assert.equal(result.courses[0].durationMinutes, 60);
    assert.equal(result.creditTypes[0].courseSpecId, 'course');
    assert.equal(result.policies[0].name, '默认预约策略');
});

test('query helpers reject excessive status filters and normalize relation fallbacks', () => {
    const filters = [];
    assert.throws(() => statusFilter(filters, Array.from({ length: 11 }, (_, index) => `s${index}`).join(',')),
        hasCode('BOOKING_STATUS_FILTER_INVALID'));
    assert.equal(policyProjection(policy()).effectiveTo, null);
    assert.equal(policyProjection(policy()).claimGranularityMinutes, 15);
    assert.equal(offeringProjection(offering()).course.courseId, 'course');
});

test('Admin booking projections preserve legacy labels and safe empty fallbacks', async () => {
    const repository = repositoryMock();
    await new BookingOpsQueryService(repository).listPolicies();
    assert.equal(repository.pageCalls.at(-1).options.filter, '');

    const filters = [];
    statusFilter(filters, '');
    assert.deepEqual(filters, []);
    assert.equal(teacherReference({ id: 'teacher', realname: '旧姓名' }).name, '旧姓名');
    assert.equal(teacherReference({ id: 'teacher', nickName: '微信昵称', avatarUrl: 'avatar-url' }).name, '微信昵称');
    assert.equal(teacherReference({ id: 'teacher', nickname: '兼容昵称', avatar: 'avatar' }).name, '兼容昵称');
    assert.deepEqual(teacherReference({ id: 'teacher' }), {
        id: 'teacher', name: '授课教师', cellphone: '', avatar: '',
    });
    assert.deepEqual(courseReference({ id: 'course' }), {
        id: 'course', code: '', name: '课程', durationMinutes: 0, defaultCreditTypeId: '',
    });
    assert.deepEqual(creditTypeReference({ id: 'credit' }), {
        id: 'credit', code: '', name: '课时类型', courseSpecId: '', unitLabel: '课时',
    });
    assert.deepEqual(offeringProjection({
        ...offering(),
        creditTypeId: { id: 'credit-object' },
        location: '',
        policyId: null,
        version: 0,
    }), offeringFallback());
});

function repositoryMock() {
    return {
        listCalls: [],
        pageCalls: [],
        async page(collection, page, perPage, options) {
            this.pageCalls.push({ collection, page, perPage, options });
            const item = collection === 'booking_policies' ? policy()
                : collection === 'teacher_course_offerings' ? offering()
                    : collection === 'booking_conflicts' ? { id: 'conflict', status: 'open' }
                        : appointment();
            return { page, perPage, totalItems: 1, totalPages: 1, items: [item] };
        },
        async get() { return appointment(); },
        async list(collection, options = {}) {
            this.listCalls.push({ collection, options });
            if (collection === 'appointment_events') return [{ id: 'event' }];
            if (collection === 'schedule_claims') return [{ id: 'claim' }];
            if (collection === 'teacher_availability_rules') return [{ id: 'rule' }];
            if (collection === 'teacher_availability_overrides') return [{ id: 'override' }];
            if (collection === 'teachers') return [{
                id: 'teacher', realName: '林老师', cellphone: '13800000000', avatar: 'teacher.png', password: 'secret',
            }];
            if (collection === 'course_specs') return [{
                id: 'course', code: 'VOICE-1V1', name: '一对一声乐课', durationMinutes: 60,
                defaultCreditTypeId: 'credit',
            }];
            if (collection === 'credit_types') return [{
                id: 'credit', code: 'VOICE-HOUR', name: '一对一声乐课时', courseSpecId: 'course', unitLabel: '课时',
            }];
            if (collection === 'booking_policies') return [policy()];
            throw new Error(`Unexpected list ${collection}`);
        },
    };
}

function appointment() {
    return {
        id: 'appointment', status: 'pending', requestedAt: '2026-08-01T00:00:00.000Z',
        requestedStartAt: '2026-08-03T01:00:00.000Z', requestedEndAt: '2026-08-03T02:00:00.000Z',
        responseDeadline: '2026-08-02T01:00:00.000Z', teacherId: 'teacher', studentId: 'student',
        courseSpecId: 'course', offeringId: 'offering', creditTypeId: 'credit', policyId: 'policy',
        expand: {
            teacherId: { id: 'teacher', realName: '林老师' },
            studentId: { id: 'student', realName: '学员甲' },
            courseSpecId: { id: 'course', name: '一对一声乐课' },
            offeringId: { id: 'offering', location: '一号教室' },
        },
        version: 1,
    };
}

function policy() {
    return {
        id: 'policy', code: 'default', name: '默认预约策略', timezone: 'Asia/Shanghai',
        defaultWindows: [{ startMinute: 540, endMinute: 660 }], slotStepMinutes: 30,
        minLeadMinutes: 720, maxAdvanceDays: 30, responseTtlMinutes: 1440,
        responseCutoffMinutes: 360, cancellationCutoffMinutes: 720,
        version: 1, effectiveFrom: '2026-08-01T00:00:00.000Z', effectiveTo: '', status: 'active',
    };
}

function offering() {
    return {
        id: 'offering', teacherId: 'teacher', courseSpecId: 'course', creditTypeId: 'credit',
        policyId: 'policy', location: '一号教室', availabilityMode: 'default', status: 'active', version: 1,
        expand: {
            teacherId: { id: 'teacher', realName: '林老师' },
            courseSpecId: { id: 'course', name: '一对一声乐课' },
            offeringId: { id: 'offering', location: '一号教室' },
        },
    };
}

function offeringFallback() {
    return {
        id: 'offering',
        teacher: { teacherId: 'teacher', name: '林老师', avatar: '' },
        course: { courseId: 'course', name: '一对一声乐课' },
        creditTypeId: 'credit-object',
        policyId: '',
        location: '',
        availabilityMode: 'default',
        status: 'active',
        version: 1,
    };
}

function hasCode(code) {
    return (error) => error?.code === code;
}
