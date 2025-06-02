<template>
    <view class="audio-content-wrapper">
        <!-- 音频描述 -->
        <view class="description-section" v-if="safeDescription">
            <view class="content-title">
                <nut-icon name="issue" size="16" color="#333333" />
                <text>音频描述</text>
            </view>
            <rich-text class="content-text" :nodes="safeDescription" user-select></rich-text>
        </view>

        <!-- 音频信息 -->
        <view class="audio-info">
            <view class="content-title">
                <nut-icon name="notice" size="16" color="#333333" />
                <text>音频信息</text>
            </view>
            <view class="info-grid">
                <view class="info-item">
                    <text class="info-label">时长</text>
                    <text class="info-value">{{ formatTime(audioDetail.duration) }}</text>
                </view>
                <view class="info-item">
                    <text class="info-label">类型</text>
                    <text class="info-value">{{ audioDetail.type || '未分类' }}</text>
                </view>
                <view class="info-item" v-if="audioDetail.language">
                    <text class="info-label">语言</text>
                    <text class="info-value">{{ audioDetail.language }}</text>
                </view>
                <view class="info-item" v-if="audioDetail.difficulty">
                    <text class="info-label">难度</text>
                    <text class="info-value">{{ audioDetail.difficulty }}级</text>
                </view>
                <view class="info-item">
                    <text class="info-label">发布时间</text>
                    <text class="info-value">{{ formatDate(audioDetail.publishedAt) }}</text>
                </view>
            </view>
        </view>

        <!-- 详细内容 -->
        <view class="audio-content" v-if="safeContent">
            <view class="content-title">
                <nut-icon name="tips" size="16" color="#333333" />
                <text>详细内容</text>
            </view>
            <rich-text class="content-text" :nodes="safeContent" user-select></rich-text>
        </view>

        <!-- 相关信息 -->
        <view class="audio-info" v-if="audioDetail.author">
            <view class="content-title">
                <nut-icon name="my" size="16" color="#333333" />
                <text>相关信息</text>
            </view>
            <view class="info-grid">
                <view v-if="audioDetail.author" class="info-item">
                    <text class="info-label">作者:</text>
                    <text class="info-value">{{ audioDetail.author }}</text>
                </view>
            </view>
        </view>
    </view>
</template>

<script setup>
import { computed } from 'vue';

// Props
const props = defineProps({
    audioDetail: {
        type: Object,
        required: true,
    },
});

// HTML处理函数（从activity页面借鉴）
const getSafeHtml = (html) => {
    if (!html) return '';

    try {
        // 处理HTML，使其适合小程序rich-text组件使用
        let content = html
            .replace(/<img([^>]*)>/gi, '<img$1 />')
            .replace(/<br>/gi, '<br />')
            .replace(/<hr>/gi, '<hr />');

        // 移除脚本和样式标签
        content = content
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

        // 处理不安全属性
        content = content
            .replace(/onclick=/gi, 'data-click=')
            .replace(/onerror=/gi, 'data-error=')
            .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
            .replace(/<audio[^>]*>.*?<\/audio>/gi, '')
            .replace(/<video[^>]*>.*?<\/video>/gi, '');

        // 添加样式
        content = content
            .replace(/<p([^>]*)>/gi, '<p$1 style="margin-bottom:12px;line-height:1.6;">')
            .replace(/<img([^>]*)>/gi, '<img$1 style="max-width:100%;height:auto;margin:10px 0;" />')
            .replace(/<a([^>]*)>/gi, '<a$1 style="color:#ff4949;text-decoration:underline;">')
            .replace(/<h1([^>]*)>/gi, '<h1$1 style="font-size:20px;font-weight:bold;margin:16px 0 8px 0;color:#333;">')
            .replace(/<h2([^>]*)>/gi, '<h2$1 style="font-size:18px;font-weight:bold;margin:16px 0 8px 0;color:#333;">')
            .replace(/<h3([^>]*)>/gi, '<h3$1 style="font-size:16px;font-weight:bold;margin:16px 0 8px 0;color:#333;">')
            .replace(/<h4([^>]*)>/gi, '<h4$1 style="font-size:16px;font-weight:bold;margin:16px 0 8px 0;color:#333;">')
            .replace(/<h5([^>]*)>/gi, '<h5$1 style="font-size:16px;font-weight:bold;margin:16px 0 8px 0;color:#333;">')
            .replace(/<h6([^>]*)>/gi, '<h6$1 style="font-size:16px;font-weight:bold;margin:16px 0 8px 0;color:#333;">')
            .replace(/<ul([^>]*)>/gi, '<ul$1 style="padding-left:20px;margin-bottom:16px;">')
            .replace(/<ol([^>]*)>/gi, '<ol$1 style="padding-left:20px;margin-bottom:16px;">')
            .replace(/<li([^>]*)>/gi, '<li$1 style="margin-bottom:6px;">');

        return content;
    } catch (e) {
        console.error('处理HTML内容出错:', e);
        // 降级处理：返回纯文本
        return html.replace(/<[^>]*>/g, '');
    }
};

// 计算属性
const safeDescription = computed(() => {
    return getSafeHtml(props.audioDetail.description);
});

const safeContent = computed(() => {
    return getSafeHtml(props.audioDetail.content);
});

// 方法
const formatTime = (seconds) => {
    if (!seconds) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const formatDate = (date) => {
    if (!date) return '';
    try {
        const formattedDate = new Date(date).toLocaleDateString();
        return formattedDate;
    } catch (e) {
        console.error('日期格式化错误:', e);
        return '';
    }
};
</script>

<style lang="scss" scoped>
.audio-content-wrapper {
    padding-bottom: 20px;
}

.content-title {
    font-size: 16px;
    font-weight: bold;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #333;
}

.content-text {
    font-size: 14px;
    line-height: 1.6;
    color: #555;
    text-align: justify;
    text-indent: 2em;
}

.description-section,
.audio-content,
.audio-info {
    margin: 16px;
    background-color: #fff;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.info-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.info-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;

    &:not(:last-child) {
        border-bottom: 1px solid #f0f0f0;
    }
}

.info-label {
    font-size: 14px;
    color: #666;
    font-weight: 500;
}

.info-value {
    font-size: 14px;
    color: #333;
}
</style>
