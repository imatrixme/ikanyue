<template>
    <view class="page-chrome" :class="`page-chrome--${tone}`">
        <slot />
    </view>
</template>

<script>
export default {
    name: 'PageChrome',
    props: {
        tone: { type: String, default: 'canvas' },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.page-chrome {
    box-sizing: border-box;
    min-height: 100vh;
}

.page-chrome--canvas {
    background: $ky-canvas;
}

.page-chrome--immersive {
    background: $ky-immersive-surface;
}
</style>
