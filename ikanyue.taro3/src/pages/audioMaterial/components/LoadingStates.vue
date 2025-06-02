<template>
    <!-- 加载中提示 -->
    <view v-if="type === 'loading'" class="state-container">
        <view class="loading-spinner"></view>
        <text class="state-text">加载中...</text>
    </view>

    <!-- 网络错误提示 -->
    <view v-else-if="type === 'error'" class="state-container">
        <view class="error-wrapper">
            <view class="error-icon">⚠️</view>
            <view class="error-content">
                <text class="error-title">网络连接失败</text>
                <text class="error-desc">请检查网络连接后重试</text>
            </view>
        </view>
        <view class="retry-button" @tap="handleRetry">重新加载</view>
    </view>

    <!-- 空数据提示 -->
    <view v-else-if="type === 'empty'" class="state-container">
        <view class="empty-wrapper">
            <view class="empty-illustration">
                <view class="empty-circle">
                    <view class="empty-icon">🎵</view>
                </view>
                <view class="empty-waves">
                    <view class="wave wave-1"></view>
                    <view class="wave wave-2"></view>
                    <view class="wave wave-3"></view>
                </view>
            </view>
            <view class="empty-content">
                <text class="empty-title">{{ emptyDescription }}</text>
                <text class="empty-desc">{{ getEmptySubtitle() }}</text>
            </view>
        </view>
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

const getEmptySubtitle = () => {
    if (props.emptyDescription.includes('收藏')) {
        return '快去收藏您喜欢的音频内容吧';
    }
    return '暂时没有可用的音频内容';
};
</script>

<style lang="scss" scoped>
.state-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 20px;
    min-height: 60vh;
    width: 100%;
    box-sizing: border-box;
    position: relative;
    left: 0;
    right: 0;
    margin: 0 auto;
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

/* 错误状态样式 */
.error-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 24px;
}

.error-icon {
    font-size: 48px;
    margin-bottom: 16px;
}

.error-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}

.error-title {
    font-size: 18px;
    font-weight: 600;
    color: #333;
    text-align: center;
}

.error-desc {
    font-size: 14px;
    color: #666;
    text-align: center;
}

/* 空数据状态样式 */
.empty-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.empty-illustration {
    position: relative;
    margin-bottom: 32px;
}

.empty-circle {
    width: 120px;
    height: 120px;
    background: linear-gradient(135deg, #ff6b6b, #ff4949);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 32px rgba(255, 73, 73, 0.3);
    position: relative;
    z-index: 2;
}

.empty-icon {
    font-size: 48px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.empty-waves {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1;
}

.wave {
    position: absolute;
    border: 2px solid #ff4949;
    border-radius: 50%;
    opacity: 0;
    animation: wave-animation 2s ease-out infinite;
}

.wave-1 {
    width: 140px;
    height: 140px;
    top: -70px;
    left: -70px;
    animation-delay: 0s;
}

.wave-2 {
    width: 160px;
    height: 160px;
    top: -80px;
    left: -80px;
    animation-delay: 0.5s;
}

.wave-3 {
    width: 180px;
    height: 180px;
    top: -90px;
    left: -90px;
    animation-delay: 1s;
}

@keyframes wave-animation {
    0% {
        opacity: 1;
        transform: scale(0.8);
    }
    100% {
        opacity: 0;
        transform: scale(1.2);
    }
}

.empty-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    max-width: 280px;
}

.empty-title {
    font-size: 18px;
    font-weight: 600;
    color: #333;
    text-align: center;
    line-height: 1.4;
}

.empty-desc {
    font-size: 14px;
    color: #999;
    text-align: center;
    line-height: 1.5;
}

/* 重试按钮 */
.retry-button {
    margin-top: 20px;
    padding: 12px 32px;
    background: linear-gradient(135deg, #ff6b6b, #ff4949);
    color: white;
    border-radius: 25px;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 16px rgba(255, 73, 73, 0.3);

    &:active {
        transform: scale(0.95);
        box-shadow: 0 2px 8px rgba(255, 73, 73, 0.4);
    }
}
</style>
