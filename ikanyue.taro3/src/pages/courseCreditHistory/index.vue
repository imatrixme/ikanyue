<template>
    <page-chrome class="course-credit-page" tone="immersive">
        <page-header eyebrow="CREDIT HISTORY" :subtitle="`${pagination.totalItems} 条不可变记录`" title="课程点明细" />
        <view class="course-credit-content">
            <view v-if="state !== 'ready'" class="course-credit-state">
                <async-state
                    :action-label="state === 'error' ? '重新加载' : ''"
                    :description="state === 'error' ? errorMessage : '课程点到账、预约或扣除后会形成记录。'"
                    :kind="state === 'error' ? 'network' : 'points'"
                    :state="state"
                    :title="state === 'empty' ? '暂无课程点记录' : ''"
                    @action="refresh"
                />
            </view>
            <template v-else>
                <view class="course-credit-list">
                    <course-credit-event-row v-for="event in items" :key="event.id" :event="event" />
                </view>
                <pagination-state
                    :has-more="hasMore"
                    :loaded="items.length"
                    :loading="loadingMore"
                    :total="pagination.totalItems"
                />
            </template>
        </view>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import AsyncState from '../../components/AsyncState.vue';
import CourseCreditEventRow from '../../components/CourseCreditEventRow.vue';
import PageChrome from '../../components/PageChrome.vue';
import PageHeader from '../../components/PageHeader.vue';
import PaginationState from '../../components/PaginationState.vue';
import { courseCreditErrorMessage, hasNextPage, mergePage, normalizePage, pageState } from '../courseCredits/pageLogic';
import './index.scss';

export default {
    components: { AsyncState, CourseCreditEventRow, PageChrome, PageHeader, PaginationState },
    data() { return { errorMessage: '', items: [], loading: false, loadingMore: false, pagination: normalizePage() }; },
    computed: {
        hasMore() { return hasNextPage(this.pagination); },
        state() { return pageState({ error: this.errorMessage, items: this.items, loading: this.loading }); },
    },
    mounted() { this.refresh(); },
    async onPullDownRefresh() { try { await this.refresh(); } finally { Taro.stopPullDownRefresh(); } },
    onReachBottom() { this.loadMore(); },
    methods: {
        async refresh() { return this.loadPage(1, true); },
        async loadMore() {
            if (!this.hasMore || this.loadingMore) return;
            this.loadingMore = true;
            try { await this.loadPage(this.pagination.page + 1, false); } finally { this.loadingMore = false; }
        },
        async loadPage(page, replace) {
            if (replace) this.loading = true;
            this.errorMessage = '';
            try {
                const result = normalizePage(await Api.listCourseCreditEvents({ page, perPage: 20 }));
                this.items = replace ? result.items : mergePage(this.items, result.items);
                this.pagination = result;
            } catch (error) { this.errorMessage = courseCreditErrorMessage(error, '课程点明细暂时无法加载'); }
            finally { if (replace) this.loading = false; }
        },
    },
};
</script>
