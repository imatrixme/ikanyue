<template>
    <view class="empty-state" :class="[`empty-state--${kind}`, { 'empty-state--compact': compact }]">
        <image class="empty-state__illustration" :src="stateImage" mode="aspectFit" aria-hidden="true" />
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
const EMPTY_IMAGES = {
    default: require('../imgs/empty/default.png'),
    error: require('../imgs/empty/error.png'),
    network: require('../imgs/empty/network.png'),
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
        stateImage() {
            if (this.kind === 'network') return EMPTY_IMAGES.network;
            if (this.kind === 'error' || this.kind === 'image') return EMPTY_IMAGES.error;
            return EMPTY_IMAGES.default;
        },
    },
};
</script>

<style lang="scss">
@import '../styles/empty-state';
</style>
