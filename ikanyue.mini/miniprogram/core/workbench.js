import { formatAppointmentTime } from './appointments.js';
import { formatDate } from './courses.js';

// Owner workbench: one teacher workbench whose sections follow the signed-in teacher's
// permissions (OpenSpec add-owner-workbench, add-teacher-substitution). The server checks every call again.

const NO_SECTIONS = Object.freeze({
    available: false, teach: false, students: false, grant: false, undo: false, allLessons: false, showTeachers: false,
    teachers: false,
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
        // Changing teachers only makes sense with a second teacher, and only the owner may do it.
        teachers: permissions.manageStudents && teacherCount > 1,
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
        started: Boolean(item.started),
        leadTeacherId: item.leadTeacherId || '',
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
        SESSION_NOT_EDITABLE: '这节课当前不能换老师。',
        SUBSTITUTE_SAME_TEACHER: '这节课已经由这位老师上。',
        SUBSTITUTE_TEACHER_ASSIGNED: '这位老师已在这节课上。',
        SUBSTITUTE_TEACHER_BUSY: '这位老师在这个时间已有课。',
        TEACHER_INACTIVE: '这位老师的账号未启用。',
        HANDOVER_ADMIN_FORBIDDEN: '管理员账号不能交接。',
        HANDOVER_CONFLICTS: '接手老师有课时间冲突，请先单独调整这些课。',
        HANDOVER_REASON_REQUIRED: '请填写至少 4 个字的交接原因。',
        HANDOVER_SELF_FORBIDDEN: '不能交接自己的账号。',
        HANDOVER_TOO_LARGE: '要交接的课太多，请在网页后台处理。',
    };
    if (messages[error?.errorCode]) return messages[error.errorCode];
    if (Number(error?.code) === 403) return messages.COURSE_CREDIT_CAPABILITY_REQUIRED;
    return error?.message || fallback;
}

function normalizeTeachers(payload = {}) {
    return array(payload.items).map((item) => {
        const name = item.name || '老师';
        const lessons = count(item.lessonCount);
        const requests = count(item.pendingRequestCount);
        return {
            teacherId: item.teacherId || '',
            name,
            initial: name.slice(0, 1),
            isAdmin: Boolean(item.isAdmin),
            description: [`${lessons} 节课未确认`, requests ? `${requests} 条约课待处理` : ''].filter(Boolean).join(' · '),
        };
    }).filter((item) => item.teacherId);
}

// Who can take a lesson: every other teacher; with exactly one the choice is made for the owner.
function substituteOptions(teachers, leadTeacherId) {
    return array(teachers).filter((teacher) => teacher.teacherId !== leadTeacherId)
        .map((teacher) => ({ label: teacher.name, value: teacher.teacherId }));
}

function normalizeTeacherLessons(payload = {}) {
    const name = payload.teacher?.name || '老师';
    return {
        teacher: { teacherId: payload.teacher?.teacherId || '', name, isAdmin: Boolean(payload.teacher?.isAdmin) },
        lessons: normalizePendingLessons(payload).map((lesson) => ({
            ...lesson, stateLabel: lesson.started ? '已开课，待确认' : '未开始',
        })),
    };
}

function normalizeHandoverPreview(payload = {}) {
    const lessons = normalizePendingLessons({ items: payload.lessons });
    const conflicts = normalizePendingLessons({ items: payload.conflicts });
    const requests = array(payload.pendingRequests).map((request) => ({
        appointmentId: request.appointmentId || '',
        label: `${request.student || '学员'} · ${formatAppointmentTime(request.startAt, request.endAt)}`,
    }));
    const students = array(payload.students).map(String).filter(Boolean);
    const unopened = array(payload.offerings).filter((offering) => !offering.receiverOffers)
        .map((offering) => offering.courseName || '课程');
    return {
        lessonCount: lessons.length,
        conflicts,
        requests,
        studentLabel: students.length ? students.join('、') : '没有学员',
        unopenedLabel: unopened.join('、'),
        canSubmit: conflicts.length === 0,
    };
}

// The last confirmation before an irreversible handover.
function handoverSummary(preview, from, to) {
    return [
        `${preview.lessonCount} 节课改由${to}上`,
        preview.requests.length ? `婉拒 ${preview.requests.length} 条约课申请` : '',
        `关闭${from}的开放预约并停用账号`,
        '学员课时不变',
    ].filter(Boolean).join('，');
}

// Owner dashboard (OpenSpec add-owner-dashboard): a few numbers per period, lessons by teacher
// for reconciling with them, and students who need a word. No money, no teacher pay.
const DASHBOARD_PERIODS = Object.freeze([
    { value: 'today', label: '今天' }, { value: 'week', label: '本周' }, { value: 'month', label: '按月' },
]);

// Lesson credits can be fractional; show at most one decimal.
const credits = (value) => String(Math.round(count(value) * 10) / 10);

const person = (name) => {
    const label = name || '学员';
    return { name: label, initial: label.slice(0, 1) };
};

function renewalDescription(item) {
    const course = item.courseName || '课程';
    if (item.reason === 'expiring') {
        return `${course} 剩 ${credits(item.remaining)} 课时，${formatDate(item.expiresAt)} 到期`;
    }
    return count(item.remaining) ? `${course} 只剩 ${credits(item.remaining)} 课时` : `${course} 课时已用完`;
}

// A month range ("YYYY-MM") steps back without limit and forward up to the current month (next is '').
const monthSteps = (range = {}) => ({
    month: range.month || '', previousMonth: range.previous || '', nextMonth: range.next || '',
});

function normalizeDashboard(payload = {}) {
    const lessons = payload.lessons || {};
    const bookings = payload.bookings || {};
    return {
        rangeLabel: payload.range?.label || '',
        ...monthSteps(payload.range),
        cards: [
            { key: 'lessons', label: '上课', value: `${count(lessons.count)} 节`, note: `扣 ${credits(lessons.credits)} 课时` },
            { key: 'grants', label: '发课时', value: `${credits(payload.grants?.credits)} 课时`, note: '老板发放的课时' },
            {
                key: 'bookings', label: '约课', value: `${count(bookings.requested)} 次`,
                note: count(bookings.cancelled) ? `取消 ${count(bookings.cancelled)} 次` : '没有取消',
            },
            { key: 'students', label: '新学员', value: `${count(payload.students?.joined)} 人`, note: '这段时间加入' },
        ],
        teachers: array(payload.teachers).filter((item) => item.teacherId).map((item) => ({
            teacherId: item.teacherId, ...person(item.name || '老师'),
            description: `${count(item.lessons)} 节 · 扣 ${credits(item.credits)} 课时`,
        })),
        renewals: array(payload.renewals).filter((item) => item.studentId).map((item) => ({
            studentId: item.studentId, ...person(item.name), description: renewalDescription(item),
        })),
        inactive: array(payload.inactive).filter((item) => item.studentId).map((item) => ({
            studentId: item.studentId, ...person(item.name),
            description: `${item.lastLessonAt ? `${count(item.days)} 天没来上课` : `领课时 ${count(item.days)} 天还没来过`}`
                + ` · 剩 ${credits(item.remaining)} 课时`,
        })),
    };
}

// One teacher's confirmed lessons of the period, to settle up with them.
function normalizeReconciliation(payload = {}) {
    return {
        teacher: { teacherId: payload.teacher?.teacherId || '', name: payload.teacher?.name || '老师' },
        rangeLabel: payload.range?.label || '',
        ...monthSteps(payload.range),
        totalLabel: `${count(payload.count)} 节 · 扣 ${credits(payload.credits)} 课时`,
        truncated: Boolean(payload.truncated),
        lessons: array(payload.items).filter((item) => item.sessionId).map((item) => ({
            sessionId: item.sessionId,
            title: item.title || '课程',
            timeLabel: formatAppointmentTime(item.startAt, item.endAt),
            studentLabel: array(item.students).map(String).filter(Boolean).join('、') || '学员',
            creditLabel: `${credits(item.credits)} 课时`,
        })),
    };
}

function dashboardTeacherUrl(teacherId, period, month) {
    const url = `/pages/workbenchTeacherLessons/index?id=${encodeURIComponent(teacherId || '')}&period=${encodeURIComponent(period || 'today')}`;
    return period === 'month' && month ? `${url}&month=${encodeURIComponent(month)}` : url;
}

function studentLedgerUrl(studentId) {
    return `/pages/workbenchStudent/index?id=${encodeURIComponent(studentId || '')}`;
}

function teacherUrl(teacherId) {
    return `/pages/workbenchTeacher/index?id=${encodeURIComponent(teacherId || '')}`;
}

function grantUrl(student = {}) {
    return `/pages/workbenchGrant/index?id=${encodeURIComponent(student.studentId || '')}&name=${encodeURIComponent(student.name || '')}`;
}

export {
    DASHBOARD_PERIODS, buildGrantPayload, confirmLessonPayload, dashboardTeacherUrl, filterLessonsByTeacher, grantUrl,
    handoverSummary, normalizeDashboard, normalizeHandoverPreview, normalizeLedger, normalizePackages, normalizePendingLessons,
    normalizeReconciliation, normalizeStudentPage, normalizeTeacherLessons,
    normalizeTeachers, normalizeWorkbenchSummary, studentLedgerUrl, substituteOptions, teacherFilterOptions, teacherUrl,
    validateNewStudent, workbenchErrorMessage, workbenchMissing, workbenchSections,
};
