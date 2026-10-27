const test = require('node:test');
const assert = require('node:assert/strict');

const {
    loadTeacherAvailabilityWindows,
    offeringWindows,
    subtractWindow,
    subtractWindows,
} = require('../src/services/courseCredits/schedule/availabilityWindows');

test('availability subtraction splits, trims, and preserves non-overlapping windows', () => {
    assert.deepEqual(subtractWindow({ startMinute: 540, endMinute: 660 }, {
        startMinute: 600, endMinute: 630,
    }), [
        { startMinute: 540, endMinute: 600 },
        { startMinute: 630, endMinute: 660 },
    ]);
    assert.deepEqual(subtractWindow({ startMinute: 540, endMinute: 600 }, {
        startMinute: 600, endMinute: 630,
    }), [{ startMinute: 540, endMinute: 600 }]);
    assert.deepEqual(subtractWindows([
        { startMinute: 540, endMinute: 660 },
        { startMinute: 840, endMinute: 900 },
    ], [
        { startMinute: 530, endMinute: 550 },
        { startMinute: 650, endMinute: 850 },
    ]), [
        { startMinute: 550, endMinute: 650 },
        { startMinute: 850, endMinute: 900 },
    ]);
});

test('teacher availability expands active offering rules and removes unavailable overrides', async () => {
    const range = {
        from: '2026-08-03T00:00:00.000+08:00',
        to: '2026-08-04T00:00:00.000+08:00',
    };
    const offering = {
        id: 'offering-1', teacherId: 'teacher-1', courseSpecId: 'course-1', policyId: 'policy-1',
        availabilityMode: 'custom', status: 'active',
        expand: {
            courseSpecId: { id: 'course-1', name: '声乐一对一' },
            policyId: { id: 'policy-1' },
        },
    };
    const rules = [{
        offeringId: 'offering-1', weekday: 1, startMinute: 540, endMinute: 660, status: 'active',
    }];
    const overrides = [{
        offeringId: 'offering-1', type: 'unavailable', status: 'active',
        startAt: '2026-08-03T10:00:00.000+08:00', endAt: '2026-08-03T10:30:00.000+08:00',
    }];
    const repository = {
        async list(collection) {
            if (collection === 'teacher_course_offerings') return [offering];
            if (collection === 'teacher_availability_rules') return rules;
            return overrides;
        },
    };

    const result = await loadTeacherAvailabilityWindows(repository, 'teacher-1', range);
    assert.deepEqual(result.map((item) => [item.startAt, item.endAt]), [
        ['2026-08-03T01:00:00.000Z', '2026-08-03T02:00:00.000Z'],
        ['2026-08-03T02:30:00.000Z', '2026-08-03T03:00:00.000Z'],
    ]);
    assert.equal(result[0].course.name, '声乐一对一');

    const outside = offeringWindows(offering, {
        from: '2026-08-03T11:30:00.000+08:00', to: '2026-08-03T12:00:00.000+08:00',
    }, rules, []);
    assert.deepEqual(outside, []);

    const fallback = offeringWindows({
        id: 'fallback', courseSpecId: 'course-fallback', availabilityMode: 'default', expand: {},
    }, {
        from: '2026-08-03T09:00:00.000+08:00', to: '2026-08-03T09:30:00.000+08:00',
    }, [], []);
    assert.equal(fallback[0].course.courseId, 'course-fallback');
    assert.equal(fallback[0].course.name, '课程');
});
