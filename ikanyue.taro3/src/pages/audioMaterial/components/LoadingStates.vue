<template>
    <view
        class="state-container"
        style="
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 70vh;
            padding: 60px 20px;
            background-color: #fafafa;
        "
    >
        <!-- 加载中提示 -->
        <view
            v-if="type === 'loading'"
            class="loading-state"
            style="display: flex; flex-direction: column; align-items: center; text-align: center; max-width: 320px"
        >
            <view
                class="loading-spinner"
                style="
                    width: 50px;
                    height: 50px;
                    border: 4px solid #e5e7eb;
                    border-top: 4px solid #ff4949;
                    border-radius: 50%;
                    margin-bottom: 30px;
                "
            ></view>
            <text class="loading-title" style="font-size: 18px; font-weight: bold; color: #111827; margin-bottom: 10px"
                >正在加载</text
            >
            <text class="loading-subtitle" style="font-size: 14px; color: #6b7280">请稍候...</text>
        </view>

        <!-- 网络错误提示 -->
        <view
            v-else-if="type === 'error'"
            class="error-state"
            style="display: flex; flex-direction: column; align-items: center; text-align: center; max-width: 320px"
        >
            <text class="error-icon" style="font-size: 80px; margin-bottom: 30px">📡</text>
            <text class="error-title" style="font-size: 18px; font-weight: bold; color: #111827; margin-bottom: 12px"
                >网络连接失败</text
            >
            <text
                class="error-subtitle"
                style="font-size: 14px; color: #6b7280; margin-bottom: 30px; max-width: 260px; text-align: center"
                >请检查您的网络连接后重试</text
            >
            <view
                class="retry-button"
                @tap="handleRetry"
                style="
                    background-color: #ff4949;
                    border-radius: 20px;
                    padding: 12px 30px;
                    color: #ffffff;
                    font-size: 14px;
                "
            >
                <text style="color: #ffffff">重新加载</text>
            </view>
        </view>

        <!-- 空数据提示 -->
        <view
            v-else-if="type === 'empty'"
            class="empty-state"
            style="display: flex; flex-direction: column; align-items: center; text-align: center; max-width: 320px"
        >
            <view
                class="empty-icon-wrapper"
                style="
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 30px;
                    height: 120px;
                "
            >
                <text class="empty-icon" style="font-size: 100px">🎧</text>
                <view
                    class="empty-decoration"
                    style="
                        position: absolute;
                        width: 140px;
                        height: 140px;
                        background-color: rgba(255, 73, 73, 0.1);
                        border-radius: 50%;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                    "
                ></view>
            </view>
            <text
                class="empty-title"
                style="
                    font-size: 18px;
                    font-weight: bold;
                    color: #111827;
                    margin-bottom: 12px;
                    max-width: 280px;
                    text-align: center;
                "
                >{{ emptyDescription }}</text
            >
            <text
                class="empty-subtitle"
                style="font-size: 14px; color: #6b7280; max-width: 260px; text-align: center"
                >{{ getEmptySubtitle() }}</text
            >
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
/* 只保留动画，不定义任何布局样式避免冲突 */

.loading-spinner {
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

.retry-button:active {
    background-color: #e63939 !important;
    transform: scale(0.95);
}

.empty-icon {
    animation: bounce 2s ease-in-out infinite;
}

@keyframes bounce {
    0%,
    100% {
        transform: translateY(0px);
    }
    50% {
        transform: translateY(-8px);
    }
}
</style>
