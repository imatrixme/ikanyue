<template>
    <view>
        <!-- 加载中 -->
        <view v-if="loading" class="loading-container">
            <nut-icon name="loading" size="30"></nut-icon>
            <text style="margin-top: 10px; font-size: 14px; color: #666">加载中...</text>
        </view>

        <!-- 网络错误 -->
        <view v-else-if="error" class="error-container">
            <nut-empty description="获取视频详情失败"></nut-empty>
            <nut-button type="primary" size="small" @click="loadVideoDetail" style="margin-top: 16px">
                重新加载
            </nut-button>
        </view>

        <!-- 内容展示 -->
        <view v-else class="video-detail-page">
            <!-- 视频播放器 -->
            <view class="video-player-container">
                <video
                    class="video-player"
                    :src="videoDetail.videoSource"
                    :poster="videoDetail.coverImage || defaultCoverImage"
                    controls
                    autoplay
                    initial-time="0"
                    show-fullscreen-btn
                    show-play-btn
                    show-center-play-btn
                    enable-progress-gesture
                    object-fit="contain"
                    @error="onVideoError"
                />
            </view>

            <!-- 视频信息 -->
            <view class="video-info">
                <text class="video-title">{{ videoDetail.title }}</text>
                <view class="meta-info">
                    <text>{{ videoDetail.type }}</text>
                    <text>{{ formatDate(videoDetail.publishedAt) }}</text>
                </view>

                <view class="meta-row">
                    <text class="meta-label">作者:</text>
                    <text class="meta-value">{{ videoDetail.author }}</text>
                </view>

                <view class="meta-row">
                    <text class="meta-label">时长:</text>
                    <text class="meta-value">{{ formatDuration(videoDetail.duration) }}</text>
                </view>

                <view class="meta-row" v-if="videoDetail.resolution">
                    <text class="meta-label">分辨率:</text>
                    <text class="meta-value">{{ videoDetail.resolution }}</text>
                </view>

                <view class="meta-row" v-if="videoDetail.language">
                    <text class="meta-label">语言:</text>
                    <text class="meta-value">{{ videoDetail.language }}</text>
                </view>

                <view class="meta-row" v-if="videoDetail.difficulty !== undefined">
                    <text class="meta-label">难度等级:</text>
                    <text class="meta-value">{{ getDifficultyText(videoDetail.difficulty) }}</text>
                </view>

                <view class="tags-container" v-if="videoDetail.tags && videoDetail.tags.length">
                    <view class="tags">
                        <text v-for="(tag, index) in videoDetail.tags" :key="index" class="tag">
                            {{ tag }}
                        </text>
                    </view>
                </view>
            </view>

            <!-- 视频描述 -->
            <view class="content-section" v-if="videoDetail.description">
                <view class="section-title">视频简介</view>
                <text class="content-text">{{ videoDetail.description }}</text>
            </view>

            <!-- 详细内容 -->
            <view class="content-section" v-if="videoDetail.content">
                <view class="section-title">详细内容</view>
                <text class="content-text">{{ videoDetail.content }}</text>
            </view>

            <!-- 字幕提示 -->
            <view class="content-section" v-if="videoDetail.subtitles">
                <view class="section-title">字幕说明</view>
                <text class="content-text">本视频提供字幕服务，可在播放器中开启查看。</text>
            </view>
        </view>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../../utils/apis';

export default {
    name: 'VideoMaterialDetail',
    data() {
        return {
            videoId: '',
            videoDetail: {},
            loading: true,
            error: false,
            defaultCoverImage: 'https://img.yzcdn.cn/vant/cat.jpeg',
        };
    },
    onLoad(options) {
        if (options.id) {
            this.videoId = options.id;
            this.loadVideoDetail();
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
    methods: {
        async loadVideoDetail() {
            this.loading = true;
            this.error = false;

            try {
                const res = await Api.findVideoMaterialDetail({ id: this.videoId });
                console.log('获取视频详情:', res);

                this.videoDetail = res;
            } catch (error) {
                console.error('加载视频详情失败:', error);
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

        onVideoError(e) {
            console.error('视频播放错误:', e);
            Taro.showToast({
                title: '视频加载失败',
                icon: 'none',
                duration: 2000,
            });
        },

        formatDuration(seconds) {
            if (!seconds) return '00:00';
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const remainingSeconds = Math.floor(seconds % 60);

            if (hours > 0) {
                return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds
                    .toString()
                    .padStart(2, '0')}`;
            } else {
                return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
            }
        },

        formatDate(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
        },

        getDifficultyText(level) {
            const difficulties = ['', '入门', '初级', '中级', '高级', '专家'];
            return difficulties[level] || '未知';
        },
    },
};
</script>

<style lang="scss">
@import './index.scss';
</style>
