<template>
    <view class="webview-container">
        <web-view :src="url" @message="handleMessage" @error="handleError"></web-view>
    </view>
</template>

<script>
import { reactive, toRefs } from 'vue';
import Taro from '@tarojs/taro';

export default {
    setup() {
        const state = reactive({
            url: '',
            title: '网页',
        });

        // 页面加载时处理参数
        Taro.useDidShow(() => {
            const router = Taro.getCurrentInstance().router;
            if (router && router.params) {
                if (router.params.url) {
                    state.url = decodeURIComponent(router.params.url);
                } else {
                    Taro.showToast({
                        title: '链接不存在',
                        icon: 'none',
                    });
                    setTimeout(() => {
                        Taro.navigateBack();
                    }, 1500);
                }

                if (router.params.title) {
                    state.title = decodeURIComponent(router.params.title);
                    Taro.setNavigationBarTitle({
                        title: state.title,
                    });
                }
            }
        });

        // 处理网页消息
        const handleMessage = (e) => {
            console.log('WebView消息:', e.detail);
        };

        // 处理网页错误
        const handleError = (e) => {
            console.error('WebView错误:', e.detail);
            Taro.showToast({
                title: '页面加载失败',
                icon: 'none',
            });
        };

        return {
            ...toRefs(state),
            handleMessage,
            handleError,
        };
    },
};
</script>

<style>
.webview-container {
    width: 100vw;
    height: 100vh;
}
</style>
