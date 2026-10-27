<template>
    <view class="sticky-action-bar" :class="{ 'sticky-action-bar--inset': inset }">
        <slot />
    </view>
</template>

<script>
export default {
    name: 'StickyActionBar',
    props: {
        inset: { type: Boolean, default: false },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.sticky-action-bar {
    background: $ky-surface;
    border-top: 1px solid $ky-line;
    bottom: 0;
    box-sizing: border-box;
    left: 0;
    padding: $ky-space-3;
    padding-bottom: calc(#{$ky-space-3} + env(safe-area-inset-bottom));
    position: fixed;
    right: 0;
    z-index: $ky-z-sticky;
}

.sticky-action-bar--inset {
    background: transparent;
    border-top: 0;
}
</style>
