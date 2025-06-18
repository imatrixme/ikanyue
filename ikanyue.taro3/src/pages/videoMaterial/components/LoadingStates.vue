<template>
    <view class="loading-states">
        <!-- 加载状态 -->
        <view v-if="type === 'loading'" class="state-container loading">
            <view class="loading-spinner">
                <nut-icon name="loading" size="32" color="#ff4949" class="spin" />
            </view>
            <text class="state-text">加载中...</text>
        </view>

        <!-- 错误状态 -->
        <view v-else-if="type === 'error'" class="state-container error">
            <view class="error-icon">
                <nut-icon name="service" size="48" color="#ef4444" />
            </view>
            <text class="state-text error-text">网络连接失败</text>
            <text class="state-desc">请检查网络连接后重试</text>
            <nut-button type="primary" size="small" @click="handleRetry" class="retry-btn"> 重新加载 </nut-button>
        </view>

        <!-- 空状态 -->
        <view v-else-if="type === 'empty'" class="state-container empty">
            <view class="empty-icon">
                <nut-icon name="photograph" size="48" color="#9ca3af" />
            </view>
            <text class="state-text empty-text">{{ emptyDescription || '暂无内容' }}</text>
            <text class="state-desc">当前没有找到相关内容</text>
        </view>
    </view>
</template>

<script setup>
// Props
const props = defineProps({
    type: {
        type: String,
        required: true,
        validator: (value) => ['loading', 'error', 'empty'].includes(value),
    },
    emptyDescription: {
        type: String,
        default: '暂无内容',
    },
});

// Emits
const emit = defineEmits(['retry']);

// 方法
const handleRetry = () => {
    emit('retry');
};
</script>

<style lang="scss">
@import '@nutui/nutui-taro/dist/styles/variables.scss';

.loading-states {
    width: 100%;
    height: 100%;
    min-height: 400px;
}

.state-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 32px;
    height: 100%;
    min-height: 400px;
    box-sizing: border-box;
}

.loading-spinner {
    margin-bottom: 16px;

    .spin {
        animation: spin 1s linear infinite;
    }
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

.error-icon,
.empty-icon {
    margin-bottom: 16px;
    opacity: 0.8;
}

.state-text {
    font-size: 16px;
    font-weight: 500;
    color: #374151;
    margin-bottom: 8px;
    text-align: center;
}

.error-text {
    color: #ef4444;
}

.empty-text {
    color: #6b7280;
}

.state-desc {
    font-size: 14px;
    color: #9ca3af;
    text-align: center;
    line-height: 1.5;
    margin-bottom: 24px;
}

.retry-btn {
    background: linear-gradient(135deg, #ff6b6b, #ff4949);
    border: none;
    border-radius: 8px;
    padding: 8px 24px;
    font-size: 14px;
    font-weight: 500;
    color: #ffffff;
    min-width: 120px;

    &:active {
        transform: scale(0.98);
    }
}
</style>
