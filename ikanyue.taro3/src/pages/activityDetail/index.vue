<template>
    <view class="activity-detail">
        <!-- 封面图 -->
        <image :src="activity.coverImage" class="cover-image" mode="aspectFill" />

        <!-- 活动信息 -->
        <view class="info-section">
            <view class="title">{{ activity.title }}</view>

            <!-- 价格信息 -->
            <view class="price-section">
                <view v-if="activity.price > 0" class="price-container">
                    <text class="price-symbol">¥</text>
                    <text class="price-amount">{{ (activity.price / 100.0).toFixed(2) }}</text>
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
                <view class="meta-item" v-if="activity.maxParticipants">
                    <nut-icon name="people" size="18"></nut-icon>
                    <view class="meta-content">
                        <text class="meta-label">参与名额</text>
                        <view>
                            <text>{{ activity.maxParticipants }}人</text>
                            <text v-if="activity.currentParticipants">
                                (已报名: {{ activity.currentParticipants }}人)</text
                            >
                            <text v-if="hasLimitedSeats" class="remaining-few">仅剩{{ remainingSeats }}个名额</text>
                        </view>
                    </view>
                </view>
            </view>

            <view class="tag-list" v-if="activity.tags && activity.tags.length">
                <text v-for="(tag, index) in activity.tags.split(',')" :key="index" class="tag">{{ tag.trim() }}</text>
            </view>
        </view>

        <!-- 活动描述 -->
        <view class="desc-section">
            <view class="section-title">活动详情</view>
            <rich-text class="description" :nodes="safeHtmlContent" user-select></rich-text>
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

        <!-- 退款政策说明 -->
        <view class="disclaimer-section">
            <text class="disclaimer-text">
                活动开始前24小时可申请全额退款；活动开始前12小时可申请50%退款；活动开始前12小时内不予退款。活动最终解释权归主办方所有。
            </text>
        </view>

        <!-- 底部操作栏 -->
        <view class="bottom-bar">
            <nut-button
                block
                type="primary"
                class="register-btn"
                @tap="register"
                v-if="!activity.externalLink || activity.externalLink === ''"
            >
                立即报名
            </nut-button>
            <nut-button block type="primary" class="register-btn" disabled v-else> 暂不可报名 </nut-button>
        </view>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { getSafeHtml, htmlToText } from './htmlUtils';
import {
    formatDateOnly as formatActivityDateOnly,
    formatTimeOnly as formatActivityTimeOnly,
    mapActivityDetail,
} from '../activity/pageLogic';

export default {
    data() {
        return {
            activity: {
                id: 0,
                title: '',
                description: '',
                coverImage: '',
                images: [],
                startTime: 0,
                endTime: 0,
                location: '',
                price: 0,
                externalLink: '',
                tags: [],
                maxParticipants: 0, // 最大参与人数
                currentParticipants: 0, // 当前已报名人数
            },
            loading: true,
            safeHtmlContent: '', // 用于存储处理后的HTML内容
        };
    },
    computed: {
        // 是否显示"仅剩X个名额"的提示
        hasLimitedSeats() {
            return (
                this.activity.maxParticipants &&
                this.activity.currentParticipants &&
                this.activity.maxParticipants - this.activity.currentParticipants <= 10
            );
        },

        // 剩余名额数量
        remainingSeats() {
            if (!this.activity.maxParticipants || !this.activity.currentParticipants) {
                return 0;
            }
            return this.activity.maxParticipants - this.activity.currentParticipants;
        },
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
                const mappedActivity = mapActivityDetail(this.activity, res);
                if (mappedActivity) {
                    this.activity = mappedActivity;

                    // 处理HTML内容
                    if (this.activity.description) {
                        this.safeHtmlContent = getSafeHtml(this.activity.description);
                    } else {
                        this.safeHtmlContent = '';
                    }
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
            return formatActivityDateOnly(timestamp);
        },

        // 只格式化时间部分 (时分)
        formatTimeOnly(timestamp) {
            return formatActivityTimeOnly(timestamp);
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
            if (!this.activity.externalLink) {
                Taro.showToast({
                    title: '暂未开放报名',
                    icon: 'none',
                });
                return;
            }

            // 使用webview页面打开外部链接
            const url = encodeURIComponent(this.activity.externalLink);
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
