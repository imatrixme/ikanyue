<template>
    <!-- Only for pages whose title carries content (course or lesson names); the native bar already names every page. -->
    <view class="page-header" :class="{ 'page-header--center': centered }">
        <slot name="leading" />
        <view v-if="title || subtitle" class="page-header__copy">
            <text v-if="title" class="page-header__title">{{ title }}</text>
            <text v-if="subtitle" class="page-header__subtitle">{{ subtitle }}</text>
        </view>
        <slot />
    </view>
</template>

<script>
export default {
    name: 'PageHeader',
    props: {
        centered: { type: Boolean, default: false },
        subtitle: { type: String, default: '' },
        title: { type: String, default: '' },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.page-header {
    box-sizing: border-box;
    color: $ky-ink-strong;
    padding: $ky-space-5 $ky-space-4 $ky-space-2;
}

.page-header--center {
    align-items: center;
    display: flex;
    flex-direction: column;
    text-align: center;
}

.page-header__title,
.page-header__subtitle {
    display: block;
}

.page-header__title {
    font-size: $ky-font-size-heading;
    font-weight: $ky-font-weight-black;
    line-height: $ky-leading-tight;
    overflow-wrap: anywhere;
}

.page-header__subtitle {
    color: $ky-text-secondary;
    font-size: $ky-font-size-sm;
    line-height: $ky-leading-readable;
    margin-top: $ky-space-1;
}
</style>
