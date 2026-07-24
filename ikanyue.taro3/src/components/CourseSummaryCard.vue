<template>
    <view class="course-summary-card" @tap="$emit('select', course)">
        <view class="course-summary-card__head">
            <view class="course-summary-card__copy">
                <text class="course-summary-card__eyebrow">{{ deliveryText }}</text>
                <text class="course-summary-card__title">{{ course.courseName }}</text>
            </view>
            <app-icon name="chevron-primary" size="sm" />
        </view>
        <view class="course-summary-card__metrics">
            <view class="course-summary-card__metric">
                <text class="course-summary-card__value">{{ course.remainingLessons }}</text>
                <text class="course-summary-card__label">剩余课时</text>
            </view>
            <view class="course-summary-card__metric">
                <text class="course-summary-card__value">{{ course.scheduledLessons }}</text>
                <text class="course-summary-card__label">已安排</text>
            </view>
            <view class="course-summary-card__metric">
                <text class="course-summary-card__value">{{ course.completedLessons }}</text>
                <text class="course-summary-card__label">已完成</text>
            </view>
        </view>
        <text class="course-summary-card__validity" :class="{ 'course-summary-card__validity--warning': course.expiringSoon }">
            {{ validityText }}
        </text>
    </view>
</template>

<script>
import AppIcon from './AppIcon.vue';
import { courseValidityText } from '../pages/courses/pageLogic';

export default {
    name: 'CourseSummaryCard',
    components: { AppIcon },
    emits: ['select'],
    props: { course: { type: Object, required: true } },
    computed: {
        deliveryText() {
            const labels = { group: '班级课程', one_on_one: '一对一课程', private: '一对一课程' };
            return labels[this.course.deliveryMode] || '声乐课程';
        },
        validityText() { return courseValidityText(this.course); },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.course-summary-card {
    background: $ky-surface;
    border: 1px solid $ky-line-tinted;
    border-radius: $ky-radius-lg;
    box-shadow: $ky-shadow-subtle;
    padding: $ky-space-4;
}

.course-summary-card:active { background: $ky-primary-wash; }
.course-summary-card + .course-summary-card { margin-top: $ky-space-3; }
.course-summary-card__head { align-items: center; display: flex; justify-content: space-between; }
.course-summary-card__copy { min-width: 0; }
.course-summary-card__eyebrow,
.course-summary-card__title,
.course-summary-card__value,
.course-summary-card__label,
.course-summary-card__validity { display: block; }
.course-summary-card__eyebrow { color: $ky-primary-strong; font-size: $ky-font-size-xs; font-weight: $ky-font-weight-bold; }
.course-summary-card__title { color: $ky-ink-strong; font-size: $ky-font-size-section; font-weight: $ky-font-weight-black; margin-top: $ky-space-1; }
.course-summary-card__metrics { border-bottom: 1px solid $ky-line-tinted; border-top: 1px solid $ky-line-tinted; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: $ky-space-4; padding: $ky-space-3 0; }
.course-summary-card__metric + .course-summary-card__metric { border-left: 1px solid $ky-line-tinted; padding-left: $ky-space-3; }
.course-summary-card__value { color: $ky-ink-strong; font-size: $ky-font-size-display-sm; font-weight: $ky-font-weight-black; }
.course-summary-card__label { color: $ky-text-muted; font-size: $ky-font-size-xs; margin-top: $ky-space-1; }
.course-summary-card__validity { color: $ky-text-secondary; font-size: $ky-font-size-xs; margin-top: $ky-space-3; }
.course-summary-card__validity--warning { color: $ky-danger; font-weight: $ky-font-weight-semibold; }
</style>
