<template>
    <page-chrome class="courses-page">
        <view class="courses-content">
            <view v-if="state !== 'ready'" class="courses-state">
                <async-state
                    :action-label="state === 'error' ? '重新加载' : ''"
                    :description="state === 'error' ? errorMessage : '完成课程或调整课程安排后，记录会显示在这里。'"
                    :kind="state === 'error' ? 'network' : 'default'"
                    :state="state"
                    :title="state === 'empty' ? '暂无课时记录' : ''"
                    @action="loadRecords(true)"
                />
            </view>
            <template v-else>
                <view class="courses-list">
                    <lesson-record-row v-for="record in records" :key="record.recordId" :record="record" />
                </view>
                <pagination-state :has-next="hasMore" :loading="loadingMore" :total="pagination.totalItems" />
            </template>
        </view>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import AsyncState from '../../components/AsyncState.vue';
import LessonRecordRow from '../../components/LessonRecordRow.vue';
import PageChrome from '../../components/PageChrome.vue';
import PaginationState from '../../components/PaginationState.vue';
import {
    hasNextPage, learningErrorMessage, mergePage, normalizePage, normalizeRecord, pageState,
} from '../courses/pageLogic';
import './index.scss';

export default {
    components: { AsyncState, LessonRecordRow, PageChrome, PaginationState },
    data() {
        return {
            courseId: '', errorMessage: '', loading: false, loadingMore: false,
            pagination: normalizePage(), records: [],
        };
    },
    computed: {
        hasMore() { return hasNextPage(this.pagination); },
        state() { return pageState({ error: this.errorMessage, items: this.records, loading: this.loading }); },
    },
    onLoad(params) { this.courseId = decodeURIComponent(params.courseId || ''); },
    onShow() { this.loadRecords(); },
    async onPullDownRefresh() { try { await this.loadRecords(true); } finally { Taro.stopPullDownRefresh(); } },
    onReachBottom() { this.loadMore(); },
    methods: {
        query(page) { return { page, perPage: 20, ...(this.courseId ? { courseId: this.courseId } : {}) }; },
        async loadRecords(force = false) {
            if (this.loading && !force) return;
            this.loading = true;
            this.errorMessage = '';
            try {
                this.pagination = normalizePage(await Api.listLearningRecords(this.query(1)), normalizeRecord);
                this.records = this.pagination.items;
            } catch (error) { this.errorMessage = learningErrorMessage(error); }
            finally { this.loading = false; }
        },
        async loadMore() {
            if (!this.hasMore || this.loadingMore) return;
            this.loadingMore = true;
            try {
                const next = normalizePage(await Api.listLearningRecords(this.query(this.pagination.page + 1)), normalizeRecord);
                this.records = mergePage(this.records, next.items, 'recordId');
                this.pagination = next;
            } catch (error) { Taro.showToast({ title: learningErrorMessage(error), icon: 'none' }); }
            finally { this.loadingMore = false; }
        },
    },
};
</script>
