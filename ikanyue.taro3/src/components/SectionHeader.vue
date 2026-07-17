<template>
    <view class="section-header">
        <view class="section-header__copy">
            <text class="section-header__title">{{ title }}</text>
            <text v-if="subtitle" class="section-header__subtitle">{{ subtitle }}</text>
        </view>
        <view v-if="actionLabel" class="section-header__action" @tap="$emit('action')">
            <text>{{ actionLabel }}</text>
            <app-icon name="chevron-primary" :size="13" />
        </view>
    </view>
</template>

<script>
import AppIcon from './AppIcon.vue';

export default {
    name: 'SectionHeader',
    components: { AppIcon },
    emits: ['action'],
    props: {
        actionLabel: { type: String, default: '' },
        subtitle: { type: String, default: '' },
        title: { type: String, required: true },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.section-header {
    align-items: flex-end;
    display: flex;
    justify-content: space-between;
    min-height: 34px;
}

.section-header__copy {
    min-width: 0;
}

.section-header__title,
.section-header__subtitle {
    display: block;
}

.section-header__title {
    color: $ky-ink-strong;
    font-size: $ky-font-size-section;
    font-weight: $ky-font-weight-black;
    line-height: $ky-leading-tight;
}

.section-header__subtitle {
    color: $ky-text-secondary;
    font-size: $ky-font-size-sm;
    margin-top: $ky-space-1;
}

.section-header__action {
    align-items: center;
    color: $ky-primary-strong;
    display: flex;
    flex-shrink: 0;
    font-size: $ky-font-size-sm;
    font-weight: $ky-font-weight-bold;
    gap: $ky-space-1;
    min-height: 30px;
    padding-left: $ky-space-3;
}
</style>
