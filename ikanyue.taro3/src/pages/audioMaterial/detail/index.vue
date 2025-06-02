<template>
    <view class="audio-detail-page">
        <!-- 加载中 -->
        <view v-if="loading" class="loading-container">
            <view class="loading-spinner"></view>
            <text class="loading-text">加载中...</text>
        </view>

        <!-- 网络错误 -->
        <view v-else-if="error" class="error-container">
            <view class="error-icon">⚠️</view>
            <text class="error-text">获取音频详情失败</text>
            <view class="retry-btn" @tap="loadAudioDetail">重新加载</view>
        </view>

        <!-- 内容展示 -->
        <view v-else class="content-wrapper">
            <!-- 固定收藏按钮 -->
            <view class="fixed-favorite-btn" @tap="toggleFavorite">
                <text class="favorite-text">{{ isFavorited ? '❤️' : '🤍' }}</text>
                <text class="favorite-label">{{ isFavorited ? '已收藏' : '收藏' }}</text>
            </view>

            <!-- 头部区域 -->
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

            <!-- 音频播放器 -->
            <view class="audio-player">
                <view class="player-controls">
                    <view class="player-btn secondary" @tap="handleRewind">
                        <text class="control-icon">⏪</text>
                    </view>

                    <view class="player-btn primary" @tap="togglePlay" :class="{ playing: isPlaying }">
                        <text class="control-icon">{{ isPlaying ? '⏸️' : '▶️' }}</text>
                    </view>

                    <view class="player-btn secondary" @tap="handleForward">
                        <text class="control-icon">⏩</text>
                    </view>
                </view>

                <view class="player-progress">
                    <nut-range
                        :model-value="currentTime"
                        :max="duration"
                        @update:model-value="onSliderDrag"
                        @change="onSliderRelease"
                        :step="1"
                        active-color="#ff4949"
                        inactive-color="#e5e5e5"
                        button-color="#ff4949"
                        :disabled="!audioDetail.audioSource"
                    />
                    <view class="player-time">
                        <text>{{ formatTime(currentTime) }}</text>
                        <text>{{ formatTime(duration) }}</text>
                    </view>
                </view>

                <!-- 播放模式和倍速控制 -->
                <view class="player-controls-extra">
                    <view class="speed-control">
                        <view class="speed-options">
                            <text
                                v-for="speed in speedOptions"
                                :key="speed"
                                :class="['speed-option', { active: playbackRate === speed }]"
                                @tap="changePlaybackRate(speed)"
                            >
                                {{ speed }}x
                            </text>
                        </view>
                    </view>
                </view>
            </view>

            <!-- 描述信息 -->
            <view class="description-section" v-if="audioDetail.description">
                <view class="content-title">
                    <text class="content-icon">📄</text>
                    <text>概述</text>
                </view>
                <text class="content-text">{{ audioDetail.description }}</text>
            </view>

            <!-- 内容展示 -->
            <view class="audio-content" v-if="audioDetail.content">
                <view class="content-title">
                    <text class="content-icon">📋</text>
                    <text>详细内容</text>
                </view>
                <view class="content-text" v-html="audioDetail.content"></view>
            </view>

            <!-- 相关信息 -->
            <view class="audio-info" v-if="audioDetail.language || audioDetail.instructor">
                <view class="content-title">
                    <text class="content-icon">👤</text>
                    <text>相关信息</text>
                </view>
                <view class="info-grid">
                    <view v-if="audioDetail.language" class="info-item">
                        <text class="info-label">语言:</text>
                        <text class="info-value">{{ audioDetail.language }}</text>
                    </view>
                    <view v-if="audioDetail.instructor" class="info-item">
                        <text class="info-label">讲师:</text>
                        <text class="info-value">{{ audioDetail.instructor }}</text>
                    </view>
                    <view v-if="audioDetail.duration" class="info-item">
                        <text class="info-label">时长:</text>
                        <text class="info-value">{{ formatTime(audioDetail.duration) }}</text>
                    </view>
                </view>
            </view>
        </view>
    </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import Taro from '@tarojs/taro';
import { Api } from '../../../../utils/apis';
import favoriteManager from '../../../../utils/favoriteManager';

// 响应式数据
const audioId = ref('');
const audioDetail = ref({});
const loading = ref(true);
const error = ref(false);
const isFavorited = ref(false);

// 音频播放相关
const audioContext = ref(null);
const isPlaying = ref(false);
const duration = ref(0);
const currentTime = ref(0);
const playTimer = ref(null);
const playbackRate = ref(1);
const isDragging = ref(false); // 是否正在拖动进度条

// 配置选项
const defaultCoverImage = 'https://via.placeholder.com/300x300/FF4949/FFFFFF?text=Audio';
const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];

// 页面生命周期
onMounted(() => {
    const instance = Taro.getCurrentInstance();
    const { id } = instance.router.params;

    if (id) {
        audioId.value = id;
        loadAudioDetail();
        initAudioContext();
        checkFavoriteStatus();
    } else {
        Taro.showToast({
            title: '参数错误',
            icon: 'none',
            duration: 2000,
        });
        setTimeout(() => {
            Taro.navigateBack();
        }, 2000);
    }
});

onUnmounted(() => {
    // 页面卸载时销毁音频实例
    if (audioContext.value) {
        audioContext.value.stop();
        clearPlayTimer();
    }
});

// 方法定义
const loadAudioDetail = async () => {
    loading.value = true;
    error.value = false;

    try {
        const res = await Api.findAudioMaterialDetail({ id: audioId.value });
        console.log('获取音频详情:', res);

        audioDetail.value = res;
        duration.value = res.duration || 0;

        // 更新音频信息
        if (audioContext.value && res.audioSource) {
            audioContext.value.src = res.audioSource;
        }
    } catch (err) {
        console.error('加载音频详情失败:', err);
        error.value = true;
        Taro.showToast({
            title: '加载失败',
            icon: 'none',
            duration: 2000,
        });
    } finally {
        loading.value = false;
    }
};

// 检查收藏状态
const checkFavoriteStatus = async () => {
    if (audioId.value) {
        isFavorited.value = await favoriteManager.isFavorite(audioId.value);
    }
};

// 切换收藏状态
const toggleFavorite = async () => {
    if (!audioDetail.value.id) {
        return;
    }

    try {
        const newStatus = await favoriteManager.toggleFavorite(audioDetail.value);
        isFavorited.value = newStatus;

        Taro.showToast({
            title: newStatus ? '已收藏' : '已取消收藏',
            icon: 'success',
            duration: 1500,
        });
    } catch (error) {
        console.error('切换收藏状态失败:', error);
        Taro.showToast({
            title: '操作失败',
            icon: 'none',
            duration: 2000,
        });
    }
};

const initAudioContext = () => {
    try {
        // 创建音频上下文
        audioContext.value = Taro.createInnerAudioContext();

        // 监听音频事件
        audioContext.value.onCanplay(() => {
            console.log('音频可以播放');
            duration.value = audioDetail.value.duration || 0;
        });

        audioContext.value.onPlay(() => {
            console.log('音频开始播放');
            isPlaying.value = true;
            startPlayTimer();
        });

        audioContext.value.onPause(() => {
            console.log('音频暂停播放');
            isPlaying.value = false;
            clearPlayTimer();
        });

        audioContext.value.onStop(() => {
            console.log('音频停止播放');
            isPlaying.value = false;
            currentTime.value = 0;
            clearPlayTimer();
        });

        audioContext.value.onEnded(() => {
            console.log('音频播放结束');
            isPlaying.value = false;
            currentTime.value = 0;
            clearPlayTimer();
        });

        audioContext.value.onError((err) => {
            console.error('音频播放错误:', err);
            Taro.showToast({
                title: '音频播放错误',
                icon: 'none',
                duration: 2000,
            });
            isPlaying.value = false;
            clearPlayTimer();
        });

        audioContext.value.onTimeUpdate(() => {
            currentTime.value = audioContext.value.currentTime || 0;
        });
    } catch (err) {
        console.error('初始化音频上下文失败:', err);
    }
};

const togglePlay = () => {
    if (!audioDetail.value.audioSource) {
        Taro.showToast({
            title: '音频资源不可用',
            icon: 'none',
            duration: 2000,
        });
        return;
    }

    try {
        if (isPlaying.value) {
            audioContext.value.pause();
        } else {
            // 如果没有设置音频源，先设置
            if (!audioContext.value.src) {
                audioContext.value.src = audioDetail.value.audioSource;
            }
            audioContext.value.play();
        }
    } catch (err) {
        console.error('播放控制错误:', err);
        Taro.showToast({
            title: '播放失败',
            icon: 'none',
            duration: 2000,
        });
    }
};

const handleRewind = () => {
    if (!audioContext.value) return;

    const newTime = Math.max(0, currentTime.value - 10);
    audioContext.value.seek(newTime);
    currentTime.value = newTime;
};

const handleForward = () => {
    if (!audioContext.value) return;

    const newTime = Math.min(duration.value, currentTime.value + 10);
    audioContext.value.seek(newTime);
    currentTime.value = newTime;
};

const onSliderDrag = (value) => {
    if (!audioContext.value) return;

    const time = Array.isArray(value) ? value[0] : value;
    // 拖动时只更新显示时间，不跳转音频
    isDragging.value = true;
    currentTime.value = time;
};

const onSliderRelease = (value) => {
    if (!audioContext.value) return;

    const time = Array.isArray(value) ? value[0] : value;
    // 释放时才跳转音频
    audioContext.value.seek(time);
    currentTime.value = time;
    isDragging.value = false;
};

const changePlaybackRate = (rate) => {
    playbackRate.value = rate;
    if (audioContext.value) {
        audioContext.value.playbackRate = rate;
    }
};

const startPlayTimer = () => {
    clearPlayTimer();
    playTimer.value = setInterval(() => {
        if (audioContext.value && isPlaying.value && !isDragging.value) {
            currentTime.value = audioContext.value.currentTime || 0;
        }
    }, 1000);
};

const clearPlayTimer = () => {
    if (playTimer.value) {
        clearInterval(playTimer.value);
        playTimer.value = null;
    }
};

const formatTime = (seconds) => {
    if (!seconds) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};
</script>

<style lang="scss">
@import './index.scss';
</style>
