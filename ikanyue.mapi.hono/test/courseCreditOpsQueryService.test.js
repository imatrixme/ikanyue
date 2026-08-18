const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseCreditOpsQueryService,
    RESOURCE_CONFIGS,
    arrayPage,
    configFor,
    emptyAccount,
    groupAccounts,
    project,
    projectAccountBatch,
    relationOrValue,
    studentFilters,
    studentIdsFromScope,
    uniqueIds,
} = require('../src/services/courseCredits/opsQueryService');

test('ops resource queries use allowlisted fields, status filters, and pagination', async () => {
    const repository = mockRepository({
        records: [{
            id: 'order', orderNo: 'O-1', studentId: { id: 'student' }, status: 'paid',
            currency: 'CNY', paidAmount: 2800, productSnapshot: { packageName: '声乐十课时' },
            grantSnapshot: { lines: [{ quantity: 10 }] },
        }],
    });
    const service = new CourseCreditOpsQueryService(repository);
    const result = await service.listResource('orders', { page: '2', perPage: '10', status: 'paid' });

    assert.equal(result.page, 2);
    assert.equal(result.items[0].studentId, 'student');
    assert.equal(result.items[0].paidAmount, 2800);
    assert.deepEqual(result.items[0].productSnapshot, { packageName: '声乐十课时' });
    assert.deepEqual(result.items[0].grantSnapshot, { lines: [{ quantity: 10 }] });
    assert.equal(repository.calls[0].options.filter, 'status="paid"');
    assert.equal(repository.calls[0].options.sort, '-created');
});

test('workspace detail filters are allowlisted and audit metadata remains structured', async () => {
    const repository = mockRepository({ records: [{
        id: 'audit', actorId: 'teacher', resourceType: 'session', resourceId: 'lesson',
        outcome: 'success', metadata: { attendanceStatus: 'present' },
    }] });
    const service = new CourseCreditOpsQueryService(repository);
    const result = await service.listResource('auditLogs', {
        actorId: 'teacher', resourceType: 'session', resourceId: 'lesson', outcome: 'success', ignored: 'x',
    });

    assert.deepEqual(result.items[0].metadata, { attendanceStatus: 'present' });
    assert.equal(repository.calls[0].options.filter,
        'actorId="teacher" && resourceType="session" && resourceId="lesson" && outcome="success"');

    await service.listResource('sessionStudents', {
        sessionId: 'lesson', studentId: 'student', attendanceStatus: 'present', creditStatus: 'reserved',
    });
    assert.match(repository.calls[1].options.filter, /sessionId="lesson"/);
    assert.match(repository.calls[1].options.filter, /creditStatus="reserved"/);
});

test('enrollment projections expose immutable workflow status without unrelated operation data', async () => {
    const repository = mockRepository({ records: [{
        id: 'operation', studentId: 'student', sourceType: 'enrollment', sourceId: 'order',
        status: 'committed', requestSnapshot: { packageId: 'package' },
        resultSnapshot: { status: 'synchronizing_future_lessons', sync: { futureLessonCount: 3 } },
    }] });
    const result = await new CourseCreditOpsQueryService(repository).listResource('enrollments', {
        studentId: 'student', sourceId: 'order',
    });

    assert.deepEqual(result.items[0].resultSnapshot, {
        status: 'synchronizing_future_lessons', sync: { futureLessonCount: 3 },
    });
    assert.equal(repository.calls[0].options.filter,
        'sourceType="enrollment" && studentId="student" && sourceId="order"');
});

test('every Admin workspace resource supports list and detail projections', async () => {
    const repository = mockRepository({ records: [{ id: 'record', status: 'active' }] });
    const service = new CourseCreditOpsQueryService(repository);

    for (const name of Object.keys(RESOURCE_CONFIGS)) {
        const listed = await service.listResource(name);
        assert.equal(listed.items[0].id, 'record', name);
        repository.first = { id: 'record', status: 'active' };
        assert.equal((await service.getResource(name, 'record')).id, 'record', name);
    }
    assert.equal(repository.calls.length, Object.keys(RESOURCE_CONFIGS).length * 2);
});

test('ops resource validation rejects unsupported resources, filters, and missing records', async () => {
    const repository = mockRepository({ records: [] });
    const service = new CourseCreditOpsQueryService(repository);

    await assert.rejects(service.listResource('unknown'), hasCode('OPS_RESOURCE_INVALID'));
    await assert.rejects(service.listResource('orders', { status: 'unknown' }), hasCode('OPS_FILTER_STATUS_INVALID'));
    await assert.rejects(service.getResource('orders', ''), hasCode('OPS_RESOURCE_ID_REQUIRED'));
    repository.first = null;
    await assert.rejects(service.getResource('orders', 'missing'), hasCode('OPS_RESOURCE_NOT_FOUND'));
    assert.throws(() => configFor('unknown'), hasCode('OPS_RESOURCE_INVALID'));
});

test('credit account list groups batch buckets and paginates by student', async () => {
    const repository = mockRepository({
        batches: [
            batch({ studentId: 'student-b', status: 'unactivated', availableQuantity: 2 }),
            batch({ studentId: 'student-a', availableQuantity: 3, frozenQuantity: 1 }),
            batch({ studentId: { id: 'student-a' }, consumedQuantity: 4, expiredQuantity: 1 }),
        ],
    });
    const service = new CourseCreditOpsQueryService(repository);
    const firstPage = await service.listAccounts({ page: 1, perPage: 1 });
    const secondPage = await service.listAccounts({ page: 2, perPage: 1 });

    assert.equal(firstPage.totalItems, 2);
    assert.equal(firstPage.totalPages, 2);
    assert.equal(firstPage.items[0].studentId, 'student-a');
    assert.equal(firstPage.items[0].batchCount, 2);
    assert.equal(firstPage.items[0].availableQuantity, 3);
    assert.equal(firstPage.items[0].frozenQuantity, 1);
    assert.equal(firstPage.items[0].consumedQuantity, 4);
    assert.equal(secondPage.items[0].unactivatedQuantity, 2);
});

test('credit account detail exposes auditable cost fields without raw snapshots', async () => {
    const repository = mockRepository({
        batches: [batch({
            studentId: 'student', creditTypeId: ['course'], sourceOperationId: { id: 'operation' },
            effectiveExpiresAt: '2026-12-31T00:00:00Z', listUnitValue: '300', paidUnitCost: '280',
            currency: 'CNY', grantSnapshot: { private: true },
        })],
        events: [{
            id: 'event', studentId: 'student', creditTypeId: 'course', operationId: 'operation',
            batchId: 'batch', eventType: 'GRANT', quantityDelta: 10, reason: 'admin enrollment',
        }],
    });
    const account = await new CourseCreditOpsQueryService(repository).getAccount('student');

    assert.equal(account.studentId, 'student');
    assert.equal(account.batches[0].creditTypeId, 'course');
    assert.equal(account.batches[0].sourceOperationId, 'operation');
    assert.equal(account.batches[0].paidUnitCost, 280);
    assert.equal(account.batches[0].grantSnapshot, undefined);
    assert.equal(account.events[0].eventType, 'GRANT');
    assert.equal(account.events[0].quantityDelta, 10);
    assert.match(repository.calls[0].options.filter, /studentId="student"/);
});

test('teacher workload queues hide resolved earnings and paginate confirmed events', async () => {
    const repository = mockRepository({ teacherEvents: [
        { id: 'pending-open', teacherId: 'teacher', sessionTeacherId: 'row-1', eventType: 'earn', quantityDelta: 1, status: 'pending' },
        { id: 'pending-closed', teacherId: 'teacher', sessionTeacherId: 'row-2', eventType: 'earn', quantityDelta: 2, status: 'pending' },
        { id: 'confirmation', teacherId: 'teacher', sessionTeacherId: 'row-2', eventType: 'confirm', quantityDelta: 2, status: 'confirmed', confirmationOfEventId: 'pending-closed' },
    ] });
    const service = new CourseCreditOpsQueryService(repository);

    const pending = await service.listTeacherEvents({ status: 'pending', teacherId: 'teacher' });
    const confirmed = await service.listTeacherEvents({ status: 'confirmed', page: 1, perPage: 10 });

    assert.deepEqual(pending.items.map((item) => item.id), ['pending-open']);
    assert.deepEqual(confirmed.items.map((item) => item.id), ['confirmation']);
    assert.equal(repository.calls[0].options.filter, 'teacherId="teacher"');
});

test('settlement exception workspace aggregates every operational failure class', async () => {
    const repository = mockRepository({ collections: {
        session_students: [{
            id: 'roster', sessionId: 'lesson-1', studentId: 'student-1',
            creditStatus: 'credit_insufficient', eligibilityReason: '余额不足', updated: '2026-08-18T01:00:00Z',
        }],
        session_credit_allocations: [{
            id: 'allocation', batchId: 'batch-1', quantity: 1, status: 'expired',
            expand: { sessionStudentId: { sessionId: 'lesson-2', studentId: 'student-2' } },
            updated: '2026-08-18T02:00:00Z',
        }],
        credit_operations: [{
            id: 'operation', type: 'settle_session', status: 'failed', studentId: 'student-3',
            requestSnapshot: { sessionId: 'lesson-3' }, resultSnapshot: { errorCode: 'DB_DOWN', message: '写入失败' },
            updated: '2026-08-18T03:00:00Z',
        }],
        sessions: [{ id: 'lesson-4', status: 'correction_pending', updated: '2026-08-18T04:00:00Z' }],
        reconciliation_exceptions: [{
            id: 'duplicate', code: 'DUPLICATE_EVENT', status: 'open', batchId: 'batch-2',
            detectedAt: '2026-08-18T05:00:00Z',
        }, { id: 'other', code: 'BALANCE_MISMATCH', status: 'open' }],
    } });
    const service = new CourseCreditOpsQueryService(repository);

    const result = await service.listSettlementExceptions({ page: 1, perPage: 10 });
    const filtered = await service.listSettlementExceptions({ kind: 'failed_operation', studentId: 'student-3' });

    assert.deepEqual(result.items.map((item) => item.kind), [
        'duplicate', 'correction_pending', 'failed_operation', 'expired_release', 'credit_insufficient',
    ]);
    assert.equal(result.items.find((item) => item.kind === 'expired_release').sessionId, 'lesson-2');
    assert.equal(filtered.items[0].reason, '写入失败');
    assert.equal(repository.calls[0].options.filter,
        'creditStatus="credit_insufficient" || creditStatus="conversion_required"');
    assert.match(repository.calls[2].options.filter, /status="failed"/);
});

test('ops projection helpers normalize relations, empty accounts, and empty pages', () => {
    assert.equal(RESOURCE_CONFIGS.reconciliationRuns.statuses.has('pending'), true);
    assert.deepEqual(project({ id: 'one', tags: ['a', { id: 'b' }] }, ['id', 'tags', 'missing']), {
        id: 'one', tags: ['a', 'b'], missing: null,
    });
    assert.deepEqual(project({ metadata: { safe: true } }, ['metadata'], new Set(['metadata'])), {
        metadata: { safe: true },
    });
    assert.equal(relationOrValue({ id: 'record' }), 'record');
    assert.equal(relationOrValue(null), null);
    assert.deepEqual(emptyAccount('student'), {
        studentId: 'student', batchCount: 0, availableQuantity: 0, frozenQuantity: 0,
        consumedQuantity: 0, expiredQuantity: 0, unactivatedQuantity: 0,
    });
    assert.deepEqual(arrayPage([], 1, 20), {
        page: 1, perPage: 20, totalItems: 0, totalPages: 0, items: [],
    });
    assert.equal(groupAccounts([]).size, 0);
    const projected = projectAccountBatch({});
    assert.equal(projected.effectiveExpiresAt, null);
    assert.equal(projected.listUnitValue, 0);
    assert.deepEqual(studentFilters({ q: '张', status: 'inactive' }), [
        '(realName ~ "张" || nickName ~ "张" || cellphone ~ "张")', 'blocked = true',
    ]);
    assert.deepEqual(studentFilters({ studentId: 'student' }), ['id="student"']);
    assert.deepEqual(uniqueIds([{ studentId: 'one' }, { studentId: { id: 'one' } }], 'studentId'), ['one']);
    assert.deepEqual(studentIdsFromScope({
        classStudents: [{ studentId: 'one' }], sessionStudents: [{ studentId: 'two' }],
    }), ['one', 'two']);
});

test('assigned student and lesson queries scope teacher data to explicit teaching relations', async () => {
    const repository = assignedRepository();
    const service = new CourseCreditOpsQueryService(repository);
    const teacher = {
        id: 'teacher', role: 'teacher', courseCreditCapabilities: ['course_credit.teacher'],
    };
    const students = await service.listAssignedStudents(teacher, { status: 'active' });
    const classes = await service.listAssignedClasses(teacher, { status: 'active' });
    const lessons = await service.listAssignedLessons(teacher, { status: 'scheduled' });

    assert.equal(students.items[0].id, 'student');
    assert.equal(students.items[0].classAssignments[0].classId, 'class');
    assert.equal(students.items[0].lessonAssignments[0].sessionId, 'session');
    assert.equal(classes.items[0].id, 'class');
    assert.equal(classes.items[0].students[0].studentId, 'student');
    assert.equal(classes.items[0].teachers[0].teacherId, 'teacher');
    assert.equal(lessons.items[0].id, 'session');
    assert.equal(lessons.items[0].students[0].studentId, 'student');
    assert.equal(lessons.items[0].teachers[0].teacherId, 'teacher');
    assert.match(repository.pageCalls[0].options.filter, /id="student"/);
    assert.match(repository.pageCalls[1].options.filter, /id="class"/);
    assert.match(repository.pageCalls[2].options.filter, /id="session"/);
    assert.match(repository.pageCalls[2].options.filter, /status="scheduled"/);
});

test('academic assigned views use global scope while unassigned teachers receive empty pages', async () => {
    const repository = assignedRepository({ assigned: false });
    const service = new CourseCreditOpsQueryService(repository);
    const teacher = { id: 'teacher', role: 'teacher', courseCreditCapabilities: ['course_credit.teacher'] };
    assert.deepEqual(await service.listAssignedStudents(teacher), arrayPage([], 1, 20));
    assert.deepEqual(await service.listAssignedClasses(teacher), arrayPage([], 1, 20));
    assert.deepEqual(await service.listAssignedLessons(teacher), arrayPage([], 1, 20));

    const academicRepository = assignedRepository();
    const academicService = new CourseCreditOpsQueryService(academicRepository);
    const academic = { id: 'academic', role: 'teacher', courseCreditCapabilities: ['course_credit.academic'] };
    assert.equal((await academicService.listAssignedStudents(academic, { keyword: '张' })).items[0].id, 'student');
    assert.equal((await academicService.listAssignedClasses(academic, { classId: 'class' })).items[0].id, 'class');
    const lesson = (await academicService.listAssignedLessons(academic, { sessionId: 'session' })).items[0];
    assert.equal(lesson.id, 'session');
    assert.equal(lesson.students[0].studentId, 'student');
    assert.equal(lesson.teachers[0].teacherId, 'teacher');
    assert.equal(academicRepository.pageCalls.at(-1).options.filter, 'id="session"');
    await assert.rejects(
        service.listAssignedStudents({ id: 'none', role: 'teacher', courseCreditCapabilities: [] }),
        hasCode('COURSE_CREDIT_CAPABILITY_REQUIRED')
    );
});

test('teacher event detail is restricted to the current teacher outside admin scope', async () => {
    const repository = mockRepository({ records: [{ id: 'event', teacherId: 'teacher' }] });
    const service = new CourseCreditOpsQueryService(repository);
    assert.equal((await service.getAssignedTeacherEvent({ id: 'teacher', isAdmin: false }, 'event')).id, 'event');
    await assert.rejects(
        service.getAssignedTeacherEvent({ id: 'other', isAdmin: false }, 'event'),
        hasCode('TEACHER_EVENT_FORBIDDEN')
    );
    assert.equal((await service.getAssignedTeacherEvent({ id: 'admin', isAdmin: true }, 'event')).id, 'event');
});

function mockRepository(options = {}) {
    return {
        calls: [],
        first: options.records?.[0] || null,
        async page(collection, page, perPage, requestOptions) {
            this.calls.push({ method: 'page', collection, page, perPage, options: requestOptions });
            const items = options.records || [];
            return { page, perPage, totalItems: items.length, totalPages: items.length ? 1 : 0, items };
        },
        async findFirst(collection, filter, requestOptions) {
            this.calls.push({ method: 'findFirst', collection, filter, options: requestOptions });
            return this.first;
        },
        async list(collection, requestOptions) {
            this.calls.push({ method: 'list', collection, options: requestOptions });
            if (options.collections) return options.collections[collection] || [];
            if (collection === 'credit_events') return options.events || [];
            if (collection === 'teacher_credit_events') return options.teacherEvents || [];
            return options.batches || [];
        },
    };
}

function assignedRepository(options = {}) {
    const assigned = options.assigned !== false;
    return {
        pageCalls: [],
        async page(collection, page, perPage, requestOptions) {
            this.pageCalls.push({ collection, page, perPage, options: requestOptions });
            const items = collection === 'students'
                ? [{ id: 'student', realName: '张同学', blocked: false }]
                : collection === 'classes'
                    ? [{ id: 'class', name: '周六声乐班', status: 'active' }]
                    : [{ id: 'session', title: '合唱排练', status: 'scheduled' }];
            return { page, perPage, totalItems: items.length, totalPages: 1, items };
        },
        async list(collection) {
            if (!assigned && ['class_teachers', 'session_teachers'].includes(collection)) return [];
            const records = {
                class_teachers: [{ classId: 'class', teacherId: 'teacher', status: 'active' }],
                session_teachers: [{ sessionId: 'session', teacherId: 'teacher', actualStatus: 'pending' }],
                class_students: [{ id: 'class-student', classId: 'class', studentId: 'student', status: 'active' }],
                session_students: [{ id: 'session-student', sessionId: 'session', studentId: 'student', attendanceStatus: 'scheduled' }],
            };
            return records[collection] || [];
        },
    };
}

function batch(changes = {}) {
    return {
        id: 'batch', studentId: 'student', creditTypeId: 'course', sourceOperationId: 'operation',
        status: 'active', originalQuantity: 10, availableQuantity: 0, frozenQuantity: 0,
        consumedQuantity: 0, expiredQuantity: 0, listUnitValue: 0, paidUnitCost: 0,
        ...changes,
    };
}

function hasCode(code) {
    return (error) => error?.code === code;
}
