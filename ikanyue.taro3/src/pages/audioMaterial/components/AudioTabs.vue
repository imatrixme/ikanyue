<template>
    <view class="tab-container">
        <view class="custom-tabs">
            <view class="tab-item" :class="{ active: currentTab === 'all' }" @tap="handleTabClick('all')">
                全部材料
            </view>
            <view class="tab-item" :class="{ active: currentTab === 'favorites' }" @tap="handleTabClick('favorites')">
                我的收藏
            </view>
        </view>
    </view>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';

// Props
const props = defineProps({
    modelValue: {
        type: String,
        default: 'all',
    },
});

// Emits
const emit = defineEmits(['update:modelValue', 'change']);

// 响应式数据
const currentTab = ref('all');

// 组件挂载时初始化
onMounted(() => {
    currentTab.value = props.modelValue || 'all';
});

// 监听外部值变化
watch(
    () => props.modelValue,
    (newValue) => {
        if (newValue && newValue !== currentTab.value) {
            currentTab.value = newValue;
        }
    },
    { immediate: true }
);

// 处理Tab点击
const handleTabClick = (value) => {
    console.log('[AudioTabs] Tab切换到:', value);
    currentTab.value = value;
    emit('update:modelValue', value);
    emit('change', value);
};
</script>

<style lang="scss">
.tab-container {
    background-color: #ffffff;
    padding: 16px;
    border-bottom: 1px solid #f0f0f0;
    position: sticky;
    top: 0;
    z-index: 10;
}

.custom-tabs {
    display: flex;
    background-color: #f8f8f8;
    border-radius: 8px;
    padding: 4px;
    width: 100%;
    box-sizing: border-box;
}

.tab-item {
    flex: 1;
    text-align: center;
    padding: 12px 20px;
    border-radius: 6px;
    font-size: 15px;
    font-weight: 500;
    color: #666666;
    background-color: transparent;
    transition: all 0.3s ease;
    white-space: nowrap;

    &.active {
        background-color: #ff4949;
        color: #ffffff;
        box-shadow: 0 2px 8px rgba(255, 73, 73, 0.3);
    }

    &:active {
        transform: scale(0.96);
    }
}
</style>
