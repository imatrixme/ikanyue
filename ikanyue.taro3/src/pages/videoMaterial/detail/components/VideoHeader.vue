<template>
    <view class="video-header">
        <view class="title-section">
            <text class="video-title">{{ videoDetail.title || '视频标题' }}</text>
        </view>

        <view class="meta-section">
            <view class="meta-row">
                <view class="meta-item">
                    <nut-icon name="category" size="14" color="#6b7280" />
                    <text class="meta-text">{{ videoDetail.type || '未分类' }}</text>
                </view>
                <view class="meta-item">
                    <nut-icon name="clock" size="14" color="#6b7280" />
                    <text class="meta-text">{{ formatDate(videoDetail.publishedAt) }}</text>
                </view>
            </view>

            <view class="meta-row" v-if="videoDetail.author">
                <view class="meta-item">
                    <nut-icon name="user" size="14" color="#6b7280" />
                    <text class="meta-text">{{ videoDetail.author }}</text>
                </view>
                <view class="meta-item" v-if="videoDetail.resolution">
                    <nut-icon name="photo" size="14" color="#6b7280" />
                    <text class="meta-text">{{ videoDetail.resolution }}</text>
                </view>
            </view>

            <view class="meta-row" v-if="videoDetail.difficulty !== undefined">
                <view class="meta-item">
                    <nut-icon name="star-fill" size="14" color="#6b7280" />
                    <text class="meta-text">{{ getDifficultyText(videoDetail.difficulty) }}</text>
                </view>
                <view class="meta-item" v-if="videoDetail.language">
                    <nut-icon name="location" size="14" color="#6b7280" />
                    <text class="meta-text">{{ videoDetail.language }}</text>
                </view>
            </view>
        </view>

        <view class="tags-section" v-if="videoDetail.tags && videoDetail.tags.length">
            <text v-for="(tag, index) in parsedTags" :key="`tag-${index}`" class="tag">
                {{ tag }}
            </text>
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
const parsedTags = computed(() => {
    if (!props.videoDetail.tags) return [];

    if (typeof props.videoDetail.tags === 'string') {
        return props.videoDetail.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter((tag) => tag);
    }

    if (Array.isArray(props.videoDetail.tags)) {
        return props.videoDetail.tags;
    }

    return [];
});

// 方法
const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};

const getDifficultyText = (level) => {
    const difficulties = ['', '入门', '初级', '中级', '高级', '专家'];
    return difficulties[level] || '未知';
};
</script>

<style lang="scss">
@import '@nutui/nutui-taro/dist/styles/variables.scss';

.video-header {
    background: #ffffff;
    border-radius: 16px;
    padding: 20px;
    margin: 16px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.title-section {
    margin-bottom: 16px;
}

.video-title {
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
    line-height: 1.4;
    display: block;
}

.meta-section {
    margin-bottom: 16px;
}

.meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 8px;

    &:last-child {
        margin-bottom: 0;
    }
}

.meta-item {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
}

.meta-text {
    font-size: 14px;
    color: #6b7280;
    line-height: 1.2;
}

.tags-section {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.tag {
    background: linear-gradient(135deg, #f3f4f6, #e5e7eb);
    color: #6b7280;
    border-radius: 12px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 500;
    border: 1px solid #e5e7eb;
    line-height: 1;
}
</style>
