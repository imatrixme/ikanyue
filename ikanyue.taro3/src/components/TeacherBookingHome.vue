<template>
    <page-chrome class="teacher-workbench" tone="immersive">
        <page-header eyebrow="TEACHER WORKBENCH" subtitle="确认学员申请并维护你的可预约时间" title="预约工作台">
            <view class="teacher-workbench__metrics">
                <view class="teacher-workbench__metric">
                    <text class="teacher-workbench__value">{{ dashboard.pendingCount }}</text>
                    <text class="teacher-workbench__label">待处理申请</text>
                </view>
                <view class="teacher-workbench__metric">
                    <text class="teacher-workbench__value">{{ dashboard.confirmed.length }}</text>
                    <text class="teacher-workbench__label">近期已确认</text>
                </view>
            </view>
        </page-header>

        <view class="teacher-workbench__content">
            <upcoming-lessons ref="upcomingLessons" />
            <view v-if="state !== 'ready'" class="teacher-workbench__state">
                <async-state
                    :action-label="state === 'error' ? '重新加载' : ''"
                    :description="errorMessage || '开放课程预约后，学员申请会显示在这里。'"
                    :kind="state === 'error' ? 'network' : 'default'"
                    :state="state"
                    :title="state === 'error' ? '工作台加载失败' : '暂无预约任务'"
                    @action="refresh(true)"
                />
            </view>
            <template v-else>
                <ticket-section action-label="全部申请" subtitle="请在响应期限前完成确认或拒绝" title="待你确认" @action="goAppointments('pending')">
                    <view v-if="dashboard.pending.length" class="teacher-workbench__list">
                        <appointment-row
                            v-for="appointment in dashboard.pending"
                            :key="appointment.appointmentId"
                            :appointment="appointment"
                            perspective="teacher"
                            @select="goDetail"
                        />
                    </view>
                    <view v-else class="teacher-workbench__empty">
                        <app-icon name="booking-confirm" size="xl" />
                        <text>当前没有待确认申请</text>
                    </view>
                </ticket-section>

                <ticket-section subtitle="按机构开放时间设置每周与临时时段" title="可预约时间">
                    <view class="teacher-workbench__offerings">
                        <account-row
                            v-for="offering in dashboard.offerings"
                            :key="offering.offeringId"
                            :description="[offering.course.durationMinutes ? `${offering.course.durationMinutes} 分钟` : '', offering.location].filter(Boolean).join(' · ')"
                            icon="booking-availability"
                            interactive
                            :title="offering.course.name"
                            value="设置"
                            @select="goAvailability(offering)"
                        />
                    </view>
                </ticket-section>
            </template>
        </view>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../utils/apis';
import AccountRow from './AccountRow.vue';
import AppIcon from './AppIcon.vue';
import AppointmentRow from './AppointmentRow.vue';
import AsyncState from './AsyncState.vue';
import PageChrome from './PageChrome.vue';
import PageHeader from './PageHeader.vue';
import TicketSection from './TicketSection.vue';
import UpcomingLessons from './UpcomingLessons.vue';
import {
    appointmentDetailUrl, availabilityUrl, bookingErrorMessage, normalizeTeacherDashboard,
} from '../pages/appointments/pageLogic';

export default {
    name: 'TeacherBookingHome',
    components: {
        AccountRow, AppIcon, AppointmentRow, AsyncState, PageChrome, PageHeader, TicketSection, UpcomingLessons,
    },
    data() {
        return { dashboard: normalizeTeacherDashboard(), errorMessage: '', loading: false, requestSerial: 0 };
    },
    computed: {
        state() {
            if (this.loading) return 'loading';
            if (this.errorMessage) return 'error';
            const hasContent = this.dashboard.pending.length || this.dashboard.confirmed.length || this.dashboard.offerings.length;
            return hasContent ? 'ready' : 'empty';
        },
    },
    mounted() { this.refresh(); },
    methods: {
        goAppointments(status = '') {
            const suffix = status ? `?status=${status}` : '';
            Taro.navigateTo({ url: `/pages/appointments/index${suffix}` });
        },
        goDetail(item) { Taro.navigateTo({ url: appointmentDetailUrl(item.appointmentId) }); },
        goAvailability(offering) { Taro.navigateTo({ url: availabilityUrl(offering.offeringId) }); },
        async refresh(force = false) {
            await this.$nextTick();
            return Promise.all([this.loadDashboard(force), this.$refs.upcomingLessons?.refresh(force)]);
        },
        async loadDashboard(force = false) {
            if (this.loading && !force) return;
            const requestId = this.requestSerial + 1;
            this.requestSerial = requestId;
            this.loading = true;
            this.errorMessage = '';
            try {
                const response = await Api.getTeacherBookingDashboard();
                if (requestId === this.requestSerial) this.dashboard = normalizeTeacherDashboard(response);
            } catch (error) {
                if (requestId === this.requestSerial) {
                    this.errorMessage = bookingErrorMessage(error, '教师工作台暂时无法加载');
                }
            } finally {
                if (requestId === this.requestSerial) this.loading = false;
            }
        },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.teacher-workbench { background: $ky-canvas; min-height: 100vh; padding-bottom: $ky-space-8; }
.teacher-workbench__metrics { border-top: 1px solid $ky-on-primary-divider; display: flex; margin-top: $ky-space-5; padding-top: $ky-space-4; }
.teacher-workbench__metric { flex: 1; }
.teacher-workbench__metric + .teacher-workbench__metric { border-left: 1px solid $ky-on-primary-divider; padding-left: $ky-space-4; }
.teacher-workbench__value,
.teacher-workbench__label { display: block; }
.teacher-workbench__value { color: $ky-on-primary; font-size: $ky-font-size-display-md; font-weight: $ky-font-weight-black; }
.teacher-workbench__label { color: $ky-on-primary-muted; font-size: $ky-font-size-xs; margin-top: 2px; }
.teacher-workbench__content { padding: 0 $ky-space-3; }
.teacher-workbench__state { background: $ky-surface; border: 1px solid $ky-line; border-radius: $ky-radius-lg; margin-top: $ky-space-4; min-height: 260px; }
.teacher-workbench__list,
.teacher-workbench__offerings { border: 1px solid $ky-line; border-radius: $ky-radius-lg; overflow: hidden; }
.teacher-workbench__empty { align-items: center; background: $ky-surface; border: 1px solid $ky-line; border-radius: $ky-radius-lg; color: $ky-text-muted; display: flex; font-size: $ky-font-size-body-sm; gap: $ky-space-3; min-height: 72px; padding: $ky-space-4; }
</style>
