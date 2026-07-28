<template>
    <view class="validity-notice" :class="`validity-notice--${tone}`">
        <view class="validity-notice__icon">
            <app-icon :name="iconName" size="lg" />
        </view>
        <view class="validity-notice__copy">
            <text class="validity-notice__title">{{ title }}</text>
            <text v-if="description" class="validity-notice__description">{{ description }}</text>
        </view>
    </view>
</template>

<script>
import AppIcon from './AppIcon.vue';

export default {
    name: 'ValidityNotice',
    components: { AppIcon },
    props: {
        description: { type: String, default: '' },
        icon: { type: String, default: '' },
        title: { type: String, required: true },
        tone: { type: String, default: 'info' },
    },
    computed: {
        iconName() { return this.icon || (this.tone === 'warning' ? 'course-alert' : 'course-validity'); },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.validity-notice { align-items: flex-start; background: $ky-primary-wash; border: 1px solid $ky-primary-line; border-radius: $ky-radius-md; display: flex; padding: $ky-space-3; }
.validity-notice--warning { background: $ky-gold-wash; border-color: $ky-gold-line; }
.validity-notice__icon { align-items: center; display: flex; flex: 0 0 26px; height: 26px; justify-content: center; }
.validity-notice__copy { min-width: 0; padding-left: $ky-space-3; }
.validity-notice__title,
.validity-notice__description { display: block; }
.validity-notice__title { color: $ky-ink-strong; font-size: $ky-font-size-body-sm; font-weight: $ky-font-weight-bold; }
.validity-notice__description { color: $ky-text-secondary; font-size: $ky-font-size-xs; line-height: $ky-leading-readable; margin-top: $ky-space-1; }
</style>
