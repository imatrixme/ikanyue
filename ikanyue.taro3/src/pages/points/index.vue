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
                        <text class="points-section__title">现在可以领取</text>
                        <text class="points-section__subtitle">到前台领取时由老师确认扣分</text>
                    </view>
                    <view class="section-count section-count--action" @tap="goRewardCatalog('redeemable')">
                        <text>全部 {{ redeemableRewards.length }}</text>
                        <app-icon name="chevron-blue" :size="13" />
                    </view>
                </view>
                <view class="reward-list" v-if="redeemableRewards.length > 0">
                    <view class="reward-card reward-card--ready" v-for="item in recentRedeemableRewards" :key="item.id">
                        <view class="reward-card__media">
                            <image v-if="canShowImage(item)" class="reward-card__image" :src="item.image" mode="aspectFill" @error="markImageFailed(item.id)" />
                            <view v-else class="reward-card__placeholder">{{ item.name.slice(0, 1) }}</view>
                        </view>
                        <view class="reward-card__body">
                            <view class="reward-card__heading">
                                <text class="reward-card__name">{{ item.name }}</text>
                                <text class="reward-card__status reward-card__status--ready">可领取</text>
                            </view>
                            <text class="reward-card__desc">{{ item.description || '到前台领取实物。' }}</text>
                            <view class="reward-card__footer">
                                <text class="reward-card__pickup">线下领取</text>
                                <text class="reward-card__price">{{ formatPoints(item.pointsPrice) }}</text>
                            </view>
                        </view>
                    </view>
                </view>
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
                        <text class="points-section__title">继续积累</text>
                        <text class="points-section__subtitle">查看距离所需积分还有多少</text>
                    </view>
                    <view class="section-count section-count--action" @tap="goRewardCatalog('locked')">
                        <text>全部 {{ lockedRewards.length }}</text>
                        <app-icon name="chevron-blue" :size="13" />
                    </view>
                </view>
                <view class="reward-list" v-if="lockedRewards.length > 0">
                    <view class="reward-card" v-for="item in recentLockedRewards" :key="item.id">
                        <view class="reward-card__media">
                            <image v-if="canShowImage(item)" class="reward-card__image" :src="item.image" mode="aspectFill" @error="markImageFailed(item.id)" />
                            <view v-else class="reward-card__placeholder">{{ item.name.slice(0, 1) }}</view>
                        </view>
                        <view class="reward-card__body">
                            <view class="reward-card__heading">
                                <text class="reward-card__name">{{ item.name }}</text>
                                <text class="reward-card__status reward-card__status--locked">{{ getRewardStateText(item, balance) }}</text>
                            </view>
                            <text class="reward-card__desc">{{ item.description || '积分达到后可线下领取。' }}</text>
                            <view class="reward-progress">
                                <view class="reward-progress__bar" :style="{ width: `${getRewardProgress(item, balance)}%` }" />
                            </view>
                            <view class="reward-card__footer">
                                <text class="reward-progress__text">当前进度 {{ getRewardProgress(item, balance) }}%</text>
                                <text class="reward-card__price">{{ formatPoints(item.pointsPrice) }}</text>
                            </view>
                        </view>
                    </view>
                </view>
                <view v-else class="points-empty-row">
                    <view class="points-empty-row__icon">
                        <app-icon name="empty-rewards" :size="20" />
                    </view>
                    <view class="points-empty-row__copy">
                        <text class="points-empty-row__title">已解锁全部实物</text>
                        <text class="points-empty-row__description">当前积分已经满足所有上架实物。</text>
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
                        <app-icon name="chevron-blue" :size="13" />
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
    getRewardProgress,
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
        pointEventTotal() {
            return this.pointEventsPagination.totalItems || this.pointEvents.length;
        },
        recentLockedRewards() {
            return this.lockedRewards.slice(0, 2);
        },
        recentRedeemableRewards() {
            return this.redeemableRewards.slice(0, 2);
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
        getRewardProgress,
        getRewardStateText,
        canShowImage(item) {
            return Boolean(item.image && !this.failedImages[item.id]);
        },
        markImageFailed(itemId) {
            this.failedImages = { ...this.failedImages, [itemId]: true };
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
