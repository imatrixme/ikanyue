const {
    createRecordId,
    invariant,
    validateSettlementRuleSnapshots,
    validateTeacherRuleSnapshot,
} = require('./domain');
const {
    materializeSessionRoster,
    materializeSessionTeachers,
} = require('./sessionPublicationPlanning');
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

class CourseCreditSessionPublicationService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async publishSession(input = {}) {
        validatePublicationInput(input);
        const classIds = uniqueIds(input.classIds);
        const overrides = input.teacherOverrides || [];
        const command = await prepareTeachingCommand(this, 'publishSession', input, {
            sessionId: input.sessionId,
            classIds,
            teacherOverrides: overrides,
        });
        if (command.replay) return command.replay;

        const session = await this.repository.get('sessions', input.sessionId);
        validateDraftSession(session);
        const classes = await Promise.all(classIds.map((id) => this.repository.get('classes', id)));
        validateClasses(classes, session.requiredCreditTypeId);
        const creditType = await this.repository.get('credit_types', session.requiredCreditTypeId);
        invariant(creditType?.kind === 'course' && creditType.consumable === true,
            'SESSION_CREDIT_TYPE_INVALID', 'Session requires an exact consumable course credit');

        const [studentGroups, teacherGroups] = await Promise.all([
            Promise.all(classIds.map(async (classId) => ({
                classId,
                memberships: await this.repository.list('class_students', {
                    filter: activeAtFilter('classId', classId, session.startAt, 'active'),
                    sort: 'studentId,effectiveFrom',
                }),
            }))),
            Promise.all(classIds.map(async (classId) => ({
                classId,
                assignments: await this.repository.list('class_teachers', {
                    filter: activeAtFilter('classId', classId, session.startAt, 'active'),
                    sort: 'role,teacherId,effectiveFrom',
                }),
            }))),
        ]);
        const roster = materializeSessionRoster(studentGroups, session.id, this.idFactory);
        const teachers = materializeSessionTeachers(teacherGroups, overrides, session.id, this.idFactory);
        const version = positiveVersion(session.version);
        const result = {
            classIds,
            operationId: command.operationId,
            rosterCount: roster.length,
            rosterVersion: positiveVersion(session.rosterVersion) + 1,
            sessionId: session.id,
            studentIds: roster.map((row) => row.studentId),
            teacherAssignments: teachers.map((row) => ({
                assignmentSource: row.assignmentSource,
                role: row.role,
                teacherId: row.teacherId,
            })),
        };
        const context = { ...command, input, result };
        const plan = [
            teachingOperation({
                ...context,
                type: 'publish_session',
                sourceType: 'session',
                sourceId: session.id,
                requestSnapshot: { sessionId: session.id, classIds },
            }),
            versionClaim(this.idFactory, 'session', session.id, version, command.operationId),
            ...classIds.map((classId) => create('session_classes', {
                id: this.idFactory(), sessionId: session.id, classId,
            })),
            ...roster.map((row) => create('session_students', row)),
            ...teachers.map((row) => create('session_teachers', row)),
            update('sessions', session.id, {
                status: 'scheduled',
                rosterVersion: result.rosterVersion,
                version: version + 1,
            }),
            outbox(this.idFactory, 'course-credit.session-published', 'session', session.id, result),
        ];
        return commitTeachingPlan(this, context, plan);
    }
}

function validatePublicationInput(input) {
    invariant(typeof input.sessionId === 'string' && input.sessionId,
        'SESSION_ID_REQUIRED', 'sessionId is required');
    invariant(Array.isArray(input.classIds) && input.classIds.length > 0,
        'SESSION_CLASSES_REQUIRED', 'At least one class is required');
    invariant(input.classIds.every((id) => typeof id === 'string' && id),
        'CLASS_ID_REQUIRED', 'Every classId must be non-empty');
    invariant(input.teacherOverrides === undefined || Array.isArray(input.teacherOverrides),
        'INVALID_TEACHER_OVERRIDES', 'teacherOverrides must be an array');
}

function validateDraftSession(session) {
    invariant(session && session.status === 'draft',
        'SESSION_NOT_DRAFT', 'Only a draft session can be published');
    invariant(Number.isFinite(Date.parse(session.startAt)) && Number.isFinite(Date.parse(session.endAt))
        && Date.parse(session.endAt) > Date.parse(session.startAt),
    'SESSION_TIME_INVALID', 'Session endAt must be later than startAt');
    invariant(Number.isInteger(session.requiredQuantity) && session.requiredQuantity > 0,
        'SESSION_CREDIT_QUANTITY_INVALID', 'Session requiredQuantity must be a positive integer');
    validateSettlementRuleSnapshots(session.attendanceRuleSnapshot, session.settlementRuleSnapshot);
    validateTeacherRuleSnapshot(session.teacherRuleSnapshot);
}

function validateClasses(classes, requiredCreditTypeId) {
    for (const classRecord of classes) {
        invariant(classRecord && classRecord.status === 'active',
            'CLASS_NOT_ACTIVE', 'Only active classes can be published into a session');
        invariant(classRecord.defaultCreditTypeId === requiredCreditTypeId,
            'CLASS_CREDIT_TYPE_MISMATCH', 'Every linked class must match the session credit type');
    }
}

function activeAtFilter(field, id, at, status) {
    const safeAt = escapeFilter(new Date(at).toISOString());
    return `${field}="${escapeFilter(id)}" && status="${escapeFilter(status)}"`
        + ` && effectiveFrom<="${safeAt}" && (effectiveTo="" || effectiveTo>"${safeAt}")`;
}

function uniqueIds(values) {
    return [...new Set(values)].sort();
}

function isNonEmptyObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).length > 0;
}

module.exports = {
    CourseCreditSessionPublicationService,
    activeAtFilter,
    isNonEmptyObject,
    uniqueIds,
    validateClasses,
    validateDraftSession,
    validatePublicationInput,
};
