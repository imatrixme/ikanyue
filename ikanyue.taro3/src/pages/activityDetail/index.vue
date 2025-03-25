<template>
    <view class="activity-detail">
        <!-- 封面图 -->
        <image class="cover-image" :src="activity.cover_image" mode="aspectFill" />

        <!-- 基本信息 -->
        <view class="info-section">
            <view class="title">{{ activity.title }}</view>
            <view class="meta-list">
                <view class="meta-item">
                    <nut-icon name="clock" size="18"></nut-icon>
                    <text>{{ formatDateTime(activity.start_time) }}</text>
                </view>
                <view class="meta-item">
                    <nut-icon name="location" size="18"></nut-icon>
                    <text>{{ activity.location }}</text>
                </view>
                <view class="meta-item">
                    <nut-icon name="price" size="18"></nut-icon>
                    <text v-if="activity.price > 0">¥{{ activity.price }}</text>
                    <text v-else class="free">免费</text>
                </view>
            </view>

            <!-- 标签 -->
            <view class="tag-list" v-if="activity.tags && activity.tags.length">
                <text v-for="(tag, index) in activity.tags" :key="index" class="tag">{{ tag }}</text>
            </view>
        </view>

        <!-- 描述信息 -->
        <view class="desc-section">
            <view class="section-title">活动详情</view>
            <view class="description">{{ activity.description }}</view>
        </view>

        <!-- 图片 -->
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
import { reactive, toRefs, onMounted } from 'vue';
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';

export default {
    setup() {
        const state = reactive({
            activity: {
                id: 0,
                title: '',
                description: '',
                cover_image: '',
                images: [],
                start_time: 0,
                end_time: 0,
                location: '',
                price: 0,
                register_url: '',
                tags: [],
            },
            loading: true,
        });

        // 获取活动详情
        const fetchActivityDetail = async (id) => {
            state.loading = true;
            try {
                const res = await Api.findActivities({ id });
                if (res && res.data && res.data.length > 0) {
                    state.activity = res.data[0];
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
                state.loading = false;
            }
        };

        // 格式化日期时间
        const formatDateTime = (timestamp) => {
            if (!timestamp) return '';

            const date = new Date(timestamp);
            const year = date.getFullYear();
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');

            return `${year}年${month}月${day}日 ${hours}:${minutes}`;
        };

        // 预览图片
        const previewImage = (current, urls) => {
            Taro.previewImage({
                current,
                urls,
            });
        };

        // 报名活动
        const register = () => {
            if (!state.activity.register_url) {
                Taro.showToast({
                    title: '暂未开放报名',
                    icon: 'none',
                });
                return;
            }

            // 使用webview页面打开外部链接
            const url = encodeURIComponent(state.activity.register_url);
            const title = encodeURIComponent(state.activity.title);
            Taro.navigateTo({
                url: `/pages/webview/index?url=${url}&title=${title}`,
            });
        };

        onMounted(() => {
            const router = Taro.getCurrentInstance().router;
            if (router && router.params && router.params.id) {
                fetchActivityDetail(router.params.id);
            } else {
                Taro.showToast({
                    title: '参数错误',
                    icon: 'none',
                });
                setTimeout(() => {
                    Taro.navigateBack();
                }, 1500);
            }
        });

        return {
            ...toRefs(state),
            formatDateTime,
            previewImage,
            register,
        };
    },
};
</script>

<style lang="scss">
@import './index.scss';
</style>
