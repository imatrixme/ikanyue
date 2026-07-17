<template>
    <view class="media-thumb" :class="`media-thumb--${size}`">
        <image v-if="showImage && src" class="media-thumb__image" :src="src" mode="aspectFill" @error="$emit('error')" />
        <text v-else class="media-thumb__fallback">{{ fallback }}</text>
    </view>
</template>

<script>
export default {
    name: 'MediaThumb',
    emits: ['error'],
    props: {
        fallback: { type: String, default: '乐' },
        showImage: { type: Boolean, default: false },
        size: { type: String, default: 'md' },
        src: { type: String, default: '' },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.media-thumb {
    align-items: center;
    background: $ky-secondary-surface;
    border-radius: $ky-radius-md;
    color: $ky-primary-strong;
    display: flex;
    flex-shrink: 0;
    font-weight: $ky-font-weight-black;
    justify-content: center;
    overflow: hidden;
}

.media-thumb--sm { height: 48px; width: 48px; }
.media-thumb--md { height: 62px; width: 68px; }
.media-thumb--lg { height: 100%; min-height: 144px; width: 104px; }

.media-thumb__image {
    height: 100%;
    width: 100%;
}

.media-thumb__fallback {
    font-size: $ky-font-size-display-sm;
}
</style>
