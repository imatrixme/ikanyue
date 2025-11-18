<template>
    <view class="prompt-page">
        <web-view :src="targetUrl" @error="handleError" />
    </view>
</template>

<script>
import Taro from '@tarojs/taro';

const H5_BASE_URL = 'https://m.ikanyue.com/prompt';

export default {
    data() {
        return {
            targetUrl: '',
        };
    },
    onLoad(options = {}) {
        const channel = options.channel || '';
        const url = channel ? `${H5_BASE_URL}?channel=${channel}` : H5_BASE_URL;
        this.targetUrl = url;
    },
    methods: {
        handleError(e) {
            console.error('H5 页面加载失败', e.detail);
            Taro.showToast({
                title: '页面加载失败',
                icon: 'none',
            });
        },
    },
};
</script>

<style lang="scss">
.prompt-page {
    width: 100vw;
    height: 100vh;
}
</style>
