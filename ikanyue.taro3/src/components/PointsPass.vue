<template>
    <view class="points-pass" :class="{ 'points-pass--compact': compact }">
        <image class="points-pass__texture" :src="heroTexture" mode="aspectFill" aria-hidden="true" />
        <view class="points-pass__content">
            <text class="points-pass__label">{{ label }}</text>
            <view class="points-pass__balance">
                <text class="points-pass__value">{{ balance }}</text>
                <text class="points-pass__unit">PT</text>
            </view>
            <text v-if="caption" class="points-pass__caption">{{ caption }}</text>
        </view>
        <view class="points-pass__staff" aria-hidden="true">
            <view v-for="line in 5" :key="line" class="points-pass__staff-line" />
        </view>
    </view>
</template>

<script>
import heroTexture from '../imgs/textures/hero-music.png';

export default {
    data() {
        return { heroTexture };
    },
    props: {
        balance: { type: [Number, String], default: 0 },
        caption: { type: String, default: '' },
        compact: { type: Boolean, default: false },
        label: { type: String, default: '可用积分' },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';
@import '../styles/hero-texture';

.points-pass {
    background: $ky-primary-strong;
    border: 1px solid $ky-primary-pressed;
    border-radius: $ky-radius-lg;
    box-shadow: $ky-shadow-raised;
    box-sizing: border-box;
    color: $ky-on-primary;
    min-height: 136px;
    overflow: hidden;
    padding: 20px;
    position: relative;
}

.points-pass__texture {
    @include ky-hero-texture-layer;
}

.points-pass__content {
    position: relative;
    z-index: 2;
}

.points-pass__label,
.points-pass__caption {
    display: block;
}

.points-pass__label {
    font-size: $ky-font-size-body-sm;
    font-weight: $ky-font-weight-semibold;
    opacity: 0.82;
}

.points-pass__balance {
    align-items: baseline;
    display: flex;
    margin-top: $ky-space-2;
}

.points-pass__value {
    color: $ky-yellow;
    font-size: $ky-font-size-balance;
    font-weight: $ky-font-weight-black;
    line-height: $ky-leading-none;
}

.points-pass__unit {
    color: $ky-yellow-soft;
    font-size: $ky-font-size-body;
    font-weight: $ky-font-weight-bold;
    margin-left: $ky-space-2;
}

.points-pass__caption {
    font-size: $ky-font-size-xs;
    margin-top: $ky-space-3;
    opacity: 0.68;
}

.points-pass__staff {
    bottom: 18px;
    left: 42%;
    opacity: 0.16;
    position: absolute;
    right: -10px;
    transform: rotate(-4deg);
    z-index: 1;
}

.points-pass__staff-line {
    border-top: 1px solid $ky-on-primary;
    margin-top: 5px;
}

.points-pass--compact {
    box-shadow: $ky-shadow-card;
    min-height: 112px;
    padding: 16px;
}

.points-pass--compact .points-pass__value {
    font-size: $ky-font-size-balance-sm;
}
</style>
