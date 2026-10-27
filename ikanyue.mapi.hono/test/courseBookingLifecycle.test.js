const test = require('node:test');
const assert = require('node:assert/strict');

const {
    AppointmentCancellationService,
    authorizeCancellation,
    cancellationType,
    validateInput,
} = require('../src/services/courseCredits/booking/cancellationService');
const { PendingAppointmentService } = require('../src/services/courseCredits/booking/pendingLifecycleService');
const { AppointmentRescheduleService } = require('../src/services/courseCredits/booking/rescheduleService');
const { AppointmentWorkerService } = require('../src/services/courseCredits/booking/workerService');

test('teacher decline and student withdrawal append a guarded pending transition', async () => {
    const declineRepo = lifecycleRepository();
    const declined = await pendingService(declineRepo).decline(command({ reason: '时间不合适' }));
    assert.equal(declined.status, 'declined');
    assert.equal(updateFor(declineRepo.plan, 'appointment_requests').status, 'declined');

    const withdrawRepo = lifecycleRepository();
    const withdrawn = await pendingService(withdrawRepo).withdraw(command({
        actorId: 'student', actorRole: 'student', studentId: 'student', reason: '计划有变',
    }));
    assert.equal(withdrawn.status, 'withdrawn');
    assert.equal(updateFor(withdrawRepo.plan, 'appointment_requests').cancelledAt, NOW);

    await assert.rejects(
        pendingService(lifecycleRepository()).decline(command({ teacherId: 'other', reason: '无空档' })),
        (error) => error.code === 'APPOINTMENT_TEACHER_FORBIDDEN'
    );
});

test('Admin can decline a pending appointment without teacher impersonation', async () => {
    const repository = lifecycleRepository();
    const declined = await pendingService(repository).decline(command({
        actorId: 'operator', actorRole: 'admin', teacherId: undefined, reason: '教务代教师拒绝',
    }));

    assert.equal(declined.status, 'declined');
    assert.equal(updateFor(repository.plan, 'appointment_requests').status, 'declined');
    assert.equal(repository.plan.find((item) => item.collection === 'appointment_events').data.actorRole, 'admin');
});

test('pending appointment transitions reject missing owners, missing reasons, and stale state', async () => {
    await assert.rejects(pendingService(lifecycleRepository()).decline(command({ appointmentId: '' })),
        hasCode('APPOINTMENT_ID_REQUIRED'));
    await assert.rejects(pendingService(lifecycleRepository()).decline(command({ teacherId: '' })),
        hasCode('APPOINTMENT_OWNER_REQUIRED'));
    await assert.rejects(pendingService(lifecycleRepository()).decline(command({ reason: '' })),
        hasCode('APPOINTMENT_DECLINE_REASON_REQUIRED'));
    await assert.rejects(pendingService(lifecycleRepository()).withdraw(command({
        actorRole: 'student', studentId: 'other', reason: undefined,
    })), hasCode('APPOINTMENT_STUDENT_FORBIDDEN'));
    await assert.rejects(pendingService(lifecycleRepository({
        appointment: appointment({ status: 'confirmed' }),
    })).withdraw(command({ actorRole: 'student', studentId: 'student', reason: undefined })),
    hasCode('APPOINTMENT_NOT_PENDING'));
});

test('confirmed appointment cancellation releases lesson hours and all active schedule claims atomically', async () => {
    const repository = lifecycleRepository({ appointment: appointment({ status: 'confirmed', sessionId: 'session' }) });
    const result = await cancellationService(repository).cancel(command({
        actorId: 'student', actorRole: 'student', studentId: 'student', reason: '临时有事',
    }));

    assert.equal(result.status, 'cancelled');
    assert.equal(updateFor(repository.plan, 'sessions').status, 'cancelled');
    assert.equal(updateFor(repository.plan, 'credit_batches').frozenQuantity, 0);
    assert.equal(updateFor(repository.plan, 'session_students').creditStatus, 'released');
    assert.equal(repository.plan.filter((item) => item.collection === 'schedule_claims'
        && item.action === 'update').length, 2);
    assert.equal(repository.plan.filter((item) => item.collection === 'credit_events'
        && item.data.eventType === 'RELEASE').length, 1);
});

test('student cancellation respects the snapshotted cutoff and ownership', async () => {
    const tooLate = lifecycleRepository({ appointment: appointment({
        status: 'confirmed', sessionId: 'session', requestedStartAt: '2026-08-01T01:00:00.000Z',
    }) });
    await assert.rejects(
        cancellationService(tooLate).cancel(command({
            actorId: 'student', actorRole: 'student', studentId: 'student', reason: '临时有事',
        })),
        (error) => error.code === 'APPOINTMENT_CANCELLATION_CUTOFF_PASSED'
    );
});

test('teacher reschedule swaps claims, preserves reservation, and updates lesson and appointment time', async () => {
    const repository = lifecycleRepository({ appointment: appointment({ status: 'confirmed', sessionId: 'session' }) });
    const result = await rescheduleService(repository).reschedule(command({
        reason: '调整教学安排', newStartAt: NEW_START, newEndAt: NEW_END,
    }));

    assert.equal(result.status, 'rescheduled');
    assert.equal(updateFor(repository.plan, 'sessions').startAt, NEW_START);
    assert.equal(updateFor(repository.plan, 'appointment_requests').requestedStartAt, NEW_START);
    assert.equal(repository.plan.filter((item) => item.collection === 'schedule_claims'
        && item.action === 'create').length, 8);
    assert.equal(repository.plan.filter((item) => item.collection === 'schedule_claims'
        && item.action === 'update').length, 2);
    assert.equal(updateFor(repository.plan, 'session_credit_allocations').reservedForStartAt, NEW_START);
});

test('reschedule preserves the old state when target availability or eligibility fails', async () => {
    const unavailable = lifecycleRepository({ appointment: appointment({ status: 'confirmed', sessionId: 'session' }) });
    await assert.rejects(
        rescheduleService(unavailable, []).reschedule(command({
            reason: '调整安排', newStartAt: NEW_START, newEndAt: NEW_END,
        })),
        (error) => error.code === 'BOOKING_SLOT_TAKEN'
    );
    assert.equal(unavailable.plan, null);

    const expiredBatch = lifecycleRepository({
        appointment: appointment({ status: 'confirmed', sessionId: 'session' }),
        batch: batch({ effectiveExpiresAt: '2026-08-03T01:30:00.000Z' }),
        candidateBatches: [],
    });
    await assert.rejects(
        rescheduleService(expiredBatch).reschedule(command({
            reason: '调整安排', newStartAt: NEW_START, newEndAt: NEW_END,
        })),
        (error) => error.code === 'APPOINTMENT_ELIGIBILITY_LOST'
    );
    assert.equal(expiredBatch.plan, null);
});

test('workers expire pending requests and fulfill appointments linked to completed lessons', async () => {
    const expiredRepo = lifecycleRepository({ workerAppointments: [appointment()] });
    const expired = await workerService(expiredRepo).expirePending(command({ cutoffAt: NOW }));
    assert.equal(expired.processedCount, 1);
    assert.equal(updateFor(expiredRepo.plan, 'appointment_requests').status, 'expired');
    assert.match(expiredRepo.listOptions[0].filter, /responseDeadline<="2026-08-01 00:00:00\.000Z"/);

    const fulfilledRepo = lifecycleRepository({
        workerAppointments: [appointment({ status: 'confirmed', sessionId: 'session' })],
    });
    const fulfilled = await workerService(fulfilledRepo).fulfillCompleted(command({ cutoffAt: NOW }));
    assert.equal(fulfilled.status, 'fulfilled');
    assert.equal(updateFor(fulfilledRepo.plan, 'appointment_requests').status, 'fulfilled');
});

test('cancellation authorization and worker empty paths preserve role and audit boundaries', async () => {
    assert.equal(cancellationType({ actorRole: 'student' }), 'student');
    assert.equal(cancellationType({ actorRole: 'teacher' }), 'teacher');
    assert.equal(cancellationType({ actorRole: 'admin', cancellationType: 'institution' }), 'institution');
    assert.equal(cancellationType({ actorRole: 'admin' }), 'admin');
    assert.doesNotThrow(() => authorizeCancellation(
        appointment({ status: 'confirmed' }), { actorRole: 'teacher', teacherId: 'teacher' }, NOW
    ));
    assert.doesNotThrow(() => authorizeCancellation(
        appointment({ status: 'confirmed', teacherId: { id: 'teacher' } }),
        { actorRole: 'teacher', teacherId: 'teacher' }, NOW
    ));
    assert.doesNotThrow(() => authorizeCancellation(
        appointment({ status: 'rescheduled' }), { actorRole: 'admin' }, NOW
    ));
    const noCutoff = appointment({ status: 'confirmed' });
    delete noCutoff.policySnapshot;
    assert.doesNotThrow(() => authorizeCancellation(
        noCutoff, { actorRole: 'student', studentId: 'student' }, NOW
    ));
    assert.throws(() => authorizeCancellation(
        appointment({ status: 'confirmed' }), { actorRole: 'teacher', teacherId: 'other' }, NOW
    ), hasCode('APPOINTMENT_TEACHER_FORBIDDEN'));
    assert.throws(() => authorizeCancellation(
        appointment({ status: 'confirmed' }), { actorRole: 'guardian' }, NOW
    ), hasCode('APPOINTMENT_CANCEL_FORBIDDEN'));
    assert.throws(() => validateInput({ appointmentId: '', reason: '原因' }), hasCode('APPOINTMENT_ID_REQUIRED'));
    assert.throws(() => validateInput({ appointmentId: 'appointment', reason: 'x' }),
        hasCode('APPOINTMENT_CANCEL_REASON_REQUIRED'));

    const repository = lifecycleRepository({ workerAppointments: [] });
    const result = await workerService(repository).expirePending(command());
    assert.equal(result.processedCount, 0);
    assert.equal(repository.plan.some((item) => item.collection === 'appointment_requests'), false);
    await assert.rejects(workerService(repository).commitTransitions(
        { at: NOW, operationId: 'operation', requestHash: 'hash', scopedKey: 'key' },
        command(), null, 'expired', 'expire_appointment', NOW
    ), hasCode('APPOINTMENT_WORKER_RESULT_INVALID'));
});

const NOW = '2026-08-01T00:00:00.000Z';
const START = '2026-08-03T01:00:00.000Z';
const END = '2026-08-03T02:00:00.000Z';
const NEW_START = '2026-08-04T06:00:00.000Z';
const NEW_END = '2026-08-04T07:00:00.000Z';

function pendingService(repository) {
    return new PendingAppointmentService(repository, { clock: () => Date.parse(NOW), idFactory: ids() });
}

function cancellationService(repository) {
    return new AppointmentCancellationService(repository, { clock: () => Date.parse(NOW), idFactory: ids() });
}

function rescheduleService(repository, slots = [{ startAt: NEW_START, endAt: NEW_END }]) {
    return new AppointmentRescheduleService(repository, {
        async availableSlots(studentId, query) {
            assert.equal(studentId, 'student');
            assert.equal(query.excludeSourceId, 'session');
            return { slots };
        },
    }, { clock: () => Date.parse(NOW), idFactory: ids() });
}

function workerService(repository) {
    return new AppointmentWorkerService(repository, { clock: () => Date.parse(NOW), idFactory: ids() });
}

function lifecycleRepository(options = {}) {
    const record = options.appointment || appointment();
    const sourceBatch = options.batch || batch();
    return {
        plan: null,
        async findFirst() { return null; },
        async get(collection) {
            if (collection === 'appointment_requests') return record;
            if (collection === 'sessions') return session();
            if (collection === 'credit_types') return { id: 'credit-type', kind: 'course', consumable: true };
            if (collection === 'credit_batches') return sourceBatch;
            throw new Error(`Unexpected get ${collection}`);
        },
        listOptions: [],
        async list(collection, listOptions) {
            this.listOptions.push(listOptions);
            if (collection === 'appointment_requests') return options.workerAppointments || [];
            if (collection === 'session_students') return [sessionStudent()];
            if (collection === 'session_credit_allocations') return [allocation()];
            if (collection === 'schedule_claims') return [claim(), claim({ id: 'claim-2', ownerType: 'student', ownerId: 'student' })];
            if (collection === 'credit_batches') {
                return options.candidateBatches === undefined ? [sourceBatch] : options.candidateBatches;
            }
            throw new Error(`Unexpected list ${collection}`);
        },
        async send(plan) { this.plan = plan; return plan; },
    };
}

function appointment(changes = {}) {
    return {
        id: 'appointment', studentId: 'student', teacherId: 'teacher', offeringId: 'offering',
        status: 'pending', requestedStartAt: START, requestedEndAt: END,
        responseDeadline: '2026-08-02T00:00:00.000Z', policySnapshot: { cancellationCutoffMinutes: 720 },
        sessionId: '', version: 1, ...changes,
    };
}

function session(changes = {}) {
    return {
        id: 'session', status: 'scheduled', startAt: START, endAt: END,
        requiredCreditTypeId: 'credit-type', requiredQuantity: 1,
        attendanceRuleSnapshot: { version: 1, present: 'consume', late: 'consume', leave: 'release', absent: 'consume' },
        settlementRuleSnapshot: { version: 1, cancelled: 'release' }, version: 1, ...changes,
    };
}

function sessionStudent(changes = {}) {
    return {
        id: 'session-student', sessionId: 'session', studentId: 'student', attendanceStatus: 'scheduled',
        creditStatus: 'reserved', version: 1, ...changes,
    };
}

function allocation(changes = {}) {
    return {
        id: 'allocation', sessionStudentId: 'session-student', batchId: 'batch', quantity: 1,
        status: 'reserved', reservedForStartAt: START, ...changes,
    };
}

function batch(changes = {}) {
    return {
        id: 'batch', studentId: 'student', creditTypeId: 'credit-type', originalQuantity: 4,
        availableQuantity: 3, frozenQuantity: 1, consumedQuantity: 0, expiredQuantity: 0,
        reversedQuantity: 0, status: 'active', validFrom: '2026-01-01T00:00:00.000Z',
        effectiveExpiresAt: '2026-12-31T00:00:00.000Z', activationMode: 'GRANT_TIME',
        activatedAt: '2026-01-01T00:00:00.000Z', priority: 0, version: 1,
        created: '2026-01-01T00:00:00.000Z', ...changes,
    };
}

function claim(changes = {}) {
    return {
        id: 'claim-1', ownerType: 'teacher', ownerId: 'teacher', sourceType: 'session', sourceId: 'session',
        cellStartAt: START, cellEndAt: '2026-08-03T01:15:00.000Z', status: 'active', version: 1, ...changes,
    };
}

function command(changes = {}) {
    return {
        appointmentId: 'appointment', teacherId: 'teacher', actorId: 'teacher', actorRole: 'teacher',
        idempotencyKey: 'command-key', ...changes,
    };
}

function ids() {
    let value = 0;
    return () => `lifecycle-id-${++value}`;
}

function updateFor(plan, collection) {
    return plan.find((item) => item.action === 'update' && item.collection === collection)?.data;
}

function hasCode(code) {
    return (error) => error?.code === code;
}
