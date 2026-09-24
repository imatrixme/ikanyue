<template>
    <teacher-calendar-home v-if="role === 'teacher'" ref="teacherCalendar" />
    <page-chrome v-else class="points-page">
        <points-pass
            :balance="balance"
            :caption="`${redeemableRewards.length} 件可领取 · ${lockedRewards.length} 件待解锁`"
        />

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
            <async-state
                action-label="登录 / 注册"
                description="登录后可以查看积分、活动和当前可领取实物。"
                kind="account"
                state="empty"
                title="登录后查看积分账户"
                @action="goProfile"
            />
        </view>

        <view v-else-if="errorMessage" class="points-page__state">
            <async-state
                action-label="重新加载"
                :description="errorMessage"
                kind="network"
                state="error"
                title="积分暂时无法加载"
                @action="loadPointsLiteData"
            />
        </view>

        <template v-else>
            <ticket-section
                action-label="全部实物"
                subtitle="到前台领取时由老师确认扣分"
                title="现在可领取"
                @action="goRewardCatalog('redeemable')"
            >
                <view v-if="redeemableRewards.length > 0" class="reward-voucher-list">
                    <reward-voucher
                        v-for="item in redeemableVoucherItems"
                        :key="item.id"
                        description="线下领取 · 管理员确认扣分"
                        :item="item"
                        redeemable
                        :show-image="canShowImage(item)"
                        @image-error="markImageFailed"
                        @select="goRewardCatalog('redeemable')"
                    />
                    <view
                        v-if="redeemableHiddenCount > 0"
                        class="reward-voucher-more"
                        @tap="goRewardCatalog('redeemable')"
                    >
                        <text>查看更多 · 另有 {{ redeemableHiddenCount }} 件可领取实物</text>
                        <app-icon name="chevron-primary" size="sm" />
                    </view>
                </view>
                <view v-else class="points-empty-row points-empty-row--ready">
                    <view class="points-empty-row__icon">
                        <app-icon name="account-rewards" size="xl" />
                    </view>
                    <view class="points-empty-row__copy">
                        <text class="points-empty-row__title">暂无可领取实物</text>
                        <text class="points-empty-row__description">继续积累积分，达到所需积分后即可线下领取。</text>
                    </view>
                </view>
            </ticket-section>

            <ticket-section
                action-label="查看目录"
                :subtitle="`${redeemableRewards.length} 件已解锁 · ${lockedRewards.length} 件继续积累`"
                title="全部实物"
                @action="goRewardCatalog('all')"
            >
                <account-row
                    description="浏览所有实物及所需积分"
                    icon="account-rewards"
                    interactive
                    :title="`${allRewards.length} 件实物`"
                    :value="`${balance} PT`"
                    @select="goRewardCatalog('all')"
                />
            </ticket-section>

            <ticket-section
                :action-label="pointEventTotal > pointEvents.length ? `全部 ${pointEventTotal} 条` : ''"
                title="积分记录"
                @action="goPointHistory"
            >

                <view v-if="pointEvents.length > 0" class="point-events">
                    <point-event-row
                        v-for="event in pointEvents"
                        :key="event.id"
                        :balance="event.balanceAfter"
                        :delta="formatPointEventDelta(event.delta)"
                        :meta="formatPointEventDate(event.created)"
                        :reason="getPointEventReason(event)"
                        :remark="event.remark"
                        :spending="event.delta < 0"
                        :title="getPointEventLabel(event)"
                    />
                </view>
                <view v-else class="points-empty-row points-empty-row--events">
                    <view class="points-empty-row__icon">
                        <app-icon name="account-points" size="xl" />
                    </view>
                    <view class="points-empty-row__copy">
                        <text class="points-empty-row__title">暂无积分记录</text>
                        <text class="points-empty-row__description">参加活动或由老师添加积分后，记录会显示在这里。</text>
                    </view>
                </view>

            </ticket-section>
        </template>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { UserManager } from '../../../utils/usermanager';
import AccountRow from '../../components/AccountRow.vue';
import AppIcon from '../../components/AppIcon.vue';
import AsyncState from '../../components/AsyncState.vue';
import PageChrome from '../../components/PageChrome.vue';
import PointEventRow from '../../components/PointEventRow.vue';
import PointsPass from '../../components/PointsPass.vue';
import RewardVoucher from '../../components/RewardVoucher.vue';
import TicketSection from '../../components/TicketSection.vue';
import TeacherCalendarHome from '../../components/TeacherCalendarHome.vue';
import { RoleManager } from '../../../utils/rolemanager';
import {
    formatPointEventDate,
    formatPointEventDelta,
    getPointEventLabel,
    getPointEventReason,
    normalizeRewardAvailability,
    normalizePointSummary,
} from './pageLogic';
import './index.scss';

export default {
    components: {
        AccountRow, AppIcon, AsyncState, PageChrome, PointEventRow, PointsPass,
        RewardVoucher, TeacherCalendarHome, TicketSection,
    },
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
            role: 'student',
        };
    },
    computed: {
        allRewards() {
            return [...this.redeemableRewards, ...this.lockedRewards]
                .sort((left, right) => left.pointsPrice - right.pointsPrice || left.sortOrder - right.sortOrder);
        },
        pointEventTotal() {
            return this.pointEventsPagination.totalItems || this.pointEvents.length;
        },
        redeemableHiddenCount() {
            return Math.max(0, this.redeemableRewards.length - 5);
        },
        redeemableVoucherItems() {
            return this.redeemableRewards.slice(0, 3);
        },
    },
    mounted() {},
    onShow() {
        this.role = RoleManager.getRole();
        RoleManager.applyTabBar(this.role);
        Taro.setNavigationBarTitle({ title: this.role === 'teacher' ? '课程日历' : '积分账户' });
        if (this.role === 'teacher') this.$nextTick(() => this.$refs.teacherCalendar?.refresh());
        else this.loadPointsLiteData();
    },
    async onPullDownRefresh() {
        try {
            if (this.role === 'teacher') await this.$refs.teacherCalendar?.refresh(true);
            else await this.loadPointsLiteData();
        } finally {
            Taro.stopPullDownRefresh();
        }
    },
    methods: {
        formatPointEventDate,
        formatPointEventDelta,
        getPointEventLabel,
        getPointEventReason,
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
