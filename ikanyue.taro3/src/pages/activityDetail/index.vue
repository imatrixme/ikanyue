<template>
    <page-chrome class="activity-detail">
        <async-state v-if="loading" state="loading" title="正在准备活动内容" />

        <view v-else-if="errorMessage" class="detail-empty">
            <async-state
                action-label="返回活动"
                :description="errorMessage"
                kind="error"
                state="error"
                title="活动暂时无法显示"
                @action="goBack"
            />
        </view>

        <template v-else>
        <view class="detail-content">
            <activity-ticket
                :cover-url="activity.coverImage"
                :date-text="formatDateOnly(activity.startTime)"
                featured
                :location="activity.location"
                :price-label="formatPriceLabel(activity.price)"
                :show-image="canShowCover"
                :tags="getActivityTags(activity)"
                :time-text="formatActivityTimeRange(activity)"
                :title="activity.title"
                @image-error="coverError = true"
            />

            <ticket-section v-if="activity.maxParticipants" subtitle="报名信息实时更新" title="参与名额">
                <view class="detail-seat-row">
                    <text>{{ activity.maxParticipants }} 人</text>
                    <text v-if="activity.currentParticipants">已报名 {{ activity.currentParticipants }} 人</text>
                    <text v-if="hasLimitedSeats" class="remaining-few">仅剩 {{ remainingSeats }} 个名额</text>
                </view>
            </ticket-section>

            <ticket-section title="活动详情">
                <view class="desc-section">
                    <rich-text class="description" :nodes="safeHtmlContent" user-select></rich-text>
                </view>
            </ticket-section>

            <ticket-section v-if="activity.images && activity.images.length" title="活动图集">
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
            </ticket-section>

            <view class="disclaimer-section">
                <text class="disclaimer-text">
                    活动开始前24小时可申请全额退款；活动开始前12小时可申请50%退款；活动开始前12小时内不予退款。活动最终解释权归主办方所有。
                </text>
            </view>
        </view>

        <!-- 底部操作栏 -->
        <sticky-action-bar class="bottom-bar">
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
        </sticky-action-bar>
        </template>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import ActivityTicket from '../../components/ActivityTicket.vue';
import AsyncState from '../../components/AsyncState.vue';
import PageChrome from '../../components/PageChrome.vue';
import StickyActionBar from '../../components/StickyActionBar.vue';
import TicketSection from '../../components/TicketSection.vue';
import { getSafeHtml } from './htmlUtils';
import {
    formatDateOnly as formatActivityDateOnly,
    formatTimeOnly as formatActivityTimeOnly,
    mapActivityDetail,
} from '../activity/pageLogic';

export default {
    components: { ActivityTicket, AsyncState, PageChrome, StickyActionBar, TicketSection },
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

        formatActivityTimeRange(activity) {
            const start = this.formatTimeOnly(activity.startTime);
            const end = this.formatTimeOnly(activity.endTime);
            return end ? `${start} - ${end}` : start;
        },

        formatPriceLabel(price) {
            return Number(price || 0) > 0 ? `¥${(price / 100).toFixed(2)}` : '免费活动';
        },

        getActivityTags(activity) {
            return String(activity?.tags || '')
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean);
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
