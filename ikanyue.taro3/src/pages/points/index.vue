<template>
    <view class="points-page">
        <view class="points-hero">
            <text class="points-hero__label">当前积分</text>
            <text class="points-hero__balance">{{ balance }}</text>
            <text class="points-hero__desc">积分由老师线下确认后发放，满足额度后可到前台领取实物。</text>
        </view>

        <view class="points-actions">
            <view class="points-action points-action--primary" @tap="loadPointsLiteData">刷新积分</view>
            <view class="points-action" @tap="goProfile">{{ isLogin ? '账号' : '登录' }}</view>
        </view>

        <view v-if="errorMessage" class="points-empty">{{ errorMessage }}</view>

        <view class="points-section">
            <text class="points-section__title">当前可兑换</text>
            <view class="reward-list" v-if="redeemableRewards.length > 0">
                <view class="reward-card" v-for="item in redeemableRewards" :key="item.id">
                    <image v-if="item.image" class="reward-card__image" :src="item.image" mode="aspectFill" />
                    <view v-else class="reward-card__placeholder">{{ item.name.slice(0, 1) }}</view>
                    <view class="reward-card__body">
                        <text class="reward-card__name">{{ item.name }}</text>
                        <text class="reward-card__desc">{{ item.description || '到店后由老师确认领取。' }}</text>
                        <text class="reward-card__price">{{ formatPoints(item.pointsPrice) }}</text>
                    </view>
                    <text class="reward-card__status reward-card__status--ready">可兑换</text>
                </view>
            </view>
            <view v-else class="points-empty">当前积分还不能兑换实物。</view>
        </view>

        <view class="points-section">
            <text class="points-section__title">继续积累</text>
            <view class="reward-list" v-if="lockedRewards.length > 0">
                <view class="reward-card reward-card--locked" v-for="item in lockedRewards" :key="item.id">
                    <image v-if="item.image" class="reward-card__image" :src="item.image" mode="aspectFill" />
                    <view v-else class="reward-card__placeholder">{{ item.name.slice(0, 1) }}</view>
                    <view class="reward-card__body">
                        <text class="reward-card__name">{{ item.name }}</text>
                        <text class="reward-card__desc">{{ item.description || '积分达到后可线下领取。' }}</text>
                        <text class="reward-card__price">{{ formatPoints(item.pointsPrice) }}</text>
                    </view>
                    <text class="reward-card__status reward-card__status--locked">{{ getRewardStateText(item, balance) }}</text>
                </view>
            </view>
            <view v-else class="points-empty">所有上架实物当前均可兑换。</view>
        </view>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { UserManager } from '../../../utils/usermanager';
import {
    formatPoints,
    getRewardStateText,
    normalizeRewardAvailability,
} from './pageLogic';
import './index.scss';

export default {
    data() {
        return {
            balance: 0,
            errorMessage: '',
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
        getRewardStateText,
        goProfile() {
            Taro.switchTab({ url: '/pages/profile/index' });
        },
        async loadPointsLiteData() {
            this.isLogin = UserManager.isLogin();
            if (!this.isLogin) {
                this.balance = 0;
                this.redeemableRewards = [];
                this.lockedRewards = [];
                this.errorMessage = '登录后可查看积分和可兑换实物。';
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
            } catch (error) {
                this.errorMessage = error?.message || '积分加载失败，请稍后重试。';
            } finally {
                this.loading = false;
            }
        },
    },
};
</script>
