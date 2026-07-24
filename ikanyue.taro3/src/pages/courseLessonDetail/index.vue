<template>
    <page-chrome class="courses-page" tone="immersive">
        <page-header eyebrow="LESSON" :subtitle="lesson.course.name" :title="lesson.title" />
        <view class="courses-content">
            <view v-if="state !== 'ready'" class="courses-state">
                <async-state :action-label="state === 'error' ? '重新加载' : ''" :description="errorMessage" :kind="state === 'error' ? 'network' : 'default'" :state="state" :title="state === 'empty' ? '暂无课堂信息' : ''" @action="loadLesson" />
            </view>
            <template v-else>
                <validity-notice v-if="lesson.notice" :description="lesson.notice" title="课程安排需要处理" tone="warning" />
                <ticket-section subtitle="以教学管理最终安排为准" title="课堂信息">
                    <view class="courses-detail-facts">
                        <view class="courses-detail-fact"><text class="courses-detail-label">课程</text><text class="courses-detail-value">{{ lesson.course.name }}</text></view>
                        <view class="courses-detail-fact"><text class="courses-detail-label">时间</text><text class="courses-detail-value">{{ formatLessonTime(lesson.startAt, lesson.endAt) }}</text></view>
                        <view class="courses-detail-fact"><text class="courses-detail-label">地点</text><text class="courses-detail-value">{{ lesson.location || '待通知' }}</text></view>
                        <view class="courses-detail-fact"><text class="courses-detail-label">课程状态</text><text class="courses-detail-value">{{ lessonStatusLabel(lesson.status) }}</text></view>
                        <view class="courses-detail-fact"><text class="courses-detail-label">出勤结果</text><text class="courses-detail-value">{{ attendanceLabel(lesson.attendanceResult) }}</text></view>
                        <view class="courses-detail-fact"><text class="courses-detail-label">课时状态</text><text class="courses-detail-value">{{ lessonHourLabel(lesson.lessonHourResult) }}</text></view>
                    </view>
                </ticket-section>
            </template>
        </view>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import AsyncState from '../../components/AsyncState.vue';
import PageChrome from '../../components/PageChrome.vue';
import PageHeader from '../../components/PageHeader.vue';
import TicketSection from '../../components/TicketSection.vue';
import ValidityNotice from '../../components/ValidityNotice.vue';
import {
    attendanceLabel, formatLessonTime, learningErrorMessage, lessonHourLabel, lessonStatusLabel,
    normalizeLesson, pageState,
} from '../courses/pageLogic';
import './index.scss';

export default {
    components: { AsyncState, PageChrome, PageHeader, TicketSection, ValidityNotice },
    data() { return { errorMessage: '', lesson: normalizeLesson(), lessonId: '', loading: false }; },
    computed: { state() { return pageState({ error: this.errorMessage, items: this.lesson.lessonId ? [this.lesson] : [], loading: this.loading }); } },
    onLoad(params) { this.lessonId = decodeURIComponent(params.id || ''); },
    onShow() { this.loadLesson(); },
    async onPullDownRefresh() { try { await this.loadLesson(); } finally { Taro.stopPullDownRefresh(); } },
    methods: {
        attendanceLabel, formatLessonTime, lessonHourLabel, lessonStatusLabel,
        async loadLesson() {
            if (!this.lessonId || this.loading) return;
            this.loading = true;
            this.errorMessage = '';
            try { this.lesson = normalizeLesson(await Api.getLearningLesson(this.lessonId)); }
            catch (error) { this.errorMessage = learningErrorMessage(error); }
            finally { this.loading = false; }
        },
    },
};
</script>
