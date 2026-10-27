<template>
    <page-chrome class="appointment-detail-page">
        <view v-if="state !== 'ready'" class="appointment-detail-state">
            <async-state
                :action-label="state === 'error' ? '重新加载' : ''"
                :description="errorMessage || '正在读取预约详情。'"
                :kind="state === 'error' ? 'network' : 'default'"
                :state="state"
                :title="state === 'error' ? '预约详情加载失败' : ''"
                @action="loadData(true)"
            />
        </view>

        <template v-else>
            <view class="appointment-detail-hero">
                <view class="appointment-detail-hero__icon">
                    <app-icon :name="heroIcon" size="xl" />
                </view>
                <view class="appointment-detail-hero__copy">
                    <view class="appointment-detail-hero__heading">
                        <text class="appointment-detail-hero__title">{{ appointment.course.name }}</text>
                        <booking-status-badge :status="appointment.status" />
                    </view>
                    <text class="appointment-detail-hero__time">{{ formatAppointmentTime(appointment.startAt, appointment.endAt) }}</text>
                    <text class="appointment-detail-hero__person">{{ personLabel }}</text>
                </view>
            </view>

            <view class="appointment-detail-section">
                <text class="appointment-detail-section__title">预约信息</text>
                <view class="appointment-detail-fields">
                    <view class="appointment-detail-field">
                        <text>课程</text><text>{{ appointment.course.name }}</text>
                    </view>
                    <view class="appointment-detail-field">
                        <text>{{ role === 'teacher' ? '学员' : '教师' }}</text><text>{{ personName }}</text>
                    </view>
                    <view class="appointment-detail-field">
                        <text>时间</text><text>{{ formatAppointmentTime(appointment.startAt, appointment.endAt) }}</text>
                    </view>
                    <view class="appointment-detail-field">
                        <text>地点</text><text>{{ appointment.location || '待老师确认' }}</text>
                    </view>
                    <view v-if="appointment.status === 'pending' && appointment.responseDeadline" class="appointment-detail-field">
                        <text>确认期限</text><text>{{ formatDeadline(appointment.responseDeadline) }}</text>
                    </view>
                </view>
            </view>

            <view v-if="appointment.note || appointment.responseReason" class="appointment-detail-section">
                <text class="appointment-detail-section__title">沟通记录</text>
                <view v-if="appointment.note" class="appointment-detail-note">
                    <text class="appointment-detail-note__label">学员备注</text>
                    <text class="appointment-detail-note__content">{{ appointment.note }}</text>
                </view>
                <view v-if="appointment.responseReason" class="appointment-detail-note">
                    <text class="appointment-detail-note__label">处理说明</text>
                    <text class="appointment-detail-note__content">{{ appointment.responseReason }}</text>
                </view>
            </view>

            <view v-if="appointment.lessonId" class="appointment-detail-section">
                <text class="appointment-detail-section__title">关联课程</text>
                <account-row
                    description="查看课程状态、上课地点和课程提醒"
                    icon="course-calendar"
                    interactive
                    title="查看课程详情"
                    @select="goLesson"
                />
            </view>

            <view v-if="hasActions" class="appointment-detail-section appointment-detail-section--actions">
                <text class="appointment-detail-section__title">可用操作</text>
                <view v-if="role === 'teacher' && appointment.canConfirm" class="appointment-detail-primary" :class="{ disabled: actionLoading }" aria-role="button" @tap="confirmAppointment">
                    确认预约并保留时间
                </view>
                <view class="appointment-detail-secondary-actions">
                    <view v-if="role === 'teacher' && appointment.canDecline" aria-role="button" @tap="openReasonAction('decline')">拒绝申请</view>
                    <view v-if="role === 'student' && appointment.canWithdraw" aria-role="button" @tap="withdrawAppointment">撤回申请</view>
                    <view v-if="appointment.canCancel" aria-role="button" @tap="openReasonAction('cancel')">取消预约</view>
                    <view v-if="role === 'teacher' && ['confirmed', 'rescheduled'].includes(appointment.status)" aria-role="button" @tap="openReschedule">调整时间</view>
                </view>
            </view>
        </template>

        <nut-popup position="bottom" :visible="showReasonPopup" class="appointment-action-popup-shell" @close="showReasonPopup = false">
            <view class="appointment-action-popup">
                <view class="appointment-action-popup__bar" />
                <text class="appointment-action-popup__title">{{ reasonActionTitle }}</text>
                <text v-if="cancellationQuote && reasonAction === 'cancel'" class="appointment-action-popup__description">{{ cancellationCopy(cancellationQuote) }}</text>
                <text class="appointment-action-popup__description">请填写简短原因，学员与教师都能看到处理结果。</text>
                <textarea v-model="reason" class="appointment-action-popup__textarea" maxlength="500" placeholder="请输入至少 2 个字" />
                <view class="appointment-action-popup__submit" :class="{ disabled: actionLoading || reason.trim().length < 2 }" aria-role="button" @tap="submitReasonAction">
                    {{ actionLoading ? '正在提交' : '确认提交' }}
                </view>
            </view>
        </nut-popup>

        <nut-popup position="bottom" :visible="showReschedulePopup" class="appointment-action-popup-shell" @close="showReschedulePopup = false">
            <view class="appointment-action-popup">
                <view class="appointment-action-popup__bar" />
                <text class="appointment-action-popup__title">调整预约时间</text>
                <text class="appointment-action-popup__description">新时间需位于可预约时间内，且不能与其他课程冲突。</text>
                <view class="appointment-action-popup__field">
                    <text>日期</text>
                    <picker mode="date" :start="today" :value="reschedule.date" @change="changeRescheduleDate($event.detail.value)">
                        <view>{{ reschedule.date }}</view>
                    </picker>
                </view>
                <view class="appointment-action-popup__windows">
                    <text class="appointment-action-popup__windows-label">当天可预约</text>
                    <text class="appointment-action-popup__windows-value">{{ rescheduleWindowsText }}</text>
                </view>
                <view class="appointment-action-popup__field">
                    <text>开始时间</text>
                    <picker mode="time" :value="reschedule.startTime" @change="reschedule.startTime = $event.detail.value">
                        <view>{{ reschedule.startTime }}</view>
                    </picker>
                </view>
                <view class="appointment-action-popup__field">
                    <text>结束时间</text>
                    <text>{{ rescheduleEndText }}</text>
                </view>
                <input v-model="reschedule.reason" class="appointment-action-popup__input" maxlength="500" placeholder="改期原因（至少 2 个字）" />
                <view class="appointment-action-popup__submit" :class="{ disabled: actionLoading || reschedule.reason.trim().length < 2 }" aria-role="button" @tap="submitReschedule">
                    {{ actionLoading ? '正在提交' : '确认调整时间' }}
                </view>
            </view>
        </nut-popup>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { academyDateKey } from '../../../utils/academyTime';
import { withCommandKey } from '../../../utils/commandKeys';
import { RoleManager } from '../../../utils/rolemanager';
import AccountRow from '../../components/AccountRow.vue';
import AppIcon from '../../components/AppIcon.vue';
import AsyncState from '../../components/AsyncState.vue';
import BookingStatusBadge from '../../components/BookingStatusBadge.vue';
import PageChrome from '../../components/PageChrome.vue';
import {
    REASON_REQUIRED_MESSAGE, bookingErrorMessage, buildRescheduleWindow, cancellationCopy, createRescheduleDraft,
    formatAppointmentTime, formatDeadline, normalizeAppointment, rescheduleEndLabel, rescheduleWindowsLabel,
} from '../appointments/pageLogic';
import { availabilityForDate, dayRange, normalizeTeacherSchedule } from '../schedule/pageLogic';
import './index.scss';

export default {
    components: { AccountRow, AppIcon, AsyncState, BookingStatusBadge, PageChrome },
    data() {
        return {
            actionLoading: false, appointment: normalizeAppointment(), appointmentId: '', errorMessage: '',
            loading: false, reason: '', reasonAction: '', reschedule: createRescheduleDraft(), role: 'student',
            showReasonPopup: false, showReschedulePopup: false,
            cancellationQuote: null, rescheduleWindows: null, rescheduleSerial: 0,
        };
    },
    computed: {
        hasActions() {
            return this.appointment.canConfirm || this.appointment.canDecline || this.appointment.canWithdraw
                || this.appointment.canCancel
                || (this.role === 'teacher' && ['confirmed', 'rescheduled'].includes(this.appointment.status));
        },
        heroIcon() {
            if (['confirmed', 'rescheduled', 'fulfilled'].includes(this.appointment.status)) return 'booking-confirm';
            if (['declined', 'expired', 'slot_taken', 'eligibility_lost'].includes(this.appointment.status)) return 'booking-decline';
            return 'booking-request';
        },
        personName() {
            return this.role === 'teacher' ? this.appointment.student?.name || '学员' : this.appointment.teacher.name;
        },
        personLabel() { return [this.personName, this.appointment.location].filter(Boolean).join(' · '); },
        reasonActionTitle() {
            return { decline: '拒绝预约申请', cancel: '取消已确认预约' }[this.reasonAction] || '处理预约';
        },
        state() {
            if (this.loading) return 'loading';
            if (this.errorMessage || !this.appointmentId) return 'error';
            return 'ready';
        },
        today() { return academyDateKey(Date.now()); },
        rescheduleEndText() { return rescheduleEndLabel(this.reschedule, this.appointment); },
        rescheduleWindowsText() {
            if (!this.rescheduleWindows) return '正在读取';
            return rescheduleWindowsLabel(this.rescheduleWindows, this.appointment.course.courseId);
        },
    },
    onLoad() { this.appointmentId = Taro.getCurrentInstance()?.router?.params?.id || ''; },
    onShow() {
        this.role = RoleManager.getRole();
        this.loadData();
    },
    async onPullDownRefresh() {
        try { await this.loadData(true); } finally { Taro.stopPullDownRefresh(); }
    },
    methods: {
        cancellationCopy, formatAppointmentTime, formatDeadline,
        goLesson() { Taro.navigateTo({ url: `/pages/courseLessonDetail/index?id=${encodeURIComponent(this.appointment.lessonId)}` }); },
        async openReasonAction(action) {
            if (this.actionLoading) return;
            this.cancellationQuote = null;
            if (action === 'cancel' && this.role === 'student') {
                this.actionLoading = true;
                try { this.cancellationQuote = await Api.previewStudentCancellation(this.appointmentId); }
                catch (error) { Taro.showToast({ title: bookingErrorMessage(error, '取消金额暂时无法核实'), icon: 'none' }); return; }
                finally { this.actionLoading = false; }
            }
            this.reasonAction = action;
            this.reason = '';
            this.showReasonPopup = true;
        },
        openReschedule() {
            this.reschedule = createRescheduleDraft(this.appointment.startAt);
            this.showReschedulePopup = true;
            this.loadRescheduleWindows();
        },
        changeRescheduleDate(value) {
            this.reschedule.date = value;
            this.loadRescheduleWindows();
        },
        async loadRescheduleWindows() {
            const serial = this.rescheduleSerial + 1;
            const date = this.reschedule.date;
            this.rescheduleSerial = serial;
            this.rescheduleWindows = null;
            try {
                const schedule = normalizeTeacherSchedule(
                    await Api.getTeacherSchedule({ ...dayRange(date), includeAvailability: true })
                );
                if (serial === this.rescheduleSerial) this.rescheduleWindows = availabilityForDate(schedule.availability, date);
            } catch {
                // The sheet still works without the hint; the API validates the new time on submit.
                if (serial === this.rescheduleSerial) this.rescheduleWindows = [];
            }
        },
        async withdrawAppointment() {
            if (this.actionLoading) return;
            const modal = await Taro.showModal({
                title: '撤回预约申请',
                content: '撤回后老师不会再处理这条申请，可以重新选择时间预约。',
                confirmText: '撤回',
            });
            if (!modal.confirm) return;
            const id = this.appointmentId;
            await this.runAction(() => withCommandKey(`withdraw-appointment:${id}`,
                (key) => Api.withdrawStudentAppointment(id, {}, key)), '预约申请已撤回');
        },
        async loadData(force = false) {
            if (this.loading && !force) return;
            if (!this.appointmentId) {
                this.errorMessage = '缺少预约编号';
                return;
            }
            this.loading = true;
            this.errorMessage = '';
            try {
                const response = this.role === 'teacher'
                    ? await Api.getTeacherAppointment(this.appointmentId)
                    : await Api.getStudentAppointment(this.appointmentId);
                this.appointment = normalizeAppointment(response);
            } catch (error) {
                this.errorMessage = bookingErrorMessage(error, '预约详情暂时无法加载');
            } finally { this.loading = false; }
        },
        async confirmAppointment() {
            if (this.actionLoading) return;
            const modal = await Taro.showModal({ title: '确认预约', content: '确认后会创建正式课程并保留该时间。' });
            if (!modal.confirm) return;
            await this.runAction(() => withCommandKey(`confirm-appointment:${this.appointmentId}`,
                (key) => Api.confirmTeacherAppointment(this.appointmentId, { reason: '教师确认预约' }, key)), '预约已确认');
        },
        async submitReasonAction() {
            if (this.actionLoading) return;
            if (this.reason.trim().length < 2) {
                Taro.showToast({ title: REASON_REQUIRED_MESSAGE, icon: 'none' });
                return;
            }
            const reason = this.reason.trim();
            const id = this.appointmentId;
            const calls = {
                decline: (key) => Api.declineTeacherAppointment(id, { reason }, key),
                cancel: (key) => this.role === 'teacher'
                    ? Api.cancelTeacherAppointment(id, { reason }, key)
                    : Api.cancelStudentAppointment(id, { reason,
                        expectedRefundAmount: this.cancellationQuote?.amount, expectedFee: this.cancellationQuote?.fee }, key),
            };
            const send = calls[this.reasonAction];
            if (!send) return;
            const success = await this.runAction(
                () => withCommandKey(`${this.reasonAction}-appointment:${id}`, send), '预约状态已更新'
            );
            if (success) this.showReasonPopup = false;
        },
        async submitReschedule() {
            if (this.actionLoading) return;
            if (this.reschedule.reason.trim().length < 2) {
                Taro.showToast({ title: REASON_REQUIRED_MESSAGE, icon: 'none' });
                return;
            }
            const window = buildRescheduleWindow(this.reschedule, this.appointment);
            if (!window) {
                Taro.showToast({ title: '请选择有效的预约日期和时间', icon: 'none' });
                return;
            }
            const success = await this.runAction(() => withCommandKey(
                `reschedule-appointment:${this.appointmentId}:${window.newStartAt}`,
                (key) => Api.rescheduleTeacherAppointment(this.appointmentId, {
                    ...window, reason: this.reschedule.reason.trim(),
                }, key)
            ), '预约时间已调整');
            if (success) this.showReschedulePopup = false;
        },
        async runAction(run, successTitle) {
            if (typeof run !== 'function') return false;
            this.actionLoading = true;
            let success = false;
            try {
                await run();
                Taro.showToast({ title: successTitle, icon: 'success' });
                success = true;
            } catch (error) {
                Taro.showToast({ title: bookingErrorMessage(error, '操作失败，请重试'), icon: 'none', duration: 2600 });
            } finally {
                this.actionLoading = false;
                if (success) await this.loadData(true);
            }
            return success;
        },
    },
};
</script>
