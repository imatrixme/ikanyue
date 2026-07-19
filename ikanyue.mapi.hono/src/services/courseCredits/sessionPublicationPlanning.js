const { invariant } = require('./domain');

const TEACHER_ROLES = new Set(['lead', 'assistant', 'observer', 'evaluator']);
const OVERRIDE_SOURCES = new Set(['session_override', 'substitute']);
const ACTUAL_STATUSES = new Set(['planned', 'confirmed', 'absent', 'cancelled']);

function materializeSessionRoster(groups, sessionId, idFactory) {
    const byStudent = new Map();
    for (const group of groups) {
        for (const membership of group.memberships) {
            if (membership.status !== 'active') continue;
            const current = byStudent.get(membership.studentId) || {
                studentId: membership.studentId,
                sourceClassIds: new Set(),
            };
            current.sourceClassIds.add(group.classId);
            byStudent.set(membership.studentId, current);
        }
    }
    return [...byStudent.values()]
        .sort((left, right) => left.studentId.localeCompare(right.studentId))
        .map((item) => ({
            id: idFactory(),
            sessionId,
            studentId: item.studentId,
            sourceClassIds: [...item.sourceClassIds].sort(),
            attendanceStatus: 'scheduled',
            creditStatus: 'pending',
            eligibilityReason: '',
            checkedInAt: '',
            settledAt: '',
            version: 1,
        }));
}

function materializeSessionTeachers(groups, overrides, sessionId, idFactory) {
    const normalizedOverrides = overrides.map(normalizeTeacherOverride);
    const overriddenRoles = new Set(normalizedOverrides.map((item) => item.role));
    const assignments = new Map();
    for (const group of groups) {
        for (const assignment of group.assignments) {
            if (assignment.status !== 'active' || overriddenRoles.has(assignment.role)) continue;
            const normalized = normalizeClassTeacher(assignment);
            assignments.set(teacherKey(normalized), normalized);
        }
    }
    for (const override of normalizedOverrides) assignments.set(teacherKey(override), override);
    const rows = [...assignments.values()]
        .sort((left, right) => teacherKey(left).localeCompare(teacherKey(right)))
        .map((assignment) => ({
            id: idFactory(),
            sessionId,
            teacherId: assignment.teacherId,
            role: assignment.role,
            assignmentSource: assignment.assignmentSource,
            actualStatus: assignment.actualStatus,
            creditStatus: 'not_eligible',
        }));
    invariant(rows.some((row) => row.role === 'lead' && row.actualStatus !== 'cancelled'),
        'SESSION_LEAD_TEACHER_REQUIRED', 'Published session requires a lead teacher');
    return rows;
}

function normalizeTeacherOverride(value = {}) {
    invariant(typeof value.teacherId === 'string' && value.teacherId,
        'TEACHER_ID_REQUIRED', 'Session teacher override requires teacherId');
    invariant(TEACHER_ROLES.has(value.role), 'INVALID_TEACHER_ROLE', 'Session teacher role is invalid');
    const assignmentSource = value.assignmentSource || 'session_override';
    invariant(OVERRIDE_SOURCES.has(assignmentSource),
        'INVALID_ASSIGNMENT_SOURCE', 'Session override source is invalid');
    const actualStatus = value.actualStatus || 'planned';
    invariant(ACTUAL_STATUSES.has(actualStatus),
        'INVALID_ACTUAL_TEACHER_STATUS', 'Actual teacher status is invalid');
    return {
        teacherId: value.teacherId,
        role: value.role,
        assignmentSource,
        actualStatus,
    };
}

function normalizeClassTeacher(value) {
    invariant(typeof value.teacherId === 'string' && value.teacherId,
        'TEACHER_ID_REQUIRED', 'Class teacher requires teacherId');
    invariant(TEACHER_ROLES.has(value.role), 'INVALID_TEACHER_ROLE', 'Class teacher role is invalid');
    return {
        teacherId: value.teacherId,
        role: value.role,
        assignmentSource: 'class_default',
        actualStatus: 'planned',
    };
}

function teacherKey(value) {
    return `${value.role}:${value.teacherId}`;
}

module.exports = {
    materializeSessionRoster,
    materializeSessionTeachers,
    normalizeClassTeacher,
    normalizeTeacherOverride,
    teacherKey,
};
