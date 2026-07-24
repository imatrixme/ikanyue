const { createRecordId, invariant } = require('./domain');
const { fingerprintRequest } = require('./repositories/operationRepository');
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

class EnrollmentRosterSyncService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async preview(input = {}) {
        requiredId(input.orderId, 'ORDER_ID_REQUIRED');
        const order = await this.repository.get('orders', input.orderId);
        const classId = order.productSnapshot?.classId || '';
        if (!classId) return emptyPreview(order);
        const links = await this.repository.list('session_classes', {
            filter: `classId="${escapeFilter(classId)}" && sessionId.startAt>="${new Date(this.clock()).toISOString()}"`
                + ' && sessionId.status!="draft" && sessionId.status!="cancelled"',
            sort: 'sessionId.startAt',
            expand: 'sessionId',
        });
        const lessons = [];
        for (const link of links) {
            const session = relation(link, 'sessionId');
            const existing = await this.repository.findFirst('session_students',
                `sessionId="${escapeFilter(session.id || link.sessionId)}" && studentId="${escapeFilter(order.studentId)}"`);
            if (!existing) lessons.push(projectLesson(session, link.sessionId));
        }
        const result = {
            orderId: order.id,
            studentId: order.studentId,
            classId,
            lessons,
        };
        return { ...result, previewHash: fingerprintRequest(result) };
    }

    async confirm(input = {}) {
        requiredId(input.orderId, 'ORDER_ID_REQUIRED');
        requiredId(input.previewHash, 'SYNC_PREVIEW_HASH_REQUIRED');
        const preview = await this.preview(input);
        invariant(preview.previewHash === input.previewHash, 'SYNC_PREVIEW_STALE', '同步预览已变化，请重新确认');
        const lessonIds = Array.isArray(input.lessonIds) && input.lessonIds.length > 0
            ? new Set(input.lessonIds)
            : new Set(preview.lessons.map((lesson) => lesson.lessonId));
        const selected = preview.lessons.filter((lesson) => lessonIds.has(lesson.lessonId));
        invariant(selected.length === lessonIds.size, 'SYNC_LESSON_SELECTION_INVALID', '选择了不在预览中的课堂');
        const command = await prepareTeachingCommand(this, 'confirmEnrollmentRosterSync', input, {
            orderId: input.orderId,
            lessonIds: [...lessonIds].sort(),
            previewHash: input.previewHash,
        });
        if (command.replay) return command.replay;
        const sessions = await Promise.all(selected.map((lesson) => this.repository.get('sessions', lesson.lessonId)));
        const rows = sessions.map((session) => ({
            id: this.idFactory(),
            sessionId: session.id,
            studentId: preview.studentId,
            sourceClassIds: [preview.classId],
            attendanceStatus: 'scheduled',
            creditStatus: 'pending',
            eligibilityReason: '',
            checkedInAt: '',
            settledAt: '',
            version: 1,
        }));
        const result = {
            operationId: command.operationId,
            orderId: input.orderId,
            synchronizedLessonIds: sessions.map((session) => session.id),
            status: 'completed',
        };
        const context = { ...command, input, result };
        const plan = [teachingOperation({
            ...context,
            type: 'adjust',
            sourceType: 'enrollment_roster_sync',
            sourceId: input.orderId,
            studentId: preview.studentId,
            requestSnapshot: { orderId: input.orderId, lessonIds: result.synchronizedLessonIds },
        })];
        sessions.forEach((session, index) => {
            const version = positiveVersion(session.version);
            plan.push(
                versionClaim(this.idFactory, 'session', session.id, version, command.operationId),
                create('session_students', rows[index]),
                update('sessions', session.id, {
                    rosterVersion: positiveVersion(session.rosterVersion) + 1,
                    version: version + 1,
                })
            );
        });
        plan.push(
            create('ops_audit_logs', {
                id: this.idFactory(), actorId: input.actorId, actorRole: input.actorRole || 'admin',
                action: 'course_operations.enrollment.sync_roster', resourceType: 'enrollment',
                resourceId: input.orderId, outcome: 'success', metadata: { lessonCount: sessions.length },
            }),
            outbox(this.idFactory, 'course-enrollment.roster-corrected', 'order', input.orderId, result)
        );
        return commitTeachingPlan(this, context, plan);
    }
}

function emptyPreview(order) {
    const result = { orderId: order.id, studentId: order.studentId, classId: null, lessons: [] };
    return { ...result, previewHash: fingerprintRequest(result) };
}

function projectLesson(session, fallbackId) {
    return {
        lessonId: session.id || fallbackId,
        title: session.title || '',
        startAt: session.startAt || null,
        status: session.status || 'scheduled',
    };
}

function relation(record = {}, field) {
    const value = record.expand?.[field];
    return Array.isArray(value) ? value[0] || {} : value || {};
}

function requiredId(value, code) {
    invariant(typeof value === 'string' && value, code, '编号不能为空');
}

module.exports = { EnrollmentRosterSyncService, emptyPreview, projectLesson, relation };
