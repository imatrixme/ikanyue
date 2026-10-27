const { invariant } = require('./errors');
const { asDate } = require('./time');

const TEACHER_ROLES = ['lead', 'assistant', 'observer', 'evaluator'];
const TEACHER_ACTUAL_STATUSES = ['planned', 'confirmed', 'absent', 'cancelled'];
const PARTICIPATING_ATTENDANCE = new Set(['present', 'late']);

function validateTeacherRuleSnapshot(snapshot) {
    invariant(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot),
        'TEACHER_RULE_SNAPSHOT_REQUIRED', 'Session requires a teacher rule snapshot');
    invariant(Number.isInteger(snapshot.version) && snapshot.version > 0,
        'TEACHER_RULE_VERSION_INVALID', 'Teacher rule snapshot version must be a positive integer');
    invariant(snapshot.rules && typeof snapshot.rules === 'object' && !Array.isArray(snapshot.rules)
        && Object.keys(snapshot.rules).length > 0,
    'TEACHER_RULES_REQUIRED', 'Teacher rule snapshot requires at least one role rule');
    for (const [role, rule] of Object.entries(snapshot.rules)) validateTeacherRule(role, rule);
    return snapshot;
}

function validateTeacherRule(role, rule) {
    invariant(TEACHER_ROLES.includes(role), 'INVALID_TEACHER_ROLE', 'Teacher rule role is not supported', { role });
    invariant(rule && typeof rule === 'object' && !Array.isArray(rule),
        'TEACHER_RULE_INVALID', 'Teacher rule must be an object', { role });
    invariant(typeof rule.ruleId === 'string' && rule.ruleId,
        'TEACHER_RULE_ID_REQUIRED', 'Teacher rule id is required', { role });
    invariant(typeof rule.courseSpecId === 'string' && rule.courseSpecId,
        'TEACHER_RULE_COURSE_REQUIRED', 'Teacher rule course specification is required', { role });
    for (const field of ['baseQuantity', 'durationFactor', 'participantFactor']) {
        invariant(Number.isFinite(rule[field]) && rule[field] >= 0,
            'TEACHER_RULE_FACTOR_INVALID', `${field} must be a non-negative number`, { field, role });
    }
    if (rule.cancellationCompensation !== undefined && rule.cancellationCompensation !== null) {
        validateCancellationCompensation(rule.cancellationCompensation, role);
    }
    return rule;
}

function validateCancellationCompensation(policy, role) {
    invariant(policy && typeof policy === 'object' && !Array.isArray(policy),
        'TEACHER_CANCELLATION_POLICY_INVALID', 'Cancellation compensation must be an object', { role });
    invariant(Number.isFinite(policy.quantity) && roundQuantity(policy.quantity) > 0,
        'TEACHER_CANCELLATION_QUANTITY_INVALID', 'Cancellation compensation quantity must be positive', { role });
    invariant(Array.isArray(policy.eligibleActualStatuses) && policy.eligibleActualStatuses.length > 0,
        'TEACHER_CANCELLATION_STATUSES_REQUIRED', 'Cancellation compensation requires eligible statuses', { role });
    const statuses = new Set(policy.eligibleActualStatuses);
    invariant(statuses.size === policy.eligibleActualStatuses.length
        && [...statuses].every((status) => TEACHER_ACTUAL_STATUSES.includes(status)),
    'TEACHER_CANCELLATION_STATUS_INVALID', 'Cancellation compensation contains an invalid status', { role });
    return policy;
}

function calculateTeacherEarning(rule, context) {
    validateTeacherRule(context.role, rule);
    invariant(Number.isFinite(context.durationHours) && context.durationHours > 0,
        'SESSION_DURATION_INVALID', 'Session duration must be greater than zero');
    invariant(Number.isInteger(context.participantCount) && context.participantCount >= 0,
        'PARTICIPANT_COUNT_INVALID', 'Participant count must be a non-negative integer');
    const quantity = roundQuantity(
        rule.baseQuantity
        + rule.durationFactor * context.durationHours
        + rule.participantFactor * context.participantCount
    );
    invariant(quantity > 0, 'TEACHER_EARNING_NOT_POSITIVE', 'Teacher earning must be greater than zero');
    return quantity;
}

function planTeacherEarnings(session, sessionTeachers, sessionStudents, courseSpecId) {
    if (session.status === 'cancelled' && !session.teacherRuleSnapshot) return [];
    const snapshot = validateTeacherRuleSnapshot(session.teacherRuleSnapshot);
    if (session.status === 'cancelled') {
        return planCancellationCompensation(snapshot, sessionTeachers, courseSpecId);
    }
    const confirmed = sessionTeachers.filter((teacher) => teacher.actualStatus === 'confirmed');
    invariant(confirmed.some((teacher) => teacher.role === 'lead'),
        'SESSION_CONFIRMED_LEAD_REQUIRED', 'Completed session requires a confirmed lead teacher');
    const participantCount = sessionStudents.filter(
        (student) => PARTICIPATING_ATTENDANCE.has(student.attendanceStatus)
    ).length;
    const durationHours = sessionDurationHours(session);
    return confirmed.map((teacher) => {
        const rule = snapshot.rules[teacher.role];
        invariant(rule, 'TEACHER_RULE_NOT_FOUND', 'No snapshotted teacher rule exists for actual role', {
            role: teacher.role,
        });
        invariant(rule.courseSpecId === courseSpecId,
            'TEACHER_RULE_COURSE_MISMATCH', 'Teacher rule does not match the session course specification');
        return {
            eventType: 'earn',
            quantity: calculateTeacherEarning(rule, {
                durationHours,
                participantCount,
                role: teacher.role,
            }),
            ruleId: rule.ruleId,
            ruleVersion: snapshot.version,
            sessionTeacherId: teacher.id,
            teacherId: teacher.teacherId,
        };
    });
}

function planCancellationCompensation(snapshot, sessionTeachers, courseSpecId) {
    return sessionTeachers.flatMap((teacher) => {
        const rule = snapshot.rules[teacher.role];
        const policy = rule?.cancellationCompensation;
        if (!policy || !policy.eligibleActualStatuses.includes(teacher.actualStatus)) return [];
        invariant(rule.courseSpecId === courseSpecId,
            'TEACHER_RULE_COURSE_MISMATCH', 'Teacher rule does not match the session course specification');
        return [{
            eventType: 'compensate',
            quantity: roundQuantity(policy.quantity),
            ruleId: rule.ruleId,
            ruleVersion: snapshot.version,
            sessionTeacherId: teacher.id,
            teacherId: teacher.teacherId,
        }];
    });
}

function sessionDurationHours(session) {
    const start = asDate(session.startAt, 'session.startAt');
    const end = asDate(session.endAt, 'session.endAt');
    const durationHours = (end.getTime() - start.getTime()) / 3_600_000;
    invariant(durationHours > 0, 'SESSION_DURATION_INVALID', 'Session end must be later than start');
    return durationHours;
}

function roundQuantity(value) {
    return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

module.exports = {
    PARTICIPATING_ATTENDANCE,
    TEACHER_ACTUAL_STATUSES,
    TEACHER_ROLES,
    calculateTeacherEarning,
    planCancellationCompensation,
    planTeacherEarnings,
    roundQuantity,
    sessionDurationHours,
    validateTeacherRule,
    validateTeacherRuleSnapshot,
    validateCancellationCompensation,
};
