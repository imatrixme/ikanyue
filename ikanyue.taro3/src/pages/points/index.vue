<template>
    <view class="points-page">
        <view class="points-summary">
            <view class="points-summary__content">
                <text class="points-summary__label">我的积分</text>
                <view class="points-summary__value-row">
                    <text class="points-summary__value">{{ balance }}</text>
                    <text class="points-summary__unit">分</text>
                </view>
            </view>
            <view class="points-summary__actions">
                <view class="summary-action" :class="{ 'summary-action--loading': loading }" aria-label="刷新积分" @tap="loadPointsLiteData">↻</view>
                <view class="summary-action" :aria-label="isLogin ? '打开我的账号' : '前往登录'" @tap="goProfile">我</view>
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

        <view v-else-if="!isLogin" class="points-state">
            <text class="points-state__title">登录后查看积分</text>
            <text class="points-state__desc">登录后可以查看当前积分和可领取的实物。</text>
            <view class="points-state__action" @tap="goProfile">前往登录</view>
        </view>

        <view v-else-if="errorMessage" class="points-state points-state--error">
            <text class="points-state__title">积分加载失败</text>
            <text class="points-state__desc">{{ errorMessage }}</text>
            <view class="points-state__action" @tap="loadPointsLiteData">重新加载</view>
        </view>

        <template v-else>
            <view class="points-section points-section--ready">
                <view class="section-heading">
                    <view>
                        <text class="points-section__title">现在可以领取</text>
                        <text class="points-section__subtitle">到前台后由老师确认扣分</text>
                    </view>
                    <text class="section-count">{{ redeemableRewards.length }} 件</text>
                </view>
                <view class="reward-list" v-if="redeemableRewards.length > 0">
                    <view class="reward-card reward-card--ready" v-for="item in redeemableRewards" :key="item.id">
                        <image v-if="canShowImage(item)" class="reward-card__image" :src="item.image" mode="aspectFill" @error="markImageFailed(item.id)" />
                        <view v-else class="reward-card__placeholder">{{ item.name.slice(0, 1) }}</view>
                        <view class="reward-card__body">
                            <view class="reward-card__heading">
                                <text class="reward-card__name">{{ item.name }}</text>
                                <text class="reward-card__status reward-card__status--ready">可领取</text>
                            </view>
                            <text class="reward-card__desc">{{ item.description || '到前台领取实物。' }}</text>
                            <text class="reward-card__price">{{ formatPoints(item.pointsPrice) }}</text>
                        </view>
                    </view>
                </view>
                <view v-else class="points-empty">
                    <text class="points-empty__title">暂时没有可领取实物</text>
                    <text class="points-empty__desc">继续积累积分，很快就能解锁下一件实物。</text>
                </view>
            </view>

            <view class="points-section">
                <view class="section-heading">
                    <view>
                        <text class="points-section__title">继续积累</text>
                        <text class="points-section__subtitle">查看距离下一件实物还有多少积分</text>
                    </view>
                </view>
                <view class="reward-list" v-if="lockedRewards.length > 0">
                    <view class="reward-card" v-for="item in lockedRewards" :key="item.id">
                        <image v-if="canShowImage(item)" class="reward-card__image" :src="item.image" mode="aspectFill" @error="markImageFailed(item.id)" />
                        <view v-else class="reward-card__placeholder">{{ item.name.slice(0, 1) }}</view>
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
                                <text class="reward-progress__text">已完成 {{ getRewardProgress(item, balance) }}%</text>
                                <text class="reward-card__price">{{ formatPoints(item.pointsPrice) }}</text>
                            </view>
                        </view>
                    </view>
                </view>
                <view v-else class="points-empty">
                    <text class="points-empty__title">所有实物都已解锁</text>
                    <text class="points-empty__desc">当前积分足以领取所有上架实物。</text>
                </view>
            </view>
        </template>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { UserManager } from '../../../utils/usermanager';
import {
    formatPoints,
    getRewardProgress,
    getRewardStateText,
    normalizeRewardAvailability,
} from './pageLogic';
import './index.scss';

export default {
    data() {
        return {
            balance: 0,
            errorMessage: '',
            failedImages: {},
            isLogin: false,
            loading: false,
            lockedRewards: [],
            redeemableRewards: [],
        };
    },
    mounted() {
        this.loadPointsLiteData();
    },
    onShow() {
        this.loadPointsLiteData();
    },
    methods: {
        formatPoints,
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
        async loadPointsLiteData() {
            if (this.loading) return;
            this.isLogin = UserManager.isLogin();
            if (!this.isLogin) {
                this.balance = 0;
                this.redeemableRewards = [];
                this.lockedRewards = [];
                this.errorMessage = '';
                return;
            }
            this.loading = true;
            this.errorMessage = '';
            try {
                const rewardsPayload = await Api.listRewardItems();
                const rewards = normalizeRewardAvailability(rewardsPayload);
                this.balance = rewards.currentPoints;
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
