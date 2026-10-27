const { createRecordId, invariant } = require('./domain');
const {
    commitTeachingPlan,
    create,
    escapeFilter,
    outbox,
    prepareTeachingCommand,
    teachingOperation,
    update,
} = require('./teachingCommand');

const STUDENT_STATUSES = new Set(['invited', 'active', 'paused', 'completed', 'cancelled']);
const TEACHER_ROLES = new Set(['lead', 'assistant', 'observer', 'evaluator']);
const TEACHER_STATUSES = new Set(['active', 'inactive']);

class CourseCreditClassMembershipService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async setStudentMembership(input = {}) {
        validateStudentMembership(input);
        const effectiveFrom = validDate(input.effectiveFrom, 'effectiveFrom');
        const effectiveTo = optionalLaterDate(input.effectiveTo, effectiveFrom);
        const command = await prepareTeachingCommand(this, 'setStudentMembership', input, {
            classId: input.classId,
            studentId: input.studentId,
            status: input.status,
            effectiveFrom,
            effectiveTo,
            sourceOrderId: input.sourceOrderId || '',
        });
        if (command.replay) return command.replay;
        const classRecord = await this.repository.get('classes', input.classId);
        validateOpenClass(classRecord);
        await this.repository.get('students', input.studentId);
        const current = await this.findOpenStudentMembership(input.classId, input.studentId);
        validateTransitionTime(current, effectiveFrom);

        const membershipId = this.idFactory();
        const result = {
            classId: input.classId,
            membershipId,
            operationId: command.operationId,
            status: input.status,
            studentId: input.studentId,
        };
        const context = { ...command, input, result };
        const plan = [teachingOperation({
            ...context,
            studentId: input.studentId,
            type: 'class_membership',
            sourceType: 'class_student',
            sourceId: membershipId,
            requestSnapshot: { classId: input.classId, studentId: input.studentId },
        })];
        if (current) plan.push(update('class_students', current.id, { effectiveTo: effectiveFrom }));
        plan.push(
            create('class_students', {
                id: membershipId,
                classId: input.classId,
                studentId: input.studentId,
                status: input.status,
                effectiveFrom,
                effectiveTo,
                sourceOrderId: input.sourceOrderId || '',
            }),
            outbox(this.idFactory, 'course-credit.class-student-changed', 'class_student', membershipId, result)
        );
        return commitTeachingPlan(this, context, plan);
    }

    async transferStudent(input = {}) {
        validateTransfer(input);
        const effectiveAt = validDate(input.effectiveAt, 'effectiveAt');
        const command = await prepareTeachingCommand(this, 'transferStudentMembership', input, {
            fromClassId: input.fromClassId,
            toClassId: input.toClassId,
            studentId: input.studentId,
            effectiveAt,
            sourceOrderId: input.sourceOrderId || '',
        });
        if (command.replay) return command.replay;
        const [fromClass, toClass] = await Promise.all([
            this.repository.get('classes', input.fromClassId),
            this.repository.get('classes', input.toClassId),
            this.repository.get('students', input.studentId),
        ]);
        validateOpenClass(fromClass);
        validateOpenClass(toClass);
        invariant(fromClass.defaultCreditTypeId === toClass.defaultCreditTypeId,
            'TRANSFER_CREDIT_TYPE_MISMATCH', 'Transfer classes must use the same default credit type');
        const [source, target] = await Promise.all([
            this.findOpenStudentMembership(input.fromClassId, input.studentId),
            this.findOpenStudentMembership(input.toClassId, input.studentId),
        ]);
        invariant(source && source.status === 'active',
            'SOURCE_MEMBERSHIP_NOT_ACTIVE', 'Student has no active source membership');
        invariant(!target, 'TARGET_MEMBERSHIP_ALREADY_OPEN', 'Student already has an open target membership');
        validateTransitionTime(source, effectiveAt);

        const membershipId = this.idFactory();
        const result = {
            fromClassId: input.fromClassId,
            membershipId,
            operationId: command.operationId,
            studentId: input.studentId,
            toClassId: input.toClassId,
        };
        const context = { ...command, input, result };
        const plan = [
            teachingOperation({
                ...context,
                studentId: input.studentId,
                type: 'class_membership',
                sourceType: 'class_transfer',
                sourceId: membershipId,
                requestSnapshot: { fromClassId: input.fromClassId, toClassId: input.toClassId },
            }),
            update('class_students', source.id, { effectiveTo: effectiveAt }),
            create('class_students', {
                id: membershipId,
                classId: input.toClassId,
                studentId: input.studentId,
                status: 'active',
                effectiveFrom: effectiveAt,
                effectiveTo: '',
                sourceOrderId: input.sourceOrderId || source.sourceOrderId || '',
            }),
            outbox(this.idFactory, 'course-credit.class-student-transferred', 'class_student', membershipId, result),
        ];
        return commitTeachingPlan(this, context, plan);
    }

    async setTeacherAssignment(input = {}) {
        validateTeacherAssignment(input);
        const effectiveFrom = validDate(input.effectiveFrom, 'effectiveFrom');
        const effectiveTo = optionalLaterDate(input.effectiveTo, effectiveFrom);
        const command = await prepareTeachingCommand(this, 'setTeacherAssignment', input, {
            classId: input.classId,
            teacherId: input.teacherId,
            role: input.role,
            status: input.status,
            effectiveFrom,
            effectiveTo,
        });
        if (command.replay) return command.replay;
        const classRecord = await this.repository.get('classes', input.classId);
        validateOpenClass(classRecord);
        await this.repository.get('teachers', input.teacherId);
        const current = await this.findOpenTeacherAssignment(input.classId, input.teacherId, input.role);
        validateTransitionTime(current, effectiveFrom);

        const assignmentId = this.idFactory();
        const result = {
            assignmentId,
            classId: input.classId,
            operationId: command.operationId,
            role: input.role,
            status: input.status,
            teacherId: input.teacherId,
        };
        const context = { ...command, input, result };
        const plan = [teachingOperation({
            ...context,
            type: 'class_teacher_assignment',
            sourceType: 'class_teacher',
            sourceId: assignmentId,
            requestSnapshot: { classId: input.classId, teacherId: input.teacherId, role: input.role },
        })];
        if (current) plan.push(update('class_teachers', current.id, { effectiveTo: effectiveFrom }));
        plan.push(
            create('class_teachers', {
                id: assignmentId,
                classId: input.classId,
                teacherId: input.teacherId,
                role: input.role,
                status: input.status,
                effectiveFrom,
                effectiveTo,
            }),
            outbox(this.idFactory, 'course-credit.class-teacher-changed', 'class_teacher', assignmentId, result)
        );
        return commitTeachingPlan(this, context, plan);
    }

    findOpenStudentMembership(classId, studentId) {
        return this.repository.findFirst('class_students',
            `classId="${escapeFilter(classId)}" && studentId="${escapeFilter(studentId)}" && effectiveTo=""`);
    }

    findOpenTeacherAssignment(classId, teacherId, role) {
        return this.repository.findFirst('class_teachers',
            `classId="${escapeFilter(classId)}" && teacherId="${escapeFilter(teacherId)}"`
            + ` && role="${escapeFilter(role)}" && effectiveTo=""`);
    }
}

function validateStudentMembership(input) {
    requiredId(input.classId, 'CLASS_ID_REQUIRED', 'classId');
    requiredId(input.studentId, 'STUDENT_ID_REQUIRED', 'studentId');
    invariant(STUDENT_STATUSES.has(input.status), 'INVALID_MEMBERSHIP_STATUS', 'Student membership status is invalid');
}

function validateTransfer(input) {
    requiredId(input.fromClassId, 'SOURCE_CLASS_ID_REQUIRED', 'fromClassId');
    requiredId(input.toClassId, 'TARGET_CLASS_ID_REQUIRED', 'toClassId');
    requiredId(input.studentId, 'STUDENT_ID_REQUIRED', 'studentId');
    invariant(input.fromClassId !== input.toClassId,
        'TRANSFER_CLASS_MUST_DIFFER', 'Transfer source and target classes must differ');
}

function validateTeacherAssignment(input) {
    requiredId(input.classId, 'CLASS_ID_REQUIRED', 'classId');
    requiredId(input.teacherId, 'TEACHER_ID_REQUIRED', 'teacherId');
    invariant(TEACHER_ROLES.has(input.role), 'INVALID_TEACHER_ROLE', 'Teacher role is invalid');
    invariant(TEACHER_STATUSES.has(input.status), 'INVALID_TEACHER_STATUS', 'Teacher assignment status is invalid');
}

function validateOpenClass(record) {
    invariant(record && ['draft', 'active'].includes(record.status),
        'CLASS_NOT_OPEN', 'Class is not open for membership changes');
}

function validateTransitionTime(current, effectiveFrom) {
    if (!current) return;
    invariant(Date.parse(effectiveFrom) > Date.parse(current.effectiveFrom),
        'MEMBERSHIP_EFFECTIVE_ORDER_INVALID', 'New effective time must be later than the open assignment');
}

function requiredId(value, code, field) {
    invariant(typeof value === 'string' && value, code, `${field} is required`);
}

function validDate(value, field) {
    const timestamp = Date.parse(value);
    invariant(Number.isFinite(timestamp), 'INVALID_DATE', `${field} must be a valid date`);
    return new Date(timestamp).toISOString();
}

function optionalLaterDate(value, effectiveFrom) {
    if (!value) return '';
    const effectiveTo = validDate(value, 'effectiveTo');
    invariant(Date.parse(effectiveTo) > Date.parse(effectiveFrom),
        'INVALID_EFFECTIVE_RANGE', 'effectiveTo must be later than effectiveFrom');
    return effectiveTo;
}

module.exports = {
    CourseCreditClassMembershipService,
    optionalLaterDate,
    validDate,
    validateOpenClass,
    validateTeacherAssignment,
    validateTransitionTime,
    validateTransfer,
};
