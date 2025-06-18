<template>
    <view class="video-item" @tap="handleItemClick">
        <!-- 大封面图 -->
        <view class="cover-wrapper">
            <image
                :src="video.coverImageUrl || defaultCoverImage"
                mode="aspectFill"
                class="cover-image"
                lazy-load
                @error="handleImageError"
                @load="handleImageLoad"
            />
            <view class="duration">{{ formatDuration(video.duration) }}</view>
            <view class="resolution-badge" v-if="video.resolution">{{ video.resolution }}</view>
            <view class="play-btn">
                <nut-icon name="play-start" size="36" color="#ffffff" />
            </view>
        </view>

        <!-- 视频信息 -->
        <view class="content-wrapper">
            <view class="title-line">
                <text class="title">{{ video.title }}</text>
            </view>

            <view class="desc-line">
                <text class="description">{{ cleanDescription(video.description) }}</text>
            </view>

            <view class="meta-line">
                <view class="meta-item">
                    <nut-icon name="category" size="10" color="#999999" />
                    <text class="meta-text">{{ video.type || '未分类' }}</text>
                </view>
                <view class="meta-item">
                    <nut-icon name="clock" size="10" color="#999999" />
                    <text class="meta-text">{{ formatDate(video.publishedAt || video.favoriteTime) }}</text>
                </view>
                <view v-if="video.difficulty" class="meta-item">
                    <nut-icon name="star-fill" size="10" color="#999999" />
                    <text class="meta-text">难度{{ video.difficulty }}</text>
                </view>
            </view>

            <view class="tags-line">
                <template v-if="video.tags && video.tags.length">
                    <text
                        v-for="(tag, index) in video.tags.split(',').slice(0, 3)"
                        :key="`tag-${video.id}-${index}`"
                        class="tag"
                    >
                        {{ tag.trim() }}
                    </text>
                    <text v-if="video.tags.split(',').length > 3" class="tag-more">
                        +{{ video.tags.split(',').length - 3 }}
                    </text>
                </template>
            </view>
        </view>
    </view>
</template>

<script setup>
import { computed } from 'vue';

// Props
const props = defineProps({
    video: {
        type: Object,
        required: true,
    },
    isFavorited: {
        type: Boolean,
        default: false,
    },
});

// Emits
const emit = defineEmits(['click']);

// 计算属性
const defaultCoverImage = 'https://via.placeholder.com/300x200/FF4949/FFFFFF?text=Video';

// 方法
const handleItemClick = () => {
    emit('click', props.video);
};

const handleImageError = (e) => {
    // 图片加载失败时使用默认图片
    e.target.src = defaultCoverImage;
};

const handleImageLoad = () => {
    // 图片加载成功
};

const formatDuration = (seconds) => {
    if (!seconds) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date
        .getDate()
        .toString()
        .padStart(2, '0')}`;
};

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
</script>

<style lang="scss">
@import '@nutui/nutui-taro/dist/styles/variables.scss';

.video-item {
    background-color: #ffffff;
    border-radius: 12px;
    margin-bottom: 16px;
    overflow: hidden;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
    position: relative;
    width: 100%;
    max-width: 100%;
}

.cover-wrapper {
    width: 100%;
    height: 200px;
    position: relative;
    overflow: hidden;
}

.cover-image {
    width: 100%;
    height: 100%;
    display: block;
}

.duration {
    position: absolute;
    bottom: 8px;
    right: 8px;
    background-color: rgba(0, 0, 0, 0.8);
    color: #ffffff;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 12px;
    line-height: 1.2;
    font-weight: 500;
}

.resolution-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    background-color: rgba(255, 73, 73, 0.9);
    color: #ffffff;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
}

.play-btn {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 60px;
    height: 60px;
    background-color: rgba(0, 0, 0, 0.6);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(10px);
    transition: all 0.3s ease;

    &:active {
        transform: translate(-50%, -50%) scale(0.95);
    }
}

.content-wrapper {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.title-line {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 4px;
}

.title {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    flex: 1;
}

.desc-line {
    margin-bottom: 4px;
}

.description {
    font-size: 14px;
    color: #6b7280;
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}

.meta-line {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin-bottom: 4px;
}

.meta-item {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
}

.meta-text {
    font-size: 12px;
    color: #9ca3af;
    line-height: 1.2;
}

.tags-line {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
}

.tag {
    background: linear-gradient(135deg, #f3f4f6, #e5e7eb);
    color: #6b7280;
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 500;
    line-height: 1;
    border: 1px solid #e5e7eb;
}

.tag-more {
    background: #ff4949;
    color: #ffffff;
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
}
</style>
