const test = require('node:test');
const assert = require('node:assert/strict');

const { fingerprintRequest } = require('../src/services/courseCredits/repositories/operationRepository');
const { assertBatchPlanPolicy } = require('../src/services/courseCredits/repositories/sdkBatchRepository');
const {
    CourseCreditSessionSettlementService,
    settlementResult,
    teacherEarningRequests,
    validateCommand,
    validateCompletedRoster,
    validateSession,
} = require('../src/services/courseCredits/sessionSettlementService');

const NOW = '2026-08-15T10:00:00.000Z';

test('settleSession atomically settles students, teacher earnings, session, audit, and outbox', async () => {
    const repository = mockRepository();
    const result = await service(repository).settleSession(command());

    assert.equal(result.replayed, false);
    assert.deepEqual(result.studentOutcomes.map((item) => item.creditStatus), ['consumed', 'released']);
    assert.deepEqual(result.teacherEarnings.map((item) => item.quantity), [1.1, 0.75]);
    assert.doesNotThrow(() => assertBatchPlanPolicy(repository.plan));
    const operation = created(repository.plan, 'credit_operations')[0];
    assert.equal(operation.type, 'settle_session');
    assert.equal(operation.requestSnapshot.sessionStatus, 'completed');
    assert.equal(updated(repository.plan, 'credit_batches', 'batch-present').consumedQuantity, 1);
    assert.equal(updated(repository.plan, 'credit_batches', 'batch-leave').expiredQuantity, 1);
    assert.equal(updated(repository.plan, 'session_credit_allocations', 'allocation-leave').status, 'expired');
    assert.deepEqual(created(repository.plan, 'teacher_credit_events').map((event) => event.status), [
        'pending', 'pending',
    ]);
    assert.equal(updated(repository.plan, 'session_teachers', 'teacher-lead').creditStatus, 'pending');
    assert.equal(updated(repository.plan, 'sessions', 'session').status, 'settled');
    assert.equal(created(repository.plan, 'outbox_events')[0].topic, 'course-credit.session-settled');
});

test('cancelled session releases reservations and creates no normal teacher earning', async () => {
    const repository = mockRepository({
        session: { status: 'cancelled' },
        roster: [student('present')],
        teachers: [teacher('teacher-lead', 'lead')],
    });
    const result = await service(repository).settleSession(command());
    assert.equal(result.studentOutcomes[0].creditStatus, 'released');
    assert.deepEqual(result.teacherEarnings, []);
    assert.equal(created(repository.plan, 'teacher_credit_events').length, 0);
});

test('cancelled session creates only snapshotted teacher compensation independent from student quantity', async () => {
    const repository = mockRepository({
        session: {
            status: 'cancelled',
            teacherRuleSnapshot: {
                version: 3,
                rules: {
                    lead: {
                        ...teacherRule('lead-rule', 1, 0, 0),
                        cancellationCompensation: {
                            quantity: 0.75,
                            eligibleActualStatuses: ['confirmed'],
                        },
                    },
                    assistant: teacherRule('assistant-rule', 1, 0, 0),
                },
            },
        },
    });
    const result = await service(repository).settleSession(command({ idempotencyKey: 'cancel-compensation' }));
    const events = created(repository.plan, 'teacher_credit_events');

    assert.equal(result.studentOutcomes.length, 2);
    assert.deepEqual(result.teacherEarnings.map((earning) => [earning.eventType, earning.quantity]), [
        ['compensate', 0.75],
    ]);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, 'compensate');
    assert.equal(events[0].reason, 'session_cancellation_compensation');
    assert.notEqual(result.teacherEarnings[0].quantity, result.studentOutcomes.length);
});

test('correction-pending session re-settles using its preserved terminal status', async () => {
    const repository = mockRepository({
        session: {
            status: 'correction_pending', correctionBaseStatus: 'completed',
            settlementOperationId: 'reversal-operation',
        },
    });
    const result = await service(repository).settleSession(command({ idempotencyKey: 'resettle-key' }));
    assert.equal(result.studentOutcomes.length, 2);
    const operation = created(repository.plan, 'credit_operations')[0];
    assert.equal(operation.requestSnapshot.sessionStatus, 'completed');
    assert.equal(operation.requestSnapshot.priorSettlementOperationId, 'reversal-operation');
    assert.equal(updated(repository.plan, 'sessions', 'session').correctionBaseStatus, '');
});

test('settlement replays immutable results and resolves same-request races', async () => {
    const hash = fingerprintRequest({ sessionId: 'session' });
    const replayRepository = mockRepository({ existing: storedOperation(hash) });
    assert.equal((await service(replayRepository).settleSession(command())).replayed, true);
    assert.equal(replayRepository.plan, null);

    const raced = mockRepository({ raceReplayAfterSend: true });
    assert.equal((await service(raced).settleSession(command())).replayed, true);

    await assert.rejects(
        service(mockRepository({ existing: storedOperation('different') })).settleSession(command()),
        hasCode('IDEMPOTENCY_CONFLICT')
    );
});

test('teacher write failure rejects the single transaction without compensation writes', async () => {
    const repository = mockRepository({ failTeacherWrite: true });
    await assert.rejects(service(repository).settleSession(command()), hasCode('TEACHER_WRITE_FAILED'));
    assert.equal(repository.sendCount, 1);
    assert.ok(created(repository.plan, 'credit_events').length > 0);
    assert.ok(created(repository.plan, 'teacher_credit_events').length > 0);
});

test('settlement validates session, roster, credit, allocation, and storage contracts', async () => {
    await reject({}, { sessionId: '' }, 'SESSION_ID_REQUIRED');
    await reject({ session: { status: 'scheduled' } }, {}, 'SESSION_NOT_SETTLEABLE');
    await reject({ session: { originType: 'migration' } }, {}, 'MIGRATION_SESSION_SETTLEMENT_FORBIDDEN');
    await reject({ session: { requiredQuantity: 0 } }, {}, 'SESSION_CREDIT_QUANTITY_INVALID');
    await reject({ session: { settlementOperationId: 'prior' } }, {}, 'SESSION_ALREADY_SETTLED');
    await reject({ session: { status: 'correction_pending', correctionBaseStatus: '' } }, {},
        'CORRECTION_BASE_STATUS_REQUIRED');
    await reject({ session: {
        status: 'correction_pending', correctionBaseStatus: 'completed', settlementOperationId: '',
    } }, {}, 'PRIOR_SETTLEMENT_OPERATION_REQUIRED');
    await reject({ creditType: { kind: 'universal', consumable: false } }, {}, 'SESSION_CREDIT_TYPE_INVALID');
    await reject({ roster: [] }, {}, 'SESSION_ROSTER_REQUIRED');
    await reject({ roster: [student('present', { creditStatus: 'credit_insufficient' })] }, {},
        'SESSION_STUDENT_CREDIT_UNRESOLVED');
    await reject({ allocations: { 'student-present': [] } }, {}, 'SESSION_ALLOCATION_QUANTITY_MISMATCH');
    await reject({ sendError: new Error('storage') }, {}, 'COURSE_CREDIT_BATCH_FAILED');
});

test('settlement helper contracts expose deterministic result and validation behavior', () => {
    assert.doesNotThrow(() => validateCommand(command()));
    assert.doesNotThrow(() => validateSession(baseSession()));
    assert.doesNotThrow(() => validateSession({
        ...baseSession(), status: 'correction_pending', correctionBaseStatus: 'cancelled',
        settlementOperationId: 'reversal',
    }));
    assert.doesNotThrow(() => validateCompletedRoster([student('present')]));
    assertCode(() => validateCompletedRoster([student('present', { creditStatus: 'released' })]),
        'SESSION_STUDENT_CREDIT_UNRESOLVED');
    const requests = teacherEarningRequests('operation', [{
        eventId: 'event', sessionTeacherId: 'assignment', teacherId: 'teacher',
        ruleId: 'rule', quantity: 1.25,
    }]);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].data.quantityDelta, 1.25);
    const result = settlementResult('operation', { id: 'session' }, [{ outcome: { id: 'student' } }], [{
        eventId: 'event', quantity: 1, ruleId: 'rule', sessionTeacherId: 'assignment', teacherId: 'teacher',
    }]);
    assert.equal(result.studentOutcomes[0].id, 'student');
    assert.equal(result.teacherEarnings[0].roleRuleId, 'rule');
});

function service(repository) {
    return new CourseCreditSessionSettlementService(repository, {
        clock: () => Date.parse(NOW), idFactory: ids(),
    });
}

function mockRepository(options = {}) {
    const roster = options.roster || [student('present'), student('leave')];
    const allocations = options.allocations || Object.fromEntries(roster.map((item) => [item.id, [allocation(item)]]));
    const batches = options.batches || Object.fromEntries(roster.map((item) => {
        const row = allocation(item);
        return [row.batchId, batch(row.batchId, item.studentId)];
    }));
    const state = {
        session: { ...baseSession(), ...(options.session || {}) },
        creditType: options.creditType || {
            id: 'course', kind: 'course', consumable: true, courseSpecId: 'course-spec',
        },
        roster,
        teachers: options.teachers || [
            teacher('teacher-lead', 'lead'), teacher('teacher-assistant', 'assistant'),
            teacher('teacher-absent', 'lead', 'absent'),
        ],
        allocations,
        batches,
    };
    return {
        existing: options.existing || null,
        plan: null,
        sendCount: 0,
        async findFirst() { return this.existing; },
        async get(collection, id) {
            if (collection === 'sessions') return state.session;
            if (collection === 'credit_types') return state.creditType;
            if (collection === 'credit_batches') return state.batches[id];
            throw new Error(`Unexpected get ${collection}`);
        },
        async list(collection, query) {
            if (collection === 'session_students') return state.roster;
            if (collection === 'session_teachers') return state.teachers;
            if (collection === 'session_credit_allocations') {
                const id = Object.keys(state.allocations).find((studentId) => query.filter.includes(studentId));
                return state.allocations[id] || [];
            }
            throw new Error(`Unexpected list ${collection}`);
        },
        async send(plan) {
            this.plan = plan;
            this.sendCount += 1;
            if (options.raceReplayAfterSend) {
                this.existing = plan.find((item) => item.collection === 'credit_operations').data;
                throw Object.assign(new Error('race'), { status: 409 });
            }
            if (options.failTeacherWrite && plan.some((item) => item.collection === 'teacher_credit_events')) {
                throw Object.assign(new Error('teacher failed'), { code: 'TEACHER_WRITE_FAILED' });
            }
            if (options.sendError) throw options.sendError;
            return plan;
        },
    };
}

async function reject(repositoryChanges, commandChanges, code) {
    await assert.rejects(
        service(mockRepository(repositoryChanges)).settleSession(command(commandChanges)),
        hasCode(code)
    );
}

function command(changes = {}) {
    return { sessionId: 'session', idempotencyKey: 'settle-key', actorId: 'operator', ...changes };
}

function baseSession() {
    return {
        id: 'session', status: 'completed', startAt: '2026-08-10T10:00:00.000Z',
        endAt: '2026-08-10T11:00:00.000Z', requiredCreditTypeId: 'course',
        requiredQuantity: 1, rosterVersion: 2, version: 5,
        attendanceRuleSnapshot: {
            version: 1, present: 'consume', late: 'consume', leave: 'release', absent: 'consume',
        },
        settlementRuleSnapshot: { version: 1, cancelled: 'release' },
        teacherRuleSnapshot: {
            version: 2,
            rules: {
                lead: teacherRule('lead-rule', 1, 0, 0.1),
                assistant: teacherRule('assistant-rule', 0.5, 0.25, 0),
            },
        },
    };
}

function teacherRule(ruleId, baseQuantity, durationFactor, participantFactor) {
    return { ruleId, courseSpecId: 'course-spec', baseQuantity, durationFactor, participantFactor };
}

function student(attendanceStatus, changes = {}) {
    const suffix = attendanceStatus;
    return {
        id: `student-${suffix}`, sessionId: 'session', studentId: `account-${suffix}`,
        attendanceStatus, creditStatus: 'reserved', version: 3, ...changes,
    };
}

function allocation(sessionStudent) {
    const suffix = sessionStudent.attendanceStatus;
    return {
        id: `allocation-${suffix}`, batchId: `batch-${suffix}`, quantity: 1,
        status: 'reserved', reservedForStartAt: '2026-08-10T10:00:00.000Z',
    };
}

function batch(id, studentId) {
    return {
        id, studentId, creditTypeId: 'course', originalQuantity: 1,
        availableQuantity: 0, frozenQuantity: 1, consumedQuantity: 0,
        expiredQuantity: 0, reversedQuantity: 0, status: 'active',
        validFrom: '2026-08-01T00:00:00.000Z', effectiveExpiresAt: '2026-08-11T00:00:00.000Z',
        activatedAt: '2026-08-01T00:00:00.000Z', version: 2,
    };
}

function teacher(id, role, actualStatus = 'confirmed') {
    return { id, teacherId: `account-${id}`, role, actualStatus, creditStatus: 'not_eligible' };
}

function storedOperation(requestHash) {
    return {
        id: 'stored', requestSnapshot: { requestHash },
        resultSnapshot: { operationId: 'stored', sessionId: 'session', studentOutcomes: [], teacherEarnings: [] },
    };
}

function created(plan, collection) {
    return plan.filter((item) => item.action === 'create' && item.collection === collection).map((item) => item.data);
}

function updated(plan, collection, id) {
    return plan.find((item) => item.action === 'update' && item.collection === collection && item.id === id).data;
}

function hasCode(code) {
    return (error) => error.code === code;
}

function assertCode(callback, code) {
    assert.throws(callback, hasCode(code));
}

function ids() {
    let index = 0;
    return () => `settlesession${String(++index).padStart(4, '0')}`;
}
