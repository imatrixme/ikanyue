<template>
    <view class="video-content">
        <!-- 视频描述 -->
        <view class="content-section" v-if="videoDetail.description">
            <view class="section-header">
                <nut-icon name="document" size="16" color="#ff4949" />
                <text class="section-title">视频简介</text>
            </view>
            <view class="section-content">
                <text class="content-text">{{ cleanDescription(videoDetail.description) }}</text>
            </view>
        </view>

        <!-- 详细内容 -->
        <view class="content-section" v-if="videoDetail.content">
            <view class="section-header">
                <nut-icon name="menu" size="16" color="#ff4949" />
                <text class="section-title">详细内容</text>
            </view>
            <view class="section-content">
                <text class="content-text">{{ cleanDescription(videoDetail.content) }}</text>
            </view>
        </view>

        <!-- 字幕说明 -->
        <view class="content-section" v-if="videoDetail.subtitles">
            <view class="section-header">
                <nut-icon name="text" size="16" color="#ff4949" />
                <text class="section-title">字幕说明</text>
            </view>
            <view class="section-content">
                <text class="content-text">本视频提供字幕服务，可在播放器中开启查看。</text>
            </view>
        </view>

        <!-- 视频信息卡片 -->
        <view class="info-card" v-if="hasVideoInfo">
            <view class="card-header">
                <nut-icon name="info" size="16" color="#ff4949" />
                <text class="card-title">视频信息</text>
            </view>

            <view class="info-grid">
                <view class="info-item" v-if="videoDetail.duration">
                    <text class="info-label">时长</text>
                    <text class="info-value">{{ formatDuration(videoDetail.duration) }}</text>
                </view>

                <view class="info-item" v-if="videoDetail.resolution">
                    <text class="info-label">分辨率</text>
                    <text class="info-value">{{ videoDetail.resolution }}</text>
                </view>

                <view class="info-item" v-if="videoDetail.language">
                    <text class="info-label">语言</text>
                    <text class="info-value">{{ videoDetail.language }}</text>
                </view>

                <view class="info-item" v-if="videoDetail.fileSize">
                    <text class="info-label">文件大小</text>
                    <text class="info-value">{{ formatFileSize(videoDetail.fileSize) }}</text>
                </view>
            </view>
        </view>

        <!-- 学习提示 -->
        <view class="content-section" v-if="videoDetail.learningTips">
            <view class="section-header">
                <nut-icon name="tips" size="16" color="#f59e0b" />
                <text class="section-title">学习提示</text>
            </view>
            <view class="section-content">
                <text class="content-text">{{ videoDetail.learningTips }}</text>
            </view>
        </view>
    </view>
</template>

<script setup>
import { computed } from 'vue';

// Props
const props = defineProps({
    videoDetail: {
        type: Object,
        required: true,
    },
});

// 计算属性
const hasVideoInfo = computed(() => {
    return (
        props.videoDetail.duration ||
        props.videoDetail.resolution ||
        props.videoDetail.language ||
        props.videoDetail.fileSize
    );
});

// 方法
const cleanDescription = (description) => {
    if (!description) return '';

    // 移除所有HTML标签
    let cleaned = description.replace(/<[^>]+>/g, '');

    // 处理常见的HTML实体
    cleaned = cleaned
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&hellip;/g, '...');

    // 移除多余的空白字符
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
};

const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return '00:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
};

const formatFileSize = (bytes) => {
    if (!bytes || bytes <= 0) return '未知';

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
};
</script>

<style lang="scss">
@import '@nutui/nutui-taro/dist/styles/variables.scss';

.video-content {
    padding: 16px 16px 32px;
}

.content-section {
    background: #ffffff;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
}

.section-title {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
}

.section-content {
    line-height: 1.6;
}

.content-text {
    font-size: 15px;
    color: #374151;
    line-height: 1.7;
    display: block;
}

.info-card {
    background: linear-gradient(135deg, #f8fafc, #f1f5f9);
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 16px;
}

.card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
}

.card-title {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
}

.info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
}

.info-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.info-label {
    font-size: 12px;
    color: #6b7280;
    font-weight: 500;
}

.info-value {
    font-size: 14px;
    color: #1f2937;
    font-weight: 600;
}
</style>
