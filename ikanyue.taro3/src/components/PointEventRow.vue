<template>
    <view class="point-event-row" :class="{ 'point-event-row--spend': spending }">
        <view class="point-event-row__rail"><view class="point-event-row__dot" /></view>
        <view class="point-event-row__body">
            <text class="point-event-row__title">{{ title }}</text>
            <text class="point-event-row__reason">{{ reason }}</text>
            <text v-if="remark && remark !== reason" class="point-event-row__remark">{{ remark }}</text>
            <text class="point-event-row__meta">{{ meta }}</text>
        </view>
        <view class="point-event-row__amount">
            <text class="point-event-row__delta">{{ delta }}</text>
            <text class="point-event-row__balance">余额 {{ balance }}</text>
        </view>
    </view>
</template>

<script>
export default {
    name: 'PointEventRow',
    props: {
        balance: { type: [Number, String], default: 0 },
        delta: { type: String, required: true },
        meta: { type: String, default: '' },
        reason: { type: String, default: '' },
        remark: { type: String, default: '' },
        spending: { type: Boolean, default: false },
        title: { type: String, required: true },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.point-event-row {
    background: $ky-surface;
    border: 1px solid $ky-line;
    border-radius: $ky-radius-lg;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    min-height: 96px;
    padding: $ky-space-3;
}

.point-event-row + .point-event-row { margin-top: $ky-space-2; }
.point-event-row__rail { position: relative; }
.point-event-row__rail::after { background: $ky-primary-line; bottom: -$ky-space-3; content: ''; left: 6px; position: absolute; top: 12px; width: 1px; }
.point-event-row:last-child .point-event-row__rail::after { display: none; }
.point-event-row__dot { background: $ky-primary; border: 3px solid $ky-primary-soft; border-radius: 50%; height: 8px; margin-top: 3px; width: 8px; }
.point-event-row--spend .point-event-row__dot { background: $ky-danger; border-color: $ky-danger-soft; }
.point-event-row__body { min-width: 0; padding-right: $ky-space-3; }
.point-event-row__title, .point-event-row__reason, .point-event-row__remark, .point-event-row__meta, .point-event-row__delta, .point-event-row__balance { display: block; }
.point-event-row__title { color: $ky-ink-strong; font-size: $ky-font-size-body; font-weight: $ky-font-weight-black; }
.point-event-row__reason, .point-event-row__remark { color: $ky-text-secondary; font-size: $ky-font-size-xs; margin-top: $ky-space-1; }
.point-event-row__meta, .point-event-row__balance { color: $ky-text-muted; font-size: $ky-font-size-2xs; margin-top: $ky-space-2; }
.point-event-row__amount { text-align: right; }
.point-event-row__delta { color: $ky-primary-strong; font-size: $ky-font-size-subtitle; font-weight: $ky-font-weight-black; }
.point-event-row--spend .point-event-row__delta { color: $ky-danger; }
</style>
