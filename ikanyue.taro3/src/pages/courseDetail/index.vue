<template>
    <page-chrome class="courses-page">
        <page-header :subtitle="validityText" :title="course.courseName">
            <view class="courses-metrics">
                <view class="courses-metric"><text class="courses-metric__value">{{ course.remainingLessons }}</text><text class="courses-metric__label">剩余课时</text></view>
                <view class="courses-metric"><text class="courses-metric__value">{{ course.scheduledLessons }}</text><text class="courses-metric__label">已安排</text></view>
                <view class="courses-metric"><text class="courses-metric__value">{{ course.completedLessons }}</text><text class="courses-metric__label">已完成</text></view>
            </view>
        </page-header>
        <view class="courses-content">
            <view v-if="state !== 'ready'" class="courses-state">
                <async-state :action-label="state === 'error' ? '重新加载' : ''" :description="errorMessage" :kind="state === 'error' ? 'network' : 'default'" :state="state" :title="state === 'empty' ? '暂无课程信息' : ''" @action="loadCourse" />
            </view>
            <template v-else>
                <validity-notice v-if="course.awaitingActivation || course.expiringSoon" :description="course.awaitingActivation ? '教学管理完成课程安排后即可开始使用。' : '请结合课程日程合理安排剩余课时。'" :title="validityText" tone="warning" />

                <ticket-section action-label="全部日程" subtitle="最近安排与完成情况" title="课程日程" @action="goLessons">
                    <view v-if="course.recentLessons.length" class="courses-list">
                        <lesson-row v-for="lesson in course.recentLessons" :key="lesson.lessonId" :lesson="lesson" @select="goLesson" />
                    </view>
                    <validity-notice v-else description="排课后将在这里显示时间和地点。" title="暂无课程日程" />
                </ticket-section>

                <ticket-section subtitle="按每次课程安排记录" title="课时来源">
                    <view v-for="(source, index) in course.sources" :key="`${source.grantedAt}-${index}`" class="courses-source">
                        <view class="courses-source__head">
                            <text class="courses-source__title">{{ source.initialLessons }} 课时</text>
                            <text class="courses-source__status">{{ sourceValidityText(source) }}</text>
                        </view>
                        <view class="courses-source__metrics">
                            <text>剩余 {{ source.remainingLessons }}</text>
                            <text>已安排 {{ source.scheduledLessons }}</text>
                            <text>已完成 {{ source.completedLessons }}</text>
                            <text>安排日期 {{ formatDate(source.grantedAt) }}</text>
                        </view>
                    </view>
                </ticket-section>

                <ticket-section action-label="全部记录" subtitle="本课程最近变化" title="课时记录" @action="goRecords">
                    <view v-if="course.recentRecords.length" class="courses-list">
                        <lesson-record-row v-for="record in course.recentRecords" :key="record.recordId" :record="record" />
                    </view>
                    <validity-notice v-else description="完成课程后会形成对应记录。" title="暂无课时记录" />
                </ticket-section>
            </template>
        </view>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import AsyncState from '../../components/AsyncState.vue';
import LessonRecordRow from '../../components/LessonRecordRow.vue';
import LessonRow from '../../components/LessonRow.vue';
import PageChrome from '../../components/PageChrome.vue';
import PageHeader from '../../components/PageHeader.vue';
import TicketSection from '../../components/TicketSection.vue';
import ValidityNotice from '../../components/ValidityNotice.vue';
import {
    courseListUrl, courseValidityText, formatDate, learningErrorMessage, lessonDetailUrl,
    normalizeCourseDetail, pageState, sourceValidityText,
} from '../courses/pageLogic';
import './index.scss';

export default {
    components: { AsyncState, LessonRecordRow, LessonRow, PageChrome, PageHeader, TicketSection, ValidityNotice },
    data() { return { course: normalizeCourseDetail(), courseId: '', errorMessage: '', loading: false }; },
    computed: {
        state() { return pageState({ error: this.errorMessage, items: this.course.courseId ? [this.course] : [], loading: this.loading }); },
        validityText() { return courseValidityText(this.course); },
    },
    onLoad(params) { this.courseId = decodeURIComponent(params.id || ''); },
    onShow() { this.loadCourse(); },
    async onPullDownRefresh() { try { await this.loadCourse(); } finally { Taro.stopPullDownRefresh(); } },
    methods: {
        formatDate,
        sourceValidityText,
        goLesson(lesson) { Taro.navigateTo({ url: lessonDetailUrl(lesson.lessonId) }); },
        goLessons() { Taro.navigateTo({ url: courseListUrl('courseLessons', this.courseId) }); },
        goRecords() { Taro.navigateTo({ url: courseListUrl('courseRecords', this.courseId) }); },
        async loadCourse() {
            if (!this.courseId || this.loading) return;
            this.loading = true;
            this.errorMessage = '';
            try { this.course = normalizeCourseDetail(await Api.getLearningCourse(this.courseId)); }
            catch (error) { this.errorMessage = learningErrorMessage(error); }
            finally { this.loading = false; }
        },
    },
};
</script>
