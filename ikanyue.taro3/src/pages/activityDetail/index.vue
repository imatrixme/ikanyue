<template>
    <view class="activity-detail">
        <view v-if="loading" class="detail-loading">
            <view class="detail-loading__spinner" />
            <text>正在准备活动内容</text>
        </view>

        <view v-else-if="errorMessage" class="detail-empty">
            <empty-state
                action-label="返回活动"
                :description="errorMessage"
                kind="error"
                title="活动暂时无法显示"
                @action="goBack"
            />
        </view>

        <template v-else>
        <view class="cover-media">
            <image
                v-if="canShowCover"
                :src="activity.coverImage"
                class="cover-image"
                mode="aspectFill"
                @error="coverError = true"
            />
            <view v-else class="cover-fallback">
                <text class="cover-fallback__mark">{{ activity.title.slice(0, 1) || '乐' }}</text>
            </view>
        </view>

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
                    <app-icon class="meta-item__icon" name="clock-muted" :size="18" />
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
                    <app-icon class="meta-item__icon" name="location-muted" :size="18" />
                    <view class="meta-content">
                        <text class="meta-label">活动地点</text>
                        <text>{{ activity.location }}</text>
                    </view>
                </view>
                <view class="meta-item" v-if="activity.maxParticipants">
                    <app-icon class="meta-item__icon" name="people-muted" :size="18" />
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
                <text v-for="(tag, index) in activity.tags.split(',').slice(0, 3)" :key="index" class="tag">{{ tag.trim() }}</text>
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
            <scroll-view
                class="image-scroll"
                scroll-x
                enhanced
                bounces
                enable-passive
                show-scrollbar="false"
            >
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
                v-if="activity.externalLink"
            >
                立即报名
            </nut-button>
            <nut-button block type="primary" class="register-btn" disabled v-else> 暂未开放报名 </nut-button>
        </view>
        </template>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import AppIcon from '../../components/AppIcon.vue';
import EmptyState from '../../components/EmptyState.vue';
import { getSafeHtml, htmlToText } from './htmlUtils';
import {
    formatDateOnly as formatActivityDateOnly,
    formatTimeOnly as formatActivityTimeOnly,
    mapActivityDetail,
} from '../activity/pageLogic';

export default {
    components: { AppIcon, EmptyState },
    data() {
        return {
            activityId: '',
            errorMessage: '',
            coverError: false,
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
        canShowCover() {
            return Boolean(this.activity.coverImage) && !this.coverError;
        },
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
            this.activityId = options.id;
            this.fetchActivityDetail(this.activityId);
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
    async onPullDownRefresh() {
        try {
            if (this.activityId) {
                await this.fetchActivityDetail(this.activityId, false);
            }
        } finally {
            Taro.stopPullDownRefresh();
        }
    },
    methods: {
        // 获取活动详情
        async fetchActivityDetail(id, showLoading = true) {
            this.loading = showLoading;
            this.errorMessage = '';
            try {
                const res = await Api.findActivities({ id });
                const mappedActivity = mapActivityDetail(this.activity, res);
                if (mappedActivity) {
                    this.activity = mappedActivity;
                    this.coverError = false;

                    // 处理HTML内容
                    if (this.activity.description) {
                        this.safeHtmlContent = getSafeHtml(this.activity.description);
                    } else {
                        this.safeHtmlContent = '';
                    }
                } else {
                    this.errorMessage = '没有找到这场活动，它可能已经更新或下架。';
                }
            } catch (error) {
                console.error('获取活动详情失败:', error);
                if (this.activity.title) {
                    Taro.showToast({ title: '刷新失败，请稍后重试', icon: 'none' });
                } else {
                    this.errorMessage = '检查网络后返回活动页重试。';
                }
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

        goBack() {
            Taro.navigateBack({
                fail: () => Taro.switchTab({ url: '/pages/activity/index' }),
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
