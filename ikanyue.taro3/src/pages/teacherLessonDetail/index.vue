<template>
    <page-chrome class="courses-page" tone="immersive">
        <page-header eyebrow="TEACHING LESSON" :subtitle="lesson.course.name" :title="lesson.title" />
        <view class="courses-content">
            <view v-if="state !== 'ready'" class="courses-state">
                <async-state
                    :action-label="state === 'error' ? '重新加载' : ''"
                    :description="errorMessage"
                    :kind="state === 'error' ? 'network' : 'default'"
                    :state="state"
                    :title="state === 'empty' ? '暂无课堂信息' : ''"
                    @action="loadLesson(true)"
                />
            </view>
            <template v-else>
                <validity-notice v-if="lesson.attention" :description="lesson.attention" title="课程安排提醒" tone="warning" />
                <ticket-section subtitle="正式课程安排" title="课堂信息">
                    <view class="courses-detail-facts">
                        <view class="courses-detail-fact"><text class="courses-detail-label">课程</text><text class="courses-detail-value">{{ lesson.course.name }}</text></view>
                        <view class="courses-detail-fact"><text class="courses-detail-label">时间</text><text class="courses-detail-value">{{ formatScheduleTime(lesson.startAt, lesson.endAt) }}</text></view>
                        <view class="courses-detail-fact"><text class="courses-detail-label">地点</text><text class="courses-detail-value">{{ lesson.location || '待通知' }}</text></view>
                        <view class="courses-detail-fact"><text class="courses-detail-label">状态</text><text class="courses-detail-value">{{ lessonStatusLabel(lesson.status) }}</text></view>
                        <view v-if="lesson.classSummary.label" class="courses-detail-fact"><text class="courses-detail-label">班级</text><text class="courses-detail-value">{{ lesson.classSummary.label }}</text></view>
                        <view v-if="lesson.participantSummary.label" class="courses-detail-fact"><text class="courses-detail-label">学员</text><text class="courses-detail-value">{{ lesson.participantSummary.label }}</text></view>
                    </view>
                </ticket-section>
            </template>
        </view>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { ScheduleManager } from '../../../utils/schedulemanager';
import { UserManager } from '../../../utils/usermanager';
import AsyncState from '../../components/AsyncState.vue';
import PageChrome from '../../components/PageChrome.vue';
import PageHeader from '../../components/PageHeader.vue';
import TicketSection from '../../components/TicketSection.vue';
import ValidityNotice from '../../components/ValidityNotice.vue';
import { lessonStatusLabel, pageState } from '../courses/pageLogic';
import {
    dayRange, formatScheduleTime, normalizeScheduleEntry, normalizeTeacherSchedule, scheduleErrorMessage,
} from '../schedule/pageLogic';
import './index.scss';

export default {
    components: { AsyncState, PageChrome, PageHeader, TicketSection, ValidityNotice },
    data() {
        return { date: '', errorMessage: '', lesson: normalizeScheduleEntry(), lessonId: '', loading: false };
    },
    computed: {
        state() { return pageState({ error: this.errorMessage, items: this.lesson.lessonId ? [this.lesson] : [], loading: this.loading }); },
    },
    onLoad(params) {
        this.lessonId = decodeURIComponent(params.id || '');
        this.date = decodeURIComponent(params.date || '');
    },
    onShow() { this.loadLesson(); },
    async onPullDownRefresh() { try { await this.loadLesson(true); } finally { Taro.stopPullDownRefresh(); } },
    methods: {
        formatScheduleTime,
        lessonStatusLabel,
        async loadLesson(force = false) {
            if (!this.lessonId || !this.date || (this.loading && !force)) return;
            const user = UserManager.getUserInfo();
            const scope = ScheduleManager.scopeFor({ ...user, role: 'teacher' });
            const cacheKey = `teacher-lesson:${this.lessonId}:${this.date}`;
            const cached = force ? null : ScheduleManager.get(scope, cacheKey);
            if (cached) this.lesson = normalizeScheduleEntry(cached);
            this.loading = true;
            this.errorMessage = '';
            try {
                const response = normalizeTeacherSchedule(await Api.getTeacherSchedule(dayRange(this.date)));
                const lesson = response.items.find((item) => item.lessonId === this.lessonId);
                if (!lesson) throw Object.assign(new Error('未找到这节课'), { errorCode: 'LEARNING_LESSON_NOT_FOUND' });
                this.lesson = lesson;
                ScheduleManager.set(scope, cacheKey, lesson);
            } catch (error) {
                if (!this.lesson.lessonId) this.errorMessage = scheduleErrorMessage(error, '课堂信息暂时无法加载');
            } finally {
                this.loading = false;
            }
        },
    },
};
</script>
