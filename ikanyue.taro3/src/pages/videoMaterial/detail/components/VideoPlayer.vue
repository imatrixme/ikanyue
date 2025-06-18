<template>
    <view class="video-player-container">
        <view class="player-wrapper">
            <video
                :id="playerId"
                class="video-player"
                :src="videoSourceUrl"
                :poster="coverImage || defaultCoverImage"
                controls
                :initial-time="0"
                show-fullscreen-btn
                show-play-btn
                show-center-play-btn
                enable-progress-gesture
                object-fit="contain"
                @error="onVideoError"
                @timeupdate="onTimeUpdate"
                @loadedmetadata="onLoadedMetadata"
                @ended="onVideoEnded"
                @play="onVideoPlay"
                @pause="onVideoPause"
                ref="videoRef"
            />

            <!-- 播放状态覆盖层 -->
            <view v-if="showPlayStatus" class="play-status-overlay">
                <view class="play-status-icon">
                    <nut-icon :name="isPlaying ? 'play-start' : 'suspend'" size="48" color="#ffffff" />
                </view>
            </view>
        </view>

        <!-- 播放控制信息 -->
        <view class="player-info">
            <view class="time-info">
                <text class="current-time">{{ formatTime(currentTime) }}</text>
                <text class="separator">/</text>
                <text class="total-time">{{ formatTime(duration) }}</text>
            </view>

            <view class="player-status">
                <text class="status-text">{{ statusText }}</text>
            </view>
        </view>
    </view>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import Taro from '@tarojs/taro';

// Props
const props = defineProps({
    videoSourceUrl: {
        type: String,
        required: true,
    },
    coverImage: {
        type: String,
        default: '',
    },
    duration: {
        type: Number,
        default: 0,
    },
});

// Emits
const emit = defineEmits(['time-update', 'play', 'pause', 'ended']);

// 响应式数据
const playerId = ref('video-player-' + Date.now());
const videoRef = ref(null);
const currentTime = ref(0);
const duration = ref(0);
const isPlaying = ref(false);
const isLoading = ref(false);
const showPlayStatus = ref(false);
const playStatusTimer = ref(null);

// 计算属性
const defaultCoverImage = 'https://via.placeholder.com/400x300/6366f1/FFFFFF?text=Video';

const statusText = computed(() => {
    if (isLoading.value) return '加载中...';
    if (isPlaying.value) return '播放中';
    return '已暂停';
});

// 监听Props变化
watch(
    () => props.duration,
    (newDuration) => {
        if (newDuration && newDuration > 0) {
            duration.value = newDuration;
        }
    }
);

// 页面生命周期
onMounted(() => {
    if (props.duration && props.duration > 0) {
        duration.value = props.duration;
    }
    console.log('[VideoPlayer] 组件挂载，视频源:', props.videoSourceUrl);
});

onUnmounted(() => {
    clearPlayStatusTimer();
});

// 方法
const formatTime = (seconds) => {
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

const showPlayStatusIcon = (isPlay) => {
    isPlaying.value = isPlay;
    showPlayStatus.value = true;

    clearPlayStatusTimer();
    playStatusTimer.value = setTimeout(() => {
        showPlayStatus.value = false;
    }, 1000);
};

const clearPlayStatusTimer = () => {
    if (playStatusTimer.value) {
        clearTimeout(playStatusTimer.value);
        playStatusTimer.value = null;
    }
};

// 事件处理
const onVideoError = (e) => {
    console.error('[VideoPlayer] 视频播放错误:', e);
    isLoading.value = false;

    Taro.showToast({
        title: '视频加载失败',
        icon: 'none',
        duration: 2000,
    });
};

const onTimeUpdate = (e) => {
    if (e.detail && typeof e.detail.currentTime === 'number') {
        currentTime.value = e.detail.currentTime;
        emit('time-update', e.detail.currentTime);
    }
};

const onLoadedMetadata = (e) => {
    console.log('[VideoPlayer] 视频元数据加载完成:', e);

    if (e.detail && typeof e.detail.duration === 'number') {
        duration.value = e.detail.duration;
    }

    isLoading.value = false;
};

const onVideoEnded = () => {
    console.log('[VideoPlayer] 视频播放结束');
    isPlaying.value = false;
    showPlayStatusIcon(false);
    emit('ended');
};

const onVideoPlay = () => {
    console.log('[VideoPlayer] 视频开始播放');
    showPlayStatusIcon(true);
    emit('play');
};

const onVideoPause = () => {
    console.log('[VideoPlayer] 视频暂停');
    showPlayStatusIcon(false);
    emit('pause');
};
</script>

<style lang="scss">
@import '@nutui/nutui-taro/dist/styles/variables.scss';

.video-player-container {
    background: #ffffff;
    border-radius: 12px;
    margin: 0px 16px 16px 16px;
    overflow: hidden;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
    overflow: hidden;
}

.player-wrapper {
    position: relative;
    width: 100%;
    height: 250px;
    background: transparent;
    border-radius: 12px;
    overflow: hidden;
}

.video-player {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    background-color: transparent;
    border-radius: 12px;
}

.play-status-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.3);
    pointer-events: none;
    z-index: 10;
    border-radius: 16px 16px 0 0;
}

.play-status-icon {
    background: rgba(0, 0, 0, 0.6);
    border-radius: 50%;
    padding: 16px;
    backdrop-filter: blur(10px);
}

.player-info {
    padding: 16px 20px;
    background: #ffffff;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.time-info {
    display: flex;
    align-items: center;
    gap: 4px;
}

.current-time,
.total-time {
    font-size: 14px;
    color: #374151;
    font-weight: 500;
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
}

.separator {
    color: #9ca3af;
    font-size: 14px;
    margin: 0 2px;
}

.player-status {
    display: flex;
    align-items: center;
}

.status-text {
    font-size: 12px;
    color: #6b7280;
    padding: 4px 8px;
    background: #f3f4f6;
    border-radius: 6px;
}
</style>
