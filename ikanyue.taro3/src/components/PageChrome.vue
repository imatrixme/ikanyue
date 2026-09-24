<template>
    <view class="page-chrome">
        <slot />
    </view>
</template>

<script>
export default {
    name: 'PageChrome',
};
</script>

<style lang="scss">
@import '../styles/tokens';

.page-chrome {
    background: $ky-canvas;
    box-sizing: border-box;
    min-height: 100vh;
}
</style>
