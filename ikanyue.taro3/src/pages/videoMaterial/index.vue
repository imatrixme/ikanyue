<template>
    <view class="video-page">
        <!-- 筛选栏 -->
        <view class="filter-bar">
            <view class="filter-label">视频类型</view>
            <nut-popover v-model="showTypeFilter" :list="typeFilterOptions" @choose="onChooseType" />
        </view>

        <!-- 加载中提示 -->
        <view v-if="loading" class="empty-container">
            <nut-icon name="loading" size="30"></nut-icon>
            <text style="margin-top: 10px; font-size: 14px; color: #666">加载中...</text>
        </view>

        <!-- 网络错误提示 -->
        <view v-else-if="networkError" class="empty-container">
            <nut-empty description="网络错误，请点击重试"></nut-empty>
            <nut-button type="primary" size="small" @click="loadVideoMaterials" style="margin-top: 16px">
                重新加载
            </nut-button>
        </view>

        <!-- 空数据提示 -->
        <view v-else-if="!videoList.length" class="empty-container">
            <nut-empty description="暂无视频材料"></nut-empty>
        </view>

        <!-- 视频列表 -->
        <view v-else class="video-list">
            <view v-for="video in videoList" :key="video.id" class="video-card" @tap="goToDetail(video.id)">
                <view class="video-cover">
                    <image :src="video.coverImage || defaultCoverImage" mode="aspectFill" class="video-cover-image" />
                    <view class="video-duration">{{ formatDuration(video.duration) }}</view>
                    <view class="resolution-badge" v-if="video.resolution">{{ video.resolution }}</view>
                    <view class="video-play-icon">
                        <nut-icon name="play-circle" color="#ffffff" size="30"></nut-icon>
                    </view>
                </view>
                <view class="video-info">
                    <text class="video-title">{{ video.title }}</text>
                    <text class="video-description">{{ video.description }}</text>

                    <view class="meta-info">
                        <text>{{ video.type }}</text>
                        <text>{{ formatDate(video.publishedAt) }}</text>
                    </view>

                    <view class="tags" v-if="video.tags && video.tags.length">
                        <text v-for="(tag, index) in video.tags" :key="index" class="tag">
                            {{ tag }}
                        </text>
                    </view>
                </view>
            </view>
        </view>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';

export default {
    name: 'VideoMaterialList',
    data() {
        return {
            videoList: [],
            loading: true,
            networkError: false,
            defaultCoverImage: 'https://img.yzcdn.cn/vant/cat.jpeg',
            showTypeFilter: false,
            typeFilterOptions: [
                { text: '全部类型', value: '' },
                { text: '课程讲解', value: '课程讲解' },
                { text: '教学视频', value: '教学视频' },
                { text: '演示', value: '演示' },
            ],
            selectedType: '',
            allVideoList: [],
        };
    },
    onLoad() {
        this.loadVideoMaterials();
    },
    onPullDownRefresh() {
        this.refreshVideoMaterials();
    },
    methods: {
        async loadVideoMaterials() {
            this.loading = true;
            this.networkError = false;

            try {
                const params = {};
                if (this.selectedType) {
                    params.type = this.selectedType;
                }

                const res = await Api.findVideoMaterials(params);
                console.log('获取视频材料数据:', res);

                this.allVideoList = res.items || [];
                this.filterVideoList();
            } catch (error) {
                console.error('加载视频材料列表失败:', error);
                this.networkError = true;
                Taro.showToast({
                    title: '加载失败，请重试',
                    icon: 'none',
                    duration: 2000,
                });
            } finally {
                this.loading = false;
            }
        },

        async refreshVideoMaterials() {
            try {
                await this.loadVideoMaterials();
                Taro.showToast({
                    title: '刷新成功',
                    icon: 'success',
                    duration: 1500,
                });
            } catch (error) {
                console.error('刷新视频材料失败:', error);
            } finally {
                Taro.stopPullDownRefresh();
            }
        },

        filterVideoList() {
            if (!this.selectedType) {
                this.videoList = [...this.allVideoList];
            } else {
                this.videoList = this.allVideoList.filter((video) => video.type === this.selectedType);
            }
        },

        onChooseType(option) {
            this.selectedType = option.value;
            this.filterVideoList();
        },

        goToDetail(id) {
            Taro.navigateTo({
                url: `/pages/videoMaterial/detail/index?id=${id}`,
            });
        },

        formatDuration(seconds) {
            if (!seconds) return '00:00';
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.floor(seconds % 60);
            return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        },

        formatDate(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date
                .getDate()
                .toString()
                .padStart(2, '0')}`;
        },
    },
};
</script>

<style lang="scss">
@import './index.scss';
</style>
