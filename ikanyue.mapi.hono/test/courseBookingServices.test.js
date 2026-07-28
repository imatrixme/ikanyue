const test = require('node:test');
const assert = require('node:assert/strict');

const { AppointmentDecisionService } = require('../src/services/courseCredits/booking/decisionService');
const { materializeAppointment, teacherSnapshot } = require('../src/services/courseCredits/booking/materialization');
const {
    AppointmentRequestService,
    event,
    normalizeText,
} = require('../src/services/courseCredits/booking/requestService');
const { fingerprintRequest } = require('../src/services/courseCredits/repositories/operationRepository');

test('teacher confirmation materializes one lesson, reserves hours, and claims both calendars', async () => {
    const repository = decisionRepository({ competing: [appointment({ id: 'competing' })] });
    const result = await decisionService(repository).confirm(confirmCommand());

    assert.equal(result.status, 'confirmed');
    assert.equal(result.closedAppointmentIds[0], 'competing');
    assert.equal(result.replayed, false);
    assert.equal(created(repository.plan, 'sessions').originType, 'appointment');
    assert.equal(created(repository.plan, 'session_students').creditStatus, 'reserved');
    assert.equal(created(repository.plan, 'session_teachers').assignmentSource, 'appointment');
    assert.equal(repository.plan.filter((item) => item.collection === 'schedule_claims').length, 8);
    assert.equal(repository.plan.filter((item) => item.collection === 'session_credit_allocations').length, 1);
    assert.equal(created(repository.plan, 'credit_operations').type, 'confirm_appointment');
    assert.deepEqual(repository.plan.filter((item) => item.collection === 'appointment_requests')
        .map((item) => item.data.status).sort(), ['confirmed', 'slot_taken']);
});

test('confirmation closes an expired or no-longer-eligible request without partial lesson records', async () => {
    const expiredRepository = decisionRepository({ appointment: appointment({ responseDeadline: NOW }) });
    const expired = await decisionService(expiredRepository).confirm(confirmCommand());
    assert.equal(expired.status, 'expired');
    assert.equal(expiredRepository.plan.some((item) => item.collection === 'sessions'), false);

    const ineligibleRepository = decisionRepository({ batches: [] });
    const ineligible = await decisionService(ineligibleRepository).confirm(confirmCommand());
    assert.equal(ineligible.status, 'eligibility_lost');
    assert.equal(ineligibleRepository.plan.some((item) => item.collection === 'credit_batches'), false);
});

test('confirmation rejects ownership, unavailable slots, and maps claim races to a stable code', async () => {
    await assert.rejects(
        decisionService(decisionRepository()).confirm(confirmCommand({ teacherId: 'other' })),
        (error) => error.code === 'APPOINTMENT_TEACHER_FORBIDDEN'
    );
    await assert.rejects(
        decisionService(decisionRepository(), { slots: [] }).confirm(confirmCommand()),
        (error) => error.code === 'BOOKING_SLOT_TAKEN'
    );
    await assert.rejects(
        decisionService(decisionRepository({
            sendError: Object.assign(new Error('unique schedule_claim conflict'), { status: 409 }),
        })).confirm(confirmCommand()),
        (error) => error.code === 'BOOKING_SLOT_TAKEN'
    );
});

test('confirmation replays the stored operation for the same idempotency request', async () => {
    const repository = decisionRepository({ existingOperation: {
        requestSnapshot: { requestHash: fingerprintRequest({ appointmentId: 'appointment' }) },
        resultSnapshot: { appointmentId: 'appointment', lessonId: 'lesson-stored', status: 'confirmed' },
    } });
    const result = await decisionService(repository).confirm(confirmCommand());
    assert.equal(result.replayed, true);
    assert.equal(result.lessonId, 'lesson-stored');
    assert.equal(repository.plan, null);
});

test('student request writes immutable event and rejects duplicate or conflicting idempotency reuse', async () => {
    const repository = requestRepository();
    const service = requestService(repository);
    const result = await service.createRequest(requestCommand());
    assert.equal(result.status, 'pending');
    assert.equal(created(repository.plan, 'appointment_requests').requestFingerprint.length, 64);
    assert.equal(created(repository.plan, 'appointment_events').metadata.occurredAt, NOW);
    assert.equal(created(repository.plan, 'appointment_events').businessTime, undefined);

    const stored = created(repository.plan, 'appointment_requests');
    const replayRepository = requestRepository({ existing: stored });
    const replay = await requestService(replayRepository).createRequest(requestCommand());
    assert.equal(replay.replayed, true);
    await assert.rejects(
        requestService(replayRepository).createRequest(requestCommand({ startAt: '2026-08-03T01:30:00.000Z' })),
        (error) => error.code === 'IDEMPOTENCY_CONFLICT'
    );

    await assert.rejects(
        requestService(requestRepository({ duplicate: appointment() })).createRequest(requestCommand()),
        (error) => error.code === 'APPOINTMENT_PENDING_DUPLICATE'
    );
});

test('student request rejects inactive offerings, stale slots, and malformed commands', async () => {
    await assert.rejects(
        requestService(requestRepository({ offering: offering({ status: 'inactive' }) })).createRequest(requestCommand()),
        hasCode('BOOKING_OFFERING_INACTIVE')
    );
    await assert.rejects(
        requestService(requestRepository(), []).createRequest(requestCommand()),
        hasCode('BOOKING_SLOT_UNAVAILABLE')
    );
    for (const [changes, code] of [
        [{ studentId: '' }, 'BOOKING_STUDENT_REQUIRED'],
        [{ offeringId: '' }, 'BOOKING_OFFERING_REQUIRED'],
        [{ startAt: '' }, 'BOOKING_START_REQUIRED'],
        [{ endAt: '' }, 'BOOKING_END_REQUIRED'],
        [{ endAt: START }, 'BOOKING_REQUEST_TIME_INVALID'],
    ]) {
        await assert.rejects(requestService(requestRepository()).createRequest(requestCommand(changes)), hasCode(code));
    }
});

test('request event defaults identity and trims optional text without trusting missing actor fields', async () => {
    const repository = requestRepository();
    await requestService(repository).createRequest(requestCommand({
        actorId: undefined, actorRole: undefined, note: null,
    }));
    const appointment = created(repository.plan, 'appointment_requests');
    const requested = created(repository.plan, 'appointment_events');
    assert.equal(appointment.note, '');
    assert.equal(requested.actorId, 'student');
    assert.equal(requested.actorRole, 'student');
    assert.equal(normalizeText('  abc  ', 2), 'ab');
    assert.equal(normalizeText(null, 20), '');
    assert.equal(event(() => 'event', appointment, 'manual', 'pending', 'pending', {
        studentId: 'student', reason: '  手工备注  ', traceId: 'trace',
    }, NOW, { source: 'test' }).data.metadata.source, 'test');
});

test('materialization validates teacher rules and snapshots the existing lesson contract', () => {
    const result = materializeAppointment({
        appointment: appointment(),
        course: course(),
        offering: offering(),
        teacherRule: teacherRule(),
        now: NOW,
        sessionId: 'session',
        sessionStudentId: 'session-student',
        sessionTeacherId: 'session-teacher',
    });
    assert.equal(result.session.attendanceRuleSnapshot.absent, 'consume');
    assert.equal(result.session.settlementRuleSnapshot.cancelled, 'release');
    assert.equal(result.session.teacherRuleSnapshot.rules.lead.ruleId, 'teacher-rule');
    assert.throws(() => teacherSnapshot(null, 'course'), /课酬规则/);
    assert.throws(() => teacherSnapshot(teacherRule({ courseSpecId: 'other' }), 'course'), /不匹配/);
});

const NOW = '2026-08-01T00:00:00.000Z';
const START = '2026-08-03T01:00:00.000Z';
const END = '2026-08-03T02:00:00.000Z';

function decisionService(repository, query = {}) {
    return new AppointmentDecisionService(repository, {
        async availableSlots() {
            return { slots: query.slots === undefined ? [{ startAt: START, endAt: END }] : query.slots };
        },
    }, { clock: () => Date.parse(NOW), idFactory: ids() });
}

function requestService(repository, slots = [{ startAt: START, endAt: END }]) {
    return new AppointmentRequestService(repository, {
        async availableSlots() { return { slots }; },
    }, { clock: () => Date.parse(NOW), idFactory: ids() });
}

function decisionRepository(options = {}) {
    const state = {
        appointment: options.appointment || appointment(),
        batches: options.batches === undefined ? [batch()] : options.batches,
    };
    return {
        plan: null,
        async findFirst(collection) {
            return collection === 'credit_operations' ? (options.existingOperation || null) : null;
        },
        async get(collection) {
            if (collection === 'appointment_requests') return state.appointment;
            if (collection === 'teacher_course_offerings') return offering();
            if (collection === 'course_specs') return course();
            if (collection === 'credit_types') return creditType();
            throw new Error(`Unexpected get ${collection}`);
        },
        async list(collection) {
            if (collection === 'teacher_credit_rules') return [teacherRule()];
            if (collection === 'credit_batches') return state.batches;
            if (collection === 'appointment_requests') return [state.appointment, ...(options.competing || [])];
            throw new Error(`Unexpected list ${collection}`);
        },
        async send(plan) {
            this.plan = plan;
            if (options.sendError) throw options.sendError;
            return plan;
        },
    };
}

function requestRepository(options = {}) {
    return {
        plan: null,
        async findFirst(collection, filter) {
            return filter.includes('idempotencyKey') ? (options.existing || null) : (options.duplicate || null);
        },
        async get(collection) {
            if (collection === 'teacher_course_offerings') return options.offering || offering();
            if (collection === 'booking_policies') return options.policy || policy();
            throw new Error(`Unexpected get ${collection}`);
        },
        async send(plan) { this.plan = plan; return plan; },
    };
}

function appointment(changes = {}) {
    return {
        id: 'appointment',
        studentId: 'student',
        teacherId: 'teacher',
        offeringId: 'offering',
        courseSpecId: 'course',
        creditTypeId: 'credit-type',
        policyId: 'policy',
        status: 'pending',
        requestedStartAt: START,
        requestedEndAt: END,
        responseDeadline: '2026-08-02T01:00:00.000Z',
        policySnapshot: policy(),
        version: 1,
        ...changes,
    };
}

function offering(changes = {}) {
    return {
        id: 'offering', teacherId: 'teacher', courseSpecId: 'course', creditTypeId: 'credit-type',
        policyId: 'policy', status: 'active', location: '第一教室', availabilityMode: 'default', ...changes,
    };
}

function course(changes = {}) {
    return { id: 'course', name: '一对一声乐', durationMinutes: 60, ...changes };
}

function creditType(changes = {}) {
    return { id: 'credit-type', kind: 'course', consumable: true, courseSpecId: 'course', ...changes };
}

function teacherRule(changes = {}) {
    return {
        id: 'teacher-rule', courseSpecId: 'course', role: 'lead', baseQuantity: 1,
        durationFactor: 0, participantFactor: 0, version: 2, status: 'active', ...changes,
    };
}

function batch(changes = {}) {
    return {
        id: 'batch', studentId: 'student', creditTypeId: 'credit-type', originalQuantity: 4,
        availableQuantity: 4, frozenQuantity: 0, consumedQuantity: 0, expiredQuantity: 0,
        reversedQuantity: 0, status: 'active', validFrom: '2026-01-01T00:00:00.000Z',
        effectiveExpiresAt: '2026-12-31T00:00:00.000Z', activationMode: 'GRANT_TIME',
        activatedAt: '2026-01-01T00:00:00.000Z', priority: 0, version: 1,
        created: '2026-01-01T00:00:00.000Z', ...changes,
    };
}

function policy(changes = {}) {
    return {
        timezone: 'Asia/Shanghai',
        defaultWindows: [{ startMinute: 540, endMinute: 660 }, { startMinute: 840, endMinute: 1140 }],
        slotStepMinutes: 30,
        claimGranularityMinutes: 15,
        minLeadMinutes: 0,
        maxAdvanceDays: 30,
        responseTtlMinutes: 1440,
        responseCutoffMinutes: 360,
        cancellationCutoffMinutes: 720,
        version: 1,
        ...changes,
    };
}

function confirmCommand(changes = {}) {
    return {
        appointmentId: 'appointment', teacherId: 'teacher', actorId: 'teacher', actorRole: 'teacher',
        idempotencyKey: 'confirm-key', ...changes,
    };
}

function requestCommand(changes = {}) {
    return {
        studentId: 'student', offeringId: 'offering', startAt: START, endAt: END,
        actorId: 'student', actorRole: 'student', idempotencyKey: 'request-key', note: '希望练习气息', ...changes,
    };
}

function ids() {
    let value = 0;
    return () => `booking-id-${++value}`;
}

function created(plan, collection) {
    return plan.find((item) => item.action === 'create' && item.collection === collection)?.data;
}

function hasCode(code) {
    return (error) => error?.code === code;
}
