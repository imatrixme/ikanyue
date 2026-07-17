<template>
    <view class="segmented-control">
        <view
            v-for="option in options"
            :key="option.value"
            class="segmented-control__item"
            :class="{ 'segmented-control__item--active': modelValue === option.value }"
            @tap="selectOption(option.value)"
        >
            {{ option.label }}
        </view>
    </view>
</template>

<script>
export default {
    name: 'SegmentedControl',
    emits: ['change', 'update:modelValue'],
    props: {
        modelValue: { type: [Number, String], default: '' },
        options: { type: Array, required: true },
    },
    methods: {
        selectOption(value) {
            this.$emit('update:modelValue', value);
            this.$emit('change', value);
        },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.segmented-control {
    background: $ky-muted-surface;
    border: 1px solid $ky-line-tinted;
    border-radius: $ky-radius-md;
    display: flex;
    padding: 2px;
}

.segmented-control__item {
    align-items: center;
    border-radius: $ky-radius-sm;
    color: $ky-text-secondary;
    display: flex;
    flex: 1;
    font-size: $ky-font-size-sm;
    font-weight: $ky-font-weight-semibold;
    height: $ky-control-height-compact;
    justify-content: center;
    min-width: 0;
    transition: background-color $ky-motion-fast ease, color $ky-motion-fast ease;
}

.segmented-control__item + .segmented-control__item {
    margin-left: 2px;
}

.segmented-control__item--active {
    background: $ky-primary-strong;
    color: $ky-on-primary;
}
</style>
