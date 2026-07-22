<template>
    <view class="page-header" :class="[`page-header--${tone}`, { 'page-header--center': centered }]">
        <image
            v-if="tone === 'immersive'"
            class="page-header__texture"
            :src="heroTexture"
            mode="aspectFill"
            aria-hidden="true"
        />
        <slot name="leading" />
        <view class="page-header__copy">
            <text v-if="eyebrow" class="page-header__eyebrow">{{ eyebrow }}</text>
            <text class="page-header__title">{{ title }}</text>
            <text v-if="subtitle" class="page-header__subtitle">{{ subtitle }}</text>
        </view>
        <slot />
    </view>
</template>

<script>
import heroTexture from '../imgs/textures/hero-music.png';

export default {
    name: 'PageHeader',
    data() {
        return { heroTexture };
    },
    props: {
        centered: { type: Boolean, default: false },
        eyebrow: { type: String, default: '' },
        subtitle: { type: String, default: '' },
        title: { type: String, required: true },
        tone: { type: String, default: 'immersive' },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';
@import '../styles/hero-texture';

.page-header {
    @include ky-hero-texture-host;
    box-sizing: border-box;
    padding: $ky-space-6 $ky-space-4;
}

.page-header--immersive {
    color: $ky-on-primary;
    background-color: $ky-immersive-surface;
}

.page-header__texture {
    @include ky-hero-texture-layer;
}

.page-header > view {
    position: relative;
    z-index: 1;
}

.page-header--canvas {
    color: $ky-ink-strong;
    background: $ky-canvas;
}

.page-header--center {
    align-items: center;
    display: flex;
    flex-direction: column;
    text-align: center;
}

.page-header__eyebrow,
.page-header__title,
.page-header__subtitle {
    display: block;
}

.page-header__eyebrow {
    font-size: $ky-font-size-xs;
    font-weight: $ky-font-weight-bold;
    opacity: 0.74;
}

.page-header__title {
    font-size: $ky-font-size-heading;
    font-weight: $ky-font-weight-black;
    line-height: $ky-leading-tight;
}

.page-header__eyebrow + .page-header__title {
    margin-top: $ky-space-2;
}

.page-header__subtitle {
    font-size: $ky-font-size-sm;
    line-height: $ky-leading-readable;
    margin-top: $ky-space-2;
    opacity: 0.76;
}
</style>
