import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from './apis';

const iNetMock = vi.hoisted(() => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
}));

const userManagerMock = vi.hoisted(() => ({
    isLogin: vi.fn(),
    logout: vi.fn(),
    updateUserInfoCache: vi.fn(),
}));

vi.mock('./request', () => ({
    iNet: iNetMock,
}));

vi.mock('./usermanager', () => ({
    UserManager: userManagerMock,
}));

describe('Api page-facing request wrappers', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('logs in with password and caches returned user info', async () => {
        const user = { id: 'student_1', token: 'jwt-token' };
        iNetMock.post.mockResolvedValue(user);

        await expect(Api.loginWithPassword('13800138000', 'secret')).resolves.toBe(user);
        expect(iNetMock.post).toHaveBeenCalledWith(
            '/v1/user/login',
            {
                cellphone: '13800138000',
                password: 'secret',
            },
            false
        );
        expect(userManagerMock.updateUserInfoCache).toHaveBeenCalledWith(user);
    });

    it('propagates password login errors without caching', async () => {
        const error = new Error('login failed');
        iNetMock.post.mockRejectedValue(error);

        await expect(Api.loginWithPassword('13800138000', 'bad')).rejects.toBe(error);
        expect(userManagerMock.updateUserInfoCache).not.toHaveBeenCalled();
    });

    it('logs in with WeChat payload and caches returned user info', async () => {
        const payload = {
            code: 'wx-code',
            phone: {
                encryptedData: 'encrypted',
                iv: 'iv',
            },
        };
        const user = { id: 'student_2', token: 'jwt-token-2' };
        iNetMock.post.mockResolvedValue(user);

        await expect(Api.loginWithWechat(payload)).resolves.toBe(user);
        expect(iNetMock.post).toHaveBeenCalledWith('/v1/user/wechat-login', payload, false);
        expect(userManagerMock.updateUserInfoCache).toHaveBeenCalledWith(user);
    });

    it('returns a dual-role WeChat challenge without corrupting the current login cache', async () => {
        const challenge = { requiresRoleSelection: true, challenge: 'signed', roles: [{ role: 'student' }] };
        iNetMock.post.mockResolvedValue(challenge);

        await expect(Api.loginWithWechat({ code: 'wx-code' })).resolves.toBe(challenge);
        expect(userManagerMock.updateUserInfoCache).not.toHaveBeenCalled();
    });

    it('completes and switches verified WeChat roles through server-issued principals', async () => {
        iNetMock.post
            .mockResolvedValueOnce({ id: 'teacher', role: 'teacher', token: 'teacher-token' })
            .mockResolvedValueOnce({ id: 'student', role: 'student', token: 'student-token' });
        iNetMock.get.mockResolvedValue([{ id: 'teacher', role: 'teacher', name: '林老师' }]);

        await Api.completeWechatRoleLogin('signed', 'teacher');
        await Api.listWechatRoles();
        await Api.switchWechatRole('student');

        expect(iNetMock.post.mock.calls).toEqual([
            ['/v1/user/wechat-role-login', { challenge: 'signed', role: 'teacher' }, false],
            ['/v1/user/switch-wechat-role', { role: 'student' }],
        ]);
        expect(iNetMock.get).toHaveBeenCalledWith('/v1/user/wechat-roles');
        expect(userManagerMock.updateUserInfoCache).toHaveBeenCalledTimes(2);
    });

    it('propagates WeChat login errors without caching', async () => {
        const error = new Error('wechat failed');
        iNetMock.post.mockRejectedValue(error);

        await expect(Api.loginWithWechat({ code: 'bad' })).rejects.toBe(error);
        expect(userManagerMock.updateUserInfoCache).not.toHaveBeenCalled();
    });

    it('updates the lightweight account profile and caches the server result', async () => {
        const payload = { nickName: '小陈', realName: '陈同学', gender: 2, age: 12, province: '上海市' };
        const updated = { id: 'student_1', ...payload };
        iNetMock.post.mockResolvedValue(updated);

        await expect(Api.updateUserInfo(payload)).resolves.toBe(updated);
        expect(iNetMock.post).toHaveBeenCalledWith('/v1/user/update', payload);
        expect(userManagerMock.updateUserInfoCache).toHaveBeenCalledWith(updated);
    });

    it('propagates profile update errors without changing local user info', async () => {
        const error = new Error('update failed');
        iNetMock.post.mockRejectedValue(error);

        await expect(Api.updateUserInfo({ nickName: '失败' })).rejects.toBe(error);
        expect(userManagerMock.updateUserInfoCache).not.toHaveBeenCalled();
    });

    it('refreshes login only when a local token exists', async () => {
        userManagerMock.isLogin.mockReturnValueOnce(false);
        await expect(Api.refreshLogin()).rejects.toThrow('未登录状态');
        expect(iNetMock.post).not.toHaveBeenCalled();

        userManagerMock.isLogin.mockReturnValueOnce(true);
        iNetMock.post.mockResolvedValue({ id: 'student_1', token: 'new-token' });
        await expect(Api.refreshLogin()).resolves.toEqual({ id: 'student_1', token: 'new-token' });
        expect(iNetMock.post).toHaveBeenCalledWith('/v1/user/refresh');
        expect(userManagerMock.updateUserInfoCache).toHaveBeenCalledWith({ id: 'student_1', token: 'new-token' });
    });

    it('clears local login when refresh returns an auth error', async () => {
        const authError = new Error('expired');
        authError.code = 10401;
        userManagerMock.isLogin.mockReturnValue(true);
        iNetMock.post.mockRejectedValue(authError);

        await expect(Api.refreshLogin()).rejects.toBe(authError);
        expect(userManagerMock.logout).toHaveBeenCalled();
    });

    it('clears local login when refresh returns a forbidden auth error', async () => {
        const authError = new Error('forbidden');
        authError.code = 10403;
        userManagerMock.isLogin.mockReturnValue(true);
        iNetMock.post.mockRejectedValue(authError);

        await expect(Api.refreshLogin()).rejects.toBe(authError);
        expect(userManagerMock.logout).toHaveBeenCalled();
    });

    it('clears a stale login when the user does not exist in the active environment', async () => {
        const missingUserError = new Error('用户不存在或已被删除');
        missingUserError.code = 404;
        userManagerMock.isLogin.mockReturnValue(true);
        iNetMock.post.mockRejectedValue(missingUserError);

        await expect(Api.refreshLogin()).rejects.toBe(missingUserError);
        expect(userManagerMock.logout).toHaveBeenCalled();
    });

    it('uses points-lite endpoints for balance and reward catalog', async () => {
        iNetMock.get.mockResolvedValue({ items: [] });

        await Api.getMyPointSummary({ page: 1, perPage: 20 });
        await Api.listRewardItems({ status: 'active' });

        expect(iNetMock.get).toHaveBeenNthCalledWith(1, '/v1/points/me', { page: 1, perPage: 20 });
        expect(iNetMock.get).toHaveBeenNthCalledWith(2, '/v1/reward-items', { status: 'active' });
    });

    it('loads the restored activity catalog through the public activity endpoint', async () => {
        iNetMock.get.mockResolvedValue({ items: [] });

        await Api.findActivities({ page: 1, perPage: 100 });

        expect(iNetMock.get).toHaveBeenCalledWith('/v1/activity/find', { page: 1, perPage: 100 });
    });

    it('wraps every read-only student learning endpoint', async () => {
        iNetMock.get.mockResolvedValue({ items: [] });

        await Api.getLearningOverview();
        await Api.getLearningCourse('course-1');
        await Api.listLearningLessons({ page: 2, scope: 'upcoming' });
        await Api.getLearningLesson('lesson-1');
        await Api.listLearningRecords({ page: 3, courseId: 'course-1' });

        expect(iNetMock.get.mock.calls).toEqual([
            ['/v1/student/learning/overview'],
            ['/v1/student/learning/courses/course-1'],
            ['/v1/student/learning/lessons', { page: 2, scope: 'upcoming' }],
            ['/v1/student/learning/lessons/lesson-1'],
            ['/v1/student/learning/records', { page: 3, courseId: 'course-1' }],
        ]);
    });

    it('does not expose student course mutation wrappers', () => {
        expect(Object.keys(Api).filter((name) => /convert|reserve|enroll|purchase/i.test(name))).toEqual([]);
    });

    it('wraps student booking reads and idempotent appointment commands', async () => {
        iNetMock.get.mockResolvedValue({ items: [] });
        iNetMock.post.mockResolvedValue({ appointmentId: 'appointment' });

        await Api.listStudentBookingOptions({ courseId: 'voice' });
        await Api.listStudentBookingSlots({ offeringId: 'offering' });
        await Api.listStudentAppointments({ page: 2 });
        await Api.getStudentAppointment('appointment');
        await Api.createStudentAppointment({ offeringId: 'offering' }, 'create-key');
        await Api.withdrawStudentAppointment('appointment', { reason: '改期' }, 'withdraw-key');
        await Api.cancelStudentAppointment('appointment', { reason: '无法参加' }, 'cancel-key');

        expect(iNetMock.get.mock.calls.slice(-4)).toEqual([
            ['/v1/student/booking-options', { courseId: 'voice' }],
            ['/v1/student/booking-slots', { offeringId: 'offering' }],
            ['/v1/student/appointments', { page: 2 }],
            ['/v1/student/appointments/appointment'],
        ]);
        expect(iNetMock.post.mock.calls.slice(-3)).toEqual([
            ['/v1/student/appointments', { offeringId: 'offering' }, true, { 'Idempotency-Key': 'create-key' }],
            ['/v1/student/appointments/appointment/withdraw', { reason: '改期' }, true, { 'Idempotency-Key': 'withdraw-key' }],
            ['/v1/student/appointments/appointment/cancel', { reason: '无法参加' }, true, { 'Idempotency-Key': 'cancel-key' }],
        ]);
    });

    it('wraps teacher booking workbench, calendar, decisions, and availability commands', async () => {
        iNetMock.get.mockResolvedValue({ items: [] });
        iNetMock.post.mockResolvedValue({ status: 'ok' });
        iNetMock.put.mockResolvedValue({ status: 'ok' });

        await Api.getTeacherBookingDashboard();
        await Api.listTeacherAppointments({ status: 'pending' });
        await Api.getTeacherAppointment('appointment');
        await Api.getTeacherCalendar({ page: 1 });
        await Api.getTeacherAvailability('offering');
        await Api.confirmTeacherAppointment('appointment', { reason: '' }, 'confirm-key');
        await Api.declineTeacherAppointment('appointment', { reason: '时间冲突' }, 'decline-key');
        await Api.cancelTeacherAppointment('appointment', { reason: '临时停课' }, 'cancel-key');
        await Api.rescheduleTeacherAppointment('appointment', { newStartAt: 'start' }, 'move-key');
        await Api.saveTeacherAvailability('offering', { rules: [] }, 'rules-key');
        await Api.createTeacherAvailabilityOverride('offering', { type: 'unavailable' }, 'override-key');
        await Api.cancelTeacherAvailabilityOverride('override', 'override-cancel-key');

        expect(iNetMock.get.mock.calls.slice(-5)).toEqual([
            ['/v1/teacher/booking/dashboard'],
            ['/v1/teacher/appointments', { status: 'pending' }],
            ['/v1/teacher/appointments/appointment'],
            ['/v1/teacher/calendar', { page: 1 }],
            ['/v1/teacher/offerings/offering/availability'],
        ]);
        expect(iNetMock.put).toHaveBeenCalledWith(
            '/v1/teacher/offerings/offering/availability', { rules: [] }, true, { 'Idempotency-Key': 'rules-key' }
        );
        expect(iNetMock.post.mock.calls.slice(-6).map((call) => call[0])).toEqual([
            '/v1/teacher/appointments/appointment/confirm',
            '/v1/teacher/appointments/appointment/decline',
            '/v1/teacher/appointments/appointment/cancel',
            '/v1/teacher/appointments/appointment/reschedule',
            '/v1/teacher/offerings/offering/availability-overrides',
            '/v1/teacher/availability-overrides/override/cancel',
        ]);
    });
});
