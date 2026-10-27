<template>
    <teacher-calendar-home v-if="role === 'teacher'" ref="teacherCalendar" />
    <page-chrome v-else class="booking-page">

        <view class="booking-content">
            <!-- The current venue takes no online bookings: hand off to phone instead of listing options. -->
            <venue-handoff v-if="closed" :venue="venue" />
            <view v-else-if="pageState !== 'ready'" class="booking-state">
                <async-state
                    :action-label="stateAction"
                    :description="stateDescription"
                    :kind="pageState === 'error' ? 'network' : 'account'"
                    :state="pageState"
                    :title="stateTitle"
                    @action="handleStateAction"
                />
            </view>
            <template v-else>
                <ticket-section v-if="options.length" subtitle="只显示当前有剩余课时且已开放预约的课程" title="选择课程与教师">
                    <view class="booking-options">
                        <booking-option-card
                            v-for="option in options"
                            :key="option.offeringId"
                            :option="option"
                            @select="goSlots"
                        />
                    </view>
                </ticket-section>

                <ticket-section action-label="全部预约" subtitle="最近的申请与已确认课程" title="我的预约" @action="goAppointments">
                    <view v-if="recentAppointments.length" class="booking-recent-list">
                        <appointment-row
                            v-for="appointment in recentAppointments"
                            :key="appointment.appointmentId"
                            :appointment="appointment"
                            @select="goAppointment"
                        />
                    </view>
                    <view v-else class="booking-empty-row">
                        <app-icon name="booking-request" size="xl" />
                        <view class="booking-empty-row__copy">
                            <text class="booking-empty-row__title">还没有预约记录</text>
                            <text class="booking-empty-row__description">从上方选择课程后即可查看可预约时间。</text>
                        </view>
                    </view>
                </ticket-section>
            </template>
        </view>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { RoleManager } from '../../../utils/rolemanager';
import { UserManager } from '../../../utils/usermanager';
import { VenueManager } from '../../../utils/venuemanager';
import AppIcon from '../../components/AppIcon.vue';
import AppointmentRow from '../../components/AppointmentRow.vue';
import AsyncState from '../../components/AsyncState.vue';
import BookingOptionCard from '../../components/BookingOptionCard.vue';
import PageChrome from '../../components/PageChrome.vue';
import TeacherCalendarHome from '../../components/TeacherCalendarHome.vue';
import TicketSection from '../../components/TicketSection.vue';
import VenueHandoff from '../../components/VenueHandoff.vue';
import {
    appointmentDetailUrl, bookingErrorMessage, bookingSlotsUrl, normalizeAppointmentPage,
    normalizeBookingOption,
} from '../appointments/pageLogic';
import './index.scss';

export default {
    components: {
        AppIcon, AppointmentRow, AsyncState, BookingOptionCard, PageChrome, TeacherCalendarHome, TicketSection, VenueHandoff,
    },
    data() {
        return {
            errorMessage: '', isLogin: false, loading: false, options: [],
            recentAppointments: [], requestSerial: 0, role: 'student', venue: null,
        };
    },
    computed: {
        closed() { return VenueManager.venueClosed(this.venue); },
        pageState() {
            if (this.loading) return 'loading';
            if (!this.isLogin) return 'empty';
            if (this.errorMessage) return 'error';
            return this.options.length || this.recentAppointments.length ? 'ready' : 'empty';
        },
        stateAction() {
            if (!this.isLogin) return '去登录';
            if (this.errorMessage) return '重新加载';
            return '';
        },
        stateDescription() {
            if (!this.isLogin) return '登录后可以使用当前课程的剩余课时发起预约。';
            if (this.errorMessage) return this.errorMessage;
            return '报课后，或老师开放可预约时间后，可预约的课程会显示在这里。';
        },
        stateTitle() {
            if (!this.isLogin) return '登录后预约课程';
            if (this.errorMessage) return '预约信息加载失败';
            return '暂无可预约课程';
        },
    },
    onShow() {
        this.role = RoleManager.getRole();
        RoleManager.applyTabBar(this.role);
        Taro.setNavigationBarTitle({ title: this.role === 'teacher' ? '课程日历' : '约课' });
        if (this.role === 'teacher') this.$nextTick(() => this.$refs.teacherCalendar?.refresh());
        else this.loadVenueAndData();
    },
    async onPullDownRefresh() {
        try {
            if (this.role === 'teacher') await this.$refs.teacherCalendar?.refresh(true);
            else await this.loadVenueAndData(true);
        } finally { Taro.stopPullDownRefresh(); }
    },
    methods: {
        goSlots(option) { Taro.navigateTo({ url: bookingSlotsUrl(option) }); },
        goAppointments() { Taro.navigateTo({ url: '/pages/appointments/index' }); },
        goAppointment(item) { Taro.navigateTo({ url: appointmentDetailUrl(item.appointmentId) }); },
        handleStateAction() {
            if (!this.isLogin) {
                Taro.switchTab({ url: '/pages/profile/index' });
                return;
            }
            this.loadData(true);
        },
        async loadVenueAndData(force = false) {
            this.venue = (await VenueManager.loadVenues()).current;
            if (!this.closed) await this.loadData(force);
        },
        async loadData(force = false) {
            this.isLogin = UserManager.isLogin();
            this.role = UserManager.getRole();
            if (!this.isLogin || this.role !== 'student') {
                this.requestSerial += 1;
                this.loading = false;
                this.options = [];
                this.recentAppointments = [];
                return;
            }
            if (this.loading && !force) return;
            const requestId = this.requestSerial + 1;
            this.requestSerial = requestId;
            this.loading = true;
            this.errorMessage = '';
            try {
                const [options, appointments] = await Promise.all([
                    Api.listStudentBookingOptions(),
                    Api.listStudentAppointments({ page: 1, perPage: 2 }),
                ]);
                if (requestId !== this.requestSerial) return;
                this.options = (Array.isArray(options) ? options : []).map(normalizeBookingOption);
                const page = normalizeAppointmentPage(appointments);
                this.recentAppointments = page.items;
            } catch (error) {
                if (requestId === this.requestSerial) this.errorMessage = bookingErrorMessage(error);
            } finally {
                if (requestId === this.requestSerial) this.loading = false;
            }
        },
    },
};
</script>
