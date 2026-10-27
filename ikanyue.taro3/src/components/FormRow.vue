<template>
    <view class="form-row">
        <text class="form-row__label">{{ label }}</text>
        <view class="form-row__control"><slot /></view>
    </view>
</template>

<script>
export default {
    name: 'FormRow',
    props: {
        label: { type: String, required: true },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.form-row {
    align-items: center;
    box-sizing: border-box;
    display: flex;
    min-height: 58px;
    padding: 0 $ky-space-4;
}

.form-row + .form-row {
    border-top: 1px solid $ky-line;
}

.form-row__label {
    color: $ky-ink-strong;
    flex-shrink: 0;
    font-size: $ky-font-size-body;
    font-weight: $ky-font-weight-semibold;
    width: 76px;
}

.form-row__control {
    flex: 1;
    min-width: 0;
}
</style>
