<template>
    <view class="audio-item" @tap="handleItemClick">
        <!-- 左侧封面图 -->
        <view class="cover-wrapper">
            <image
                :src="audio.coverImage || defaultCoverImage"
                mode="aspectFill"
                class="cover-image"
                lazy-load
                @error="handleImageError"
                @load="handleImageLoad"
            />
            <view class="duration">{{ formatDuration(audio.duration) }}</view>
            <view class="play-btn">
                <nut-icon name="play-start" size="20" color="#ffffff" />
            </view>
        </view>

        <!-- 右侧内容 -->
        <view class="content-wrapper">
            <view class="title-line">
                <text class="title">{{ audio.title }}</text>
            </view>

            <view class="desc-line">
                <text class="description">{{ audio.description }}</text>
            </view>

            <view class="meta-line">
                <view class="meta-item">
                    <nut-icon name="category" size="10" color="#999999" />
                    <text class="meta-text">{{ audio.type || '未分类' }}</text>
                </view>
                <view class="meta-item">
                    <nut-icon name="clock" size="10" color="#999999" />
                    <text class="meta-text">{{ formatDate(audio.publishedAt || audio.favoriteTime) }}</text>
                </view>
                <view v-if="audio.difficulty" class="meta-item">
                    <nut-icon name="star-fill" size="10" color="#999999" />
                    <text class="meta-text">难度{{ audio.difficulty }}</text>
                </view>
            </view>

            <view class="tags-line">
                <template v-if="audio.tags && audio.tags.length">
                    <text
                        v-for="(tag, index) in audio.tags.split(',').slice(0, 3)"
                        :key="`tag-${audio.id}-${index}`"
                        class="tag"
                    >
                        {{ tag.trim() }}
                    </text>
                    <text v-if="audio.tags.split(',').length > 3" class="tag-more">
                        +{{ audio.tags.split(',').length - 3 }}
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
    audio: {
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
const defaultCoverImage = 'https://via.placeholder.com/80x80/FF4949/FFFFFF?text=Audio';

// 方法
const handleItemClick = () => {
    emit('click', props.audio);
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
</script>

<style lang="scss">
@import '@nutui/nutui-taro/dist/styles/variables.scss';

.audio-item {
    background-color: #ffffff;
    border-radius: 8px;
    margin-bottom: 12px;
    padding: 12px;
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    position: relative;
    height: 104px; /* 固定高度 */
    box-sizing: border-box;
    width: 100%; /* 确保完整宽度 */
    max-width: 100%; /* 防止超出容器 */
}

.cover-wrapper {
    width: 80px;
    height: 80px;
    border-radius: 6px;
    overflow: hidden;
    position: relative;
    flex-shrink: 0;
    margin-right: 12px;
}

.cover-image {
    width: 80px;
    height: 80px;
    display: block;
}

.duration {
    position: absolute;
    bottom: 2px;
    right: 2px;
    background-color: rgba(0, 0, 0, 0.7);
    color: #ffffff;
    border-radius: 4px;
    padding: 1px 4px;
    font-size: 10px;
    line-height: 1.2;
}

.play-btn {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 20px;
    height: 20px;
    background-color: rgba(0, 0, 0, 0.5);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.content-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 80px;
    overflow: hidden;
}

.title-line {
    margin-bottom: 4px;
}

.title {
    font-size: 14px;
    font-weight: 600;
    color: #333333;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    max-lines: 1;
}

.desc-line {
    margin-bottom: 6px;
    flex: 1;
}

.description {
    font-size: 12px;
    color: #666666;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
}

.meta-line {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 4px;
}

.meta-item {
    display: flex;
    align-items: center;
    gap: 4px;
}

.meta-text {
    font-size: 10px;
    color: #999999;
    line-height: 1.2;
}

.tags-line {
    display: flex;
    gap: 4px;
    overflow: hidden;
    white-space: nowrap;
}

.tag {
    font-size: 10px;
    background-color: #f5f5f5;
    color: #666666;
    padding: 2px 6px;
    border-radius: 6px;
    line-height: 1.2;
    flex-shrink: 0;
    white-space: nowrap;
}

.tag-more {
    font-size: 10px;
    background-color: #e5e7eb;
    color: #6b7280;
    padding: 2px 6px;
    border-radius: 6px;
    line-height: 1.2;
    flex-shrink: 0;
    white-space: nowrap;
}

/* 点击效果 */
.audio-item:active {
    transform: scale(0.98);
    transition: transform 0.1s ease;
}
</style>
