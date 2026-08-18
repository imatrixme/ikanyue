const { invariant } = require('../../services/courseCredits/domain');
const { requireBookingTeacher } = require('./bookingHandlers');

function createCourseScheduleHandlers(options) {
    const {
        capability,
        loadServices,
        queryParams,
        requireAnyCapability,
        requireCapability,
        safeQuery,
    } = options;
    const teacherQuery = (c) => queryParams(c, ['from', 'to', 'includeAvailability']);

    const teacherSchedule = async (c) => safeQuery(c, async () => {
        const user = requireBookingTeacher(c.get('user'), capability, requireCapability);
        return (await loadServices()).scheduleQueryService.teacher(user.id, teacherQuery(c));
    });

    return {
        async getInstitutionCourseCalendar(c) {
            return safeQuery(c, async () => {
                const user = requireAnyCapability(c.get('user'), [capability.ACADEMIC, capability.TEACHER]);
                const services = await loadServices();
                const query = queryParams(c, [
                    'from', 'to', 'teacherId', 'studentId', 'classId', 'courseSpecId',
                    'status', 'originType',
                ]);
                return user.isAdmin || (user.courseCreditCapabilities || []).includes(capability.ACADEMIC)
                    ? services.scheduleQueryService.institution(query)
                    : services.scheduleQueryService.teacherOps(user.id, query);
            });
        },
        getTeacherCalendar: teacherSchedule,
        getTeacherSchedule: teacherSchedule,
        async getUpcomingSchedule(c) {
            return safeQuery(c, async () => {
                const user = requireScheduleUser(c.get('user'));
                return (await loadServices()).scheduleQueryService.upcoming(
                    user, queryParams(c, ['limit'])
                );
            });
        },
    };
}

function requireScheduleUser(user) {
    invariant(user?.id && ['student', 'teacher'].includes(user.role),
        'CALENDAR_ROLE_UNSUPPORTED', '当前身份不支持课程日程');
    return user;
}

module.exports = { createCourseScheduleHandlers, requireScheduleUser };
