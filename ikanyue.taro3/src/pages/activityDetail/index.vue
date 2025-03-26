<template>
    <view class="activity-detail">
        <!-- 封面图 -->
        <image :src="activity.cover_image || defaultCoverImage" class="cover-image" mode="aspectFill" />

        <!-- 活动信息 -->
        <view class="info-section">
            <view class="title">{{ activity.title }}</view>

            <!-- 价格信息 -->
            <view class="price-section">
                <view v-if="activity.price > 0" class="price-container">
                    <text class="price-symbol">¥</text>
                    <text class="price-amount">{{ activity.price }}</text>
                </view>
                <view v-else class="price-free">免费活动</view>
            </view>

            <view class="meta-list">
                <view class="meta-item">
                    <nut-icon name="clock" size="18"></nut-icon>
                    <view class="meta-content">
                        <text class="meta-label">活动时间</text>
                        <view>
                            <text>{{ formatDateOnly(activity.startTime) }} </text>
                            <text>{{ formatTimeOnly(activity.startTime) }}</text>
                            <text v-if="activity.endTime"> - {{ formatTimeOnly(activity.endTime) }}</text>
                        </view>
                    </view>
                </view>
                <view class="meta-item">
                    <nut-icon name="location" size="18"></nut-icon>
                    <view class="meta-content">
                        <text class="meta-label">活动地点</text>
                        <text>{{ activity.location }}</text>
                    </view>
                </view>
            </view>

            <view class="tag-list" v-if="activity.tags && activity.tags.length">
                <text v-for="(tag, index) in activity.tags" :key="index" class="tag">{{ tag }}</text>
            </view>
        </view>

        <!-- 活动描述 -->
        <view class="desc-section">
            <view class="section-title">活动详情</view>
            <view class="description">{{ activity.description }}</view>
        </view>

        <!-- 活动图片 -->
        <view class="image-section" v-if="activity.images && activity.images.length">
            <view class="section-title">活动图集</view>
            <scroll-view class="image-scroll" scroll-x>
                <image
                    v-for="(img, index) in activity.images"
                    :key="index"
                    :src="img"
                    class="activity-image"
                    mode="aspectFill"
                    @tap="previewImage(img, activity.images)"
                />
            </scroll-view>
        </view>

        <!-- 底部操作栏 -->
        <view class="bottom-bar">
            <nut-button block type="primary" class="register-btn" @tap="register">立即报名</nut-button>
        </view>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';

export default {
    data() {
        return {
            activity: {
                id: 0,
                title: '',
                description: '',
                cover_image: '',
                images: [],
                startTime: 0,
                endTime: 0,
                location: '',
                price: 0,
                register_url: '',
                tags: [],
            },
            loading: true,
            defaultCoverImage: 'https://img.yzcdn.cn/vant/apple-1.jpg', // 替换为实际的占位图URL
        };
    },
    onLoad(options) {
        if (options && options.id) {
            this.fetchActivityDetail(options.id);
        } else {
            Taro.showToast({
                title: '参数错误',
                icon: 'none',
            });
            setTimeout(() => {
                Taro.navigateBack();
            }, 1500);
        }
    },
    methods: {
        // 获取活动详情
        async fetchActivityDetail(id) {
            this.loading = true;
            try {
                const res = await Api.findActivities({ id });
                if (res && res.data && res.data.length > 0) {
                    this.activity = res.data[0];
                } else {
                    Taro.showToast({
                        title: '未找到活动',
                        icon: 'none',
                    });
                    setTimeout(() => {
                        Taro.navigateBack();
                    }, 1500);
                }
            } catch (error) {
                console.error('获取活动详情失败:', error);
                Taro.showToast({
                    title: '加载失败，请重试',
                    icon: 'none',
                });
            } finally {
                this.loading = false;
            }
        },

        // 只格式化日期部分 (月日)
        formatDateOnly(timestamp) {
            if (!timestamp) return '';

            const date = new Date(timestamp);

            // 检查日期是否有效
            if (isNaN(date.getTime())) return '';

            const month = (date.getMonth() + 1).toString();
            const day = date.getDate().toString();

            return `${month}月${day}日`;
        },

        // 只格式化时间部分 (时分)
        formatTimeOnly(timestamp) {
            if (!timestamp) return '';

            const date = new Date(timestamp);

            // 检查日期是否有效
            if (isNaN(date.getTime())) return '';

            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');

            return `${hours}:${minutes}`;
        },

        // 格式化日期时间
        formatDateTime(timestamp) {
            if (!timestamp) return '';

            const date = new Date(timestamp);

            // 检查日期是否有效
            if (isNaN(date.getTime())) return '';

            const year = date.getFullYear();
            const month = (date.getMonth() + 1).toString();
            const day = date.getDate().toString();
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');

            return `${year}年${month}月${day}日 ${hours}:${minutes}`;
        },

        // 预览图片
        previewImage(current, urls) {
            Taro.previewImage({
                current,
                urls,
            });
        },

        // 报名活动
        register() {
            if (!this.activity.register_url) {
                Taro.showToast({
                    title: '暂未开放报名',
                    icon: 'none',
                });
                return;
            }

            // 使用webview页面打开外部链接
            const url = encodeURIComponent(this.activity.register_url);
            const title = encodeURIComponent(this.activity.title);
            Taro.navigateTo({
                url: `/pages/webview/index?url=${url}&title=${title}`,
            });
        },
    },
};
</script>

<style lang="scss">
@import './index.scss';
</style>
