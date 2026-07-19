<template>
    <page-chrome class="course-credit-page" tone="immersive">
        <page-header eyebrow="CREDIT BATCHES" :subtitle="`${pagination.totalItems} 个批次`" :title="pageTitle" />
        <view class="course-credit-content">
            <view v-if="state !== 'ready'" class="course-credit-state">
                <async-state
                    :action-label="state === 'error' ? '重新加载' : ''"
                    :description="state === 'error' ? errorMessage : '课程点到账后会生成独立批次。'"
                    :kind="state === 'error' ? 'network' : 'points'"
                    :state="state"
                    :title="state === 'empty' ? '暂无课程点批次' : ''"
                    @action="refresh"
                />
            </view>
            <template v-else>
                <text class="course-credit-batches__count">按有效期优先排列，临近到期的批次会排在前面。</text>
                <view class="course-credit-list">
                    <course-credit-batch-row v-for="batch in items" :key="batch.id" :batch="batch" @select="openBatch" />
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
import CourseCreditBatchRow from '../../components/CourseCreditBatchRow.vue';
import PageChrome from '../../components/PageChrome.vue';
import PageHeader from '../../components/PageHeader.vue';
import PaginationState from '../../components/PaginationState.vue';
import { courseCreditErrorMessage, hasNextPage, mergePage, normalizePage, pageState } from '../courseCredits/pageLogic';
import './index.scss';

export default {
    components: { AsyncState, CourseCreditBatchRow, PageChrome, PageHeader, PaginationState },
    data() {
        return {
            creditTypeId: '', errorMessage: '', items: [], loading: false, loadingMore: false,
            pageTitle: '全部课程点', pagination: normalizePage(),
        };
    },
    computed: {
        hasMore() { return hasNextPage(this.pagination); },
        state() { return pageState({ error: this.errorMessage, items: this.items, loading: this.loading }); },
    },
    mounted() {
        const params = Taro.getCurrentInstance()?.router?.params || {};
        this.creditTypeId = decodeURIComponent(params.creditTypeId || '');
        this.pageTitle = decodeURIComponent(params.name || '全部课程点');
        this.refresh();
    },
    async onPullDownRefresh() {
        try { await this.refresh(); } finally { Taro.stopPullDownRefresh(); }
    },
    onReachBottom() { this.loadMore(); },
    methods: {
        openBatch(batch) { Taro.navigateTo({ url: `/pages/courseCreditBatch/index?id=${batch.id}` }); },
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
                const result = normalizePage(await Api.listCourseCreditBatches({
                    page, perPage: 20, ...(this.creditTypeId ? { creditTypeId: this.creditTypeId } : {}),
                }));
                this.items = replace ? result.items : mergePage(this.items, result.items);
                this.pagination = result;
            } catch (error) {
                this.errorMessage = courseCreditErrorMessage(error);
            } finally {
                if (replace) this.loading = false;
            }
        },
    },
};
</script>
