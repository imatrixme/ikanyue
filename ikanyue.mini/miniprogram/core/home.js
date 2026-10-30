import { academyParts } from './academyTime.js';
import { courseValidityText } from './courses.js';

const LOW_LESSON_THRESHOLD = 2;

function homeState({ courses = [], error = '', isLogin = false, loading = false } = {}) {
    if (!isLogin) return 'guest';
    if (loading && !courses.length) return 'loading';
    if (error && !courses.length) return 'error';
    return courses.length ? 'member' : 'noCourse';
}

function needsRenewal(course = {}) {
    if (course.awaitingActivation) return false;
    return Boolean(course.expiringSoon) || course.remainingLessons <= LOW_LESSON_THRESHOLD;
}

function renewalHint(course = {}) {
    if (!needsRenewal(course)) return '';
    if (course.remainingLessons <= 0) return '课时已用完，可查看续费课包';
    if (course.expiringSoon && course.remainingLessons > LOW_LESSON_THRESHOLD) return '课程即将到期，可查看续费课包';
    return `仅剩 ${course.remainingLessons} 节，可查看续费课包`;
}

function homeCourseRows(courses = []) {
    return courses.map((course) => ({
        courseId: course.courseId,
        name: course.courseName,
        remainingLessons: course.remainingLessons,
        renewalHint: renewalHint(course),
        validityText: courseValidityText(course),
    }));
}

// The newest unread 教务提醒 and the subscribe template the student may opt into.
function normalizeReminders(payload = {}) {
    const items = Array.isArray(payload.items) ? payload.items : [];
    const latest = items[0];
    return {
        reminder: latest ? {
            id: latest.id || '',
            message: latest.message || '',
            sender: latest.sender || '看乐教务',
        } : null,
        subscribeTemplateId: payload.subscribeTemplateId || '',
    };
}

const RENEWAL_REASONS = Object.freeze({ low_balance: '课时不足', expiring: '即将到期' });

// Teachers only see who is due; the academy sends the reminders.
function teacherRenewalRows(payload = {}) {
    const items = Array.isArray(payload.items) ? payload.items : [];
    return items.map((item) => {
        const date = academyParts(item.validUntil);
        const detail = item.reason === 'expiring' && date
            ? `${date.month}月${date.day}日到期`
            : `剩 ${Number(item.remainingLessons) || 0} 节`;
        return {
            key: `${item.studentId}-${item.courseId}`,
            title: item.studentName || '学员',
            description: [item.courseName, RENEWAL_REASONS[item.reason] || ''].filter(Boolean).join(' · '),
            value: detail,
        };
    });
}

// The studio home in the 松果 layout: four shortcuts under the venue card, then my lessons and my bookings.
// `account` entries need a signed-in student; a guest signs in on the spot when tapping one.
const HOME_SHORTCUTS = Object.freeze([
    { key: 'venue', label: '场馆信息', icon: 'account-about', url: '/pages/venues/index', tab: false, account: false },
    { key: 'shop', label: '课程课包', icon: 'course-book', url: '/pages/courseShop/index', tab: false, account: true },
    { key: 'booking', label: '去约课', icon: 'booking-request', url: '/pages/appointmentBooking/index', tab: true, account: false },
    { key: 'lessons', label: '我的课时', icon: 'course-validity', url: '/pages/courses/index', tab: false, account: true },
]);

export {
    HOME_SHORTCUTS, LOW_LESSON_THRESHOLD, homeCourseRows, homeState, needsRenewal, normalizeReminders, renewalHint, teacherRenewalRows,
};
