const {
    createRecordId,
    invariant,
    planTeacherEarnings,
    settlementDecision,
} = require('./domain');
const { effectiveSettlementSession } = require('./sessionSettlementService');
const {
    commitTeachingPlan,
    create,
    escapeFilter,
    outbox,
    positiveVersion,
    prepareTeachingCommand,
    teachingOperation,
    update,
    versionClaim,
} = require('./teachingCommand');

const MANUAL_ATTENDANCE_STATUSES = new Set(['present', 'late', 'leave', 'absent', 'cancelled']);
const ACTUAL_TEACHER_STATUSES = new Set(['confirmed', 'absent', 'cancelled']);

class ManualAttendanceService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async setAttendance(input = {}) {
        validateAttendanceInput(input);
        const command = await prepareTeachingCommand(this, 'setManualAttendance', input, {
            sessionId: input.sessionId,
            sessionStudentId: input.sessionStudentId,
            attendanceStatus: input.attendanceStatus,
        });
        if (command.replay) return command.replay;
        const [session, record] = await Promise.all([
            this.repository.get('sessions', input.sessionId),
            this.repository.get('session_students', input.sessionStudentId),
        ]);
        validateEditableSession(session);
        await authorizeSessionActor(this.repository, input, session.id);
        invariant(record.sessionId === session.id, 'ATTENDANCE_ROSTER_MISMATCH', '学员不属于这节课');
        const result = {
            operationId: command.operationId,
            sessionId: session.id,
            sessionStudentId: record.id,
            attendanceStatus: input.attendanceStatus,
        };
        const context = { ...command, input, result };
        return commitTeachingPlan(this, context, attendancePlan(this, context, [record], input.attendanceStatus));
    }

    async markAllPresent(input = {}) {
        requiredId(input.sessionId, 'SESSION_ID_REQUIRED');
        const command = await prepareTeachingCommand(this, 'markAllPresent', input, { sessionId: input.sessionId });
        if (command.replay) return command.replay;
        const session = await this.repository.get('sessions', input.sessionId);
        validateEditableSession(session);
        await authorizeSessionActor(this.repository, input, session.id);
        const roster = await this.repository.list('session_students', {
            filter: `sessionId="${escapeFilter(input.sessionId)}" && attendanceStatus!="cancelled"`,
            sort: 'studentId',
        });
        invariant(roster.length > 0, 'SESSION_ROSTER_REQUIRED', '课堂没有学员名单');
        const result = {
            operationId: command.operationId,
            sessionId: input.sessionId,
            updatedCount: roster.length,
            attendanceStatus: 'present',
        };
        const context = { ...command, input, result };
        return commitTeachingPlan(this, context, attendancePlan(this, context, roster, 'present'));
    }

    async setActualTeacher(input = {}) {
        requiredId(input.sessionId, 'SESSION_ID_REQUIRED');
        requiredId(input.sessionTeacherId, 'SESSION_TEACHER_ID_REQUIRED');
        invariant(ACTUAL_TEACHER_STATUSES.has(input.actualStatus),
            'ACTUAL_TEACHER_STATUS_INVALID', '实际授课状态无效');
        const command = await prepareTeachingCommand(this, 'setActualTeacher', input, {
            sessionId: input.sessionId,
            sessionTeacherId: input.sessionTeacherId,
            actualStatus: input.actualStatus,
        });
        if (command.replay) return command.replay;
        const [session, teacher] = await Promise.all([
            this.repository.get('sessions', input.sessionId),
            this.repository.get('session_teachers', input.sessionTeacherId),
        ]);
        validateEditableSession(session);
        await authorizeSessionActor(this.repository, input, session.id);
        invariant(teacher.sessionId === session.id, 'ACTUAL_TEACHER_SESSION_MISMATCH', '教师不属于这节课');
        invariant(!isAssignedTeachingActor(input) || teacher.teacherId === input.actorId,
            'SESSION_TEACHER_TARGET_FORBIDDEN', '教师只能确认本人的授课状态');
        const result = {
            operationId: command.operationId,
            sessionId: session.id,
            sessionTeacherId: teacher.id,
            actualStatus: input.actualStatus,
        };
        const context = { ...command, input, result };
        return commitTeachingPlan(this, context, [
            teachingOperation({
                ...context,
                type: 'adjust',
                sourceType: 'session_teacher',
                sourceId: teacher.id,
                requestSnapshot: { sessionId: session.id, actualStatus: input.actualStatus },
            }),
            update('session_teachers', teacher.id, { actualStatus: input.actualStatus }),
            audit(this.idFactory, input, session.id, 'actual_teacher', { actualStatus: input.actualStatus }),
            outbox(this.idFactory, 'course-session.actual-teacher-updated', 'session', session.id, result),
        ]);
    }

    async previewSettlement(sessionId) {
        requiredId(sessionId, 'SESSION_ID_REQUIRED');
        const session = await this.repository.get('sessions', sessionId);
        const effectiveSession = effectiveSettlementSession(session);
        invariant(['completed', 'cancelled'].includes(effectiveSession.status),
            'SESSION_NOT_SETTLEABLE', '课堂尚未进入可核销状态');
        const filter = `sessionId="${escapeFilter(sessionId)}"`;
        const [roster, teachers, creditType] = await Promise.all([
            this.repository.list('session_students', { filter, sort: 'studentId' }),
            this.repository.list('session_teachers', { filter, sort: 'role,teacherId' }),
            this.repository.get('credit_types', session.requiredCreditTypeId),
        ]);
        const allocations = roster.length ? await this.repository.list('session_credit_allocations', {
            filter: `(${roster.map((record) => `sessionStudentId="${escapeFilter(record.id)}"`).join(' || ')})`,
            sort: 'sessionStudentId,created',
            expand: 'batchId',
        }) : [];
        const students = roster.map((record) => previewStudent(
            effectiveSession,
            record,
            allocations.filter((allocation) => relationId(allocation.sessionStudentId) === record.id)
        ));
        const earnings = planTeacherEarnings(effectiveSession, teachers, roster, creditType.courseSpecId);
        return {
            sessionId,
            sessionStatus: effectiveSession.status,
            canSettle: students.every((student) => !student.exception),
            students,
            teachers: earnings.map((earning) => ({
                sessionTeacherId: earning.sessionTeacherId,
                teacherId: earning.teacherId,
                role: teachers.find((teacher) => teacher.id === earning.sessionTeacherId).role,
                action: earning.eventType === 'compensate' ? 'compensate' : 'earn',
                quantity: earning.quantity,
            })),
        };
    }
}

function attendancePlan(service, context, roster, attendanceStatus) {
    const plan = [teachingOperation({
        ...context,
        type: 'adjust',
        sourceType: 'session_attendance',
        sourceId: context.result.sessionId,
        requestSnapshot: { attendanceStatus, rosterCount: roster.length },
    })];
    for (const record of roster) {
        const version = positiveVersion(record.version);
        plan.push(
            versionClaim(service.idFactory, 'session_student', record.id, version, context.operationId),
            update('session_students', record.id, {
                attendanceStatus,
                checkedInAt: attendanceStatus === 'present' || attendanceStatus === 'late' ? context.at : record.checkedInAt || '',
                version: version + 1,
            })
        );
    }
    plan.push(
        audit(service.idFactory, context.input, context.result.sessionId, 'attendance', {
            attendanceStatus, rosterCount: roster.length,
        }),
        outbox(service.idFactory, 'course-session.attendance-updated', 'session', context.result.sessionId, context.result)
    );
    return plan;
}

function previewStudent(session, record, allocations = []) {
    const affectedBatches = allocations.map((allocation) => {
        const batch = expanded(allocation, 'batchId');
        return {
            allocationId: allocation.id,
            batchId: relationId(allocation.batchId),
            quantity: Number(allocation.quantity || 0),
            status: allocation.status || '',
            effectiveExpiresAt: batch.effectiveExpiresAt || null,
        };
    });
    if (record.creditStatus !== 'reserved') {
        return {
            sessionStudentId: record.id,
            studentId: record.studentId,
            attendanceStatus: record.attendanceStatus,
            action: 'exception',
            quantity: Number(session.requiredQuantity),
            allocations: affectedBatches,
            exception: record.creditStatus === 'credit_insufficient'
                ? '课时不足，需要教务处理'
                : '课时状态尚未准备完成',
        };
    }
    try {
        const decision = settlementDecision(session, record);
        return {
            sessionStudentId: record.id,
            studentId: record.studentId,
            attendanceStatus: record.attendanceStatus,
            action: decision.action,
            quantity: Number(session.requiredQuantity),
            allocations: affectedBatches,
            exception: null,
        };
    } catch (error) {
        return {
            sessionStudentId: record.id,
            studentId: record.studentId,
            attendanceStatus: record.attendanceStatus,
            action: 'exception',
            quantity: Number(session.requiredQuantity),
            allocations: affectedBatches,
            exception: error.code === 'ATTENDANCE_NOT_FINAL' ? '需要先完成出勤登记' : '课堂规则需要教务检查',
        };
    }
}

function expanded(record, field) {
    const value = record.expand?.[field];
    return Array.isArray(value) ? value[0] || {} : value || {};
}

function relationId(value) {
    if (Array.isArray(value)) return relationId(value[0]);
    return value && typeof value === 'object' ? value.id || '' : value || '';
}

function audit(idFactory, input, sessionId, action, metadata) {
    return create('ops_audit_logs', {
        id: idFactory(), actorId: input.actorId, actorRole: input.actorRole || 'admin',
        action: `course_operations.lesson.${action}`, resourceType: 'session', resourceId: sessionId,
        outcome: 'success', metadata,
    });
}

function validateAttendanceInput(input) {
    requiredId(input.sessionId, 'SESSION_ID_REQUIRED');
    requiredId(input.sessionStudentId, 'SESSION_STUDENT_ID_REQUIRED');
    invariant(MANUAL_ATTENDANCE_STATUSES.has(input.attendanceStatus),
        'ATTENDANCE_STATUS_INVALID', '出勤结果无效');
}

function validateEditableSession(session) {
    invariant(session && !['settled', 'cancelled'].includes(session.status),
        'SESSION_ATTENDANCE_LOCKED', '当前课堂不能修改出勤');
}

async function authorizeSessionActor(repository, input, sessionId) {
    if (!isAssignedTeachingActor(input)) return;
    const assignment = await repository.findFirst('session_teachers',
        `sessionId="${escapeFilter(sessionId)}" && teacherId="${escapeFilter(input.actorId)}"`
        + ' && actualStatus!="cancelled"');
    invariant(assignment, 'SESSION_TEACHER_FORBIDDEN', '教师只能操作本人负责的课堂');
}

function isAssignedTeachingActor(input) {
    return input.actorTeachingScope === 'assigned'
        || (!input.actorTeachingScope && input.actorRole === 'teacher');
}

function requiredId(value, code) {
    invariant(typeof value === 'string' && value, code, '编号不能为空');
}

module.exports = {
    ACTUAL_TEACHER_STATUSES,
    MANUAL_ATTENDANCE_STATUSES,
    ManualAttendanceService,
    attendancePlan,
    authorizeSessionActor,
    isAssignedTeachingActor,
    previewStudent,
    validateAttendanceInput,
    validateEditableSession,
};
