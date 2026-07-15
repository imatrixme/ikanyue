<template>
    <view class="points-page">
        <view class="points-masthead">
            <view class="points-balance">
                <view>
                    <text class="points-balance__label">可用积分</text>
                    <text class="points-balance__value">{{ balance }}</text>
                </view>
                <text class="points-balance__unit">PT</text>
            </view>

            <view class="points-metrics">
                <view class="points-metric">
                    <text class="points-metric__value">{{ redeemableRewards.length }}</text>
                    <text class="points-metric__label">件可领取</text>
                </view>
                <view class="points-metric">
                    <text class="points-metric__value">{{ lockedRewards.length }}</text>
                    <text class="points-metric__label">件待解锁</text>
                </view>
            </view>
        </view>

        <view v-if="loading" class="points-loading" aria-label="积分和实物加载中">
            <view class="skeleton-card" v-for="index in 3" :key="index">
                <view class="skeleton-card__media" />
                <view class="skeleton-card__body">
                    <view class="skeleton-line skeleton-line--title" />
                    <view class="skeleton-line" />
                    <view class="skeleton-line skeleton-line--short" />
                </view>
            </view>
        </view>

        <view v-else-if="!isLogin" class="points-page__state">
            <empty-state
                action-label="登录 / 注册"
                description="登录后可以查看积分、活动和当前可兑换实物。"
                kind="account"
                title="登录后查看积分账户"
                @action="goProfile"
            />
        </view>

        <view v-else-if="errorMessage" class="points-page__state">
            <empty-state
                action-label="重新加载"
                :description="errorMessage"
                kind="network"
                title="积分暂时无法加载"
                @action="loadPointsLiteData"
            />
        </view>

        <template v-else>
            <view class="points-section points-section--ready">
                <view class="section-heading">
                    <view class="section-heading__copy">
                        <text class="points-section__title">现在可领取</text>
                        <text class="points-section__subtitle">到前台领取时由老师确认扣分</text>
                    </view>
                    <view class="section-count section-count--action" @tap="goRewardCatalog('redeemable')">
                        <text>全部 {{ redeemableRewards.length }}</text>
                        <app-icon name="chevron-primary" :size="13" />
                    </view>
                </view>
                <scroll-view
                    v-if="redeemableRewards.length > 0"
                    class="reward-strip"
                    scroll-x
                    enhanced
                    enable-flex
                    :show-scrollbar="false"
                    aria-label="可领取实物图片"
                >
                    <view class="reward-strip__track">
                        <view
                            v-for="item in redeemablePreviewItems"
                            :key="item.id"
                            class="reward-tile"
                            @tap="goRewardCatalog('redeemable')"
                        >
                            <view class="reward-tile__media reward-tile__media--ready">
                                <image v-if="canShowImage(item)" class="reward-tile__image" :src="item.image" mode="aspectFill" @error="markImageFailed(item.id)" />
                                <view v-else class="reward-tile__placeholder">{{ item.name.slice(0, 1) }}</view>
                            </view>
                            <text class="reward-tile__name">{{ item.name }}</text>
                            <text class="reward-tile__meta reward-tile__meta--ready">{{ formatPoints(item.pointsPrice) }}</text>
                        </view>
                        <view
                            v-if="redeemableHiddenCount > 0"
                            class="reward-tile reward-tile--more"
                            @tap="goRewardCatalog('redeemable')"
                        >
                            <view class="reward-tile__media reward-tile__more-media">
                                <text class="reward-tile__more-count">+{{ redeemableHiddenCount }}</text>
                                <text class="reward-tile__more-label">查看更多</text>
                            </view>
                            <text class="reward-tile__name">全部可领取</text>
                            <text class="reward-tile__meta">进入完整列表</text>
                        </view>
                    </view>
                </scroll-view>
                <view v-else class="points-empty-row points-empty-row--ready">
                    <view class="points-empty-row__icon">
                        <app-icon name="empty-rewards" :size="20" />
                    </view>
                    <view class="points-empty-row__copy">
                        <text class="points-empty-row__title">暂无可兑换实物</text>
                        <text class="points-empty-row__description">继续积累积分，达到所需积分后即可线下领取。</text>
                    </view>
                </view>
            </view>

            <view class="points-section">
                <view class="section-heading">
                    <view class="section-heading__copy">
                        <text class="points-section__title">全部实物</text>
                        <text class="points-section__subtitle">已解锁与继续积累中的实物</text>
                    </view>
                    <view class="section-count section-count--action" @tap="goRewardCatalog('all')">
                        <text>全部 {{ allRewards.length }}</text>
                        <app-icon name="chevron-primary" :size="13" />
                    </view>
                </view>
                <scroll-view
                    v-if="allRewards.length > 0"
                    class="reward-strip"
                    scroll-x
                    enhanced
                    enable-flex
                    :show-scrollbar="false"
                    aria-label="全部实物图片"
                >
                    <view class="reward-strip__track">
                        <view
                            v-for="item in allRewardPreviewItems"
                            :key="item.id"
                            class="reward-tile"
                            @tap="goRewardCatalog('all')"
                        >
                            <view class="reward-tile__media" :class="{ 'reward-tile__media--ready': isRewardRedeemable(item) }">
                                <image v-if="canShowImage(item)" class="reward-tile__image" :src="item.image" mode="aspectFill" @error="markImageFailed(item.id)" />
                                <view v-else class="reward-tile__placeholder">{{ item.name.slice(0, 1) }}</view>
                            </view>
                            <text class="reward-tile__name">{{ item.name }}</text>
                            <text
                                class="reward-tile__meta"
                                :class="isRewardRedeemable(item) ? 'reward-tile__meta--ready' : 'reward-tile__meta--locked'"
                            >
                                {{ isRewardRedeemable(item) ? '可领取' : getRewardStateText(item, balance) }}
                            </text>
                        </view>
                        <view
                            v-if="allRewardsHiddenCount > 0"
                            class="reward-tile reward-tile--more"
                            @tap="goRewardCatalog('all')"
                        >
                            <view class="reward-tile__media reward-tile__more-media">
                                <text class="reward-tile__more-count">+{{ allRewardsHiddenCount }}</text>
                                <text class="reward-tile__more-label">查看更多</text>
                            </view>
                            <text class="reward-tile__name">全部实物</text>
                            <text class="reward-tile__meta">进入完整列表</text>
                        </view>
                    </view>
                </scroll-view>
                <view v-else class="points-empty-row">
                    <view class="points-empty-row__icon">
                        <app-icon name="empty-rewards" :size="20" />
                    </view>
                    <view class="points-empty-row__copy">
                        <text class="points-empty-row__title">暂无实物</text>
                        <text class="points-empty-row__description">实物上架后会显示在这里。</text>
                    </view>
                </view>
            </view>

            <view class="points-section points-section--events">
                <view class="section-heading">
                    <view class="section-heading__copy">
                        <text class="points-section__title">积分记录</text>
                        <text class="points-section__subtitle">最近 2 条变动</text>
                    </view>
                    <view class="section-count section-count--action" @tap="goPointHistory">
                        <text>全部 {{ pointEventTotal }}</text>
                        <app-icon name="chevron-primary" :size="13" />
                    </view>
                </view>

                <view v-if="pointEvents.length > 0" class="point-events">
                    <view
                        v-for="event in pointEvents"
                        :key="event.id"
                        class="point-event"
                        :class="{ 'point-event--spend': event.delta < 0 }"
                    >
                        <view class="point-event__rail"><view class="point-event__dot" /></view>
                        <view class="point-event__body">
                            <text class="point-event__title">{{ getPointEventLabel(event) }}</text>
                            <text class="point-event__reason">{{ getPointEventReason(event) }}</text>
                            <text
                                v-if="event.remark && event.remark !== getPointEventReason(event)"
                                class="point-event__remark"
                            >
                                {{ event.remark }}
                            </text>
                            <text class="point-event__meta">{{ formatPointEventDate(event.created) }}</text>
                        </view>
                        <view class="point-event__amount">
                            <text class="point-event__delta">{{ formatPointEventDelta(event.delta) }}</text>
                            <text class="point-event__balance">余额 {{ event.balanceAfter }}</text>
                        </view>
                    </view>
                </view>
                <view v-else class="points-empty-row points-empty-row--events">
                    <view class="points-empty-row__icon">
                        <app-icon name="empty-points" :size="20" />
                    </view>
                    <view class="points-empty-row__copy">
                        <text class="points-empty-row__title">暂无积分记录</text>
                        <text class="points-empty-row__description">参加活动或由老师添加积分后，记录会显示在这里。</text>
                    </view>
                </view>

            </view>
        </template>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { UserManager } from '../../../utils/usermanager';
import AppIcon from '../../components/AppIcon.vue';
import EmptyState from '../../components/EmptyState.vue';
import {
    formatPoints,
    formatPointEventDate,
    formatPointEventDelta,
    getPointEventLabel,
    getPointEventReason,
    getRewardStateText,
    normalizeRewardAvailability,
    normalizePointSummary,
} from './pageLogic';
import './index.scss';

export default {
    components: { AppIcon, EmptyState },
    data() {
        return {
            balance: 0,
            errorMessage: '',
            failedImages: {},
            isLogin: false,
            loading: false,
            lockedRewards: [],
            pointEvents: [],
            pointEventsPagination: { page: 1, perPage: 2, totalItems: 0, totalPages: 1 },
            redeemableRewards: [],
        };
    },
    computed: {
        allRewardPreviewItems() {
            return this.allRewards.slice(0, 5);
        },
        allRewards() {
            return [...this.redeemableRewards, ...this.lockedRewards]
                .sort((left, right) => left.pointsPrice - right.pointsPrice || left.sortOrder - right.sortOrder);
        },
        allRewardsHiddenCount() {
            return Math.max(0, this.allRewards.length - 5);
        },
        pointEventTotal() {
            return this.pointEventsPagination.totalItems || this.pointEvents.length;
        },
        redeemableHiddenCount() {
            return Math.max(0, this.redeemableRewards.length - 5);
        },
        redeemablePreviewItems() {
            return this.redeemableRewards.slice(0, 5);
        },
    },
    mounted() {
        this.loadPointsLiteData();
    },
    onShow() {
        this.loadPointsLiteData();
    },
    async onPullDownRefresh() {
        try {
            await this.loadPointsLiteData();
        } finally {
            Taro.stopPullDownRefresh();
        }
    },
    methods: {
        formatPoints,
        formatPointEventDate,
        formatPointEventDelta,
        getPointEventLabel,
        getPointEventReason,
        getRewardStateText,
        canShowImage(item) {
            return Boolean(item.image && !this.failedImages[item.id]);
        },
        markImageFailed(itemId) {
            this.failedImages = { ...this.failedImages, [itemId]: true };
        },
        isRewardRedeemable(item) {
            return Number(item?.pointsPrice || 0) <= Number(this.balance || 0);
        },
        goProfile() {
            Taro.switchTab({ url: '/pages/profile/index' });
        },
        goPointHistory() {
            Taro.navigateTo({ url: '/pages/pointsHistory/index' });
        },
        goRewardCatalog(view) {
            Taro.navigateTo({ url: `/pages/rewardCatalog/index?view=${view}` });
        },
        async loadPointsLiteData() {
            if (this.loading) return;
            this.isLogin = UserManager.isLogin();
            if (!this.isLogin) {
                this.balance = 0;
                this.redeemableRewards = [];
                this.lockedRewards = [];
                this.pointEvents = [];
                this.pointEventsPagination = { page: 1, perPage: 2, totalItems: 0, totalPages: 1 };
                this.errorMessage = '';
                return;
            }
            this.loading = true;
            this.errorMessage = '';
            try {
                const [summaryPayload, rewardsPayload] = await Promise.all([
                    Api.getMyPointSummary({ page: 1, perPage: 2 }),
                    Api.listRewardItems(),
                ]);
                const summary = normalizePointSummary(summaryPayload);
                const rewards = normalizeRewardAvailability(rewardsPayload);
                this.balance = summary.balance;
                this.pointEvents = summary.events;
                this.pointEventsPagination = summary.pagination;
                this.redeemableRewards = rewards.redeemable;
                this.lockedRewards = rewards.locked;
                this.failedImages = {};
            } catch (error) {
                this.errorMessage = error?.message || '请检查网络后重试。';
            } finally {
                this.loading = false;
            }
        },
    },
};
</script>
