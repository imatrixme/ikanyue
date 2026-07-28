const test = require('node:test');
const assert = require('node:assert/strict');

const {
    TeacherAvailabilityService,
    normalizeWeeklyRules,
    validateOverride,
} = require('../src/services/courseCredits/booking/availabilityService');

test('teacher replaces weekly availability and can restore institution defaults', async () => {
    const repository = availabilityRepository({ rules: [storedRule()] });
    const service = createService(repository);
    const result = await service.saveWeekly(command({
        rules: [{ weekday: 1, startMinute: 540, endMinute: 660 }],
    }));
    assert.equal(result.availabilityMode, 'custom');
    assert.equal(repository.plan.filter((item) => item.collection === 'teacher_availability_rules'
        && item.action === 'create').length, 1);
    assert.equal(repository.plan.find((item) => item.collection === 'teacher_course_offerings'
        && item.action === 'update').data.availabilityMode, 'custom');

    const defaults = availabilityRepository({ rules: [storedRule()] });
    assert.equal((await createService(defaults).saveWeekly(command({ rules: [] }))).availabilityMode, 'default');
});

test('teacher creates and cancels a future date override with ownership and policy guards', async () => {
    const repository = availabilityRepository();
    const service = createService(repository);
    const created = await service.createOverride(command({
        type: 'available', startAt: '2026-08-03T01:00:00.000Z', endAt: '2026-08-03T02:00:00.000Z',
        reason: '临时加开',
    }));
    assert.equal(created.status, 'active');
    assert.equal(repository.plan.find((item) => item.collection === 'teacher_availability_overrides'
        && item.action === 'create').data.type, 'available');

    const cancelledRepo = availabilityRepository({ override: override() });
    const cancelled = await createService(cancelledRepo).cancelOverride(command({ overrideId: 'override' }));
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelledRepo.plan.find((item) => item.collection === 'teacher_availability_overrides'
        && item.action === 'update').data.version, 2);
});

test('academic operators derive teacher ownership from offering and override records', async () => {
    const weeklyRepo = availabilityRepository();
    const weekly = await createService(weeklyRepo).saveWeeklyForOperator(command({
        teacherId: undefined, rules: [{ weekday: 2, startMinute: 540, endMinute: 600 }],
    }));
    assert.equal(weekly.ruleCount, 1);
    assert.equal(weeklyRepo.plan.find((item) => item.collection === 'teacher_availability_rules'
        && item.action === 'create').data.teacherId, 'teacher');

    const overrideRepo = availabilityRepository();
    const created = await createService(overrideRepo).createOverrideForOperator(command({
        teacherId: undefined, type: 'unavailable',
        startAt: '2026-08-03T00:00:00.000Z', endAt: '2026-08-03T01:00:00.000Z',
    }));
    assert.equal(created.status, 'active');

    const cancelRepo = availabilityRepository({ override: override() });
    const cancelled = await createService(cancelRepo).cancelOverrideForOperator(command({
        teacherId: undefined, offeringId: undefined, overrideId: 'override',
    }));
    assert.equal(cancelled.status, 'cancelled');
});

test('availability validation prevents overlap and teacher time outside institution windows', () => {
    const policy = bookingPolicy();
    assert.throws(() => normalizeWeeklyRules([
        { weekday: 2, startMinute: 540, endMinute: 600 },
        { weekday: 2, startMinute: 590, endMinute: 630 },
    ], policy), /不能重叠/);
    assert.throws(() => normalizeWeeklyRules([
        { weekday: 2, startMinute: 480, endMinute: 540 },
    ], policy), /不能超出/);
    assert.throws(() => validateOverride({
        type: 'available', startAt: '2026-08-03T00:00:00.000Z', endAt: '2026-08-03T01:00:00.000Z',
    }, policy, NOW), /不能超出/);
    assert.doesNotThrow(() => validateOverride({
        type: 'unavailable', startAt: '2026-08-03T00:00:00.000Z', endAt: '2026-08-03T01:00:00.000Z',
    }, policy, NOW));
});

const NOW = '2026-08-01T00:00:00.000Z';

function createService(repository) {
    return new TeacherAvailabilityService(repository, { clock: () => Date.parse(NOW), idFactory: ids() });
}

function availabilityRepository(options = {}) {
    return {
        plan: null,
        async findFirst() { return null; },
        async get(collection) {
            if (collection === 'teacher_course_offerings') return offering();
            if (collection === 'booking_policies') return bookingPolicy();
            if (collection === 'teacher_availability_overrides') return options.override || override();
            throw new Error(`Unexpected get ${collection}`);
        },
        async list(collection) {
            if (collection === 'teacher_availability_rules') return options.rules || [];
            throw new Error(`Unexpected list ${collection}`);
        },
        async send(plan) { this.plan = plan; return plan; },
    };
}

function offering(changes = {}) {
    return {
        id: 'offering', teacherId: 'teacher', policyId: 'policy', status: 'active',
        availabilityMode: 'default', version: 1, ...changes,
    };
}

function bookingPolicy() {
    return {
        timezone: 'Asia/Shanghai',
        defaultWindows: [{ startMinute: 540, endMinute: 660 }, { startMinute: 840, endMinute: 1140 }],
        slotStepMinutes: 30, claimGranularityMinutes: 15, minLeadMinutes: 720, maxAdvanceDays: 30,
        responseTtlMinutes: 1440, responseCutoffMinutes: 360, cancellationCutoffMinutes: 720, version: 1,
    };
}

function storedRule() {
    return {
        id: 'rule', teacherId: 'teacher', offeringId: 'offering', weekday: 1,
        startMinute: 540, endMinute: 600, status: 'active', version: 1,
    };
}

function override(changes = {}) {
    return { id: 'override', teacherId: 'teacher', status: 'active', version: 1, ...changes };
}

function command(changes = {}) {
    return {
        teacherId: 'teacher', offeringId: 'offering', actorId: 'teacher', actorRole: 'teacher',
        idempotencyKey: 'availability-key', ...changes,
    };
}

function ids() {
    let value = 0;
    return () => `availability-id-${++value}`;
}
