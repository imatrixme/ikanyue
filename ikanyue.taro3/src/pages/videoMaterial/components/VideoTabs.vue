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
    console.log('[VideoTabs] Tab切换到:', value);
    currentTab.value = value;
    emit('update:modelValue', value);
    emit('change', value);
};
</script>

<style lang="scss">
.tab-container {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    padding: 16px 16px 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    position: sticky;
    top: 0;
    z-index: 10;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}

.custom-tabs {
    display: flex;
    background: #f1f5f9;
    border-radius: 12px;
    padding: 4px;
    width: 100%;
    box-sizing: border-box;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.05);
    height: 42px;
}

.tab-item {
    flex: 1;
    text-align: center;
    padding: 8px 20px;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    color: #64748b;
    background-color: transparent;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;
    letter-spacing: 0.025em;
    display: flex;
    align-items: center;
    justify-content: center;

    &.active {
        background: linear-gradient(135deg, #ff6b6b, #ff4949);
        color: #ffffff;
        box-shadow: 0 4px 12px rgba(255, 73, 73, 0.25), 0 2px 4px rgba(255, 73, 73, 0.15);
        transform: translateY(-1px);
    }

    &:active {
        transform: scale(0.97) translateY(-1px);
    }
}
</style>
