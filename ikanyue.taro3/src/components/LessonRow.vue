<template>
    <view
        class="lesson-row"
        :class="{ 'lesson-row--compact': compact, 'lesson-row--prominent': prominent }"
        @tap="$emit('select', lesson)"
    >
        <view class="lesson-row__date">
            <text class="lesson-row__day">{{ day }}</text>
            <text class="lesson-row__month">{{ month }}</text>
        </view>
        <view class="lesson-row__copy">
            <view class="lesson-row__head">
                <text class="lesson-row__title">{{ lesson.title }}</text>
                <text class="lesson-row__status">{{ lessonStatusLabel(lesson.status) }}</text>
            </view>
            <text class="lesson-row__course">{{ lesson.course.name }}</text>
            <text v-if="contextLabel" class="lesson-row__context">{{ contextLabel }}</text>
            <view class="lesson-row__meta">
                <text>{{ formatLessonTime(lesson.startAt, lesson.endAt) }}</text>
                <text v-if="lesson.location">{{ lesson.location }}</text>
            </view>
            <text v-if="lesson.notice" class="lesson-row__notice">{{ lesson.notice }}</text>
        </view>
        <app-icon name="chevron-primary" size="sm" />
    </view>
</template>

<script>
import AppIcon from './AppIcon.vue';
import { formatLessonTime, lessonStatusLabel } from '../pages/courses/pageLogic';
import { dateKey } from '../pages/schedule/pageLogic';

export default {
    name: 'LessonRow',
    components: { AppIcon },
    emits: ['select'],
    props: {
        compact: { type: Boolean, default: false },
        lesson: { type: Object, required: true },
        perspective: { type: String, default: 'student' },
        prominent: { type: Boolean, default: false },
    },
    computed: {
        contextLabel() {
            const summaries = this.perspective === 'teacher'
                ? [this.lesson.classSummary, this.lesson.participantSummary]
                : [this.lesson.teacherSummary, this.lesson.classSummary];
            return summaries.map((summary) => summary?.label).filter(Boolean).join(' · ');
        },
        dateParts() {
            if (!this.lesson.startAt) return null;
            const [, month, day] = dateKey(this.lesson.startAt).split('-');
            return { day, month: `${Number(month)}月` };
        },
        day() { return this.dateParts?.day || '--'; },
        month() { return this.dateParts?.month || '待定'; },
    },
    methods: { formatLessonTime, lessonStatusLabel },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.lesson-row { align-items: center; background: $ky-surface; display: flex; min-height: 88px; padding: $ky-space-3; }
.lesson-row--prominent { background: $ky-primary-wash; min-height: 98px; }
.lesson-row--compact { min-height: 76px; }
.lesson-row--compact .lesson-row__date { height: 46px; flex-basis: 44px; }
.lesson-row--compact .lesson-row__day { font-size: $ky-font-size-title; }
.lesson-row + .lesson-row { border-top: 1px solid $ky-line-tinted; }
.lesson-row:active { background: $ky-primary-wash; }
.lesson-row__date { align-items: center; background: $ky-primary-soft; border-radius: $ky-radius-md; display: flex; flex: 0 0 48px; flex-direction: column; height: 52px; justify-content: center; }
.lesson-row__day,
.lesson-row__month,
.lesson-row__title,
.lesson-row__course,
.lesson-row__notice { display: block; }
.lesson-row__day { color: $ky-primary-strong; font-size: $ky-font-size-heading; font-weight: $ky-font-weight-black; line-height: $ky-leading-tight; }
.lesson-row__month { color: $ky-primary-strong; font-size: $ky-font-size-xs; }
.lesson-row__copy { flex: 1; min-width: 0; padding: 0 $ky-space-3; }
.lesson-row__head { align-items: flex-start; display: flex; justify-content: space-between; }
.lesson-row__title { color: $ky-ink-strong; flex: 1; font-size: $ky-font-size-body-lg; font-weight: $ky-font-weight-bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lesson-row__status { color: $ky-primary-strong; flex-shrink: 0; font-size: $ky-font-size-xs; font-weight: $ky-font-weight-semibold; margin-left: $ky-space-2; }
.lesson-row__course { color: $ky-text-secondary; font-size: $ky-font-size-xs; margin-top: $ky-space-1; }
.lesson-row__context { color: $ky-primary-strong; display: block; font-size: $ky-font-size-xs; margin-top: $ky-space-1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lesson-row__meta { color: $ky-text-muted; display: flex; flex-wrap: wrap; font-size: $ky-font-size-xs; gap: $ky-space-2; margin-top: $ky-space-1; }
.lesson-row__notice { color: $ky-danger; font-size: $ky-font-size-xs; margin-top: $ky-space-2; }
</style>
