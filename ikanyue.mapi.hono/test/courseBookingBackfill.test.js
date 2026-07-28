const test = require('node:test');
const assert = require('node:assert/strict');

const { ScheduleClaimBackfillService, buildReport } = require('../src/services/courseCredits/booking/backfillService');
const { sessionClaimPlan } = require('../src/services/courseCredits/booking/claimPlanning');

test('backfill preview separates ready, already claimed, and conflicting future lessons', () => {
    const ready = entry('ready', 'teacher-c');
    const claimed = entry('claimed', 'teacher-b');
    const conflict = entry('conflict', 'teacher-a');
    const existing = [
        ...claimed.plan.claims.map((claim) => ({ ...claim, sourceId: 'claimed' })),
        { ...conflict.plan.claims[0], sourceId: 'other-session' },
    ];
    const report = buildReport([claimed, ready, conflict], existing);
    assert.deepEqual(report.claimed, [{ sessionId: 'claimed' }]);
    assert.ok(report.conflicts.length > 0);
    assert.equal(report.ready.some((item) => item.sessionId === 'ready'), true);
});

test('backfill apply creates claims and disables offerings for conflicting teachers', async () => {
    const repository = mockRepository();
    const result = await service(repository).apply(command());
    assert.equal(result.scannedCount, 2);
    assert.ok(result.conflictCount > 0);
    assert.deepEqual(result.disabledOfferingIds, ['offering']);
    assert.equal(repository.plan.some((item) => item.collection === 'booking_conflicts'), true);
    assert.equal(repository.plan.find((item) => item.collection === 'teacher_course_offerings'
        && item.action === 'update').data.status, 'inactive');
    assert.equal(repository.plan.find((item) => item.collection === 'credit_operations').data.type,
        'backfill_schedule_claims');
});

const START = '2026-08-03T01:00:00.000Z';
const END = '2026-08-03T02:00:00.000Z';

function service(repository) {
    return new ScheduleClaimBackfillService(repository, {
        clock: () => Date.parse('2026-08-01T00:00:00.000Z'), idFactory: ids(),
    });
}

function mockRepository() {
    const sessions = [session('session-a'), session('session-b')];
    return {
        plan: null,
        async findFirst() { return null; },
        async list(collection, options) {
            if (collection === 'sessions') return sessions;
            if (collection === 'session_students') return [{ id: `student-row-${options.filter}`, studentId: 'student' }];
            if (collection === 'session_teachers') return [{ id: `teacher-row-${options.filter}`, teacherId: 'teacher' }];
            if (collection === 'schedule_claims') {
                return [{
                    id: 'existing', ownerType: 'teacher', ownerId: 'teacher', status: 'active',
                    sourceType: 'session', sourceId: 'legacy-session',
                    cellStartAt: START, cellEndAt: '2026-08-03T01:15:00.000Z',
                }];
            }
            if (collection === 'teacher_course_offerings') {
                return [{ id: 'offering', teacherId: 'teacher', status: 'active', version: 1 }];
            }
            throw new Error(`Unexpected list ${collection}`);
        },
        async send(plan) { this.plan = plan; return plan; },
    };
}

function entry(sessionId, teacherId) {
    return {
        session: session(sessionId),
        plan: sessionClaimPlan({
            sessionId, teacherIds: [teacherId], studentIds: [`student-${sessionId}`],
            startAt: START, endAt: END, granularityMinutes: 15, idFactory: ids(),
        }),
    };
}

function session(id) {
    return { id, status: 'scheduled', startAt: START, endAt: END, appointmentId: '' };
}

function command() {
    return {
        from: '2026-08-01T00:00:00.000Z', actorId: 'admin', actorRole: 'admin',
        idempotencyKey: 'backfill-key',
    };
}

function ids() {
    let value = 0;
    return () => `backfill-id-${++value}`;
}
