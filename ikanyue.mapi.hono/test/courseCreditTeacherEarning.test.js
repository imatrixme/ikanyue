const test = require('node:test');
const assert = require('node:assert/strict');

const {
    calculateTeacherEarning,
    planTeacherEarnings,
    roundQuantity,
    sessionDurationHours,
    validateCancellationCompensation,
    validateTeacherRule,
    validateTeacherRuleSnapshot,
} = require('../src/services/courseCredits/domain');

test('teacher earnings use actual roles, duration hours, and participating students', () => {
    const earnings = planTeacherEarnings(
        session(),
        [
            teacher('lead-teacher', 'lead', 'confirmed'),
            teacher('assistant-teacher', 'assistant', 'confirmed'),
            teacher('absent-teacher', 'lead', 'absent'),
        ],
        [student('present'), student('late'), student('leave'), student('absent')],
        'course-spec'
    );
    assert.deepEqual(earnings, [
        {
            eventType: 'earn', quantity: 1.95, ruleId: 'lead-rule', ruleVersion: 4,
            sessionTeacherId: 'lead-teacher', teacherId: 'teacher-lead-teacher',
        },
        {
            eventType: 'earn', quantity: 0.875, ruleId: 'assistant-rule', ruleVersion: 4,
            sessionTeacherId: 'assistant-teacher', teacherId: 'teacher-assistant-teacher',
        },
    ]);
});

test('confirmed substitute earns while the absent default teacher does not', () => {
    const substitute = {
        ...teacher('substitute', 'lead', 'confirmed'),
        assignmentSource: 'substitute',
    };
    const defaultTeacher = {
        ...teacher('default', 'lead', 'absent'),
        assignmentSource: 'class_default',
    };
    const earnings = planTeacherEarnings(
        session(),
        [defaultTeacher, substitute],
        [student('present')],
        'course-spec'
    );

    assert.deepEqual(earnings.map((earning) => earning.teacherId), ['teacher-substitute']);
});

test('cancelled sessions never create normal teacher earnings', () => {
    assert.deepEqual(planTeacherEarnings(
        { ...session(), status: 'cancelled', teacherRuleSnapshot: null },
        [teacher('lead', 'lead', 'confirmed')],
        [student('present')],
        'course-spec'
    ), []);
});

test('cancelled sessions create only explicitly versioned compensation earnings', () => {
    const compensated = {
        ...session(),
        status: 'cancelled',
        teacherRuleSnapshot: {
            version: 5,
            rules: {
                lead: {
                    ...rule('lead-cancellation'),
                    cancellationCompensation: {
                        quantity: 0.75,
                        eligibleActualStatuses: ['planned', 'confirmed'],
                    },
                },
                assistant: rule('assistant-no-compensation'),
            },
        },
    };
    const earnings = planTeacherEarnings(compensated, [
        teacher('planned-lead', 'lead', 'planned'),
        teacher('absent-lead', 'lead', 'absent'),
        teacher('assistant', 'assistant', 'confirmed'),
    ], [], 'course-spec');

    assert.deepEqual(earnings, [{
        eventType: 'compensate', quantity: 0.75, ruleId: 'lead-cancellation', ruleVersion: 5,
        sessionTeacherId: 'planned-lead', teacherId: 'teacher-planned-lead',
    }]);
});

test('teacher earning helpers define precision and duration contracts', () => {
    assert.equal(sessionDurationHours(session()), 1.5);
    assert.equal(roundQuantity(1.23456789), 1.234568);
    assert.equal(calculateTeacherEarning(rule('lead-rule'), {
        durationHours: 1.5, participantCount: 2, role: 'lead',
    }), 1.95);
    assert.equal(validateTeacherRule('lead', rule('lead-rule')).ruleId, 'lead-rule');
    assert.equal(validateTeacherRuleSnapshot(snapshot()).version, 4);
    assert.equal(validateCancellationCompensation({
        quantity: 0.5, eligibleActualStatuses: ['confirmed'],
    }, 'lead').quantity, 0.5);
});

test('teacher rule validation rejects incomplete or unsafe snapshots', () => {
    const cases = [
        [() => validateTeacherRuleSnapshot(null), 'TEACHER_RULE_SNAPSHOT_REQUIRED'],
        [() => validateTeacherRuleSnapshot([]), 'TEACHER_RULE_SNAPSHOT_REQUIRED'],
        [() => validateTeacherRuleSnapshot({ version: 0, rules: { lead: rule('x') } }), 'TEACHER_RULE_VERSION_INVALID'],
        [() => validateTeacherRuleSnapshot({ version: 1, rules: {} }), 'TEACHER_RULES_REQUIRED'],
        [() => validateTeacherRuleSnapshot({ version: 1, rules: [] }), 'TEACHER_RULES_REQUIRED'],
        [() => validateTeacherRule('unknown', rule('x')), 'INVALID_TEACHER_ROLE'],
        [() => validateTeacherRule('lead', null), 'TEACHER_RULE_INVALID'],
        [() => validateTeacherRule('lead', { ...rule('x'), ruleId: '' }), 'TEACHER_RULE_ID_REQUIRED'],
        [() => validateTeacherRule('lead', { ...rule('x'), courseSpecId: '' }), 'TEACHER_RULE_COURSE_REQUIRED'],
        [() => validateTeacherRule('lead', { ...rule('x'), durationFactor: -1 }), 'TEACHER_RULE_FACTOR_INVALID'],
        [() => validateTeacherRule('lead', { ...rule('x'), cancellationCompensation: [] }),
            'TEACHER_CANCELLATION_POLICY_INVALID'],
        [() => validateTeacherRule('lead', { ...rule('x'), cancellationCompensation: {
            quantity: 0, eligibleActualStatuses: ['confirmed'],
        } }), 'TEACHER_CANCELLATION_QUANTITY_INVALID'],
        [() => validateTeacherRule('lead', { ...rule('x'), cancellationCompensation: {
            quantity: 0.0000001, eligibleActualStatuses: ['confirmed'],
        } }), 'TEACHER_CANCELLATION_QUANTITY_INVALID'],
        [() => validateTeacherRule('lead', { ...rule('x'), cancellationCompensation: {
            quantity: 1, eligibleActualStatuses: [],
        } }), 'TEACHER_CANCELLATION_STATUSES_REQUIRED'],
        [() => validateTeacherRule('lead', { ...rule('x'), cancellationCompensation: {
            quantity: 1, eligibleActualStatuses: ['confirmed', 'confirmed'],
        } }), 'TEACHER_CANCELLATION_STATUS_INVALID'],
        [() => validateTeacherRule('lead', { ...rule('x'), cancellationCompensation: {
            quantity: 1, eligibleActualStatuses: ['unknown'],
        } }), 'TEACHER_CANCELLATION_STATUS_INVALID'],
        [() => calculateTeacherEarning(rule('x'), { durationHours: 0, participantCount: 1, role: 'lead' }), 'SESSION_DURATION_INVALID'],
        [() => calculateTeacherEarning(rule('x'), { durationHours: 1, participantCount: -1, role: 'lead' }), 'PARTICIPANT_COUNT_INVALID'],
        [() => calculateTeacherEarning({ ...rule('x'), baseQuantity: 0, durationFactor: 0, participantFactor: 0 }, {
            durationHours: 1, participantCount: 0, role: 'lead',
        }), 'TEACHER_EARNING_NOT_POSITIVE'],
        [() => sessionDurationHours({ ...session(), endAt: session().startAt }), 'SESSION_DURATION_INVALID'],
    ];
    for (const [callback, code] of cases) assertCode(callback, code);
});

test('teacher planning rejects missing lead, role rule, and course mismatch', () => {
    assertCode(() => planTeacherEarnings(session(), [teacher('assistant', 'assistant', 'confirmed')], [], 'course-spec'),
        'SESSION_CONFIRMED_LEAD_REQUIRED');
    assertCode(() => planTeacherEarnings(
        { ...session(), teacherRuleSnapshot: { version: 1, rules: { lead: rule('lead') } } },
        [teacher('lead', 'lead', 'confirmed'), teacher('assistant', 'assistant', 'confirmed')],
        [],
        'course-spec'
    ), 'TEACHER_RULE_NOT_FOUND');
    assertCode(() => planTeacherEarnings(
        { ...session(), teacherRuleSnapshot: {
            version: 1, rules: { lead: { ...rule('lead'), courseSpecId: 'other' } },
        } },
        [teacher('lead', 'lead', 'confirmed')],
        [],
        'course-spec'
    ), 'TEACHER_RULE_COURSE_MISMATCH');
    assertCode(() => planTeacherEarnings(
        {
            ...session(), status: 'cancelled', teacherRuleSnapshot: {
                version: 1,
                rules: { lead: {
                    ...rule('lead'), courseSpecId: 'other',
                    cancellationCompensation: { quantity: 1, eligibleActualStatuses: ['confirmed'] },
                } },
            },
        },
        [teacher('lead', 'lead', 'confirmed')],
        [],
        'course-spec'
    ), 'TEACHER_RULE_COURSE_MISMATCH');
});

function session() {
    return {
        id: 'session', status: 'completed',
        startAt: '2026-08-10T10:00:00.000Z', endAt: '2026-08-10T11:30:00.000Z',
        teacherRuleSnapshot: snapshot(),
    };
}

function snapshot() {
    return {
        version: 4,
        rules: {
            lead: rule('lead-rule'),
            assistant: {
                ...rule('assistant-rule'), baseQuantity: 0.5,
                durationFactor: 0.25, participantFactor: 0,
            },
        },
    };
}

function rule(ruleId) {
    return {
        ruleId, courseSpecId: 'course-spec', baseQuantity: 1,
        durationFactor: 0.5, participantFactor: 0.1,
    };
}

function teacher(id, role, actualStatus) {
    return { id, teacherId: `teacher-${id}`, role, actualStatus };
}

function student(attendanceStatus) {
    return { attendanceStatus };
}

function assertCode(callback, code) {
    assert.throws(callback, (error) => error.code === code);
}
