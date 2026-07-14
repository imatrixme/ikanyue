<template>
    <view class="history-page">
        <view class="history-hero">
            <view>
                <text class="history-hero__title">积分明细</text>
            </view>
            <view class="history-balance">
                <text class="history-balance__value">{{ balance }}</text>
                <text class="history-balance__unit">PT</text>
            </view>
            <view class="history-hero__footer">
                <text>当前可用积分</text>
                <text>{{ pagination.totalItems }} 条记录</text>
            </view>
        </view>

        <view class="history-content">
            <view v-if="loading" class="history-state">
                <text class="history-state__title">正在加载积分记录</text>
            </view>

            <empty-state
                v-else-if="errorMessage"
                action-label="重新加载"
                :description="errorMessage"
                kind="network"
                title="积分记录暂时无法加载"
                @action="refreshEvents"
            />

            <empty-state
                v-else-if="events.length === 0"
                description="参加活动或由老师添加积分后，记录会显示在这里。"
                kind="points"
                title="暂无积分记录"
            />

            <view v-else class="point-events">
                <view
                    v-for="event in events"
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

            <view v-if="events.length > 0" class="history-footer">
                <text v-if="loadingMore">正在加载更多</text>
                <text v-else-if="hasMore">已加载 {{ events.length }} / {{ pagination.totalItems }}</text>
                <text v-else>已显示全部记录</text>
            </view>
        </view>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { UserManager } from '../../../utils/usermanager';
import EmptyState from '../../components/EmptyState.vue';
import {
    formatPointEventDate,
    formatPointEventDelta,
    getPointEventLabel,
    getPointEventReason,
    mergePointEvents,
    normalizePointSummary,
} from '../points/pageLogic';
import './index.scss';

const EMPTY_PAGINATION = { page: 1, perPage: 20, totalItems: 0, totalPages: 1 };

export default {
    components: { EmptyState },
    data() {
        return {
            balance: 0,
            errorMessage: '',
            events: [],
            loading: true,
            loadingMore: false,
            pagination: { ...EMPTY_PAGINATION },
        };
    },
    computed: {
        hasMore() {
            return this.pagination.page < this.pagination.totalPages;
        },
    },
    onLoad() {
        this.refreshEvents();
    },
    async onPullDownRefresh() {
        try {
            await this.refreshEvents();
        } finally {
            Taro.stopPullDownRefresh();
        }
    },
    onReachBottom() {
        this.loadMoreEvents();
    },
    methods: {
        formatPointEventDate,
        formatPointEventDelta,
        getPointEventLabel,
        getPointEventReason,
        async refreshEvents() {
            if (!UserManager.isLogin()) {
                Taro.switchTab({ url: '/pages/profile/index' });
                return;
            }
            this.loading = true;
            this.errorMessage = '';
            try {
                const summary = normalizePointSummary(await Api.getMyPointSummary({ page: 1, perPage: 20 }));
                this.balance = summary.balance;
                this.events = summary.events;
                this.pagination = summary.pagination;
            } catch (error) {
                this.errorMessage = error?.message || '请检查网络后重试。';
            } finally {
                this.loading = false;
            }
        },
        async loadMoreEvents() {
            if (this.loading || this.loadingMore || !this.hasMore) {
                return;
            }
            this.loadingMore = true;
            try {
                const nextPage = this.pagination.page + 1;
                const summary = normalizePointSummary(await Api.getMyPointSummary({ page: nextPage, perPage: 20 }));
                this.balance = summary.balance;
                this.events = mergePointEvents(this.events, summary.events);
                this.pagination = summary.pagination;
            } catch (error) {
                Taro.showToast({ title: error?.message || '记录加载失败', icon: 'none' });
            } finally {
                this.loadingMore = false;
            }
        },
    },
};
</script>
