<template>
    <view class="validity-notice" :class="`validity-notice--${tone}`">
        <view class="validity-notice__mark" />
        <view class="validity-notice__copy">
            <text class="validity-notice__title">{{ title }}</text>
            <text v-if="description" class="validity-notice__description">{{ description }}</text>
        </view>
    </view>
</template>

<script>
export default {
    name: 'ValidityNotice',
    props: {
        description: { type: String, default: '' },
        title: { type: String, required: true },
        tone: { type: String, default: 'info' },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.validity-notice { align-items: flex-start; background: $ky-primary-wash; border: 1px solid $ky-primary-line; border-radius: $ky-radius-md; display: flex; padding: $ky-space-3; }
.validity-notice--warning { background: $ky-gold-wash; border-color: $ky-gold-line; }
.validity-notice__mark { background: $ky-primary; border-radius: 50%; flex: 0 0 8px; height: 8px; margin-top: $ky-space-2; width: 8px; }
.validity-notice--warning .validity-notice__mark { background: $ky-danger; }
.validity-notice__copy { min-width: 0; padding-left: $ky-space-3; }
.validity-notice__title,
.validity-notice__description { display: block; }
.validity-notice__title { color: $ky-ink-strong; font-size: $ky-font-size-body-sm; font-weight: $ky-font-weight-bold; }
.validity-notice__description { color: $ky-text-secondary; font-size: $ky-font-size-xs; line-height: $ky-leading-readable; margin-top: $ky-space-1; }
</style>
