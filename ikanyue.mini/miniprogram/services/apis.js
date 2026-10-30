import { iNet } from './request.js';
import { UserManager } from './usermanager.js';

/**
 * 手机号密码登录
 * @param {string} cellphone - 手机号
 * @param {string} password - 密码
 * @returns {Promise} - 登录结果Promise
 */
const loginWithPassword = (cellphone, password) => {
    return new Promise((resolve, reject) => {
        iNet.post(
            '/v1/user/login',
            {
                cellphone,
                password,
            },
            false
        )
            .then((res) => {
                // 登录成功，更新用户信息缓存
                UserManager.updateUserInfoCache(res);
                resolve(res);
            })
            .catch((err) => {
                console.error('登录API错误:', err);
                reject(err);
            });
    });
};

/**
 * 微信授权登录
 * @param {Object} payload - 微信登录参数
 * @param {string} payload.code - wx.login 返回的 code
 * @param {Object} payload.phone - 微信加密手机号数据
 * @returns {Promise}
 */
const loginWithWechat = (payload) => {
    return new Promise((resolve, reject) => {
        iNet.post('/v1/user/wechat-login', payload, false)
            .then((res) => {
                if (res?.token) UserManager.updateUserInfoCache(res);
                resolve(res);
            })
            .catch((err) => {
                console.error('微信登录API错误:', err);
                reject(err);
            });
    });
};

const completeWechatRoleLogin = async (challenge, role) => {
    const result = await iNet.post('/v1/user/wechat-role-login', { challenge, role }, false);
    UserManager.updateUserInfoCache(result);
    return result;
};

const listWechatRoles = () => iNet.get('/v1/user/wechat-roles');

const switchWechatRole = async (role) => {
    const result = await iNet.post('/v1/user/switch-wechat-role', { role });
    UserManager.updateUserInfoCache(result);
    return result;
};

const updateUserInfo = async (userInfo) => {
    try {
        const result = await iNet.post('/v1/user/update', userInfo);
        UserManager.updateUserInfoCache(result || userInfo);
        return result;
    } catch (error) {
        console.error('更新用户信息API错误:', error);
        throw error;
    }
};

/**
 * 刷新登录状态
 * @returns {Promise} - 刷新结果Promise
 */
const refreshLogin = () => {
    return new Promise((resolve, reject) => {
        if (!UserManager.isLogin()) {
            reject(new Error('未登录状态'));
            return;
        }

        iNet.post('/v1/user/refresh')
            .then((res) => {
                // 登录成功，缓存用户信息
                UserManager.updateUserInfoCache(res);
                resolve(res);
            })
            .catch((err) => {
                console.error('刷新登录API错误:', err);
                // 如果刷新失败，清除登录状态
                if ([401, 403, 404, 10401, 10403, 10404].includes(Number(err.code))) {
                    UserManager.logout();
                }
                reject(err);
            });
    });
};

const findActivities = (params = {}) => {
    return iNet.get('/v1/activity/find', params);
};

const getMyPointSummary = (params = {}) => {
    return iNet.get('/v1/points/me', params);
};

const listRewardItems = (params = {}) => {
    return iNet.get('/v1/reward-items', params);
};

// Public: the home page shows venues before sign-in.
const listPublicVenues = () => iNet.get('/v1/public/venues', {}, false);

const getLearningOverview = () => iNet.get('/v1/student/learning/overview');

const getLearningCourse = (courseId) => iNet.get(`/v1/student/learning/courses/${courseId}`);

const listLearningLessons = (params = {}) => iNet.get('/v1/student/learning/lessons', params);

const getLearningLesson = (lessonId) => iNet.get(`/v1/student/learning/lessons/${lessonId}`);

const listLearningRecords = (params = {}) => iNet.get('/v1/student/learning/records', params);

const listRenewalReminders = () => iNet.get('/v1/student/renewal-reminders');

const readRenewalReminders = () => iNet.post('/v1/student/renewal-reminders/read', {});

// Records one accepted one-time subscribe grant; each grant lets the academy send one WeChat reminder.
const subscribeRenewalReminders = () => iNet.post('/v1/student/renewal-reminders/subscriptions', {});

const listStudentBookingOptions = (params = {}) => iNet.get('/v1/student/booking-options', params);

const listStudentBookingSlots = (params = {}) => iNet.get('/v1/student/booking-slots', params);

const listStudentAppointments = (params = {}) => iNet.get('/v1/student/appointments', params);

const getStudentAppointment = (appointmentId) => iNet.get(`/v1/student/appointments/${appointmentId}`);
const previewStudentCancellation = (appointmentId) => iNet.get(`/v1/student/appointments/${appointmentId}/cancellation-preview`);

const createStudentAppointment = (payload, idempotencyKey) => iNet.post(
    '/v1/student/appointments', payload, true, commandHeaders(idempotencyKey)
);

const withdrawStudentAppointment = (appointmentId, payload, idempotencyKey) => iNet.post(
    `/v1/student/appointments/${appointmentId}/withdraw`, payload, true, commandHeaders(idempotencyKey)
);

const cancelStudentAppointment = (appointmentId, payload, idempotencyKey) => iNet.post(
    `/v1/student/appointments/${appointmentId}/cancel`, payload, true, commandHeaders(idempotencyKey)
);

const getTeacherBookingDashboard = () => iNet.get('/v1/teacher/booking/dashboard');

const listTeacherRenewals = () => iNet.get('/v1/teacher/renewals');

const listTeacherAppointments = (params = {}) => iNet.get('/v1/teacher/appointments', params);

const getTeacherAppointment = (appointmentId) => iNet.get(`/v1/teacher/appointments/${appointmentId}`);

const getTeacherCalendar = (params = {}) => iNet.get('/v1/teacher/calendar', params);

const getTeacherSchedule = (params = {}) => iNet.get('/v1/teacher/schedule', params);

const getUpcomingSchedule = (params = {}) => iNet.get('/v1/schedule/upcoming', params);

const confirmTeacherAppointment = (appointmentId, payload, idempotencyKey) => iNet.post(
    `/v1/teacher/appointments/${appointmentId}/confirm`, payload, true, commandHeaders(idempotencyKey)
);

const declineTeacherAppointment = (appointmentId, payload, idempotencyKey) => iNet.post(
    `/v1/teacher/appointments/${appointmentId}/decline`, payload, true, commandHeaders(idempotencyKey)
);

const cancelTeacherAppointment = (appointmentId, payload, idempotencyKey) => iNet.post(
    `/v1/teacher/appointments/${appointmentId}/cancel`, payload, true, commandHeaders(idempotencyKey)
);

const rescheduleTeacherAppointment = (appointmentId, payload, idempotencyKey) => iNet.post(
    `/v1/teacher/appointments/${appointmentId}/reschedule`, payload, true, commandHeaders(idempotencyKey)
);

const getTeacherAvailability = (offeringId) => iNet.get(
    `/v1/teacher/offerings/${offeringId}/availability`
);

const saveTeacherAvailability = (offeringId, payload, idempotencyKey) => iNet.put(
    `/v1/teacher/offerings/${offeringId}/availability`, payload, true, commandHeaders(idempotencyKey)
);

const createTeacherAvailabilityOverride = (offeringId, payload, idempotencyKey) => iNet.post(
    `/v1/teacher/offerings/${offeringId}/availability-overrides`, payload, true, commandHeaders(idempotencyKey)
);

const cancelTeacherAvailabilityOverride = (overrideId, idempotencyKey) => iNet.post(
    `/v1/teacher/availability-overrides/${overrideId}/cancel`, {}, true, commandHeaders(idempotencyKey)
);

// Owner workbench: sections follow the teacher's permissions; the server re-checks every call.
const getWorkbenchSummary = () => iNet.get('/v1/workbench/summary');

const listWorkbenchPendingLessons = () => iNet.get('/v1/workbench/lessons/pending');

const confirmWorkbenchLesson = (sessionId, payload, idempotencyKey) => iNet.post(
    `/v1/workbench/lessons/${sessionId}/confirm`, payload, true, commandHeaders(idempotencyKey)
);

const undoWorkbenchLesson = (sessionId, payload, idempotencyKey) => iNet.post(
    `/v1/workbench/lessons/${sessionId}/reverse`, payload, true, commandHeaders(idempotencyKey)
);

const listWorkbenchStudents = (params = {}) => iNet.get('/v1/workbench/students', params);

const addWorkbenchStudent = (payload) => iNet.post('/v1/workbench/students', payload);

const getWorkbenchStudentLedger = (id) => iNet.get(`/v1/workbench/students/${id}/ledger`);

const listWorkbenchPackages = () => iNet.get('/v1/workbench/packages');

const grantWorkbenchLessons = (id, payload, idempotencyKey) => iNet.post(
    `/v1/workbench/students/${id}/grants`, payload, true, commandHeaders(idempotencyKey)
);

function commandHeaders(idempotencyKey) {
    return { 'Idempotency-Key': idempotencyKey };
}

const Api = {
    loginWithPassword,
    loginWithWechat,
    completeWechatRoleLogin,
    listWechatRoles,
    switchWechatRole,
    updateUserInfo,
    refreshLogin,
    findActivities,
    getMyPointSummary,
    listRewardItems,
    getLearningOverview,
    listPublicVenues,
    getLearningCourse,
    listLearningLessons,
    getLearningLesson,
    listLearningRecords,
    listRenewalReminders,
    readRenewalReminders,
    subscribeRenewalReminders,
    listStudentBookingOptions,
    listStudentBookingSlots,
    listStudentAppointments,
    getStudentAppointment,
    previewStudentCancellation,
    createStudentAppointment,
    withdrawStudentAppointment,
    cancelStudentAppointment,
    getTeacherBookingDashboard,
    listTeacherRenewals,
    listTeacherAppointments,
    getTeacherAppointment,
    getTeacherCalendar,
    getTeacherSchedule,
    getUpcomingSchedule,
    confirmTeacherAppointment,
    declineTeacherAppointment,
    cancelTeacherAppointment,
    rescheduleTeacherAppointment,
    getTeacherAvailability,
    saveTeacherAvailability,
    createTeacherAvailabilityOverride,
    cancelTeacherAvailabilityOverride,
    getWorkbenchSummary,
    listWorkbenchPendingLessons,
    confirmWorkbenchLesson,
    undoWorkbenchLesson,
    listWorkbenchStudents,
    addWorkbenchStudent,
    getWorkbenchStudentLedger,
    listWorkbenchPackages,
    grantWorkbenchLessons,
};

export { Api };
