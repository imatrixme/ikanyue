<template>
    <view class="catalog-page">
        <view class="catalog-hero">
            <view class="catalog-hero__heading">
                <view>
                    <text class="catalog-hero__title">实物列表</text>
                </view>
                <view class="catalog-balance">
                    <text class="catalog-balance__value">{{ balance }}</text>
                    <text class="catalog-balance__unit">PT</text>
                </view>
            </view>
            <view class="catalog-hero__counts">
                <text>{{ redeemableRewards.length }} 件可领取</text>
                <text>{{ lockedRewards.length }} 件待解锁</text>
            </view>
        </view>

        <view class="catalog-tabs">
            <view
                class="catalog-tab"
                :class="{ 'catalog-tab--active': activeView === 'redeemable' }"
                @tap="setActiveView('redeemable')"
            >
                可兑换
            </view>
            <view
                class="catalog-tab"
                :class="{ 'catalog-tab--active': activeView === 'locked' }"
                @tap="setActiveView('locked')"
            >
                未达到
            </view>
        </view>

        <view class="catalog-content">
            <view v-if="loading" class="catalog-state">
                <text class="catalog-state__title">正在加载实物列表</text>
            </view>

            <empty-state
                v-else-if="errorMessage"
                action-label="重新加载"
                :description="errorMessage"
                kind="network"
                title="实物列表暂时无法加载"
                @action="loadRewards"
            />

            <empty-state
                v-else-if="activeItems.length === 0"
                :description="activeView === 'redeemable' ? '继续积累积分，达到所需积分后即可线下领取。' : '当前积分已经满足所有上架实物。'"
                kind="rewards"
                :title="activeView === 'redeemable' ? '暂无可兑换实物' : '已解锁全部实物'"
            />

            <view v-else class="catalog-list">
                <view v-for="item in activeItems" :key="item.id" class="catalog-item">
                    <view class="catalog-item__media">
                        <image
                            v-if="canShowImage(item)"
                            class="catalog-item__image"
                            :src="item.image"
                            mode="aspectFill"
                            @error="markImageFailed(item.id)"
                        />
                        <view v-else class="catalog-item__placeholder">{{ item.name.slice(0, 1) }}</view>
                    </view>
                    <view class="catalog-item__body">
                        <view class="catalog-item__heading">
                            <text class="catalog-item__name">{{ item.name }}</text>
                            <text
                                class="catalog-item__status"
                                :class="{ 'catalog-item__status--ready': activeView === 'redeemable' }"
                            >
                                {{ activeView === 'redeemable' ? '可领取' : getRewardStateText(item, balance) }}
                            </text>
                        </view>
                        <text class="catalog-item__desc">{{ item.description || '到前台领取实物。' }}</text>
                        <view v-if="activeView === 'locked'" class="catalog-progress">
                            <view class="catalog-progress__bar" :style="{ width: `${getRewardProgress(item, balance)}%` }" />
                        </view>
                        <view class="catalog-item__footer">
                            <text>{{ activeView === 'redeemable' ? '线下领取' : `当前进度 ${getRewardProgress(item, balance)}%` }}</text>
                            <text class="catalog-item__price">{{ formatPoints(item.pointsPrice) }}</text>
                        </view>
                    </view>
                </view>
            </view>
        </view>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { UserManager } from '../../../utils/usermanager';
import EmptyState from '../../components/EmptyState.vue';
import { formatPoints, getRewardProgress, getRewardStateText, normalizeRewardAvailability } from '../points/pageLogic';
import './index.scss';

export default {
    components: { EmptyState },
    data() {
        return {
            activeView: 'redeemable',
            balance: 0,
            errorMessage: '',
            failedImages: {},
            loading: true,
            lockedRewards: [],
            redeemableRewards: [],
        };
    },
    computed: {
        activeItems() {
            return this.activeView === 'locked' ? this.lockedRewards : this.redeemableRewards;
        },
    },
    onLoad(options = {}) {
        this.activeView = options.view === 'locked' ? 'locked' : 'redeemable';
        this.loadRewards();
    },
    async onPullDownRefresh() {
        try {
            await this.loadRewards();
        } finally {
            Taro.stopPullDownRefresh();
        }
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
        setActiveView(view) {
            this.activeView = view;
        },
        async loadRewards() {
            if (!UserManager.isLogin()) {
                Taro.switchTab({ url: '/pages/profile/index' });
                return;
            }
            this.loading = true;
            this.errorMessage = '';
            try {
                const rewards = normalizeRewardAvailability(await Api.listRewardItems());
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
