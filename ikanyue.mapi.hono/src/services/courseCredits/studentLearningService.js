const { invariant } = require('./domain');
const {
    escapeFilter,
    mapPage,
    pagination,
    quantity,
    relation,
    relationId,
} = require('./queryService');
const {
    assertStudentLearningProjection,
    sanitizeStudentText,
} = require('./studentLearningContract');

const LESSON_SCOPES = new Set(['all', 'upcoming', 'completed']);
const UPCOMING_LESSON_LIMIT = 3;
const RELATION_CHUNK_SIZE = 40;

class StudentLearningService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.expiryWarningDays = options.expiryWarningDays || 30;
        this.recentLimit = options.recentLimit || 3;
    }

    async overview(studentId) {
        requiredStudentId(studentId);
        const [batches, roster, records] = await Promise.all([
            this.courseBatches(studentId),
            this.repository.list('session_students', lessonQueryOptions(studentId)),
            this.repository.page('credit_events', 1, this.recentLimit, recordQueryOptions(studentId)),
        ]);
        const courses = buildCourseSummaries(batches, this.clock(), this.expiryWarningDays);
        const contexts = await loadLessonContexts(this.repository, roster);
        const lessons = roster.map((record) => mapLesson(record, lessonContext(record, contexts)));
        const now = this.clock();
        const upcomingLessons = lessons.filter((lesson) => isUpcomingLesson(lesson, now))
            .sort(compareLessonStart).slice(0, UPCOMING_LESSON_LIMIT);
        const result = {
            nextLesson: upcomingLessons[0] || null,
            upcomingLessons,
            courses,
            warnings: buildLearningWarnings(roster, contexts),
            recentRecords: (records.items || []).map(mapLessonRecord),
        };
        return assertStudentLearningProjection(result);
    }

    async getCourse(studentId, courseId) {
        requiredStudentId(studentId);
        requiredId(courseId, 'LEARNING_COURSE_ID_REQUIRED', '课程编号不能为空');
        const [batches, roster, records] = await Promise.all([
            this.courseBatches(studentId),
            this.repository.list('session_students', lessonQueryOptions(studentId)),
            this.repository.page('credit_events', 1, this.recentLimit, recordQueryOptions(studentId)),
        ]);
        const contexts = await loadLessonContexts(this.repository, roster);
        const course = buildCourseSummaries(batches, this.clock(), this.expiryWarningDays)
            .find((item) => item.courseId === courseId);
        invariant(course, 'LEARNING_COURSE_NOT_FOUND', '未找到这门课程');
        const result = {
            ...course,
            sources: batches.filter((batch) => courseIdentity(batch) === courseId).map(mapCourseSource),
            recentLessons: roster.map((record) => mapLesson(record, lessonContext(record, contexts)))
                .filter((lesson) => lesson.course.courseId === courseId).slice(0, 5),
            recentRecords: (records.items || []).map(mapLessonRecord)
                .filter((record) => record.course.courseId === courseId),
        };
        return assertStudentLearningProjection(result);
    }

    async listLessons(studentId, query = {}) {
        requiredStudentId(studentId);
        const page = pagination(query);
        const scope = query.scope || 'all';
        invariant(LESSON_SCOPES.has(scope), 'LEARNING_LESSON_SCOPE_INVALID', '课程日程筛选无效');
        const result = await this.repository.page('session_students', page.page, page.perPage,
            lessonQueryOptions(studentId, { courseId: query.courseId, now: this.clock(), scope }));
        const contexts = await loadLessonContexts(this.repository, result.items || []);
        return assertStudentLearningProjection(mapPage(result,
            (record) => mapLesson(record, lessonContext(record, contexts))));
    }

    async getLesson(studentId, lessonId) {
        requiredStudentId(studentId);
        requiredId(lessonId, 'LEARNING_LESSON_ID_REQUIRED', '课堂编号不能为空');
        const record = await this.repository.findFirst('session_students',
            `studentId="${escapeFilter(studentId)}" && sessionId="${escapeFilter(lessonId)}"`, {
                expand: lessonExpand(),
            });
        invariant(record, 'LEARNING_LESSON_NOT_FOUND', '未找到这节课');
        const contexts = await loadLessonContexts(this.repository, [record]);
        return assertStudentLearningProjection(mapLesson(record, lessonContext(record, contexts)));
    }

    async listRecords(studentId, query = {}) {
        requiredStudentId(studentId);
        const page = pagination(query);
        const result = await this.repository.page('credit_events', page.page, page.perPage,
            recordQueryOptions(studentId, query.courseId));
        return assertStudentLearningProjection(mapPage(result, mapLessonRecord));
    }

    courseBatches(studentId) {
        return this.repository.list('credit_batches', {
            filter: `studentId="${escapeFilter(studentId)}" && status!="cancelled" && creditTypeId.kind="course"`,
            sort: 'effectiveExpiresAt,priority,created',
            expand: 'creditTypeId,creditTypeId.courseSpecId',
        });
    }
}

function buildCourseSummaries(batches, nowValue, warningDays) {
    const now = Number(nowValue);
    const warningAt = now + warningDays * 86400000;
    const courses = new Map();
    for (const batch of batches) {
        const courseId = courseIdentity(batch);
        if (!courseId) continue;
        if (!courses.has(courseId)) courses.set(courseId, emptyCourse(batch, courseId));
        const course = courses.get(courseId);
        course.remainingLessons += quantity(batch.availableQuantity);
        course.scheduledLessons += quantity(batch.frozenQuantity);
        course.completedLessons += quantity(batch.consumedQuantity);
        course.expiredLessons += quantity(batch.expiredQuantity);
        if (batch.status === 'pending' || batch.status === 'unactivated') course.awaitingActivation = true;
        const expiry = Date.parse(batch.effectiveExpiresAt || '');
        if (Number.isFinite(expiry) && expiry > now) {
            if (!course.validUntil || expiry < Date.parse(course.validUntil)) {
                course.validUntil = new Date(expiry).toISOString();
            }
            if (expiry <= warningAt) course.expiringSoon = true;
        }
    }
    return [...courses.values()].sort((left, right) => left.courseName.localeCompare(right.courseName));
}

function emptyCourse(batch, courseId) {
    const type = relation(batch, 'creditTypeId');
    const spec = relation(type, 'courseSpecId');
    return {
        courseId,
        courseName: sanitizeStudentText(spec.name || type.name || '课程'),
        deliveryMode: spec.deliveryMode || '',
        durationMinutes: quantity(spec.durationMinutes),
        remainingLessons: 0,
        scheduledLessons: 0,
        completedLessons: 0,
        expiredLessons: 0,
        awaitingActivation: false,
        validUntil: null,
        expiringSoon: false,
    };
}

function mapCourseSource(batch) {
    return {
        grantedAt: nullableDate(batch.created),
        initialLessons: quantity(batch.originalQuantity),
        remainingLessons: quantity(batch.availableQuantity),
        scheduledLessons: quantity(batch.frozenQuantity),
        completedLessons: quantity(batch.consumedQuantity),
        validFrom: nullableDate(batch.validFrom),
        validUntil: nullableDate(batch.effectiveExpiresAt),
        status: sourceStatus(batch.status),
    };
}

function mapLesson(record, context = {}) {
    const session = relation(record, 'sessionId');
    const type = relation(session, 'requiredCreditTypeId');
    const spec = relation(type, 'courseSpecId');
    return {
        lessonId: session.id || relationId(record.sessionId),
        title: sanitizeStudentText(session.title || spec.name || type.name || '课程'),
        course: {
            courseId: spec.id || relationId(type.courseSpecId) || type.id || relationId(session.requiredCreditTypeId),
            name: sanitizeStudentText(spec.name || type.name || '课程'),
        },
        status: lessonStatus(session.status),
        startAt: nullableDate(session.startAt),
        endAt: nullableDate(session.endAt),
        location: sanitizeStudentText(session.location || ''),
        teacherSummary: relationSummary(context.teachers, 'teacherId', '教师'),
        classSummary: relationSummary(context.classes, 'classId', '班级'),
        attendanceResult: attendanceResult(record.attendanceStatus),
        lessonHourResult: lessonHourResult(record.creditStatus),
        notice: learningNotice(record.creditStatus),
    };
}

function mapLessonRecord(event) {
    const type = relation(event, 'creditTypeId');
    const spec = relation(type, 'courseSpecId');
    const presentation = eventPresentation(event.eventType, Number(event.quantityDelta) || 0);
    return {
        recordId: event.id || '',
        course: {
            courseId: spec.id || relationId(type.courseSpecId) || type.id || relationId(event.creditTypeId),
            name: sanitizeStudentText(spec.name || type.name || '课程'),
        },
        title: presentation.title,
        lessonHours: presentation.lessonHours,
        impact: presentation.impact,
        occurredAt: nullableDate(event.businessTime || event.created),
    };
}

function buildLearningWarnings(roster, contexts = new Map()) {
    return roster.filter((record) => ['credit_insufficient', 'conversion_required'].includes(record.creditStatus))
        .map((record) => {
            const lesson = mapLesson(record, lessonContext(record, contexts));
            return {
                lessonId: lesson.lessonId,
                title: lesson.title,
                startAt: lesson.startAt,
                message: '当前课时安排需要教务老师处理，请联系教学管理。',
            };
        });
}

function lessonQueryOptions(studentId, filters = {}) {
    const parts = [`studentId="${escapeFilter(studentId)}"`];
    if (filters.courseId) {
        parts.push(`sessionId.requiredCreditTypeId.courseSpecId="${escapeFilter(filters.courseId)}"`);
    }
    if (filters.scope === 'upcoming') {
        parts.push(`sessionId.startAt>="${new Date(filters.now).toISOString()}"`);
        parts.push('sessionId.status!="cancelled"');
    } else if (filters.scope === 'completed') {
        parts.push('(sessionId.status="completed" || sessionId.status="settled")');
    }
    return { filter: parts.join(' && '), sort: 'sessionId.startAt', expand: lessonExpand() };
}

function recordQueryOptions(studentId, courseId = '') {
    const parts = [`studentId="${escapeFilter(studentId)}"`];
    if (courseId) parts.push(`creditTypeId.courseSpecId="${escapeFilter(courseId)}"`);
    return {
        filter: parts.join(' && '),
        sort: '-businessTime,-created',
        expand: 'creditTypeId,creditTypeId.courseSpecId',
    };
}

function lessonExpand() {
    return 'sessionId,sessionId.requiredCreditTypeId,sessionId.requiredCreditTypeId.courseSpecId';
}

function courseIdentity(batch) {
    const type = relation(batch, 'creditTypeId');
    const spec = relation(type, 'courseSpecId');
    return spec.id || relationId(type.courseSpecId) || '';
}

function eventPresentation(type, delta) {
    const count = Math.abs(delta);
    const presentations = {
        GRANT: ['新增课时', 'added'],
        CONVERT_IN: ['新增课时', 'added'],
        CONVERT_OUT: ['课程调整', 'used'],
        FREEZE: ['已安排课程', 'scheduled'],
        ACTIVATE: ['课程已生效', 'neutral'],
        CONSUME: ['已完成课程', 'used'],
        RELEASE: ['课时已退回', 'returned'],
        EXPIRE: ['课时已到期', 'used'],
        EXTEND: ['有效期已延长', 'neutral'],
        REVERSE: ['记录已更正', 'neutral'],
        ADJUST: ['课时已调整', delta >= 0 ? 'added' : 'used'],
    };
    const [title, impact] = presentations[type] || ['课时记录', 'neutral'];
    return { title, impact, lessonHours: count };
}

function lessonStatus(status) {
    if (status === 'settled') return 'completed';
    return ['draft', 'scheduled', 'enrollment_closed', 'in_progress', 'completed', 'cancelled'].includes(status)
        ? status
        : 'scheduled';
}

function attendanceResult(status) {
    const values = {
        scheduled: 'pending', checked_in: 'present', present: 'present', late: 'late',
        leave: 'leave', absent: 'absent', cancelled: 'cancelled',
    };
    return values[status] || 'pending';
}

function lessonHourResult(status) {
    const values = {
        pending: 'pending', credit_insufficient: 'needs_help', conversion_required: 'needs_help',
        reserved: 'scheduled', consumed: 'completed', released: 'returned', reversed: 'corrected',
    };
    return values[status] || 'pending';
}

function learningNotice(status) {
    return ['credit_insufficient', 'conversion_required'].includes(status)
        ? '当前课时安排需要教务老师处理，请联系教学管理。'
        : '';
}

function sourceStatus(status) {
    const values = {
        pending: 'pending', unactivated: 'awaiting_activation', active: 'active', depleted: 'completed',
        expired: 'expired', cancelled: 'cancelled',
    };
    return values[status] || 'pending';
}

function isUpcomingLesson(lesson, now) {
    const startAt = Date.parse(lesson.startAt || '');
    const endAt = Date.parse(lesson.endAt || '');
    const relevantAt = Number.isFinite(endAt) ? endAt : startAt;
    return Number.isFinite(startAt) && relevantAt >= Number(now) && lesson.status !== 'cancelled';
}

async function loadLessonContexts(repository, records) {
    const sessionIds = [...new Set((records || []).map(sessionIdOf).filter(Boolean))];
    if (!sessionIds.length) return new Map();
    const [teachers, classes] = await Promise.all([
        loadLessonRelations(repository, 'session_teachers', sessionIds, 'teacherId'),
        loadLessonRelations(repository, 'session_classes', sessionIds, 'classId'),
    ]);
    const contexts = new Map(sessionIds.map((id) => [id, { teachers: [], classes: [] }]));
    for (const row of teachers) contexts.get(relationId(row.sessionId))?.teachers.push(row);
    for (const row of classes) contexts.get(relationId(row.sessionId))?.classes.push(row);
    return contexts;
}

async function loadLessonRelations(repository, collection, sessionIds, expand) {
    const chunks = [];
    for (let index = 0; index < sessionIds.length; index += RELATION_CHUNK_SIZE) {
        chunks.push(sessionIds.slice(index, index + RELATION_CHUNK_SIZE));
    }
    const rows = await Promise.all(chunks.map((ids) => repository.list(collection, {
        filter: `(${ids.map((id) => `sessionId="${escapeFilter(id)}"`).join(' || ')})`,
        sort: 'sessionId',
        expand,
    })));
    return rows.flat();
}

function lessonContext(record, contexts) {
    return contexts.get(sessionIdOf(record)) || {};
}

function sessionIdOf(record = {}) {
    const session = relation(record, 'sessionId');
    return session.id || relationId(record.sessionId);
}

function relationSummary(rows = [], field, fallback) {
    const items = rows.map((row) => {
        const expanded = relation(row, field);
        return {
            id: expanded.id || relationId(row[field]),
            name: sanitizeStudentText(expanded.realName || expanded.realname || expanded.nickName
                || expanded.nickname || expanded.name || expanded.code || fallback),
        };
    }).filter((item) => item.id);
    return {
        count: items.length,
        items: items.slice(0, 3),
        label: items.slice(0, 3).map((item) => item.name).join('、'),
        overflow: Math.max(0, items.length - 3),
    };
}

function compareLessonStart(left, right) {
    return Date.parse(left.startAt) - Date.parse(right.startAt)
        || left.lessonId.localeCompare(right.lessonId);
}

function nullableDate(value) {
    return value || null;
}

function requiredStudentId(studentId) {
    requiredId(studentId, 'STUDENT_ID_REQUIRED', '学员编号不能为空');
}

function requiredId(value, code, message) {
    invariant(typeof value === 'string' && value, code, message);
}

module.exports = {
    LESSON_SCOPES,
    StudentLearningService,
    attendanceResult,
    buildCourseSummaries,
    buildLearningWarnings,
    courseIdentity,
    eventPresentation,
    isUpcomingLesson,
    learningNotice,
    lessonHourResult,
    lessonQueryOptions,
    lessonStatus,
    loadLessonContexts,
    mapCourseSource,
    mapLesson,
    mapLessonRecord,
    recordQueryOptions,
    sourceStatus,
};
