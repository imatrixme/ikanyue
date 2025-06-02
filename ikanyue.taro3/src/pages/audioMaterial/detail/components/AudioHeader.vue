<template>
    <view class="audio-header">
        <nut-image
            class="audio-cover"
            :src="audioDetail.coverImage || defaultCoverImage"
            mode="aspectFill"
            lazy-load
            show-loading
        />
        <view class="header-content">
            <view class="header-title-row">
                <text class="header-title">{{ audioDetail.title }}</text>
            </view>

            <view class="header-meta">
                <view class="meta-item">
                    <text class="meta-icon">📂</text>
                    <text>{{ audioDetail.type || '未分类' }}</text>
                </view>
                <view class="meta-item">
                    <text class="meta-icon">🕐</text>
                    <text>{{ formatDate(audioDetail.publishedAt) }}</text>
                </view>
                <view v-if="audioDetail.difficulty" class="meta-item">
                    <text class="meta-icon">⭐</text>
                    <text>难度{{ audioDetail.difficulty }}</text>
                </view>
            </view>

            <view class="audio-tags" v-if="audioDetail.tags && audioDetail.tags.length">
                <text v-for="(tag, index) in audioDetail.tags.split(',')" :key="index" class="audio-tag">
                    {{ tag.trim() }}
                </text>
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

// 配置
const defaultCoverImage = 'https://via.placeholder.com/300x300/FF4949/FFFFFF?text=Audio';

// 方法
const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};
</script>

<style lang="scss" scoped>
.audio-header {
    position: relative;
    height: 280px;
    overflow: hidden;
}

.audio-cover {
    width: 100%;
    height: 100%;
    filter: blur(8px);
    transform: scale(1.1);
}

.header-content {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.6));
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: #fff;
    padding: 20px;
    text-align: center;
}

.header-title-row {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    width: 100%;
    position: relative;
    margin-bottom: 16px;
}

.header-title {
    font-size: 22px;
    font-weight: bold;
    line-height: 1.4;
    max-width: 80%;
    text-align: center;
}

.header-meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 16px;
    margin-bottom: 16px;
}

.meta-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 14px;

    text {
        line-height: 1;
    }
}

.meta-icon {
    font-size: 12px;
}

.audio-tags {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
}

.audio-tag {
    font-size: 12px;
    background-color: rgba(255, 255, 255, 0.2);
    color: #fff;
    padding: 4px 12px;
    border-radius: 16px;
    backdrop-filter: blur(4px);
}
</style>
