<template>
    <page-chrome class="catalog-page">
        <points-pass
            :balance="balance"
            :caption="`${redeemableRewards.length} 件可领取 · ${lockedRewards.length} 件待解锁`"
            compact
        />

        <segmented-control v-model="activeView" class="catalog-tabs" :options="catalogOptions" @change="setActiveView" />

        <ticket-section :subtitle="activeViewSubtitle" :title="activeViewTitle">
            <async-state v-if="loading" state="loading" title="正在加载实物列表" />

            <async-state
                v-else-if="errorMessage"
                action-label="重新加载"
                :description="errorMessage"
                kind="network"
                state="error"
                title="实物列表暂时无法加载"
                @action="loadRewards"
            />

            <async-state
                v-else-if="activeItems.length === 0"
                :description="emptyStateDescription"
                kind="rewards"
                state="empty"
                :title="emptyStateTitle"
            />

            <view v-else class="catalog-list">
                <reward-voucher
                    v-for="item in activeItems"
                    :key="item.id"
                    :description="item.description || `当前进度 ${getRewardProgress(item, balance)}%`"
                    :item="item"
                    :locked-label="getRewardStateText(item, balance)"
                    :redeemable="isRewardRedeemable(item)"
                    :show-image="canShowImage(item)"
                    @image-error="markImageFailed"
                />
            </view>
        </ticket-section>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { UserManager } from '../../../utils/usermanager';
import AsyncState from '../../components/AsyncState.vue';
import PageChrome from '../../components/PageChrome.vue';
import PointsPass from '../../components/PointsPass.vue';
import RewardVoucher from '../../components/RewardVoucher.vue';
import SegmentedControl from '../../components/SegmentedControl.vue';
import TicketSection from '../../components/TicketSection.vue';
import { getRewardProgress, getRewardStateText, normalizeRewardAvailability } from '../points/pageLogic';
import './index.scss';

export default {
    components: { AsyncState, PageChrome, PointsPass, RewardVoucher, SegmentedControl, TicketSection },
    data() {
        return {
            activeView: 'redeemable',
            catalogOptions: [
                { label: '全部', value: 'all' },
                { label: '可领取', value: 'redeemable' },
                { label: '未解锁', value: 'locked' },
            ],
            balance: 0,
            errorMessage: '',
            failedImages: {},
            loading: true,
            lockedRewards: [],
            redeemableRewards: [],
        };
    },
    computed: {
        allRewards() {
            return [...this.redeemableRewards, ...this.lockedRewards]
                .sort((left, right) => left.pointsPrice - right.pointsPrice || left.sortOrder - right.sortOrder);
        },
        activeItems() {
            if (this.activeView === 'all') return this.allRewards;
            return this.activeView === 'locked' ? this.lockedRewards : this.redeemableRewards;
        },
        activeViewSubtitle() {
            if (this.activeView === 'all') return '所有可领取与继续积累中的实物';
            if (this.activeView === 'locked') return '继续积累积分即可解锁';
            return '到前台领取时由老师确认扣分';
        },
        activeViewTitle() {
            if (this.activeView === 'all') return '全部实物';
            return this.activeView === 'locked' ? '未解锁' : '现在可领取';
        },
        emptyStateDescription() {
            if (this.activeView === 'all') return '实物上架后会显示在这里。';
            if (this.activeView === 'redeemable') return '继续积累积分，达到所需积分后即可线下领取。';
            return '当前积分已经满足所有上架实物。';
        },
        emptyStateTitle() {
            if (this.activeView === 'all') return '暂无实物';
            return this.activeView === 'redeemable' ? '暂无可领取实物' : '已解锁全部实物';
        },
    },
    onLoad(options = {}) {
        this.activeView = ['all', 'locked', 'redeemable'].includes(options.view) ? options.view : 'redeemable';
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
        getRewardProgress,
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
