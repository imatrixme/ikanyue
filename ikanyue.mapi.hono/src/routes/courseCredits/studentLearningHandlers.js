const { invariant } = require('../../services/courseCredits/domain');

function createStudentLearningHandlers(options) {
    const { loadServices, queryParams, safeQuery } = options;

    return {
        async getLearningOverview(c) {
            return safeQuery(c, async () => {
                const user = requireLearningStudent(c.get('user'));
                const services = await loadServices();
                return services.studentLearningService.overview(user.id);
            });
        },

        async getLearningCourse(c) {
            return safeQuery(c, async () => {
                const user = requireLearningStudent(c.get('user'));
                const services = await loadServices();
                return services.studentLearningService.getCourse(user.id, c.req.param('courseId'));
            });
        },

        async listLearningLessons(c) {
            return safeQuery(c, async () => {
                const user = requireLearningStudent(c.get('user'));
                const services = await loadServices();
                return services.studentLearningService.listLessons(user.id,
                    queryParams(c, ['page', 'perPage', 'scope', 'courseId']));
            });
        },

        async getLearningLesson(c) {
            return safeQuery(c, async () => {
                const user = requireLearningStudent(c.get('user'));
                const services = await loadServices();
                return services.studentLearningService.getLesson(user.id, c.req.param('lessonId'));
            });
        },

        async listLearningRecords(c) {
            return safeQuery(c, async () => {
                const user = requireLearningStudent(c.get('user'));
                const services = await loadServices();
                return services.studentLearningService.listRecords(user.id,
                    queryParams(c, ['page', 'perPage', 'courseId']));
            });
        },
    };
}

function requireLearningStudent(user = {}) {
    invariant(user.id && user.role === 'student',
        'STUDENT_LEARNING_STUDENT_REQUIRED', '仅学员可以查看课程信息');
    return user;
}

module.exports = { createStudentLearningHandlers, requireLearningStudent };
