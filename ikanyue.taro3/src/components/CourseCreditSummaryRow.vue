<template>
    <view class="credit-summary-row" @tap="$emit('select', item)">
        <view class="credit-summary-row__top">
            <view class="credit-summary-row__identity">
                <text class="credit-summary-row__name">{{ item.creditType.name }}</text>
                <text v-if="item.exchangeOnly" class="credit-summary-row__badge">仅兑换</text>
            </view>
            <view class="credit-summary-row__amount">
                <text class="credit-summary-row__number">{{ item.availableQuantity }}</text>
                <text class="credit-summary-row__unit">{{ item.exchangeOnly ? '额度可用' : '课时可用' }}</text>
            </view>
        </view>
        <view class="credit-summary-row__metrics">
            <text>{{ item.frozenQuantity }} 课时用于未来课程</text>
            <text>{{ item.unactivatedQuantity }} 课时尚未生效</text>
            <text v-if="item.nearestExpiryAt" :class="`credit-summary-row__expiry--${expiryTone}`">
                {{ expiryCopy }}
            </text>
            <text v-else>长期有效</text>
        </view>
        <view class="credit-summary-row__footer">
            <text>{{ item.exchangeOnly ? '兑换后才能用于对应课程' : '查看课时来源与使用限制' }}</text>
            <app-icon name="chevron-primary" size="sm" />
        </view>
    </view>
</template>

<script>
import AppIcon from './AppIcon.vue';
import { expiryState, formatDate } from '../pages/courseCredits/pageLogic';

export default {
    name: 'CourseCreditSummaryRow',
    components: { AppIcon },
    emits: ['select'],
    props: {
        item: { type: Object, required: true },
        warningDays: { type: Number, default: 30 },
    },
    computed: {
        expiryTone() {
            return expiryState(this.item.nearestExpiryAt, Date.now(), this.warningDays);
        },
        expiryCopy() {
            const quantity = this.item.expiringQuantity > 0 ? `${this.item.expiringQuantity} 课时 ` : '';
            return `${quantity}${formatDate(this.item.nearestExpiryAt)} 到期`;
        },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.credit-summary-row {
    background: $ky-surface;
    border: 1px solid $ky-line-tinted;
    border-radius: $ky-radius-lg;
    box-shadow: $ky-shadow-subtle;
    box-sizing: border-box;
    padding: $ky-space-4;
}

.credit-summary-row + .credit-summary-row { margin-top: $ky-space-3; }

.credit-summary-row__top,
.credit-summary-row__identity,
.credit-summary-row__metrics,
.credit-summary-row__footer {
    align-items: center;
    display: flex;
}

.credit-summary-row__top,
.credit-summary-row__footer { justify-content: space-between; }
.credit-summary-row__identity { min-width: 0; }

.credit-summary-row__name {
    color: $ky-ink-strong;
    font-size: $ky-font-size-subtitle;
    font-weight: $ky-font-weight-bold;
}

.credit-summary-row__badge {
    background: $ky-primary-soft;
    border-radius: $ky-radius-sm;
    color: $ky-primary-strong;
    font-size: $ky-font-size-2xs;
    font-weight: $ky-font-weight-bold;
    margin-left: $ky-space-2;
    padding: 2px $ky-space-2;
}

.credit-summary-row__amount { flex: 0 0 auto; text-align: right; }
.credit-summary-row__number { color: $ky-primary-strong; font-size: $ky-font-size-display-md; font-weight: $ky-font-weight-black; }
.credit-summary-row__unit { color: $ky-text-secondary; font-size: $ky-font-size-xs; margin-left: $ky-space-1; }

.credit-summary-row__metrics {
    color: $ky-text-secondary;
    flex-wrap: wrap;
    font-size: $ky-font-size-xs;
    gap: $ky-space-2 $ky-space-3;
    margin-top: $ky-space-3;
}

.credit-summary-row__expiry--warning { color: $ky-gold-foreground; font-weight: $ky-font-weight-semibold; }
.credit-summary-row__expiry--expired { color: $ky-danger; font-weight: $ky-font-weight-semibold; }

.credit-summary-row__footer {
    border-top: 1px solid $ky-line-tinted;
    color: $ky-text-muted;
    font-size: $ky-font-size-xs;
    margin-top: $ky-space-3;
    padding-top: $ky-space-3;
}
</style>
