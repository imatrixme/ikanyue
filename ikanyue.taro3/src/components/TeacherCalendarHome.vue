<template>
    <page-chrome class="teacher-calendar" tone="immersive">
        <page-header eyebrow="TEACHING CALENDAR" subtitle="已确认预约会自动占用你的授课时间" title="预约日历">
            <view class="teacher-calendar__count">
                <text class="teacher-calendar__count-value">{{ pagination.totalItems }}</text>
                <text class="teacher-calendar__count-label">未来 60 天预约</text>
            </view>
        </page-header>

        <view class="teacher-calendar__content">
            <view v-if="state !== 'ready'" class="teacher-calendar__state">
                <async-state
                    :action-label="state === 'error' ? '重新加载' : ''"
                    :description="errorMessage || '教师确认预约后，课程会按时间显示在这里。'"
                    :kind="state === 'error' ? 'network' : 'default'"
                    :state="state"
                    :title="state === 'error' ? '日历加载失败' : '暂无已确认预约'"
                    @action="refresh(true)"
                />
            </view>
            <view v-else class="teacher-calendar__list">
                <appointment-row
                    v-for="appointment in items"
                    :key="appointment.appointmentId"
                    :appointment="appointment"
                    perspective="teacher"
                    @select="goDetail"
                />
            </view>
            <view v-if="loadingMore" class="teacher-calendar__footer">正在加载更多</view>
            <view v-else-if="items.length && !hasMore" class="teacher-calendar__footer">已显示未来 60 天全部预约</view>
        </view>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../utils/apis';
import AppointmentRow from './AppointmentRow.vue';
import AsyncState from './AsyncState.vue';
import PageChrome from './PageChrome.vue';
import PageHeader from './PageHeader.vue';
import {
    appointmentDetailUrl, bookingDateRange, bookingErrorMessage, hasNextPage,
    mergeAppointmentPage, normalizeAppointmentPage,
} from '../pages/appointments/pageLogic';

export default {
    name: 'TeacherCalendarHome',
    components: { AppointmentRow, AsyncState, PageChrome, PageHeader },
    data() {
        return {
            errorMessage: '', items: [], loading: false, loadingMore: false,
            pagination: { page: 1, perPage: 20, totalItems: 0, totalPages: 0 },
            requestSerial: 0,
        };
    },
    computed: {
        hasMore() { return hasNextPage(this.pagination); },
        state() {
            if (this.loading) return 'loading';
            if (this.errorMessage) return 'error';
            return this.items.length ? 'ready' : 'empty';
        },
    },
    mounted() { this.refresh(); },
    methods: {
        goDetail(item) { Taro.navigateTo({ url: appointmentDetailUrl(item.appointmentId) }); },
        loadMore() { if (this.hasMore) this.loadPage(false); },
        refresh(force = false) { return this.loadPage(true, force); },
        async loadPage(reset = false, force = false) {
            if ((this.loading || this.loadingMore) && !force) return;
            const requestId = reset ? this.requestSerial + 1 : this.requestSerial;
            if (reset) this.requestSerial = requestId;
            const pageNumber = reset ? 1 : this.pagination.page + 1;
            if (reset) {
                this.loading = true;
                this.loadingMore = false;
                this.errorMessage = '';
            } else this.loadingMore = true;
            try {
                const page = normalizeAppointmentPage(await Api.getTeacherCalendar({
                    page: pageNumber, perPage: 20, ...bookingDateRange(Date.now(), 60),
                }));
                if (requestId !== this.requestSerial) return;
                this.items = reset ? page.items : mergeAppointmentPage(this.items, page.items);
                this.pagination = {
                    page: page.page,
                    perPage: page.perPage,
                    totalItems: page.totalItems,
                    totalPages: page.totalPages,
                };
            } catch (error) {
                if (requestId !== this.requestSerial) return;
                if (reset) this.errorMessage = bookingErrorMessage(error, '预约日历暂时无法加载');
                else Taro.showToast({ title: bookingErrorMessage(error, '加载失败'), icon: 'none' });
            } finally {
                if (requestId === this.requestSerial) {
                    this.loading = false;
                    this.loadingMore = false;
                }
            }
        },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.teacher-calendar { background: $ky-canvas; min-height: 100vh; padding-bottom: $ky-space-8; }
.teacher-calendar__count { border-top: 1px solid $ky-on-primary-divider; margin-top: $ky-space-5; padding-top: $ky-space-4; }
.teacher-calendar__count-value,
.teacher-calendar__count-label { display: block; }
.teacher-calendar__count-value { color: $ky-on-primary; font-size: $ky-font-size-display-md; font-weight: $ky-font-weight-black; }
.teacher-calendar__count-label { color: $ky-on-primary-muted; font-size: $ky-font-size-xs; margin-top: 2px; }
.teacher-calendar__content { padding: 0 $ky-space-3; }
.teacher-calendar__state { background: $ky-surface; border: 1px solid $ky-line; border-radius: $ky-radius-lg; margin-top: $ky-space-4; min-height: 260px; }
.teacher-calendar__list { border: 1px solid $ky-line; border-radius: $ky-radius-lg; box-shadow: $ky-shadow-card; margin-top: $ky-space-4; overflow: hidden; }
.teacher-calendar__footer { color: $ky-text-muted; font-size: $ky-font-size-xs; padding: $ky-space-5 0; text-align: center; }
</style>
