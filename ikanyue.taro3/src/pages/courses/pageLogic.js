const LESSON_STATUS = Object.freeze({
    draft: '待安排',
    scheduled: '已安排',
    enrollment_closed: '名单已确认',
    in_progress: '进行中',
    completed: '已完成',
    cancelled: '已取消',
});

const ATTENDANCE_STATUS = Object.freeze({
    pending: '待上课',
    present: '已到课',
    late: '迟到',
    leave: '请假',
    absent: '缺席',
    cancelled: '已取消',
});

const LESSON_HOUR_STATUS = Object.freeze({
    pending: '待确认',
    needs_help: '请联系教务',
    scheduled: '已安排',
    completed: '已完成',
    returned: '已退回',
    corrected: '已更正',
});

function normalizeOverview(payload = {}) {
    const upcomingLessons = array(payload.upcomingLessons).map(normalizeLesson).slice(0, 3);
    const nextLesson = payload.nextLesson ? normalizeLesson(payload.nextLesson) : upcomingLessons[0] || null;
    return {
        courses: array(payload.courses).map(normalizeCourse),
        nextLesson,
        recentRecords: array(payload.recentRecords).map(normalizeRecord),
        upcomingLessons: upcomingLessons.length ? upcomingLessons : nextLesson ? [nextLesson] : [],
        warnings: array(payload.warnings).map((warning) => ({
            lessonId: warning.lessonId || '',
            message: warning.message || '当前课程安排需要教务老师处理。',
            startAt: warning.startAt || null,
            title: warning.title || '课程安排提醒',
        })),
    };
}

function normalizeCourse(course = {}) {
    return {
        awaitingActivation: Boolean(course.awaitingActivation),
        completedLessons: count(course.completedLessons),
        courseId: course.courseId || '',
        courseName: course.courseName || '课程',
        deliveryMode: course.deliveryMode || '',
        durationMinutes: count(course.durationMinutes),
        expiredLessons: count(course.expiredLessons),
        expiringSoon: Boolean(course.expiringSoon),
        remainingLessons: count(course.remainingLessons),
        scheduledLessons: count(course.scheduledLessons),
        validUntil: course.validUntil || null,
    };
}

function normalizeCourseDetail(payload = {}) {
    return {
        ...normalizeCourse(payload),
        recentLessons: array(payload.recentLessons).map(normalizeLesson),
        recentRecords: array(payload.recentRecords).map(normalizeRecord),
        sources: array(payload.sources).map(normalizeSource),
    };
}

function normalizeSource(source = {}) {
    return {
        completedLessons: count(source.completedLessons),
        grantedAt: source.grantedAt || null,
        initialLessons: count(source.initialLessons),
        remainingLessons: count(source.remainingLessons),
        scheduledLessons: count(source.scheduledLessons),
        status: source.status || 'pending',
        validFrom: source.validFrom || null,
        validUntil: source.validUntil || null,
    };
}

function normalizeLesson(lesson = {}) {
    return {
        attendanceResult: lesson.attendanceResult || 'pending',
        course: {
            courseId: lesson.course?.courseId || '',
            name: lesson.course?.name || '课程',
        },
        endAt: lesson.endAt || null,
        classSummary: normalizeLessonSummary(lesson.classSummary),
        lessonHourResult: lesson.lessonHourResult || 'pending',
        lessonId: lesson.lessonId || '',
        location: lesson.location || '',
        notice: lesson.notice || '',
        startAt: lesson.startAt || null,
        status: lesson.status || 'scheduled',
        teacherSummary: normalizeLessonSummary(lesson.teacherSummary),
        title: lesson.title || lesson.course?.name || '课程',
    };
}

function normalizeLessonSummary(summary = {}) {
    return {
        count: count(summary.count),
        items: array(summary.items).slice(0, 3).map((item) => ({ id: item?.id || '', name: item?.name || '未命名' })),
        label: summary.label || '',
        overflow: count(summary.overflow),
    };
}

function normalizeRecord(record = {}) {
    return {
        course: {
            courseId: record.course?.courseId || '',
            name: record.course?.name || '课程',
        },
        impact: record.impact || 'neutral',
        lessonHours: count(record.lessonHours),
        occurredAt: record.occurredAt || null,
        recordId: record.recordId || '',
        title: record.title || '课时记录',
    };
}

function normalizePage(payload = {}, mapper = (item) => item) {
    return {
        items: array(payload.items).map(mapper),
        page: positive(payload.page, 1),
        perPage: positive(payload.perPage, 20),
        totalItems: count(payload.totalItems),
        totalPages: count(payload.totalPages),
    };
}

function mergePage(current = [], incoming = [], key = 'lessonId') {
    const merged = new Map();
    [...current, ...incoming].forEach((item) => {
        const identity = item?.[key];
        if (identity) merged.set(identity, item);
    });
    return [...merged.values()];
}

function hasNextPage(page = {}) {
    return Number(page.page || 1) < Number(page.totalPages || 0);
}

function formatDate(value) {
    const date = validDate(value);
    if (!date) return '长期有效';
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function formatDateTime(value) {
    const date = validDate(value);
    if (!date) return '时间待定';
    return `${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatLessonTime(startAt, endAt) {
    const start = validDate(startAt);
    const end = validDate(endAt);
    if (!start) return '时间待定';
    const date = `${pad(start.getMonth() + 1)}.${pad(start.getDate())}`;
    const startTime = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
    return end ? `${date} ${startTime}-${pad(end.getHours())}:${pad(end.getMinutes())}` : `${date} ${startTime}`;
}

function courseValidityText(course = {}) {
    if (course.awaitingActivation) return '课程安排待生效';
    if (!course.validUntil) return '长期有效';
    return course.expiringSoon ? `有效期至 ${formatDate(course.validUntil)}，请留意安排` : `有效期至 ${formatDate(course.validUntil)}`;
}

function sourceValidityText(source = {}) {
    const status = {
        pending: '待生效', awaiting_activation: '待生效', active: '可安排',
        completed: '已完成', expired: '已到期', cancelled: '已取消',
    }[source.status] || '待确认';
    return `${status} · ${source.validUntil ? formatDate(source.validUntil) : '长期有效'}`;
}

function lessonStatusLabel(status) {
    return LESSON_STATUS[status] || '待确认';
}

function attendanceLabel(status) {
    return ATTENDANCE_STATUS[status] || '待确认';
}

function lessonHourLabel(status) {
    return LESSON_HOUR_STATUS[status] || '待确认';
}

function recordQuantityText(record = {}) {
    const sign = ['added', 'returned'].includes(record.impact) ? '+' : record.impact === 'used' ? '-' : '';
    return `${sign}${count(record.lessonHours)} 课时`;
}

function pageState({ error = '', items = [], loading = false } = {}) {
    if (loading) return 'loading';
    if (error) return 'error';
    return items.length ? 'ready' : 'empty';
}

function learningErrorMessage(error, fallback = '课程数据暂时无法加载') {
    const messages = {
        LEARNING_COURSE_NOT_FOUND: '未找到这门课程',
        LEARNING_LESSON_NOT_FOUND: '未找到这节课',
        LEARNING_LESSON_SCOPE_INVALID: '课程日程筛选无效',
        STUDENT_SCOPE_REQUIRED: '请使用学员账号登录',
    };
    return messages[error?.errorCode] || error?.message || fallback;
}

function courseDetailUrl(courseId) {
    return `/pages/courseDetail/index?id=${encodeURIComponent(courseId || '')}`;
}

function lessonDetailUrl(lessonId) {
    return `/pages/courseLessonDetail/index?id=${encodeURIComponent(lessonId || '')}`;
}

function courseListUrl(path, courseId = '') {
    const suffix = courseId ? `?courseId=${encodeURIComponent(courseId)}` : '';
    return `/pages/${path}/index${suffix}`;
}

function array(value) {
    return Array.isArray(value) ? value : [];
}

function count(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
}

function positive(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function validDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value) {
    return String(value).padStart(2, '0');
}

export {
    attendanceLabel, courseDetailUrl, courseListUrl, courseValidityText, formatDate,
    formatDateTime, formatLessonTime, hasNextPage, learningErrorMessage, lessonDetailUrl,
    lessonHourLabel, lessonStatusLabel, mergePage, normalizeCourse, normalizeCourseDetail,
    normalizeLesson, normalizeOverview, normalizePage, normalizeRecord, normalizeSource,
    pageState, recordQuantityText, sourceValidityText,
};
