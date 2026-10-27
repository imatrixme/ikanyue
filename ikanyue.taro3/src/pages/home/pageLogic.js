import { courseValidityText } from '../courses/pageLogic';

const LOW_LESSON_THRESHOLD = 2;

function homeState({ courses = [], error = '', isLogin = false, loading = false } = {}) {
    if (!isLogin) return 'signedOut';
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

export {
    LOW_LESSON_THRESHOLD, homeCourseRows, homeState, needsRenewal, renewalHint,
};
