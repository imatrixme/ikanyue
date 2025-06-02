<template>
    <view class="audio-content-wrapper">
        <!-- 音频描述 -->
        <view class="description-section" v-if="audioDetail.description">
            <view class="content-title">
                <nut-icon name="text" size="16" color="#333333" />
                <text>音频描述</text>
            </view>
            <view class="content-text" v-html="audioDetail.description"></view>
        </view>

        <!-- 音频信息 -->
        <view class="audio-info">
            <view class="content-title">
                <nut-icon name="setting" size="16" color="#333333" />
                <text>音频信息</text>
            </view>
            <view class="info-grid">
                <view class="info-item">
                    <text class="info-label">时长</text>
                    <text class="info-value">{{ formatTime(audioDetail.duration) }}</text>
                </view>
                <view class="info-item">
                    <text class="info-label">类型</text>
                    <text class="info-value">{{ audioDetail.type || '未分类' }}</text>
                </view>
                <view class="info-item" v-if="audioDetail.language">
                    <text class="info-label">语言</text>
                    <text class="info-value">{{ audioDetail.language }}</text>
                </view>
                <view class="info-item" v-if="audioDetail.difficulty">
                    <text class="info-label">难度</text>
                    <text class="info-value">{{ audioDetail.difficulty }}级</text>
                </view>
                <view class="info-item">
                    <text class="info-label">发布时间</text>
                    <text class="info-value">{{ formatDate(audioDetail.publishedAt) }}</text>
                </view>
            </view>
        </view>

        <!-- 内容展示 -->
        <view class="audio-content" v-if="audioDetail.content">
            <view class="content-title">
                <nut-icon name="list" size="16" color="#333333" />
                <text>详细内容</text>
            </view>
            <view class="content-text" v-html="audioDetail.content"></view>
        </view>

        <!-- 相关信息 -->
        <view class="audio-info" v-if="audioDetail.instructor">
            <view class="content-title">
                <nut-icon name="user" size="16" color="#333333" />
                <text>相关信息</text>
            </view>
            <view class="info-grid">
                <view v-if="audioDetail.instructor" class="info-item">
                    <text class="info-label">讲师:</text>
                    <text class="info-value">{{ audioDetail.instructor }}</text>
                </view>
            </view>
        </view>
    </view>
</template>

<script setup>
// Props
const props = defineProps({
    audioDetail: {
        type: Object,
        required: true,
    },
});

// 方法
const formatTime = (seconds) => {
    if (!seconds) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const formatDate = (date) => {
    if (!date) return '';
    const formattedDate = new Date(date).toLocaleDateString();
    return formattedDate;
};
</script>

<style lang="scss" scoped>
.audio-content-wrapper {
    padding-bottom: 20px;
}

.content-title {
    font-size: 16px;
    font-weight: bold;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #333;
}

.content-text {
    font-size: 14px;
    line-height: 1.6;
    color: #555;

    p {
        margin-bottom: 12px;
    }

    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
        margin: 16px 0 8px;
        color: #333;
    }
}

.description-section,
.audio-content,
.audio-info {
    margin: 16px;
    background-color: #fff;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.info-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.info-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;

    &:not(:last-child) {
        border-bottom: 1px solid #f0f0f0;
    }
}

.info-label {
    font-size: 14px;
    color: #666;
    font-weight: 500;
}

.info-value {
    font-size: 14px;
    color: #333;
}
</style>
