<template>
    <view>
        <!-- 加载中 -->
        <view v-if="loading" class="loading-container">
            <nut-icon name="loading" size="30"></nut-icon>
            <text style="margin-top: 10px; font-size: 14px; color: #666">加载中...</text>
        </view>

        <!-- 网络错误 -->
        <view v-else-if="error" class="error-container">
            <nut-empty description="获取音频详情失败"></nut-empty>
            <nut-button type="primary" size="small" @click="loadAudioDetail" style="margin-top: 16px">
                重新加载
            </nut-button>
        </view>

        <!-- 内容展示 -->
        <view v-else class="audio-detail-page">
            <!-- 头部区域 -->
            <view class="audio-header">
                <image class="audio-cover" :src="audioDetail.coverImage || defaultCoverImage" mode="aspectFill" />
                <view class="header-content">
                    <text class="header-title">{{ audioDetail.title }}</text>
                    <view class="header-meta">
                        <text>{{ audioDetail.type }}</text>
                        <text>{{ formatDate(audioDetail.publishedAt) }}</text>
                    </view>
                    <view class="audio-tags" v-if="audioDetail.tags && audioDetail.tags.length">
                        <text v-for="(tag, index) in audioDetail.tags" :key="index" class="audio-tag">
                            {{ tag }}
                        </text>
                    </view>
                </view>
            </view>

            <!-- 音频播放器 -->
            <view class="audio-player">
                <view class="player-controls">
                    <view class="player-btn" @tap="handleRewind">
                        <nut-icon name="play-double-back" size="24"></nut-icon>
                    </view>
                    <view class="player-btn" style="width: 70px; height: 70px" @tap="togglePlay">
                        <nut-icon :name="isPlaying ? 'pause' : 'play'" size="36"></nut-icon>
                    </view>
                    <view class="player-btn" @tap="handleForward">
                        <nut-icon name="play-double-forward" size="24"></nut-icon>
                    </view>
                </view>
                <view class="player-progress">
                    <nut-range v-model="currentTime" :max="duration" @change="onSliderChange" />
                    <view class="player-time">
                        <text>{{ formatTime(currentTime) }}</text>
                        <text>{{ formatTime(duration) }}</text>
                    </view>
                </view>
            </view>

            <!-- 描述信息 -->
            <view class="description-section" v-if="audioDetail.description">
                <view class="content-title">概述</view>
                <text class="content-text">{{ audioDetail.description }}</text>
            </view>

            <!-- 内容展示 -->
            <view class="audio-content" v-if="audioDetail.content">
                <view class="content-title">内容</view>
                <text class="content-text">{{ audioDetail.content }}</text>
            </view>
        </view>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../../utils/apis';

export default {
    name: 'AudioMaterialDetail',
    data() {
        return {
            audioId: '',
            audioDetail: {},
            loading: true,
            error: false,
            defaultCoverImage: 'https://img.yzcdn.cn/vant/cat.jpeg',

            // 音频播放相关
            audioContext: null,
            isPlaying: false,
            duration: 0,
            currentTime: 0,
            playTimer: null,
        };
    },
    onLoad(options) {
        if (options.id) {
            this.audioId = options.id;
            this.loadAudioDetail();
            this.initAudioContext();
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
    },
    onUnload() {
        // 页面卸载时销毁音频实例
        if (this.audioContext) {
            this.audioContext.stop();
            this.clearPlayTimer();
        }
    },
    methods: {
        async loadAudioDetail() {
            this.loading = true;
            this.error = false;

            try {
                const res = await Api.findAudioMaterialDetail({ id: this.audioId });
                console.log('获取音频详情:', res);

                this.audioDetail = res;

                // 更新音频信息
                if (this.audioContext && this.audioDetail.audioSource) {
                    this.audioContext.src = this.audioDetail.audioSource;
                    this.duration = this.audioDetail.duration || 0;
                }
            } catch (error) {
                console.error('加载音频详情失败:', error);
                this.error = true;
                Taro.showToast({
                    title: '加载失败',
                    icon: 'none',
                    duration: 2000,
                });
            } finally {
                this.loading = false;
            }
        },

        initAudioContext() {
            try {
                // 创建音频上下文
                this.audioContext = Taro.createInnerAudioContext();

                // 监听音频事件
                this.audioContext.onCanplay(() => {
                    console.log('音频可以播放');
                    this.duration = this.audioDetail.duration || 0;
                });

                this.audioContext.onPlay(() => {
                    console.log('音频开始播放');
                    this.isPlaying = true;
                    this.startPlayTimer();
                });

                this.audioContext.onPause(() => {
                    console.log('音频暂停播放');
                    this.isPlaying = false;
                    this.clearPlayTimer();
                });

                this.audioContext.onStop(() => {
                    console.log('音频停止播放');
                    this.isPlaying = false;
                    this.currentTime = 0;
                    this.clearPlayTimer();
                });

                this.audioContext.onEnded(() => {
                    console.log('音频播放结束');
                    this.isPlaying = false;
                    this.currentTime = 0;
                    this.clearPlayTimer();
                });

                this.audioContext.onError((err) => {
                    console.error('音频播放错误:', err);
                    Taro.showToast({
                        title: '音频播放错误',
                        icon: 'none',
                        duration: 2000,
                    });
                    this.isPlaying = false;
                    this.clearPlayTimer();
                });

                this.audioContext.onTimeUpdate(() => {
                    this.currentTime = this.audioContext.currentTime;
                });
            } catch (error) {
                console.error('初始化音频上下文失败:', error);
            }
        },

        togglePlay() {
            if (!this.audioDetail.audioSource) {
                Taro.showToast({
                    title: '音频资源不可用',
                    icon: 'none',
                    duration: 2000,
                });
                return;
            }

            try {
                if (this.isPlaying) {
                    this.audioContext.pause();
                } else {
                    // 如果没有设置音频源，先设置
                    if (!this.audioContext.src) {
                        this.audioContext.src = this.audioDetail.audioSource;
                    }
                    this.audioContext.play();
                }
            } catch (error) {
                console.error('播放控制错误:', error);
            }
        },

        handleRewind() {
            if (!this.audioContext) return;

            const newTime = Math.max(0, this.currentTime - 10);
            this.audioContext.seek(newTime);
            this.currentTime = newTime;
        },

        handleForward() {
            if (!this.audioContext) return;

            const newTime = Math.min(this.duration, this.currentTime + 10);
            this.audioContext.seek(newTime);
            this.currentTime = newTime;
        },

        onSliderChange(value) {
            if (!this.audioContext) return;

            this.audioContext.seek(value);
            this.currentTime = value;
        },

        startPlayTimer() {
            this.clearPlayTimer();
            this.playTimer = setInterval(() => {
                if (this.audioContext && this.isPlaying) {
                    this.currentTime = this.audioContext.currentTime || 0;
                }
            }, 1000);
        },

        clearPlayTimer() {
            if (this.playTimer) {
                clearInterval(this.playTimer);
                this.playTimer = null;
            }
        },

        formatTime(seconds) {
            if (!seconds) return '00:00';
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.floor(seconds % 60);
            return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        },

        formatDate(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
        },
    },
};
</script>

<style lang="scss">
@import './index.scss';
</style>
