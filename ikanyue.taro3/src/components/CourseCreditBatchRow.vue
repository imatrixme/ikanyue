<template>
    <view class="credit-batch-row" @tap="$emit('select', batch)">
        <view class="credit-batch-row__header">
            <view>
                <text class="credit-batch-row__title">{{ creditName }}</text>
                <text class="credit-batch-row__code">{{ formatDate(batch.effectiveExpiresAt) }}到期</text>
            </view>
            <text class="credit-batch-row__status" :class="`credit-batch-row__status--${batch.status}`">
                {{ batchStatusLabel(batch.status) }}
            </text>
        </view>
        <view class="credit-batch-row__quantities">
            <view><text class="credit-batch-row__number">{{ batch.availableQuantity }}</text><text>可用</text></view>
            <view><text class="credit-batch-row__number">{{ batch.frozenQuantity }}</text><text>未来课程占用</text></view>
            <view><text class="credit-batch-row__number">{{ batch.consumedQuantity }}</text><text>已使用</text></view>
        </view>
        <view class="credit-batch-row__footer">
            <text>{{ batchRestrictionText(batch) }}</text>
            <text>{{ formatDate(batch.effectiveExpiresAt) }}</text>
        </view>
    </view>
</template>

<script>
import { batchRestrictionText, batchStatusLabel, formatDate, normalizeCreditType } from '../pages/courseCredits/pageLogic';

export default {
    name: 'CourseCreditBatchRow',
    emits: ['select'],
    props: { batch: { type: Object, required: true } },
    computed: {
        creditName() { return normalizeCreditType(this.batch.creditType).name; },
    },
    methods: { batchRestrictionText, batchStatusLabel, formatDate },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.credit-batch-row {
    background: $ky-surface;
    border-bottom: 1px solid $ky-line-tinted;
    padding: $ky-space-4;
}
.credit-batch-row:first-child { border-radius: $ky-radius-lg $ky-radius-lg 0 0; }
.credit-batch-row:last-child { border-bottom: 0; border-radius: 0 0 $ky-radius-lg $ky-radius-lg; }
.credit-batch-row:only-child { border-radius: $ky-radius-lg; }
.credit-batch-row__header, .credit-batch-row__quantities, .credit-batch-row__footer { display: flex; }
.credit-batch-row__header { align-items: flex-start; justify-content: space-between; }
.credit-batch-row__title, .credit-batch-row__code { display: block; }
.credit-batch-row__title { color: $ky-ink-strong; font-size: $ky-font-size-body-lg; font-weight: $ky-font-weight-bold; }
.credit-batch-row__code { color: $ky-text-muted; font-size: $ky-font-size-2xs; margin-top: $ky-space-1; }
.credit-batch-row__status { background: $ky-muted-surface; border-radius: $ky-radius-sm; color: $ky-text-secondary; font-size: $ky-font-size-xs; padding: $ky-space-1 $ky-space-2; }
.credit-batch-row__status--active { background: $ky-success-soft; color: $ky-success; }
.credit-batch-row__status--unactivated { background: $ky-yellow-soft; color: $ky-gold-foreground; }
.credit-batch-row__status--expired, .credit-batch-row__status--cancelled { background: $ky-danger-soft; color: $ky-danger; }
.credit-batch-row__quantities { gap: $ky-space-6; margin-top: $ky-space-4; }
.credit-batch-row__quantities view { color: $ky-text-muted; display: flex; flex-direction: column; font-size: $ky-font-size-xs; }
.credit-batch-row__number { color: $ky-ink-strong; font-size: $ky-font-size-title; font-weight: $ky-font-weight-bold; }
.credit-batch-row__footer { color: $ky-text-secondary; font-size: $ky-font-size-xs; justify-content: space-between; line-height: $ky-leading-readable; margin-top: $ky-space-3; }
.credit-batch-row__footer text:first-child { max-width: 68%; }
</style>
