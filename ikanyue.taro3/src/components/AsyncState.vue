<template>
    <view class="async-state" :class="`async-state--${state}`">
        <view v-if="state === 'loading'" class="async-state__loading">
            <view class="async-state__spinner" />
            <text>{{ title || '正在加载' }}</text>
        </view>
        <empty-state
            v-else
            :action-label="actionLabel"
            :compact="compact"
            :description="description"
            :kind="kind"
            :title="title"
            @action="$emit('action')"
        />
    </view>
</template>

<script>
import EmptyState from './EmptyState.vue';

export default {
    name: 'AsyncState',
    components: { EmptyState },
    emits: ['action'],
    props: {
        actionLabel: { type: String, default: '' },
        compact: { type: Boolean, default: false },
        description: { type: String, default: '' },
        kind: { type: String, default: 'activities' },
        state: { type: String, required: true },
        title: { type: String, default: '' },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.async-state__loading {
    align-items: center;
    color: $ky-text-muted;
    display: flex;
    flex-direction: column;
    font-size: $ky-font-size-body-sm;
    justify-content: center;
    min-height: 140px;
}

.async-state__spinner {
    animation: ky-async-spin 0.8s linear infinite;
    border: 2px solid $ky-primary-soft;
    border-radius: 50%;
    border-top-color: $ky-primary;
    height: 22px;
    margin-bottom: $ky-space-3;
    width: 22px;
}

@keyframes ky-async-spin {
    to { transform: rotate(360deg); }
}
</style>
