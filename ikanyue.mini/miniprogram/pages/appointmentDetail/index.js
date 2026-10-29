import { definePage } from '../../kit/page.js';
import { nav, ui } from '../../kit/api.js';
import { academyDateKey } from '../../core/academyTime.js';
import {
    REASON_REQUIRED_MESSAGE, bookingErrorMessage, buildRescheduleWindow, cancellationCopy, createRescheduleDraft,
    formatAppointmentTime, formatDeadline, normalizeAppointment, rescheduleEndLabel, rescheduleWindowsLabel, statusIcon,
} from '../../core/appointments.js';
import { availabilityForDate, dayRange, normalizeTeacherSchedule } from '../../core/schedule.js';
import { Api } from '../../services/apis.js';
import { withCommandKey } from '../../services/commandKeys.js';
import { RoleManager } from '../../services/rolemanager.js';

const RESCHEDULABLE = ['confirmed', 'rescheduled'];

definePage({
    data: () => ({
        actionLoading: false, appointment: normalizeAppointment(), appointmentId: '', errorMessage: '',
        loading: false, reason: '', reasonAction: '', reschedule: createRescheduleDraft(), role: 'student',
        showReasonPopup: false, showReschedulePopup: false,
        cancellationQuote: null, rescheduleWindows: null, today: academyDateKey(Date.now()),
    }),
    computed: {
        canReschedule: (d) => d.role === 'teacher' && RESCHEDULABLE.includes(d.appointment.status),
        hasActions: (d) => d.appointment.canConfirm || d.appointment.canDecline || d.appointment.canWithdraw
            || d.appointment.canCancel || d.canReschedule,
        heroIcon: (d) => statusIcon(d.appointment.status),
        personName: (d) => (d.role === 'teacher' ? d.appointment.student?.name || '学员' : d.appointment.teacher.name),
        personLabel: (d) => [d.personName, d.appointment.location].filter(Boolean).join(' · '),
        timeLabel: (d) => formatAppointmentTime(d.appointment.startAt, d.appointment.endAt),
        deadlineLabel: (d) => (d.appointment.responseDeadline ? formatDeadline(d.appointment.responseDeadline) : ''),
        cancellationText: (d) => (d.cancellationQuote && d.reasonAction === 'cancel' ? cancellationCopy(d.cancellationQuote) : ''),
        reasonActionTitle: (d) => ({ decline: '拒绝预约申请', cancel: '取消已确认预约' }[d.reasonAction] || '处理预约'),
        reasonReady: (d) => !d.actionLoading && d.reason.trim().length >= 2,
        rescheduleReady: (d) => !d.actionLoading && d.reschedule.reason.trim().length >= 2,
        state: (d) => {
            if (d.loading) return 'loading';
            if (d.errorMessage || !d.appointmentId) return 'error';
            return 'ready';
        },
        rescheduleEndText: (d) => rescheduleEndLabel(d.reschedule, d.appointment),
        rescheduleWindowsText: (d) => {
            if (!d.rescheduleWindows) return '正在读取';
            return rescheduleWindowsLabel(d.rescheduleWindows, d.appointment.course.courseId);
        },
    },
    onLoad(query) {
        this.rescheduleSerial = 0;
        this.set({ appointmentId: query.id || '' });
    },
    onShow() {
        this.set({ role: RoleManager.getRole() });
        this.loadData();
    },
    onPullDownRefresh() {
        return this.loadData(true);
    },
    methods: {
        retry() {
            return this.loadData(true);
        },
        goLesson() {
            nav.to('/pages/courseLessonDetail/index', { id: this.data.appointment.lessonId });
        },
        openDecline() {
            return this.openReasonAction('decline');
        },
        openCancel() {
            return this.openReasonAction('cancel');
        },
        closeReasonPopup() {
            this.set({ showReasonPopup: false });
        },
        closeReschedulePopup() {
            this.set({ showReschedulePopup: false });
        },
        async openReasonAction(action) {
            if (this.data.actionLoading) return;
            let cancellationQuote = null;
            if (action === 'cancel' && this.data.role === 'student') {
                await this.set({ actionLoading: true });
                try {
                    cancellationQuote = await Api.previewStudentCancellation(this.data.appointmentId);
                } catch (error) {
                    ui.toast(bookingErrorMessage(error, '取消金额暂时无法核实'));
                    return;
                } finally {
                    await this.set({ actionLoading: false });
                }
            }
            await this.set({ cancellationQuote, reasonAction: action, reason: '', showReasonPopup: true });
        },
        async openReschedule() {
            await this.set({ reschedule: createRescheduleDraft(this.data.appointment.startAt), showReschedulePopup: true });
            this.loadRescheduleWindows();
        },
        async changeRescheduleDate(event) {
            await this.set({ reschedule: { ...this.data.reschedule, date: event.detail.value } });
            this.loadRescheduleWindows();
        },
        changeRescheduleTime(event) {
            this.set({ reschedule: { ...this.data.reschedule, startTime: event.detail.value } });
        },
        changeRescheduleReason(event) {
            this.set({ reschedule: { ...this.data.reschedule, reason: event.detail.value } });
        },
        async loadRescheduleWindows() {
            const serial = this.rescheduleSerial + 1;
            const { date } = this.data.reschedule;
            this.rescheduleSerial = serial;
            await this.set({ rescheduleWindows: null });
            try {
                const schedule = normalizeTeacherSchedule(
                    await Api.getTeacherSchedule({ ...dayRange(date), includeAvailability: true }),
                );
                if (serial === this.rescheduleSerial) await this.set({ rescheduleWindows: availabilityForDate(schedule.availability, date) });
            } catch {
                // The sheet still works without the hint; the API validates the new time on submit.
                if (serial === this.rescheduleSerial) await this.set({ rescheduleWindows: [] });
            }
        },
        async withdrawAppointment() {
            if (this.data.actionLoading) return;
            const confirmed = await ui.confirm({
                title: '撤回预约申请',
                content: '撤回后老师不会再处理这条申请，可以重新选择时间预约。',
                okText: '撤回',
            });
            if (!confirmed) return;
            const id = this.data.appointmentId;
            await this.runAction(() => withCommandKey(`withdraw-appointment:${id}`,
                (key) => Api.withdrawStudentAppointment(id, {}, key)), '预约申请已撤回');
        },
        async loadData(force = false) {
            if (this.data.loading && !force) return;
            if (!this.data.appointmentId) {
                await this.set({ errorMessage: '缺少预约编号' });
                return;
            }
            await this.set({ loading: true, errorMessage: '' });
            try {
                const id = this.data.appointmentId;
                const response = this.data.role === 'teacher'
                    ? await Api.getTeacherAppointment(id)
                    : await Api.getStudentAppointment(id);
                await this.set({ appointment: normalizeAppointment(response) });
            } catch (error) {
                await this.set({ errorMessage: bookingErrorMessage(error, '预约详情暂时无法加载') });
            } finally {
                await this.set({ loading: false });
            }
        },
        async confirmAppointment() {
            if (this.data.actionLoading) return;
            const confirmed = await ui.confirm({ title: '确认预约', content: '确认后会创建正式课程并保留该时间。' });
            if (!confirmed) return;
            const id = this.data.appointmentId;
            await this.runAction(() => withCommandKey(`confirm-appointment:${id}`,
                (key) => Api.confirmTeacherAppointment(id, { reason: '教师确认预约' }, key)), '预约已确认');
        },
        async submitReasonAction() {
            if (this.data.actionLoading) return;
            const reason = this.data.reason.trim();
            if (reason.length < 2) {
                ui.toast(REASON_REQUIRED_MESSAGE);
                return;
            }
            const { appointmentId: id, cancellationQuote, reasonAction, role } = this.data;
            const calls = {
                decline: (key) => Api.declineTeacherAppointment(id, { reason }, key),
                cancel: (key) => (role === 'teacher'
                    ? Api.cancelTeacherAppointment(id, { reason }, key)
                    : Api.cancelStudentAppointment(id, {
                        reason, expectedRefundAmount: cancellationQuote?.amount, expectedFee: cancellationQuote?.fee,
                    }, key)),
            };
            const send = calls[reasonAction];
            if (!send) return;
            const success = await this.runAction(
                () => withCommandKey(`${reasonAction}-appointment:${id}`, send), '预约状态已更新',
            );
            if (success) await this.set({ showReasonPopup: false });
        },
        async submitReschedule() {
            if (this.data.actionLoading) return;
            const { appointment, appointmentId: id, reschedule } = this.data;
            if (reschedule.reason.trim().length < 2) {
                ui.toast(REASON_REQUIRED_MESSAGE);
                return;
            }
            const window = buildRescheduleWindow(reschedule, appointment);
            if (!window) {
                ui.toast('请选择有效的预约日期和时间');
                return;
            }
            const success = await this.runAction(() => withCommandKey(
                `reschedule-appointment:${id}:${window.newStartAt}`,
                (key) => Api.rescheduleTeacherAppointment(id, { ...window, reason: reschedule.reason.trim() }, key),
            ), '预约时间已调整');
            if (success) await this.set({ showReschedulePopup: false });
        },
        async runAction(run, successTitle) {
            if (typeof run !== 'function') return false;
            await this.set({ actionLoading: true });
            let success = false;
            try {
                await run();
                ui.toast(successTitle, { kind: 'success' });
                success = true;
            } catch (error) {
                ui.toast(bookingErrorMessage(error, '操作失败，请重试'), { duration: 2600 });
            } finally {
                await this.set({ actionLoading: false });
                if (success) await this.loadData(true);
            }
            return success;
        },
    },
});
