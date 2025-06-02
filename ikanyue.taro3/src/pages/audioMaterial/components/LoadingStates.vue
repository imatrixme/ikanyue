<template>
    <!-- 加载中提示 -->
    <view v-if="type === 'loading'" class="state-container">
        <view class="loading-spinner"></view>
        <text class="state-text">加载中...</text>
    </view>

    <!-- 网络错误提示 -->
    <view v-else-if="type === 'error'" class="state-container">
        <view class="error-icon">⚠️</view>
        <text class="state-text">网络错误，请点击重试</text>
        <view class="retry-button" @tap="handleRetry">重新加载</view>
    </view>

    <!-- 空数据提示 -->
    <view v-else-if="type === 'empty'" class="state-container">
        <view class="empty-icon">📭</view>
        <text class="state-text">{{ emptyDescription }}</text>
    </view>
</template>

<script setup>
import { computed } from 'vue';

// Props
const props = defineProps({
    type: {
        type: String,
        required: true,
        validator: (value) => ['loading', 'error', 'empty'].includes(value),
    },
    emptyDescription: {
        type: String,
        default: '暂无数据',
    },
});

// Emits
const emit = defineEmits(['retry']);

// 方法
const handleRetry = () => {
    emit('retry');
};
</script>

<style lang="scss" scoped>
.state-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 20px;
    min-height: 50vh;
    width: 100%;
    box-sizing: border-box;
}

.state-text {
    margin-top: 16px;
    font-size: 15px;
    color: #666;
    text-align: center;
    line-height: 1.5;
}

.loading-spinner {
    width: 36px;
    height: 36px;
    border: 3px solid #f3f3f3;
    border-top: 3px solid #ff4949;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}

.error-icon {
    font-size: 48px;
    margin-bottom: 8px;
}

.empty-icon {
    font-size: 56px;
    margin-bottom: 12px;
    opacity: 0.8;
}

.retry-button {
    margin-top: 20px;
    padding: 10px 28px;
    background-color: #ff4949;
    color: white;
    border-radius: 25px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(255, 73, 73, 0.3);

    &:active {
        transform: scale(0.95);
        background-color: #e63939;
    }
}
</style>
