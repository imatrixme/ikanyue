const { invariant } = require('./domain');

const ATTENDANCE_STATUSES = new Set(['present', 'late', 'leave', 'absent', 'cancelled']);
const ACTIVATION_MODES = new Set([
    'GRANT_TIME', 'FIRST_RESERVATION', 'FIRST_CHECK_IN', 'FIRST_COMPLETED_SESSION', 'TERM_START',
]);
const EXPIRY_POLICIES = new Set(['FIXED_DURATION', 'TERM_END', 'NO_EXPIRY']);
const TEACHER_ROLES = new Set(['lead', 'assistant', 'observer', 'evaluator']);
const TEACHER_STATUSES = new Set(['planned', 'confirmed', 'absent', 'cancelled']);

function previewMigrationPlan(inventory, input) {
    const plan = normalizeMigrationPlan(input);
    const differences = [];
    const studentById = new Map(inventory.studentHours.map((item) => [item.id, item]));
    const teacherById = new Map(inventory.teacherHours.map((item) => [item.id, item]));
    const programIds = new Set(inventory.programs.map((item) => item.id));
    const sessionIds = new Set(inventory.sessions.map((item) => item.id));
    assertUnique(plan.studentHours, 'studentId', 'MIGRATION_STUDENT_DUPLICATE');
    assertUnique(plan.teacherHours, 'teacherId', 'MIGRATION_TEACHER_DUPLICATE');
    assertUnique(plan.programs, 'legacyProgramId', 'MIGRATION_PROGRAM_DUPLICATE');
    assertUnique(plan.sessions, 'legacySessionId', 'MIGRATION_SESSION_DUPLICATE');

    for (const mapping of plan.studentHours) {
        const source = studentById.get(mapping.studentId);
        invariant(source, 'MIGRATION_STUDENT_UNKNOWN', '历史学员不在盘点结果中', { studentId: mapping.studentId });
        const mapped = sum(mapping.allocations.map((item) => item.quantity));
        if (mapped !== source.hours) differences.push({
            sourceId: mapping.studentId, sourceQuantity: source.hours, mappedQuantity: mapped,
            difference: mapped - source.hours, type: 'student_hours',
        });
    }
    for (const mapping of plan.teacherHours) {
        const source = teacherById.get(mapping.teacherId);
        invariant(source, 'MIGRATION_TEACHER_UNKNOWN', '历史教师不在盘点结果中', { teacherId: mapping.teacherId });
        if (mapping.quantity !== source.hours) differences.push({
            sourceId: mapping.teacherId, sourceQuantity: source.hours, mappedQuantity: mapping.quantity,
            difference: mapping.quantity - source.hours, type: 'teacher_hours',
        });
    }
    assertKnown(plan.programs, 'legacyProgramId', programIds, 'MIGRATION_PROGRAM_UNKNOWN');
    assertKnown(plan.sessions, 'legacySessionId', sessionIds, 'MIGRATION_SESSION_UNKNOWN');

    const attendanceIds = new Set(inventory.attendance.map((item) => item.id));
    const attendanceMappings = plan.sessions.flatMap((item) => item.attendanceRecordIds);
    invariant(new Set(attendanceMappings).size === attendanceMappings.length,
        'MIGRATION_ATTENDANCE_DUPLICATE', '同一历史出勤记录不能重复映射');
    for (const id of attendanceMappings) invariant(attendanceIds.has(id),
        'MIGRATION_ATTENDANCE_UNKNOWN', '历史出勤记录不在盘点结果中', { sourceId: id });
    const mappedAttendance = new Set(attendanceMappings);
    const unmapped = {
        attendance: inventory.attendance.map((item) => item.id).filter((id) => !mappedAttendance.has(id)),
        programs: inventory.programs.map((item) => item.id)
            .filter((id) => !plan.programs.some((mapping) => mapping.legacyProgramId === id)),
        sessions: inventory.sessions.map((item) => item.id)
            .filter((id) => !plan.sessions.some((mapping) => mapping.legacySessionId === id)),
        studentHours: inventory.studentHours.map((item) => item.id)
            .filter((id) => !plan.studentHours.some((mapping) => mapping.studentId === id)),
        teacherHours: inventory.teacherHours.map((item) => item.id)
            .filter((id) => !plan.teacherHours.some((mapping) => mapping.teacherId === id)),
    };
    const report = {
        differences,
        mapped: {
            attendance: mappedAttendance.size,
            programs: plan.programs.length,
            sessions: plan.sessions.length,
            studentHours: sum(plan.studentHours.flatMap((item) => item.allocations).map((item) => item.quantity)),
            teacherHours: sum(plan.teacherHours.map((item) => item.quantity)),
        },
        source: inventory.totals,
        unmapped,
    };
    return {
        plan,
        ready: differences.length === 0 && Object.values(unmapped).every((items) => items.length === 0),
        report,
    };
}

function normalizeMigrationPlan(input = {}) {
    invariant(input && typeof input === 'object' && !Array.isArray(input),
        'MIGRATION_PLAN_REQUIRED', '迁移计划必须是对象');
    return {
        programs: array(input.programs).map(normalizeProgram).sort(by('legacyProgramId')),
        sessions: array(input.sessions).map(normalizeSession).sort(by('legacySessionId')),
        studentHours: array(input.studentHours).map(normalizeStudentHours).sort(by('studentId')),
        teacherHours: array(input.teacherHours).map(normalizeTeacherHours).sort(by('teacherId')),
    };
}

function normalizeStudentHours(item = {}) {
    const studentId = requiredId(item.studentId, 'MIGRATION_STUDENT_ID_REQUIRED');
    const allocations = array(item.allocations).map((allocation) => {
        invariant(Number.isInteger(Number(allocation.quantity)) && Number(allocation.quantity) > 0,
            'MIGRATION_QUANTITY_INVALID', '迁移课程点必须是正整数');
        invariant(ACTIVATION_MODES.has(allocation.activationMode),
            'MIGRATION_ACTIVATION_INVALID', '迁移批次必须显式选择激活方式');
        invariant(EXPIRY_POLICIES.has(allocation.expiryPolicy),
            'MIGRATION_EXPIRY_INVALID', '迁移批次必须显式选择有效期策略');
        if (allocation.expiryPolicy === 'FIXED_DURATION') {
            invariant(Number.isInteger(Number(allocation.validityDurationDays))
                && Number(allocation.validityDurationDays) >= 0,
            'MIGRATION_VALIDITY_INVALID', '固定有效期迁移批次必须填写有效天数');
        }
        if (allocation.activationMode !== 'GRANT_TIME') {
            invariant(Number.isInteger(Number(allocation.activationDeadlineDays))
                && Number(allocation.activationDeadlineDays) >= 0,
            'MIGRATION_ACTIVATION_DEADLINE_INVALID', '延迟激活迁移批次必须填写激活期限');
        }
        if (allocation.expiryPolicy === 'TERM_END') {
            validDate(allocation.termEnd, 'MIGRATION_TERM_END_INVALID');
        }
        return {
            activationDeadlineDays: nullableInteger(allocation.activationDeadlineDays),
            activationMode: allocation.activationMode,
            creditTypeId: requiredId(allocation.creditTypeId, 'MIGRATION_CREDIT_TYPE_REQUIRED'),
            expiryPolicy: allocation.expiryPolicy,
            quantity: Number(allocation.quantity),
            reason: requiredReason(allocation.reason),
            termEnd: allocation.termEnd ? validDate(allocation.termEnd, 'MIGRATION_TERM_END_INVALID') : null,
            validityDurationDays: nullableInteger(allocation.validityDurationDays),
        };
    });
    invariant(allocations.length > 0, 'MIGRATION_ALLOCATION_REQUIRED', '每个历史学员必须至少有一条课程点映射');
    return { allocations, studentId };
}

function normalizeTeacherHours(item = {}) {
    invariant(Number.isFinite(Number(item.quantity)) && Number(item.quantity) !== 0,
        'MIGRATION_TEACHER_QUANTITY_INVALID', '教师调整数量必须是非零数值');
    return {
        quantity: Number(item.quantity), reason: requiredReason(item.reason),
        teacherId: requiredId(item.teacherId, 'MIGRATION_TEACHER_ID_REQUIRED'),
    };
}

function normalizeProgram(item = {}) {
    invariant(['package', 'class'].includes(item.targetType),
        'MIGRATION_PROGRAM_TYPE_INVALID', '历史学习项目必须人工分类为课包或班级');
    return {
        legacyProgramId: requiredId(item.legacyProgramId, 'MIGRATION_PROGRAM_ID_REQUIRED'),
        reason: requiredReason(item.reason),
        targetId: requiredId(item.targetId, 'MIGRATION_PROGRAM_TARGET_REQUIRED'),
        targetType: item.targetType,
    };
}

function normalizeSession(item = {}) {
    const startAt = validDate(item.startAt, 'MIGRATION_SESSION_START_INVALID');
    const endAt = validDate(item.endAt, 'MIGRATION_SESSION_END_INVALID');
    invariant(Date.parse(endAt) > Date.parse(startAt),
        'MIGRATION_SESSION_END_INVALID', '历史课堂结束时间必须晚于开始时间');
    const attendees = array(item.attendees).map((entry) => {
        invariant(ATTENDANCE_STATUSES.has(entry.attendanceStatus),
            'MIGRATION_ATTENDANCE_INVALID', '历史出勤状态无效');
        return {
            attendanceStatus: entry.attendanceStatus,
            studentId: requiredId(entry.studentId, 'MIGRATION_STUDENT_ID_REQUIRED'),
        };
    });
    assertUnique(attendees, 'studentId', 'MIGRATION_SESSION_STUDENT_DUPLICATE');
    const teachers = array(item.teachers).map((entry) => {
        const actualStatus = entry.actualStatus || 'confirmed';
        const role = entry.role || 'lead';
        invariant(TEACHER_ROLES.has(role), 'MIGRATION_TEACHER_ROLE_INVALID', '历史课堂教师角色无效');
        invariant(TEACHER_STATUSES.has(actualStatus),
            'MIGRATION_TEACHER_STATUS_INVALID', '历史课堂教师状态无效');
        return {
            actualStatus,
            role,
            teacherId: requiredId(entry.teacherId, 'MIGRATION_TEACHER_ID_REQUIRED'),
        };
    });
    invariant(new Set(teachers.map((entry) => `${entry.teacherId}:${entry.role}`)).size === teachers.length,
        'MIGRATION_SESSION_TEACHER_DUPLICATE', '历史课堂教师映射重复');
    return {
        attendanceRecordIds: array(item.attendanceRecordIds).map(String),
        attendees,
        code: String(item.code || ''),
        endAt,
        legacySessionId: requiredId(item.legacySessionId, 'MIGRATION_SESSION_ID_REQUIRED'),
        location: String(item.location || ''),
        reason: requiredReason(item.reason),
        requiredCreditTypeId: requiredId(item.requiredCreditTypeId, 'MIGRATION_CREDIT_TYPE_REQUIRED'),
        requiredQuantity: positiveInteger(item.requiredQuantity, 'MIGRATION_SESSION_QUANTITY_INVALID'),
        startAt,
        teachers,
        title: String(item.title || '').trim() || '历史课堂',
    };
}

function assertUnique(items, key, code) {
    invariant(new Set(items.map((item) => item[key])).size === items.length, code, '迁移计划包含重复来源');
}

function assertKnown(items, key, known, code) {
    for (const item of items) invariant(known.has(item[key]), code, '迁移来源不在盘点结果中', { sourceId: item[key] });
}

function requiredId(value, code) {
    invariant(typeof value === 'string' && value.trim(), code, '迁移映射缺少必要编号');
    return value.trim();
}

function requiredReason(value) {
    invariant(typeof value === 'string' && value.trim().length >= 4,
        'MIGRATION_REASON_REQUIRED', '迁移映射必须填写可审计原因');
    return value.trim();
}

function validDate(value, code) {
    invariant(Number.isFinite(Date.parse(value)), code, '迁移日期无效');
    return new Date(value).toISOString();
}

function nullableInteger(value) {
    return value === undefined || value === null || value === '' ? null : Number(value);
}

function positiveInteger(value, code) {
    invariant(Number.isInteger(Number(value)) && Number(value) > 0, code, '必须是正整数');
    return Number(value);
}

function array(value) { return Array.isArray(value) ? value : []; }
function sum(values) { return values.reduce((total, value) => total + Number(value || 0), 0); }
function by(key) { return (left, right) => left[key].localeCompare(right[key]); }

module.exports = { normalizeMigrationPlan, previewMigrationPlan };
