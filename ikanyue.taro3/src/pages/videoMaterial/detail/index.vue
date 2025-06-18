<template>
    <view class="video-detail-page">
        <!-- 加载中 -->
        <view v-if="loading" class="loading-container">
            <view class="loading-spinner">
                <nut-icon name="loading" size="32" color="#6366f1" class="spin" />
            </view>
            <text class="loading-text">加载中...</text>
        </view>

        <!-- 网络错误 -->
        <view v-else-if="error" class="error-container">
            <nut-icon name="failure" size="40" color="#ef4444" />
            <text class="error-text">获取视频详情失败</text>
            <view class="retry-btn" @tap="loadVideoDetail">重新加载</view>
        </view>

        <!-- 内容展示 -->
        <view v-else class="content-wrapper">
            <!-- 固定收藏按钮 -->
            <view class="fixed-favorite-btn" @tap="toggleFavorite">
                <nut-icon
                    :name="isFavorited ? 'heart-fill' : 'heart'"
                    size="20"
                    :color="isFavorited ? '#ff4949' : '#666666'"
                />
                <text class="favorite-label">{{ isFavorited ? '已收藏' : '收藏' }}</text>
            </view>

            <!-- 头部区域 -->
            <VideoHeader :video-detail="videoDetail" />

            <!-- 视频播放器 -->
            <view class="player-wrapper">
                <VideoPlayer
                    :video-source-url="videoDetail.videoSourceUrl"
                    :cover-image="videoDetail.coverImageUrl"
                    :duration="videoDetail.duration || duration"
                    @time-update="onTimeUpdate"
                />
            </view>

            <!-- 内容信息 -->
            <VideoContent :video-detail="videoDetail" />
        </view>
    </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import Taro from '@tarojs/taro';
import { Api } from '../../../../utils/apis';
import favoriteManager from '../../../../utils/favoriteManager';

// 导入组件
import VideoHeader from './components/VideoHeader.vue';
import VideoPlayer from './components/VideoPlayer.vue';
import VideoContent from './components/VideoContent.vue';

// 响应式数据
const videoId = ref('');
const videoDetail = ref({});
const loading = ref(true);
const error = ref(false);
const isFavorited = ref(false);
const duration = ref(0);

// 页面生命周期
onMounted(() => {
    const instance = Taro.getCurrentInstance();
    const { id } = instance.router.params;

    if (id) {
        videoId.value = id;
        loadVideoDetail();
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

// 方法定义
const loadVideoDetail = async () => {
    loading.value = true;
    error.value = false;

    try {
        const res = await Api.findVideoMaterialDetail({ id: videoId.value });
        console.log('[VideoDetail] 获取视频详情:', res);
        videoDetail.value = res;
        duration.value = res.duration || 0;
    } catch (err) {
        console.error('[VideoDetail] 加载视频详情失败:', err);
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
    if (videoId.value) {
        isFavorited.value = await favoriteManager.isFavoriteVideo(videoId.value);
    }
};

// 切换收藏状态
const toggleFavorite = async () => {
    if (!videoDetail.value.id) {
        return;
    }

    try {
        const newStatus = await favoriteManager.toggleFavoriteVideo(videoDetail.value);
        isFavorited.value = newStatus;

        Taro.showToast({
            title: newStatus ? '已收藏' : '已取消收藏',
            icon: 'success',
            duration: 1500,
        });
    } catch (error) {
        console.error('[VideoDetail] 切换收藏状态失败:', error);
        Taro.showToast({
            title: '操作失败',
            icon: 'none',
            duration: 2000,
        });
    }
};

// 视频时间更新回调
const onTimeUpdate = (currentTime) => {
    try {
        // 可以在这里处理时间更新，如保存播放进度等
        console.log('[VideoDetail] 视频时间更新:', currentTime);
    } catch (error) {
        // 静默处理错误
    }
};
</script>

<style lang="scss">
@import './index.scss';
</style>
