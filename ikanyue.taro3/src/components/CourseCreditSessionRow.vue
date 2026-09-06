<template>
    <view class="credit-session-row">
        <view class="credit-session-row__date">
            <text class="credit-session-row__day">{{ day }}</text>
            <text class="credit-session-row__month">{{ month }}</text>
        </view>
        <view class="credit-session-row__body">
            <view class="credit-session-row__header">
                <text class="credit-session-row__title">{{ record.session.title || '课程安排' }}</text>
                <text class="credit-session-row__status" :class="`credit-session-row__status--${presentation.tone}`">
                    {{ presentation.label }}
                </text>
            </view>
            <text class="credit-session-row__meta">{{ creditName }} · {{ record.requiredQuantity }} 课时</text>
            <text class="credit-session-row__meta">{{ timeCopy }} · {{ record.session.location || '地点待定' }}</text>
            <view
                v-if="presentation.action !== 'none'"
                class="credit-session-row__action"
                @tap.stop="$emit('action', record, presentation.action)"
            >
                {{ presentation.action === 'consent' ? '查看兑换并预约' : '预约这节课' }}
            </view>
        </view>
    </view>
</template>

<script>
import { formatDateTime, normalizeCreditType, sessionPresentation } from '../pages/courseCredits/pageLogic';

export default {
    name: 'CourseCreditSessionRow',
    emits: ['action'],
    props: { record: { type: Object, required: true } },
    computed: {
        date() { return this.record.session?.startAt ? new Date(this.record.session.startAt) : null; },
        creditName() { return normalizeCreditType(this.record.requiredCreditType).name; },
        day() { return this.date && !Number.isNaN(this.date.getTime()) ? String(this.date.getDate()).padStart(2, '0') : '--'; },
        month() { return this.date && !Number.isNaN(this.date.getTime()) ? `${this.date.getMonth() + 1}月` : '待定'; },
        presentation() { return sessionPresentation(this.record); },
        timeCopy() { return formatDateTime(this.record.session?.startAt); },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.credit-session-row { align-items: stretch; background: $ky-surface; border-bottom: 1px solid $ky-line-tinted; display: flex; padding: $ky-space-4; }
.credit-session-row:last-child { border-bottom: 0; }
.credit-session-row__date { align-items: center; border-right: 1px solid $ky-primary-divider; display: flex; flex: 0 0 48px; flex-direction: column; justify-content: center; padding-right: $ky-space-3; }
.credit-session-row__day { color: $ky-primary-strong; font-size: $ky-font-size-display-sm; font-weight: $ky-font-weight-black; }
.credit-session-row__month { color: $ky-text-muted; font-size: $ky-font-size-xs; }
.credit-session-row__body { flex: 1; margin-left: $ky-space-3; min-width: 0; }
.credit-session-row__header { align-items: flex-start; display: flex; justify-content: space-between; }
.credit-session-row__title { color: $ky-ink-strong; font-size: $ky-font-size-body-lg; font-weight: $ky-font-weight-bold; max-width: 62%; }
.credit-session-row__status { background: $ky-muted-surface; border-radius: $ky-radius-sm; color: $ky-text-secondary; font-size: $ky-font-size-2xs; padding: 3px $ky-space-2; }
.credit-session-row__status--success { background: $ky-success-soft; color: $ky-success; }
.credit-session-row__status--warning { background: $ky-yellow-soft; color: $ky-gold-foreground; }
.credit-session-row__status--danger { background: $ky-danger-soft; color: $ky-danger; }
.credit-session-row__meta { color: $ky-text-muted; display: block; font-size: $ky-font-size-xs; margin-top: $ky-space-1; }
.credit-session-row__action { border-top: 1px solid $ky-line-tinted; color: $ky-primary-strong; font-size: $ky-font-size-body-sm; font-weight: $ky-font-weight-bold; margin-top: $ky-space-3; padding-top: $ky-space-3; }
</style>
