<template>
    <view v-if="!loadError" class="webview-container">
        <web-view :src="url" @message="handleMessage" @error="handleError"></web-view>
    </view>
    <view v-else class="webview-error">
        <empty-state
            action-label="返回活动"
            :description="loadError"
            kind="network"
            title="网页暂时无法打开"
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
            loadError: '',
            url: '',
            title: '网页',
        };
    },
    onLoad(options) {
        if (options) {
            if (options.url) {
                this.url = decodeURIComponent(options.url);
            } else {
                this.loadError = '活动报名链接可能已经更新，请返回活动页查看最新内容。';
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
            this.loadError = '检查网络后返回活动页重试。';
        },

        goBack() {
            Taro.navigateBack({
                fail: () => Taro.switchTab({ url: '/pages/activity/index' }),
            });
        },
    },
};
</script>

<style lang="scss">
@import '../../styles/tokens';

.webview-container {
    background: $ky-canvas;
    height: 100vh;
    width: 100vw;
}

.webview-error {
    align-items: center;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    min-height: 100vh;
    padding: 18px;
    background: $ky-canvas;
}
</style>
