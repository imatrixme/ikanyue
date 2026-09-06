<template>
    <view class="credit-event-row">
        <view class="credit-event-row__mark" :class="{ 'credit-event-row__mark--debit': delta.startsWith('-') }">
            {{ delta }}
        </view>
        <view class="credit-event-row__body">
            <view class="credit-event-row__header">
                <text class="credit-event-row__title">{{ eventLabel(event.eventType) }}</text>
                <text class="credit-event-row__time">{{ formatDateTime(event.businessTime || event.created) }}</text>
            </view>
            <text class="credit-event-row__meta">{{ creditName }} · {{ eventSourceText(event.source) }}</text>
            <text class="credit-event-row__meta">{{ event.reason || '系统记录' }}</text>
            <text v-if="event.reversalOfEventId" class="credit-event-row__linked">已关联原扣减记录</text>
        </view>
    </view>
</template>

<script>
import { eventLabel, eventSourceText, formatDateTime, normalizeCreditType, signedEventQuantity } from '../pages/courseCredits/pageLogic';

export default {
    name: 'CourseCreditEventRow',
    props: { event: { type: Object, required: true } },
    computed: {
        creditName() { return normalizeCreditType(this.event.creditType).name; },
        delta() { return signedEventQuantity(this.event); },
    },
    methods: { eventLabel, eventSourceText, formatDateTime },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.credit-event-row { align-items: flex-start; background: $ky-surface; border-bottom: 1px solid $ky-line-tinted; display: flex; padding: $ky-space-4; }
.credit-event-row:last-child { border-bottom: 0; }
.credit-event-row__mark { align-items: center; background: $ky-success-soft; border-radius: $ky-radius-md; color: $ky-success; display: flex; flex: 0 0 48px; font-size: $ky-font-size-body-lg; font-weight: $ky-font-weight-bold; height: 38px; justify-content: center; }
.credit-event-row__mark--debit { background: $ky-secondary-surface; color: $ky-ink-strong; }
.credit-event-row__body { flex: 1; margin-left: $ky-space-3; min-width: 0; }
.credit-event-row__header { align-items: center; display: flex; justify-content: space-between; }
.credit-event-row__title { color: $ky-ink-strong; font-size: $ky-font-size-body; font-weight: $ky-font-weight-bold; }
.credit-event-row__time, .credit-event-row__meta, .credit-event-row__linked { color: $ky-text-muted; font-size: $ky-font-size-xs; }
.credit-event-row__meta, .credit-event-row__linked { display: block; line-height: $ky-leading-readable; margin-top: $ky-space-1; }
.credit-event-row__linked { color: $ky-blue-pressed; }
</style>
