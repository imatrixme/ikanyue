<template>
    <page-chrome class="slot-page">
        <view class="slot-summary">
            <view class="slot-summary__icon"><app-icon name="booking-request" size="xl" /></view>
            <view class="slot-summary__copy">
                <text class="slot-summary__course">{{ option.course.name }}</text>
                <text class="slot-summary__teacher">{{ option.teacher.name }}</text>
                <text class="slot-summary__meta">{{ optionMeta }}</text>
            </view>
        </view>

        <view v-if="state !== 'ready'" class="slot-state">
            <async-state
                :action-label="state === 'error' ? '重新加载' : ''"
                :description="stateDescription"
                :kind="state === 'error' ? 'network' : 'default'"
                :state="state"
                :title="stateTitle"
                @action="loadSlots(true)"
            />
        </view>

        <template v-else>
            <view class="slot-intro">
                <text class="slot-intro__title">可预约时间</text>
                <text class="slot-intro__description">教师确认后，该时间才会正式保留。</text>
            </view>
            <view class="slot-groups">
                <view v-for="group in slotGroups" :key="group.dateKey" class="slot-group">
                    <view class="slot-group__date">
                        <text class="slot-group__day">{{ group.dateLabel }}</text>
                        <text class="slot-group__weekday">{{ group.weekday }}</text>
                    </view>
                    <view class="slot-grid">
                        <view
                            v-for="slot in group.slots"
                            :key="slot.startAt"
                            class="slot-chip"
                            :class="{ 'slot-chip--selected': selectedSlot?.startAt === slot.startAt }"
                            @tap="selectSlot(slot)"
                        >
                            {{ slot.label }}
                        </view>
                    </view>
                </view>
            </view>

            <view class="slot-note">
                <text class="slot-note__label">给老师的备注</text>
                <textarea
                    v-model="note"
                    class="slot-note__input"
                    maxlength="500"
                    placeholder="可填写练习内容、希望重点解决的问题（选填）"
                    placeholder-class="slot-note__placeholder"
                />
                <text class="slot-note__count">{{ note.length }}/500</text>
            </view>
        </template>

        <view class="slot-action" :class="{ 'slot-action--disabled': !canSubmit }" @tap="submitBooking">
            <text>{{ submitting ? '正在提交' : selectedSlot ? `申请 ${selectedSlot.label}` : '请选择预约时间' }}</text>
        </view>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { UserManager } from '../../../utils/usermanager';
import AppIcon from '../../components/AppIcon.vue';
import AsyncState from '../../components/AsyncState.vue';
import PageChrome from '../../components/PageChrome.vue';
import {
    appointmentDetailUrl, bookingDateRange, bookingErrorMessage, createCommandKey, groupSlots,
    normalizeBookingOption,
} from '../appointments/pageLogic';
import './index.scss';

export default {
    components: { AppIcon, AsyncState, PageChrome },
    data() {
        return {
            errorMessage: '', loading: false, note: '', offeringId: '', option: normalizeBookingOption(),
            requestSerial: 0, selectedSlot: null, slotGroups: [], submitting: false,
        };
    },
    computed: {
        canSubmit() { return Boolean(this.selectedSlot && !this.submitting && UserManager.getRole() === 'student'); },
        optionMeta() {
            const duration = this.option.course.durationMinutes ? `${this.option.course.durationMinutes} 分钟` : '';
            return [duration, this.option.location].filter(Boolean).join(' · ') || '一对一课程';
        },
        state() {
            if (this.loading) return 'loading';
            if (this.errorMessage) return 'error';
            return this.slotGroups.length ? 'ready' : 'empty';
        },
        stateDescription() {
            return this.errorMessage || '未来 30 天暂时没有可预约时间，请稍后再看或联系老师。';
        },
        stateTitle() { return this.errorMessage ? '时间加载失败' : '暂无可预约时间'; },
    },
    onLoad() {
        const params = Taro.getCurrentInstance()?.router?.params || {};
        this.offeringId = params.offeringId || '';
        this.option = normalizeBookingOption({
            offeringId: this.offeringId,
            course: { name: params.courseName || '课程' },
            teacher: { name: params.teacherName || '授课教师' },
            location: params.location || '',
        });
    },
    onShow() { this.loadSlots(); },
    async onPullDownRefresh() {
        try { await this.loadSlots(true); } finally { Taro.stopPullDownRefresh(); }
    },
    methods: {
        selectSlot(slot) { if (!this.submitting) this.selectedSlot = slot; },
        async loadSlots(force = false) {
            if (!UserManager.isLogin() || UserManager.getRole() !== 'student') {
                this.requestSerial += 1;
                this.loading = false;
                this.errorMessage = '请先登录并切换到学员身份';
                this.slotGroups = [];
                return;
            }
            if (!this.offeringId) {
                this.errorMessage = '缺少课程预约信息';
                return;
            }
            if (this.loading && !force) return;
            const requestId = this.requestSerial + 1;
            this.requestSerial = requestId;
            this.loading = true;
            this.errorMessage = '';
            try {
                const response = await Api.listStudentBookingSlots({
                    offeringId: this.offeringId,
                    ...bookingDateRange(),
                });
                if (requestId !== this.requestSerial) return;
                this.option = normalizeBookingOption(response?.offering || this.option);
                this.slotGroups = groupSlots(response?.slots);
                if (this.selectedSlot && !this.slotGroups.some((group) => (
                    group.slots.some((slot) => slot.startAt === this.selectedSlot.startAt)
                ))) this.selectedSlot = null;
            } catch (error) {
                if (requestId === this.requestSerial) {
                    this.errorMessage = bookingErrorMessage(error, '可预约时间暂时无法加载');
                }
            } finally {
                if (requestId === this.requestSerial) this.loading = false;
            }
        },
        async submitBooking() {
            if (!this.canSubmit) return;
            this.submitting = true;
            try {
                const result = await Api.createStudentAppointment({
                    offeringId: this.offeringId,
                    startAt: this.selectedSlot.startAt,
                    endAt: this.selectedSlot.endAt,
                    note: this.note.trim(),
                }, createCommandKey('request-appointment', this.offeringId));
                if (!result?.appointmentId) throw new Error('预约已提交，但未返回预约编号');
                Taro.showToast({ title: '预约申请已发送', icon: 'success' });
                setTimeout(() => Taro.redirectTo({ url: appointmentDetailUrl(result.appointmentId) }), 350);
            } catch (error) {
                const message = bookingErrorMessage(error, '预约提交失败，请重试');
                Taro.showToast({ title: message, icon: 'none', duration: 2600 });
                if (['BOOKING_SLOT_TAKEN', 'BOOKING_SLOT_UNAVAILABLE'].includes(error?.errorCode)) {
                    this.selectedSlot = null;
                    await this.loadSlots(true);
                }
            } finally {
                this.submitting = false;
            }
        },
    },
};
</script>
