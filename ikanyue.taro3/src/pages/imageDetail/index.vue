<template>
    <view v-if="imageUrl && !imageError" class="image-detail-page">
        <scroll-view scroll-y="true" class="detail-scroll">
            <image :src="imageUrl" class="detail-image" mode="widthFix" @error="handleImageError" />
        </scroll-view>
    </view>
    <view v-else class="image-detail-page image-detail-page--status">
        <text class="status-text">{{ statusText }}</text>
        <button class="back-button" @tap="goBack">返回首页</button>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';

export default {
    data() {
        return {
            imageUrl: '',
            imageError: false,
            statusText: '图片不存在',
        };
    },
    onLoad(options) {
        if (!options?.imageUrl) {
            this.handleMissingImage();
            return;
        }

        this.imageUrl = decodeURIComponent(options.imageUrl);

        if (options.title) {
            Taro.setNavigationBarTitle({
                title: decodeURIComponent(options.title),
            });
        }
    },
    methods: {
        handleMissingImage() {
            this.statusText = '图片不存在';

            Taro.showToast({
                title: '图片不存在',
                icon: 'none',
            });

            setTimeout(() => {
                this.goBack();
            }, 1500);
        },

        handleImageError() {
            this.imageError = true;
            this.statusText = '图片加载失败';

            Taro.showToast({
                title: '图片加载失败',
                icon: 'none',
            });
        },

        goBack() {
            Taro.navigateBack({
                fail: () => {
                    Taro.switchTab({
                        url: '/pages/activity/index',
                    });
                },
            });
        },
    },
};
</script>

<style lang="scss">
@import './index.scss';
</style>
