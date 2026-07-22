<template>
    <view class="account-row" :class="{ 'account-row--interactive': interactive }" @tap="handleTap">
        <view v-if="icon || iconText" class="account-row__leading">
            <app-icon v-if="icon" :name="icon" size="xl" />
            <text v-else>{{ iconText }}</text>
        </view>
        <view class="account-row__copy">
            <text class="account-row__title">{{ title }}</text>
            <text v-if="description" class="account-row__description">{{ description }}</text>
        </view>
        <text v-if="value" class="account-row__value">{{ value }}</text>
        <app-icon v-if="interactive" class="account-row__arrow" name="chevron-primary" size="sm" />
    </view>
</template>

<script>
import AppIcon from './AppIcon.vue';

export default {
    components: { AppIcon },
    emits: ['select'],
    props: {
        description: { type: String, default: '' },
        icon: { type: String, default: '' },
        iconText: { type: String, default: '' },
        interactive: { type: Boolean, default: false },
        title: { type: String, required: true },
        value: { type: [Number, String], default: '' },
    },
    methods: {
        handleTap() {
            if (this.interactive) this.$emit('select');
        },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.account-row {
    align-items: center;
    background: $ky-surface;
    box-sizing: border-box;
    display: flex;
    min-height: 58px;
    padding: $ky-space-3 $ky-space-4;
}

.account-row + .account-row {
    border-top: 1px solid $ky-line;
}

.account-row--interactive:active {
    background: $ky-primary-wash;
}

.account-row__leading {
    align-items: center;
    background: $ky-secondary-surface;
    border-radius: $ky-radius-md;
    color: $ky-primary-strong;
    display: flex;
    flex: 0 0 36px;
    font-size: $ky-font-size-body-sm;
    font-weight: $ky-font-weight-black;
    height: 36px;
    justify-content: center;
    width: 36px;
}

.account-row__leading .app-icon {
    transform: scale(1.25);
}

.account-row__copy {
    flex: 1;
    min-width: 0;
    padding-left: $ky-space-3;
}

.account-row__title,
.account-row__description {
    display: block;
}

.account-row__title {
    color: $ky-ink-strong;
    font-size: $ky-font-size-body-lg;
    font-weight: $ky-font-weight-semibold;
}

.account-row__description {
    color: $ky-text-muted;
    font-size: $ky-font-size-xs;
    margin-top: $ky-space-1;
}

.account-row__value {
    color: $ky-text-secondary;
    flex-shrink: 0;
    font-size: $ky-font-size-body-sm;
    margin-left: $ky-space-3;
    max-width: 42%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.account-row__arrow {
    flex-shrink: 0;
    margin-left: $ky-space-2;
}
</style>
