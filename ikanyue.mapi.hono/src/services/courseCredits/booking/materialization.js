const { createOperationNo, invariant, validateTeacherRuleSnapshot } = require('../domain');

const ATTENDANCE_RULE_SNAPSHOT = Object.freeze({
    version: 1,
    present: 'consume',
    late: 'consume',
    leave: 'release',
    absent: 'consume',
});

const SETTLEMENT_RULE_SNAPSHOT = Object.freeze({
    version: 1,
    cancelled: 'release',
});

function materializeAppointment(input = {}) {
    validateInput(input);
    const { appointment, course, offering, teacherRule } = input;
    const sessionId = input.sessionId;
    const sessionStudentId = input.sessionStudentId;
    const sessionTeacherId = input.sessionTeacherId;
    const session = {
        id: sessionId,
        code: createOperationNo('APT', input.now, sessionId),
        title: `${course.name}预约课`,
        status: 'scheduled',
        startAt: appointment.requestedStartAt,
        endAt: appointment.requestedEndAt,
        location: offering.location || '',
        requiredCreditTypeId: relationId(appointment.creditTypeId),
        requiredQuantity: 1,
        attendanceRuleSnapshot: { ...ATTENDANCE_RULE_SNAPSHOT },
        settlementRuleSnapshot: { ...SETTLEMENT_RULE_SNAPSHOT },
        teacherRuleSnapshot: teacherSnapshot(teacherRule, relationId(appointment.courseSpecId)),
        rosterVersion: 1,
        version: 1,
        settlementOperationId: '',
        correctionBaseStatus: '',
        originType: 'appointment',
        appointmentId: appointment.id,
        cancellationType: '',
        cancelledAt: '',
    };
    return {
        session,
        sessionStudent: {
            id: sessionStudentId,
            sessionId,
            studentId: relationId(appointment.studentId),
            sourceClassIds: [],
            attendanceStatus: 'scheduled',
            creditStatus: 'reserved',
            eligibilityReason: '',
            checkedInAt: '',
            settledAt: '',
            version: 1,
        },
        sessionTeacher: {
            id: sessionTeacherId,
            sessionId,
            teacherId: relationId(appointment.teacherId),
            role: 'lead',
            assignmentSource: 'appointment',
            actualStatus: 'planned',
            creditStatus: 'pending',
        },
    };
}

function teacherSnapshot(rule, courseSpecId) {
    invariant(rule?.id, 'BOOKING_TEACHER_RULE_REQUIRED', '该课程缺少有效的教师课酬规则');
    invariant(relationId(rule.courseSpecId) === courseSpecId,
        'BOOKING_TEACHER_RULE_COURSE_MISMATCH', '教师规则与预约课程不匹配');
    const cancellationCompensation = normalizeCancellationCompensation(rule.cancellationCompensation);
    const snapshot = {
        version: positiveInteger(rule.version),
        rules: {
            lead: {
                ruleId: rule.id,
                courseSpecId,
                baseQuantity: nonNegativeNumber(rule.baseQuantity),
                durationFactor: nonNegativeNumber(rule.durationFactor),
                participantFactor: nonNegativeNumber(rule.participantFactor),
                ...(cancellationCompensation ? { cancellationCompensation } : {}),
            },
        },
    };
    return validateTeacherRuleSnapshot(snapshot);
}

function normalizeCancellationCompensation(value) {
    if (value === undefined || value === null) return null;
    if (Number.isFinite(Number(value.cancelled))) {
        const quantity = Number(value.cancelled);
        return quantity > 0 ? { quantity, eligibleActualStatuses: ['confirmed'] } : null;
    }
    return value;
}

function validateInput(input) {
    for (const field of ['sessionId', 'sessionStudentId', 'sessionTeacherId', 'now']) {
        invariant(typeof input[field] === 'string' && input[field],
            'BOOKING_MATERIALIZATION_INPUT_INVALID', `缺少 ${field}`);
    }
    invariant(input.appointment?.id && input.course?.name && input.offering,
        'BOOKING_MATERIALIZATION_INPUT_INVALID', '预约课堂物化信息不完整');
}

function relationId(value) {
    return typeof value === 'string' ? value : value?.id || '';
}

function positiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : 1;
}

function nonNegativeNumber(value) {
    const number = Number(value || 0);
    invariant(Number.isFinite(number) && number >= 0,
        'BOOKING_TEACHER_RULE_INVALID', '教师规则系数必须是非负数');
    return number;
}

module.exports = {
    ATTENDANCE_RULE_SNAPSHOT,
    SETTLEMENT_RULE_SNAPSHOT,
    materializeAppointment,
    normalizeCancellationCompensation,
    teacherSnapshot,
};
