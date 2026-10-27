<template>
    <page-chrome class="courses-page">
        <view class="courses-content">
            <segmented-control v-model="scope" class="courses-filter" :options="scopeOptions" @change="changeScope" />
            <view v-if="state !== 'ready'" class="courses-state">
                <async-state
                    :action-label="state === 'error' ? '重新加载' : ''"
                    :description="state === 'error' ? errorMessage : emptyDescription"
                    :kind="state === 'error' ? 'network' : 'default'"
                    :state="state"
                    :title="state === 'empty' ? '暂无课程日程' : ''"
                    @action="loadLessons(true)"
                />
            </view>
            <template v-else>
                <view class="courses-list">
                    <lesson-row v-for="lesson in lessons" :key="lesson.lessonId" :lesson="lesson" @select="goLesson" />
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
import LessonRow from '../../components/LessonRow.vue';
import PageChrome from '../../components/PageChrome.vue';
import PaginationState from '../../components/PaginationState.vue';
import SegmentedControl from '../../components/SegmentedControl.vue';
import {
    hasNextPage, learningErrorMessage, lessonDetailUrl, mergePage, normalizeLesson, normalizePage, pageState,
} from '../courses/pageLogic';
import './index.scss';

export default {
    components: { AsyncState, LessonRow, PageChrome, PaginationState, SegmentedControl },
    data() {
        return {
            courseId: '', errorMessage: '', lessons: [], loading: false, loadingMore: false,
            pagination: normalizePage(), scope: 'upcoming',
            scopeOptions: [
                { label: '即将上课', value: 'upcoming' },
                { label: '已完成', value: 'completed' },
                { label: '全部', value: 'all' },
            ],
        };
    },
    computed: {
        emptyDescription() { return this.scope === 'completed' ? '完成课程后会显示在这里。' : '排课后会显示上课时间和地点。'; },
        hasMore() { return hasNextPage(this.pagination); },
        state() { return pageState({ error: this.errorMessage, items: this.lessons, loading: this.loading }); },
    },
    onLoad(params) { this.courseId = decodeURIComponent(params.courseId || ''); },
    onShow() { this.loadLessons(); },
    async onPullDownRefresh() { try { await this.loadLessons(true); } finally { Taro.stopPullDownRefresh(); } },
    onReachBottom() { this.loadMore(); },
    methods: {
        changeScope() { this.loadLessons(true); },
        goLesson(lesson) { Taro.navigateTo({ url: lessonDetailUrl(lesson.lessonId) }); },
        async loadLessons(force = false) {
            if (this.loading && !force) return;
            this.loading = true;
            this.errorMessage = '';
            try {
                this.pagination = normalizePage(await Api.listLearningLessons({
                    page: 1, perPage: 20, scope: this.scope, ...(this.courseId ? { courseId: this.courseId } : {}),
                }), normalizeLesson);
                this.lessons = this.pagination.items;
            } catch (error) { this.errorMessage = learningErrorMessage(error); }
            finally { this.loading = false; }
        },
        async loadMore() {
            if (!this.hasMore || this.loadingMore) return;
            this.loadingMore = true;
            try {
                const next = normalizePage(await Api.listLearningLessons({
                    page: this.pagination.page + 1, perPage: this.pagination.perPage, scope: this.scope,
                    ...(this.courseId ? { courseId: this.courseId } : {}),
                }), normalizeLesson);
                this.lessons = mergePage(this.lessons, next.items);
                this.pagination = next;
            } catch (error) { Taro.showToast({ title: learningErrorMessage(error), icon: 'none' }); }
            finally { this.loadingMore = false; }
        },
    },
};
</script>
