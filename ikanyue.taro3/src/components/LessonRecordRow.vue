<template>
    <view class="lesson-record-row">
        <view class="lesson-record-row__mark" :class="`lesson-record-row__mark--${record.impact}`" />
        <view class="lesson-record-row__copy">
            <text class="lesson-record-row__title">{{ record.title }}</text>
            <text class="lesson-record-row__meta">{{ record.course.name }} · {{ formatDateTime(record.occurredAt) }}</text>
        </view>
        <text class="lesson-record-row__quantity" :class="`lesson-record-row__quantity--${record.impact}`">
            {{ recordQuantityText(record) }}
        </text>
    </view>
</template>

<script>
import { formatDateTime, recordQuantityText } from '../pages/courses/pageLogic';

export default {
    name: 'LessonRecordRow',
    props: { record: { type: Object, required: true } },
    methods: { formatDateTime, recordQuantityText },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.lesson-record-row { align-items: center; background: $ky-surface; display: flex; min-height: 64px; padding: $ky-space-3 $ky-space-4; }
.lesson-record-row + .lesson-record-row { border-top: 1px solid $ky-line-tinted; }
.lesson-record-row__mark { background: $ky-text-muted; border-radius: 50%; flex: 0 0 8px; height: 8px; width: 8px; }
.lesson-record-row__mark--added,
.lesson-record-row__mark--returned { background: $ky-primary; }
.lesson-record-row__mark--used { background: $ky-gold; }
.lesson-record-row__copy { flex: 1; min-width: 0; padding: 0 $ky-space-3; }
.lesson-record-row__title,
.lesson-record-row__meta { display: block; }
.lesson-record-row__title { color: $ky-ink-strong; font-size: $ky-font-size-body-sm; font-weight: $ky-font-weight-semibold; }
.lesson-record-row__meta { color: $ky-text-muted; font-size: $ky-font-size-xs; margin-top: $ky-space-1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lesson-record-row__quantity { color: $ky-text-secondary; flex-shrink: 0; font-size: $ky-font-size-body-sm; font-weight: $ky-font-weight-bold; }
.lesson-record-row__quantity--added,
.lesson-record-row__quantity--returned { color: $ky-primary-strong; }
</style>
