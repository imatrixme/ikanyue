<template>
    <page-chrome class="courses-page" tone="immersive">
        <page-header eyebrow="MY COURSES" subtitle="查看课时、课程安排和上课记录" title="我的课程">
            <view class="courses-hero-metrics">
                <view class="courses-hero-metric">
                    <text class="courses-hero-value">{{ overview.courses.length }}</text>
                    <text class="courses-hero-label">当前课程</text>
                </view>
                <view class="courses-hero-metric">
                    <text class="courses-hero-value">{{ remainingLessons }}</text>
                    <text class="courses-hero-label">剩余课时</text>
                </view>
                <view class="courses-hero-metric">
                    <text class="courses-hero-value">{{ scheduledLessons }}</text>
                    <text class="courses-hero-label">已安排</text>
                </view>
            </view>
        </page-header>

        <view class="courses-content">
            <view v-if="!isLogin" class="courses-state">
                <async-state
                    action-label="前往登录"
                    description="登录后可以查看当前课程、课时和上课记录。"
                    kind="account"
                    state="empty"
                    title="登录后查看课程"
                    @action="goProfile"
                />
            </view>
            <view v-else-if="state !== 'ready'" class="courses-state">
                <async-state
                    :action-label="state === 'error' ? '重新加载' : ''"
                    :description="state === 'error' ? errorMessage : '课程由教务老师统一安排，安排完成后会显示在这里。'"
                    :kind="state === 'error' ? 'network' : 'default'"
                    :state="state"
                    :title="state === 'empty' ? '暂无课程安排' : ''"
                    @action="loadData(true)"
                />
            </view>
            <template v-else>
                <ticket-section v-if="overview.nextLesson" action-label="全部日程" subtitle="下一节已安排课程" title="即将上课" @action="goLessons">
                    <view class="courses-list">
                        <lesson-row :lesson="overview.nextLesson" @select="goLesson" />
                    </view>
                </ticket-section>

                <ticket-section v-if="overview.warnings.length" subtitle="请及时联系教学管理" title="需要处理">
                    <view class="courses-notices">
                        <view v-for="warning in overview.warnings" :key="warning.lessonId" class="courses-notice-link" @tap="goLesson({ lessonId: warning.lessonId })">
                            <validity-notice :description="warning.message" :title="warning.title" tone="warning" />
                        </view>
                    </view>
                </ticket-section>

                <ticket-section subtitle="按课程查看剩余与已安排课时" title="当前课程">
                    <course-summary-card v-for="course in overview.courses" :key="course.courseId" :course="course" @select="goCourse" />
                </ticket-section>

                <ticket-section action-label="全部记录" subtitle="最近的课时变化" title="课时记录" @action="goRecords">
                    <view v-if="overview.recentRecords.length" class="courses-list">
                        <lesson-record-row v-for="record in overview.recentRecords" :key="record.recordId" :record="record" />
                    </view>
                    <validity-notice v-else description="完成课程或调整课程安排后，记录会显示在这里。" title="暂无课时记录" />
                </ticket-section>
            </template>
        </view>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { UserManager } from '../../../utils/usermanager';
import AsyncState from '../../components/AsyncState.vue';
import CourseSummaryCard from '../../components/CourseSummaryCard.vue';
import LessonRecordRow from '../../components/LessonRecordRow.vue';
import LessonRow from '../../components/LessonRow.vue';
import PageChrome from '../../components/PageChrome.vue';
import PageHeader from '../../components/PageHeader.vue';
import TicketSection from '../../components/TicketSection.vue';
import ValidityNotice from '../../components/ValidityNotice.vue';
import {
    courseDetailUrl, courseListUrl, learningErrorMessage, lessonDetailUrl, normalizeOverview, pageState,
} from './pageLogic';
import './index.scss';

export default {
    components: {
        AsyncState, CourseSummaryCard, LessonRecordRow, LessonRow, PageChrome, PageHeader,
        TicketSection, ValidityNotice,
    },
    data() {
        return { errorMessage: '', isLogin: false, loading: false, overview: normalizeOverview() };
    },
    computed: {
        remainingLessons() { return this.overview.courses.reduce((sum, course) => sum + course.remainingLessons, 0); },
        scheduledLessons() { return this.overview.courses.reduce((sum, course) => sum + course.scheduledLessons, 0); },
        state() {
            return pageState({ error: this.errorMessage, items: this.overview.courses, loading: this.loading });
        },
    },
    onShow() { this.loadData(); },
    async onPullDownRefresh() {
        try { await this.loadData(true); } finally { Taro.stopPullDownRefresh(); }
    },
    methods: {
        goCourse(course) { Taro.navigateTo({ url: courseDetailUrl(course.courseId) }); },
        goLesson(lesson) { if (lesson.lessonId) Taro.navigateTo({ url: lessonDetailUrl(lesson.lessonId) }); },
        goLessons() { Taro.navigateTo({ url: courseListUrl('courseLessons') }); },
        goRecords() { Taro.navigateTo({ url: courseListUrl('courseRecords') }); },
        goProfile() { Taro.switchTab({ url: '/pages/profile/index' }); },
        async loadData(force = false) {
            if (this.loading && !force) return;
            this.isLogin = UserManager.isLogin();
            if (!this.isLogin) {
                this.overview = normalizeOverview();
                this.errorMessage = '';
                return;
            }
            this.loading = true;
            this.errorMessage = '';
            try { this.overview = normalizeOverview(await Api.getLearningOverview()); }
            catch (error) { this.errorMessage = learningErrorMessage(error); }
            finally { this.loading = false; }
        },
    },
};
</script>
