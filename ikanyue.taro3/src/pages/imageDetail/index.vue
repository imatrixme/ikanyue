<template>
    <view v-if="imageUrl && !imageError" class="image-detail-page">
        <image :src="imageUrl" class="detail-image" mode="widthFix" @error="handleImageError" />
    </view>
    <view v-else class="image-detail-page image-detail-page--status">
        <empty-state
            action-label="返回活动"
            :description="statusDescription"
            kind="image"
            :title="statusText"
            @action="goBack"
        />
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import EmptyState from '../../components/EmptyState.vue';

export default {
    components: { EmptyState },
    data() {
        return {
            imageUrl: '',
            imageError: false,
            statusText: '图片不存在',
        };
    },
    computed: {
        statusDescription() {
            return this.imageError
                ? '图片暂时没有加载出来，返回活动页后可以稍后再试。'
                : '这张活动图片可能已经更新，返回活动页查看最新内容。';
        },
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
        },

        handleImageError() {
            this.imageError = true;
            this.statusText = '图片加载失败';
        },

        goBack() {
            Taro.navigateBack({
                fail: () => {
                    Taro.switchTab({
                        url: '/pages/home/index',
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
