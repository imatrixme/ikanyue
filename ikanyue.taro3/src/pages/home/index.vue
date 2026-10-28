<template>
    <teacher-booking-home v-if="role === 'teacher'" ref="teacherHome" />
    <page-chrome v-else class="home-page">
        <view class="home-content">
            <view v-if="venue" class="home-studio">
                <view class="home-studio__header">
                    <text class="home-studio__name">{{ venue.name }}</text>
                    <view class="home-studio__switch" aria-role="button" aria-label="切换场馆" @tap="goVenues">
                        <text>切换场馆</text>
                    </view>
                </view>
                <text v-if="venue.intro" class="home-studio__tagline">{{ venue.intro }}</text>
                <view v-for="row in venueRows" :key="row.key" class="home-studio__fact">
                    <app-icon :name="row.icon" size="sm" />
                    <text>{{ row.text }}</text>
                </view>
                <view v-if="venue.phone" class="home-studio__call" aria-role="button" aria-label="拨打电话咨询" @tap="callVenue">
                    <app-icon name="account-phone" size="sm" />
                    <text>电话咨询</text>
                </view>
            </view>

            <view v-if="isLogin && reminder" class="home-notice" aria-role="button" aria-label="查看教务提醒的课包" @tap="openReminder">
                <view class="home-notice__header">
                    <text class="home-notice__sender">{{ reminder.sender }}</text>
                    <text class="home-notice__tag">教务提醒</text>
                </view>
                <text class="home-notice__message">{{ reminder.message }}</text>
                <view class="home-notice__action">
                    <text>查看课包</text>
                    <app-icon name="chevron-primary" size="sm" />
                </view>
            </view>

            <view v-if="state === 'signedOut'" class="home-state">
                <async-state
                    action-label="去登录"
                    compact
                    description="登录后可以查看剩余课时，并在线预约上课时间。"
                    kind="account"
                    state="empty"
                    title="登录后查看课时与预约"
                    @action="goProfile"
                />
            </view>

            <view v-else-if="state === 'loading'" class="home-state">
                <async-state compact state="loading" title="正在加载课时" />
            </view>

            <view v-else-if="state === 'error'" class="home-state">
                <async-state
                    action-label="重新加载"
                    compact
                    :description="errorMessage"
                    kind="network"
                    state="error"
                    title="课时暂时无法加载"
                    @action="loadData(true)"
                />
            </view>

            <ticket-section v-else-if="state === 'noCourse'" title="开始学习">
                <view class="home-enroll">
                    <text class="home-enroll__title">报课后即可在线约课</text>
                    <text class="home-enroll__description">报课完成后，剩余课时和可预约时间会显示在这里。</text>
                    <nut-button v-if="venue && venue.phone" block type="primary" class="home-primary-button" @click="callVenue">电话咨询报课</nut-button>
                </view>
                <view class="home-links">
                    <account-row description="单节课与课包" icon="course-book" interactive title="查看课程课包" @select="goShop" />
                </view>
            </ticket-section>

            <ticket-section v-else action-label="课程详情" title="我的课时" @action="goCourses">
                <view class="home-courses">
                    <view v-for="course in courseRows" :key="course.courseId" class="home-course">
                        <view class="home-course__main">
                            <view class="home-course__copy">
                                <text class="home-course__name">{{ course.name }}</text>
                                <text class="home-course__validity">{{ course.validityText }}</text>
                            </view>
                            <view class="home-course__balance">
                                <text class="home-course__count">{{ course.remainingLessons }}</text>
                                <text class="home-course__unit">节</text>
                            </view>
                        </view>
                        <view
                            v-if="course.renewalHint"
                            class="home-course__renewal"
                            aria-role="button"
                            @tap="goShop"
                        >
                            <text>{{ course.renewalHint }}</text>
                            <app-icon name="chevron-primary" size="sm" />
                        </view>
                    </view>
                    <view
                        v-if="subscribeTemplateId"
                        class="home-course__renewal home-subscribe"
                        aria-role="button"
                        @tap="subscribeReminders"
                    >
                        <text>课时不足时用微信提醒我</text>
                        <app-icon name="chevron-primary" size="sm" />
                    </view>
                </view>
                <venue-handoff v-if="closed" :venue="venue" />
                <nut-button v-else block type="primary" class="home-primary-button" @click="goBooking">去约课</nut-button>
            </ticket-section>

            <upcoming-lessons v-if="isLogin" ref="upcomingLessons" />
        </view>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { RoleManager } from '../../../utils/rolemanager';
import { UserManager } from '../../../utils/usermanager';
import { VenueManager } from '../../../utils/venuemanager';
import AccountRow from '../../components/AccountRow.vue';
import AppIcon from '../../components/AppIcon.vue';
import AsyncState from '../../components/AsyncState.vue';
import PageChrome from '../../components/PageChrome.vue';
import TeacherBookingHome from '../../components/TeacherBookingHome.vue';
import TicketSection from '../../components/TicketSection.vue';
import UpcomingLessons from '../../components/UpcomingLessons.vue';
import VenueHandoff from '../../components/VenueHandoff.vue';
import { learningErrorMessage, normalizeOverview } from '../courses/pageLogic';
import { venueFacts } from '../venues/pageLogic';
import { homeCourseRows, homeState, normalizeReminders } from './pageLogic';
import './index.scss';

export default {
    components: {
        AccountRow, AppIcon, AsyncState, PageChrome, TeacherBookingHome, TicketSection, UpcomingLessons, VenueHandoff,
    },
    data() {
        return {
            errorMessage: '', isLogin: false, loading: false, overview: normalizeOverview(), reminder: null,
            requestSerial: 0, role: 'student', subscribeTemplateId: '', venue: null,
        };
    },
    computed: {
        courseRows() { return homeCourseRows(this.overview.courses); },
        state() {
            return homeState({
                courses: this.overview.courses, error: this.errorMessage, isLogin: this.isLogin, loading: this.loading,
            });
        },
        closed() { return VenueManager.venueClosed(this.venue); },
        venueRows() { return venueFacts(this.venue || {}); },
    },
    onShow() {
        this.role = RoleManager.getRole();
        RoleManager.applyTabBar(this.role);
        if (this.role === 'teacher') {
            Taro.setNavigationBarTitle({ title: '工作台' });
            this.$nextTick(() => this.$refs.teacherHome?.refresh());
            return;
        }
        this.loadVenue();
        this.loadData();
    },
    async onPullDownRefresh() {
        try {
            if (this.role === 'teacher') await this.$refs.teacherHome?.refresh(true);
            else await Promise.all([this.loadVenue(), this.loadData(true)]);
        } finally { Taro.stopPullDownRefresh(); }
    },
    methods: {
        callVenue() { VenueManager.callVenue(this.venue); },
        goBooking() { Taro.switchTab({ url: '/pages/appointmentBooking/index' }); },
        goCourses() { Taro.navigateTo({ url: '/pages/courses/index' }); },
        goProfile() { Taro.switchTab({ url: '/pages/profile/index' }); },
        goShop() { Taro.navigateTo({ url: '/pages/courseShop/index' }); },
        goVenues() { Taro.navigateTo({ url: '/pages/venues/index' }); },
        // Reminders are a side note: a failed load never blocks the lesson balance.
        async loadReminders() {
            try {
                const { reminder, subscribeTemplateId } = normalizeReminders(await Api.listRenewalReminders());
                this.reminder = reminder;
                this.subscribeTemplateId = subscribeTemplateId;
            } catch (error) {
                this.reminder = null;
            }
        },
        openReminder() {
            this.reminder = null;
            Api.readRenewalReminders().catch(() => {});
            this.goShop();
        },
        // One-time subscribe: every accepted prompt allows one WeChat reminder.
        async subscribeReminders() {
            const templateId = this.subscribeTemplateId;
            try {
                const result = await Taro.requestSubscribeMessage({ tmplIds: [templateId] });
                if (result[templateId] !== 'accept') return;
                await Api.subscribeRenewalReminders();
                Taro.showToast({ title: '已开启微信提醒', icon: 'success' });
            } catch (error) {
                Taro.showToast({ title: error?.message || '暂时无法开启微信提醒', icon: 'none' });
            }
        },
        async loadVenue() {
            this.venue = (await VenueManager.loadVenues()).current;
            Taro.setNavigationBarTitle({ title: this.venue?.name || '看乐艺术' });
        },
        async loadData(force = false) {
            this.isLogin = UserManager.isLogin();
            if (!this.isLogin) {
                this.requestSerial += 1;
                this.loading = false;
                this.errorMessage = '';
                this.overview = normalizeOverview();
                this.reminder = null;
                this.subscribeTemplateId = '';
                return;
            }
            this.$nextTick(() => this.$refs.upcomingLessons?.refresh(force));
            this.loadReminders();
            if (this.loading && !force) return;
            const requestId = this.requestSerial + 1;
            this.requestSerial = requestId;
            this.loading = true;
            this.errorMessage = '';
            try {
                const overview = normalizeOverview(await Api.getLearningOverview());
                if (requestId === this.requestSerial) this.overview = overview;
            } catch (error) {
                if (requestId === this.requestSerial) this.errorMessage = learningErrorMessage(error);
            } finally {
                if (requestId === this.requestSerial) this.loading = false;
            }
        },
    },
};
</script>
