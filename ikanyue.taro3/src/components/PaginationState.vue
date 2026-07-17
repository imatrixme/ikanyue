<template>
    <view v-if="visible" class="pagination-state">
        <text v-if="loading">正在加载更多</text>
        <text v-else-if="hasMore">已加载 {{ loaded }} / {{ total }}</text>
        <text v-else>{{ completeLabel }}</text>
    </view>
</template>

<script>
export default {
    name: 'PaginationState',
    props: {
        completeLabel: { type: String, default: '已显示全部内容' },
        hasMore: { type: Boolean, default: false },
        loaded: { type: Number, default: 0 },
        loading: { type: Boolean, default: false },
        total: { type: Number, default: 0 },
        visible: { type: Boolean, default: true },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.pagination-state {
    color: $ky-text-muted;
    font-size: $ky-font-size-xs;
    padding: $ky-space-4 0 $ky-space-2;
    text-align: center;
}
</style>
