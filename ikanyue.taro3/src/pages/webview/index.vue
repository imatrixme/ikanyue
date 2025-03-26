<template>
    <view class="webview-container">
        <web-view :src="url" @message="handleMessage" @error="handleError"></web-view>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';

export default {
    data() {
        return {
            url: '',
            title: '网页',
        };
    },
    onLoad(options) {
        if (options) {
            if (options.url) {
                this.url = decodeURIComponent(options.url);
            } else {
                Taro.showToast({
                    title: '链接不存在',
                    icon: 'none',
                });
                setTimeout(() => {
                    Taro.navigateBack();
                }, 1500);
            }

            if (options.title) {
                this.title = decodeURIComponent(options.title);
                Taro.setNavigationBarTitle({
                    title: this.title,
                });
            }
        }
    },
    methods: {
        // 处理网页消息
        handleMessage(e) {
            console.log('WebView消息:', e.detail);
        },

        // 处理网页错误
        handleError(e) {
            console.error('WebView错误:', e.detail);
            Taro.showToast({
                title: '页面加载失败',
                icon: 'none',
            });
        },
    },
};
</script>

<style>
.webview-container {
    width: 100vw;
    height: 100vh;
}
</style>
