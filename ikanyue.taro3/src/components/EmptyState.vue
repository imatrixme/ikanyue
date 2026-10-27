<template>
    <view class="empty-state" :class="[`empty-state--${kind}`, { 'empty-state--compact': compact }]">
        <view class="empty-state__visual" aria-hidden="true">
            <image class="empty-state__art" :src="artSource" mode="aspectFit" />
        </view>
        <view class="empty-state__content">
            <view class="empty-state__copy">
                <text class="empty-state__title">{{ title }}</text>
                <text v-if="description" class="empty-state__description">{{ description }}</text>
            </view>
            <button v-if="actionLabel" class="empty-state__action" @tap="$emit('action')">
                {{ actionLabel }}
            </button>
        </view>
    </view>
</template>

<script>
const EMPTY_ART = {
    account: require('../imgs/empty/default-brand.png'),
    activities: require('../imgs/empty/default-brand.png'),
    default: require('../imgs/empty/default-brand.png'),
    error: require('../imgs/empty/error-brand.png'),
    image: require('../imgs/empty/error-brand.png'),
    network: require('../imgs/empty/network-brand.png'),
    points: require('../imgs/empty/default-brand.png'),
    rewards: require('../imgs/empty/default-brand.png'),
};

export default {
    name: 'EmptyState',
    emits: ['action'],
    props: {
        actionLabel: {
            type: String,
            default: '',
        },
        compact: {
            type: Boolean,
            default: false,
        },
        description: {
            type: String,
            default: '',
        },
        kind: {
            type: String,
            default: 'activities',
        },
        title: {
            type: String,
            required: true,
        },
    },
    computed: {
        artSource() {
            return EMPTY_ART[this.kind] || EMPTY_ART.default;
        },
    },
};
</script>

<style lang="scss">
@import '../styles/empty-state';
</style>
