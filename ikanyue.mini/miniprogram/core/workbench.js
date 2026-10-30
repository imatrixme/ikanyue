import { formatAppointmentTime } from './appointments.js';

// Owner workbench: one teacher workbench whose sections follow the signed-in teacher's
// permissions (OpenSpec add-owner-workbench). The server checks every call again.

const NO_SECTIONS = Object.freeze({
    available: false, teach: false, students: false, grant: false, undo: false, allLessons: false, showTeachers: false,
});

const ATTENDANCE_LABELS = Object.freeze({
    present: '到课', late: '迟到', leave: '请假', absent: '缺席', cancelled: '已取消', pending: '待确认',
});

const array = (value) => (Array.isArray(value) ? value : []);
const count = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0);

// A server without the workbench routes (or a gateway without them) answers 404: keep the original workbench.
function workbenchMissing(error) {
    return Number(error?.code) === 404 || Number(error?.httpStatus) === 404;
}

function normalizeWorkbenchSummary(payload = {}) {
    const permissions = payload.permissions || {};
    return {
        permissions: {
            teach: Boolean(permissions.teach),
            manageStudents: Boolean(permissions.manageStudents),
            grant: Boolean(permissions.grant),
            undo: Boolean(permissions.undo),
            allLessons: Boolean(permissions.allLessons),
        },
        teacherCount: count(payload.teacherCount),
        pendingLessonCount: count(payload.pendingLessonCount),
        pendingRequestCount: count(payload.pendingRequestCount),
    };
}

// Which workbench sections show; teacher names and filters only once the studio has a second teacher.
function workbenchSections(summary) {
    if (!summary) return { ...NO_SECTIONS };
    const { permissions, teacherCount } = normalizeWorkbenchSummary(summary);
    return {
        available: true,
        teach: permissions.teach,
        students: permissions.manageStudents,
        grant: permissions.grant,
        undo: permissions.undo,
        allLessons: permissions.allLessons,
        showTeachers: teacherCount > 1,
    };
}

function normalizePendingLesson(item = {}, { showTeachers = false } = {}) {
    const teachers = array(item.teachers).map(String).filter(Boolean);
    const students = array(item.students).map((student) => ({
        sessionStudentId: student.sessionStudentId || '',
        name: student.name || '学员',
        attendance: ATTENDANCE_LABELS[student.attendanceStatus] || ATTENDANCE_LABELS.pending,
    }));
    return {
        sessionId: item.sessionId || '',
        title: item.title || '课程',
        timeLabel: formatAppointmentTime(item.startAt, item.endAt),
        location: item.location || '',
        reconfirm: Boolean(item.reconfirm),
        teachers,
        teacherLabel: showTeachers ? teachers.join('、') : '',
        students,
        studentLabel: students.length ? students.map((student) => student.name).join('、') : '暂无学员',
    };
}

function normalizePendingLessons(payload = {}, options = {}) {
    return array(payload.items).map((item) => normalizePendingLesson(item, options));
}

// Teacher filter: '' keeps every lesson; names come from the lessons themselves.
function teacherFilterOptions(lessons) {
    const names = [...new Set(lessons.flatMap((lesson) => lesson.teachers))];
    return [{ label: '全部老师', value: '' }, ...names.map((name) => ({ label: name, value: name }))];
}

function filterLessonsByTeacher(lessons, teacher) {
    return teacher ? lessons.filter((lesson) => lesson.teachers.includes(teacher)) : lessons;
}

// The confirm body: everyone present unless picked as absent.
function confirmLessonPayload(absentIds = []) {
    const ids = [...new Set(array(absentIds).filter(Boolean))].sort();
    return ids.length ? { absentSessionStudentIds: ids } : {};
}

function normalizeStudentRow(item = {}) {
    const name = item.realName || item.nickName || '未填写姓名';
    return {
        studentId: item.id || '',
        name,
        initial: name.slice(0, 1),
        cellphone: item.cellphone || '',
        blocked: Boolean(item.blocked),
    };
}

function normalizeStudentPage(payload = {}) {
    const pagination = payload.pagination || {};
    return {
        items: array(payload.items).map(normalizeStudentRow),
        page: count(pagination.page) || 1,
        totalPages: count(pagination.totalPages),
    };
}

const CELLPHONE = /^1\d{10}$/;

// Adding a student needs a name and an 11-digit mainland cellphone; the student signs in with WeChat later.
function validateNewStudent(draft = {}) {
    const realName = String(draft.realName || '').trim();
    const cellphone = String(draft.cellphone || '').replace(/\s/g, '');
    if (!realName) return { error: '请填写学员姓名' };
    if (!CELLPHONE.test(cellphone)) return { error: '请填写 11 位手机号' };
    return { payload: { realName, cellphone } };
}

const yuan = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '0';
    return amount.toFixed(2).replace(/\.00$/, '');
};

function normalizePackages(payload = {}) {
    return array(payload.items).map((item) => {
        const grants = array(item.grants).map((grant) => `${grant.name || '课时'} ${count(grant.quantity)} ${grant.unitLabel || '课时'}`);
        return {
            packageId: item.packageId || '',
            name: item.name || '课包',
            grantLabel: grants.join('、'),
            validityLabel: count(item.validityDurationDays) ? `有效期 ${count(item.validityDurationDays)} 天` : '',
            prices: array(item.prices).map((price) => ({
                priceVersionId: price.priceVersionId || '',
                listAmount: Number(price.listAmount) || 0,
                saleAmount: Number(price.saleAmount) || 0,
                label: Number(price.saleAmount) < Number(price.listAmount)
                    ? `售价 ¥${yuan(price.saleAmount)}（标价 ¥${yuan(price.listAmount)}）`
                    : `售价 ¥${yuan(price.saleAmount)}`,
            })),
        };
    }).filter((item) => item.packageId && item.prices.length);
}

// Received amount is optional: empty means the sale price; a lower amount is the owner's own discount.
function buildGrantPayload(draft = {}, packages = []) {
    const chosen = packages.find((item) => item.packageId === draft.packageId);
    if (!chosen) return { error: '请选择课包' };
    const price = chosen.prices.find((item) => item.priceVersionId === draft.priceVersionId) || chosen.prices[0];
    const payload = { packageId: chosen.packageId, priceVersionId: price.priceVersionId };
    const text = String(draft.paidAmount ?? '').trim();
    if (text) {
        const amount = Number(text);
        if (!/^\d+(\.\d{1,2})?$/.test(text) || !Number.isFinite(amount)) return { error: '实收金额最多两位小数' };
        payload.paidAmount = amount;
    }
    const received = payload.paidAmount ?? price.saleAmount;
    return {
        payload,
        summary: `${chosen.name}，${chosen.grantLabel}，标价 ¥${yuan(price.listAmount)}，实收 ¥${yuan(received)}`,
    };
}

function normalizeLedger(payload = {}) {
    const overview = payload.overview || {};
    const records = payload.records || {};
    return {
        student: {
            studentId: payload.student?.studentId || '',
            name: payload.student?.name || '学员',
            cellphone: payload.student?.cellphone || '',
        },
        courses: array(overview.courses).map((course) => ({
            courseId: course.courseId || '',
            name: course.courseName || '课程',
            remaining: count(course.remainingLessons),
            scheduled: count(course.scheduledLessons),
            completed: count(course.completedLessons),
        })),
        confirmedLessons: array(payload.confirmedLessons).map((lesson) => ({
            sessionId: lesson.lessonId || '',
            title: lesson.title || '课程',
            timeLabel: formatAppointmentTime(lesson.startAt, lesson.endAt),
            attendance: ATTENDANCE_LABELS[lesson.attendanceResult] || ATTENDANCE_LABELS.pending,
        })),
        records: array(records.items).map((record) => ({
            recordId: record.recordId || '',
            title: record.title || '课时变动',
            course: record.course?.name || '课程',
            change: `${{ added: '+', used: '-' }[record.impact] || ''}${count(record.lessonHours)} 课时`,
        })),
    };
}

function workbenchErrorMessage(error, fallback = '工作台暂时无法使用') {
    const messages = {
        COURSE_CREDIT_ADMIN_REQUIRED: '只有老板可以管理学员。',
        COURSE_CREDIT_CAPABILITY_REQUIRED: '当前账号没有这项权限。',
        COURSE_CREDIT_FEATURE_DISABLED: '确认上课暂未开放。',
        ENROLLMENT_PRICE_EXPIRED: '这个价格已过期，请重新选择。',
        ENROLLMENT_PACKAGE_INACTIVE: '这个课包已停售，请重新选择。',
        LESSON_NOT_STARTED: '课程开始后才能确认上课。',
        REVERSAL_REASON_REQUIRED: '请填写至少 4 个字的撤销原因。',
        SESSION_ALREADY_SETTLED: '这节课已经确认过了。',
        SESSION_ATTENDANCE_LOCKED: '这节课已经确认过了。',
        SESSION_NOT_REVERSIBLE: '这节课当前不能撤销。',
        SESSION_ROSTER_REQUIRED: '这节课没有学员，无需确认。',
        SESSION_STUDENT_CREDIT_UNRESOLVED: '有学员课时未就绪，请在后台处理后再确认。',
        SESSION_TEACHER_FORBIDDEN: '只能确认自己任课的课。',
    };
    if (messages[error?.errorCode]) return messages[error.errorCode];
    if (Number(error?.code) === 403) return messages.COURSE_CREDIT_CAPABILITY_REQUIRED;
    return error?.message || fallback;
}

function studentLedgerUrl(studentId) {
    return `/pages/workbenchStudent/index?id=${encodeURIComponent(studentId || '')}`;
}

function grantUrl(student = {}) {
    return `/pages/workbenchGrant/index?id=${encodeURIComponent(student.studentId || '')}&name=${encodeURIComponent(student.name || '')}`;
}

export {
    buildGrantPayload, confirmLessonPayload, filterLessonsByTeacher, grantUrl, normalizeLedger, normalizePackages,
    normalizePendingLessons, normalizeStudentPage, normalizeWorkbenchSummary, studentLedgerUrl, teacherFilterOptions,
    validateNewStudent, workbenchErrorMessage, workbenchMissing, workbenchSections,
};
