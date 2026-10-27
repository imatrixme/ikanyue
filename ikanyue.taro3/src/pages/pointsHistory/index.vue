<template>
    <page-chrome class="history-page">
        <points-pass :balance="balance" :caption="`${pagination.totalItems} 条积分记录`" compact />

        <ticket-section subtitle="按时间倒序展示" title="积分明细">
            <async-state v-if="loading" state="loading" title="正在加载积分记录" />

            <async-state
                v-else-if="errorMessage"
                action-label="重新加载"
                :description="errorMessage"
                kind="network"
                state="error"
                title="积分记录暂时无法加载"
                @action="refreshEvents"
            />

            <async-state
                v-else-if="events.length === 0"
                description="参加活动或由老师添加积分后，记录会显示在这里。"
                kind="points"
                state="empty"
                title="暂无积分记录"
            />

            <view v-else class="point-events">
                <point-event-row
                    v-for="event in events"
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

            <pagination-state
                complete-label="已显示全部记录"
                :has-more="hasMore"
                :loaded="events.length"
                :loading="loadingMore"
                :total="pagination.totalItems"
                :visible="events.length > 0"
            />
        </ticket-section>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { UserManager } from '../../../utils/usermanager';
import AsyncState from '../../components/AsyncState.vue';
import PageChrome from '../../components/PageChrome.vue';
import PaginationState from '../../components/PaginationState.vue';
import PointEventRow from '../../components/PointEventRow.vue';
import PointsPass from '../../components/PointsPass.vue';
import TicketSection from '../../components/TicketSection.vue';
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
    components: { AsyncState, PageChrome, PaginationState, PointEventRow, PointsPass, TicketSection },
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
