<template>
    <page-chrome class="teacher-calendar" tone="immersive">
        <page-header eyebrow="TEACHING CALENDAR" subtitle="查看正式课程安排与可预约时间" title="课程日历">
            <view class="teacher-calendar__metrics">
                <view class="teacher-calendar__metric">
                    <text class="teacher-calendar__metric-value">{{ schedule.items.length }}</text>
                    <text class="teacher-calendar__metric-label">本周课程</text>
                </view>
                <view class="teacher-calendar__metric">
                    <text class="teacher-calendar__metric-value">{{ dailyLessons.length }}</text>
                    <text class="teacher-calendar__metric-label">当日课程</text>
                </view>
            </view>
        </page-header>

        <view class="teacher-calendar__content">
            <view class="teacher-calendar__week-nav">
                <view class="teacher-calendar__nav-button teacher-calendar__nav-button--previous" aria-label="上一周" @tap="moveWeek(-1)">
                    <app-icon name="chevron-primary" size="sm" />
                </view>
                <text class="teacher-calendar__week-label">{{ weekLabel }}</text>
                <view class="teacher-calendar__nav-button" aria-label="下一周" @tap="moveWeek(1)">
                    <app-icon name="chevron-primary" size="sm" />
                </view>
            </view>

            <view class="teacher-calendar__date-strip">
                <view
                    v-for="day in days"
                    :key="day.dateKey"
                    class="teacher-calendar__day"
                    :class="{ 'teacher-calendar__day--selected': day.isSelected, 'teacher-calendar__day--today': day.isToday }"
                    @tap="selectDate(day.dateKey)"
                >
                    <text class="teacher-calendar__weekday">{{ day.weekday }}</text>
                    <text class="teacher-calendar__day-number">{{ day.day }}</text>
                </view>
            </view>

            <view class="teacher-calendar__availability-toggle">
                <view>
                    <text class="teacher-calendar__toggle-title">显示可预约时间</text>
                    <text class="teacher-calendar__toggle-subtitle">作为背景参考，不代表已安排课程</text>
                </view>
                <switch :checked="showAvailability" :color="primaryColor" @change="toggleAvailability" />
            </view>

            <view v-if="state !== 'ready'" class="teacher-calendar__state">
                <async-state
                    :action-label="state === 'error' ? '重新加载' : ''"
                    :description="errorMessage"
                    :kind="state === 'error' ? 'network' : 'default'"
                    :state="state"
                    :title="state === 'error' ? '课程日历加载失败' : ''"
                    @action="refresh(true)"
                />
            </view>

            <template v-else>
                <ticket-section :subtitle="selectedDateLabel" title="当日课程">
                    <view v-if="dailyLessons.length" class="teacher-calendar__list">
                        <lesson-row
                            v-for="lesson in dailyLessons"
                            :key="lesson.lessonId"
                            :lesson="lesson"
                            perspective="teacher"
                            @select="goDetail"
                        />
                    </view>
                    <view v-else class="teacher-calendar__empty">
                        <app-icon name="course-calendar" size="xl" />
                        <view>
                            <text class="teacher-calendar__empty-title">当天没有课程</text>
                            <text class="teacher-calendar__empty-copy">切换日期查看本周其他安排</text>
                        </view>
                    </view>
                </ticket-section>

                <ticket-section v-if="showAvailability" subtitle="已扣除临时关闭时段" title="可预约时间">
                    <view v-if="dailyAvailability.length" class="teacher-calendar__availability-list">
                        <view v-for="window in dailyAvailability" :key="`${window.offeringId}-${window.startAt}`" class="teacher-calendar__availability-window">
                            <text class="teacher-calendar__availability-course">{{ window.course.name }}</text>
                            <text class="teacher-calendar__availability-time">{{ formatScheduleTime(window.startAt, window.endAt) }}</text>
                        </view>
                    </view>
                    <view v-else class="teacher-calendar__availability-empty">当天没有开放可预约时段</view>
                </ticket-section>
            </template>
        </view>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../utils/apis';
import { ScheduleManager } from '../../utils/schedulemanager';
import { UserManager } from '../../utils/usermanager';
import { themeColors } from '../styles/theme.mjs';
import AppIcon from './AppIcon.vue';
import AsyncState from './AsyncState.vue';
import LessonRow from './LessonRow.vue';
import PageChrome from './PageChrome.vue';
import PageHeader from './PageHeader.vue';
import TicketSection from './TicketSection.vue';
import {
    availabilityForDate, buildSevenDayStrip, dateKey, formatScheduleTime, lessonsForDate,
    normalizeTeacherSchedule, scheduleErrorMessage, shiftWeek, teacherLessonDetailUrl, weekRange,
} from '../pages/schedule/pageLogic';

export default {
    name: 'TeacherCalendarHome',
    components: { AppIcon, AsyncState, LessonRow, PageChrome, PageHeader, TicketSection },
    data() {
        return {
            errorMessage: '', hasLoaded: false, loading: false, primaryColor: themeColors.primaryStrong,
            requestSerial: 0, schedule: normalizeTeacherSchedule(), selectedDate: dateKey(), showAvailability: false,
        };
    },
    computed: {
        dailyAvailability() { return availabilityForDate(this.schedule.availability, this.selectedDate); },
        dailyLessons() { return lessonsForDate(this.schedule.items, this.selectedDate); },
        days() { return buildSevenDayStrip(this.selectedDate); },
        selectedDateLabel() {
            const selected = this.days.find((day) => day.isSelected);
            return selected ? `${selected.month}${selected.day}日 · ${selected.weekday}` : '';
        },
        state() {
            if (this.loading && !this.hasLoaded) return 'loading';
            if (this.errorMessage && !this.hasLoaded) return 'error';
            return 'ready';
        },
        weekLabel() {
            const first = this.days[0];
            const last = this.days[6];
            return first && last ? `${first.month}${first.day}日 - ${last.month}${last.day}日` : '';
        },
    },
    methods: {
        formatScheduleTime,
        goDetail(lesson) { Taro.navigateTo({ url: teacherLessonDetailUrl(lesson) }); },
        moveWeek(amount) {
            this.selectedDate = shiftWeek(this.selectedDate, amount);
            this.loadWeek();
        },
        refresh(force = false) { return this.loadWeek(force); },
        selectDate(value) { this.selectedDate = value; },
        toggleAvailability(event) { this.showAvailability = Boolean(event?.detail?.value); },
        async loadWeek(force = false) {
            if (this.loading && !force) return;
            const user = UserManager.getUserInfo();
            const scope = ScheduleManager.scopeFor({ ...user, role: 'teacher' });
            const range = weekRange(this.selectedDate);
            const cacheKey = `teacher-week:${range.from}`;
            const cached = force ? null : ScheduleManager.get(scope, cacheKey);
            if (cached) {
                this.schedule = normalizeTeacherSchedule(cached);
                this.hasLoaded = true;
            }
            const requestId = this.requestSerial + 1;
            this.requestSerial = requestId;
            this.loading = true;
            this.errorMessage = '';
            try {
                const response = await Api.getTeacherSchedule({ ...range, includeAvailability: true });
                if (requestId !== this.requestSerial) return;
                this.schedule = normalizeTeacherSchedule(response);
                this.hasLoaded = true;
                ScheduleManager.set(scope, cacheKey, response);
            } catch (error) {
                if (requestId === this.requestSerial) this.errorMessage = scheduleErrorMessage(error);
            } finally {
                if (requestId === this.requestSerial) this.loading = false;
            }
        },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.teacher-calendar { background: $ky-canvas; min-height: 100vh; padding-bottom: $ky-space-8; }
.teacher-calendar__metrics { border-top: 1px solid $ky-on-primary-divider; display: flex; margin-top: $ky-space-5; padding-top: $ky-space-4; }
.teacher-calendar__metric { flex: 1; }
.teacher-calendar__metric + .teacher-calendar__metric { border-left: 1px solid $ky-on-primary-divider; padding-left: $ky-space-4; }
.teacher-calendar__metric-value,
.teacher-calendar__metric-label { display: block; }
.teacher-calendar__metric-value { color: $ky-on-primary; font-size: $ky-font-size-display-md; font-weight: $ky-font-weight-black; }
.teacher-calendar__metric-label { color: $ky-on-primary-muted; font-size: $ky-font-size-xs; margin-top: 2px; }
.teacher-calendar__content { padding: $ky-space-4 $ky-space-3 0; }
.teacher-calendar__week-nav { align-items: center; display: flex; justify-content: space-between; }
.teacher-calendar__nav-button { align-items: center; background: $ky-surface; border: 1px solid $ky-line; border-radius: $ky-radius-md; display: flex; height: 34px; justify-content: center; width: 34px; }
.teacher-calendar__nav-button--previous .app-icon { transform: rotate(180deg); }
.teacher-calendar__week-label { color: $ky-ink-strong; font-size: $ky-font-size-body; font-weight: $ky-font-weight-bold; }
.teacher-calendar__date-strip { background: $ky-surface; border: 1px solid $ky-line; border-radius: $ky-radius-lg; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); margin-top: $ky-space-3; overflow: hidden; }
.teacher-calendar__day { align-items: center; display: flex; flex-direction: column; min-width: 0; padding: $ky-space-2 0; }
.teacher-calendar__day--selected { background: $ky-primary-strong; }
.teacher-calendar__weekday,
.teacher-calendar__day-number { display: block; }
.teacher-calendar__weekday { color: $ky-text-muted; font-size: $ky-font-size-2xs; }
.teacher-calendar__day-number { color: $ky-ink-strong; font-size: $ky-font-size-title-sm; font-weight: $ky-font-weight-black; margin-top: $ky-space-1; }
.teacher-calendar__day--today:not(.teacher-calendar__day--selected) .teacher-calendar__day-number { color: $ky-primary-strong; }
.teacher-calendar__day--selected .teacher-calendar__weekday,
.teacher-calendar__day--selected .teacher-calendar__day-number { color: $ky-on-primary; }
.teacher-calendar__availability-toggle { align-items: center; background: $ky-surface; border: 1px solid $ky-line; border-radius: $ky-radius-lg; display: flex; justify-content: space-between; margin-top: $ky-space-3; min-height: 64px; padding: 0 $ky-space-4; }
.teacher-calendar__toggle-title,
.teacher-calendar__toggle-subtitle { display: block; }
.teacher-calendar__toggle-title { color: $ky-ink-strong; font-size: $ky-font-size-body; font-weight: $ky-font-weight-bold; }
.teacher-calendar__toggle-subtitle { color: $ky-text-muted; font-size: $ky-font-size-xs; margin-top: 3px; }
.teacher-calendar__state { background: $ky-surface; border: 1px solid $ky-line; border-radius: $ky-radius-lg; margin-top: $ky-space-4; min-height: 260px; }
.teacher-calendar__list { border: 1px solid $ky-line-tinted; border-radius: $ky-radius-lg; overflow: hidden; }
.teacher-calendar__empty { align-items: center; background: $ky-surface; border: 1px solid $ky-line; border-radius: $ky-radius-lg; color: $ky-text-muted; display: flex; gap: $ky-space-3; min-height: 76px; padding: $ky-space-4; }
.teacher-calendar__empty-title,
.teacher-calendar__empty-copy { display: block; }
.teacher-calendar__empty-title { color: $ky-ink-strong; font-size: $ky-font-size-body; font-weight: $ky-font-weight-bold; }
.teacher-calendar__empty-copy { font-size: $ky-font-size-xs; margin-top: 3px; }
.teacher-calendar__availability-list { display: grid; gap: $ky-space-2; }
.teacher-calendar__availability-window { align-items: center; background: $ky-primary-wash; border: 1px solid $ky-primary-line; border-radius: $ky-radius-md; display: flex; justify-content: space-between; min-height: 46px; padding: 0 $ky-space-3; }
.teacher-calendar__availability-course { color: $ky-ink-strong; font-size: $ky-font-size-body-sm; font-weight: $ky-font-weight-semibold; }
.teacher-calendar__availability-time { color: $ky-primary-strong; font-size: $ky-font-size-body-sm; font-weight: $ky-font-weight-bold; }
.teacher-calendar__availability-empty { background: $ky-primary-wash; border: 1px solid $ky-line-tinted; border-radius: $ky-radius-md; color: $ky-text-muted; font-size: $ky-font-size-body-sm; padding: $ky-space-4; text-align: center; }
</style>
