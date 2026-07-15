<template>
    <view class="empty-state" :class="[`empty-state--${kind}`, { 'empty-state--compact': compact }]">
        <view class="empty-state__visual" aria-hidden="true">
            <app-icon :name="iconName" :size="iconSize" />
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
import AppIcon from './AppIcon.vue';

const EMPTY_ICONS = {
    account: 'empty-account',
    activities: 'empty-activities',
    default: 'empty-activities',
    error: 'empty-network',
    image: 'empty-image',
    network: 'empty-network',
    points: 'empty-points',
    rewards: 'empty-rewards',
};

export default {
    name: 'EmptyState',
    components: { AppIcon },
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
        iconName() {
            return EMPTY_ICONS[this.kind] || EMPTY_ICONS.default;
        },
        iconSize() {
            return this.compact ? 34 : 42;
        },
    },
};
</script>

<style lang="scss">
@import '../styles/empty-state';
</style>
