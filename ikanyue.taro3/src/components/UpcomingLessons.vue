<template>
    <ticket-section
        v-if="visible"
        :action-label="items.length ? actionLabel : ''"
        :subtitle="subtitle"
        title="近期课程"
        @action="goFullSchedule"
    >
        <view v-if="items.length" class="upcoming-lessons__list">
            <lesson-row
                v-for="(lesson, index) in items"
                :key="lesson.lessonId"
                :compact="index > 0"
                :lesson="lesson"
                :perspective="role"
                :prominent="index === 0"
                @select="goLesson"
            />
        </view>
        <view v-else class="upcoming-lessons__error" @tap="refresh(true)">
            <text class="upcoming-lessons__error-title">课程安排未加载</text>
            <text class="upcoming-lessons__error-action">点击重试</text>
        </view>
    </ticket-section>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../utils/apis';
import { RoleManager } from '../../utils/rolemanager';
import { ScheduleManager } from '../../utils/schedulemanager';
import { UserManager } from '../../utils/usermanager';
import LessonRow from './LessonRow.vue';
import TicketSection from './TicketSection.vue';
import {
    normalizeUpcomingResponse, teacherLessonDetailUrl,
} from '../pages/schedule/pageLogic';
import { lessonDetailUrl } from '../pages/courses/pageLogic';

export default {
    name: 'UpcomingLessons',
    components: { LessonRow, TicketSection },
    data() {
        return { errorMessage: '', items: [], loading: false, requestSerial: 0, role: 'student' };
    },
    computed: {
        actionLabel() { return this.role === 'teacher' ? '查看日历' : '全部日程'; },
        subtitle() { return this.role === 'teacher' ? '最近 3 节已安排课程' : '接下来 3 节课程安排'; },
        visible() { return Boolean(this.items.length || this.errorMessage); },
    },
    methods: {
        goFullSchedule() {
            if (this.role === 'teacher') Taro.switchTab({ url: '/pages/points/index' });
            else Taro.navigateTo({ url: '/pages/courseLessons/index' });
        },
        goLesson(lesson) {
            const url = this.role === 'teacher' ? teacherLessonDetailUrl(lesson) : lessonDetailUrl(lesson.lessonId);
            if (lesson.lessonId) Taro.navigateTo({ url });
        },
        async refresh(force = false) {
            const user = UserManager.getUserInfo();
            this.role = RoleManager.getRole();
            if (!user.token) {
                this.items = [];
                this.errorMessage = '';
                return;
            }
            const scope = ScheduleManager.scopeFor({ ...user, role: this.role });
            const cached = force ? null : ScheduleManager.get(scope, 'upcoming');
            if (cached) this.items = normalizeUpcomingResponse(cached).items;
            if (this.loading) return;
            const requestId = this.requestSerial + 1;
            this.requestSerial = requestId;
            this.loading = true;
            this.errorMessage = '';
            try {
                const response = await Api.getUpcomingSchedule({ limit: 3 });
                if (requestId !== this.requestSerial) return;
                this.items = normalizeUpcomingResponse(response).items;
                ScheduleManager.set(scope, 'upcoming', response);
            } catch (error) {
                if (requestId === this.requestSerial && !this.items.length) this.errorMessage = error?.message || '加载失败';
            } finally {
                if (requestId === this.requestSerial) this.loading = false;
            }
        },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.upcoming-lessons__list { border: 1px solid $ky-line-tinted; border-radius: $ky-radius-lg; box-shadow: $ky-shadow-subtle; overflow: hidden; }
.upcoming-lessons__error { align-items: center; background: $ky-surface; border: 1px solid $ky-line; border-radius: $ky-radius-lg; display: flex; justify-content: space-between; min-height: 52px; padding: 0 $ky-space-4; }
.upcoming-lessons__error-title { color: $ky-text-secondary; font-size: $ky-font-size-body-sm; }
.upcoming-lessons__error-action { color: $ky-primary-strong; font-size: $ky-font-size-body-sm; font-weight: $ky-font-weight-bold; }
</style>
