import { definePage } from '../../kit/page.js';
import { nav, ui } from '../../kit/api.js';
import {
    hasNextPage, learningErrorMessage, lessonDetailUrl, mergePage, normalizeLesson, normalizePage, pageState,
} from '../../core/courses.js';
import { Api } from '../../services/apis.js';

const SCOPE_OPTIONS = Object.freeze([
    { label: '即将上课', value: 'upcoming' },
    { label: '已完成', value: 'completed' },
    { label: '全部', value: 'all' },
]);

definePage({
    data: () => ({
        courseId: '', errorMessage: '', lessons: [], loading: false, loadingMore: false,
        pagination: normalizePage(), scope: 'upcoming', scopeOptions: SCOPE_OPTIONS,
    }),
    computed: {
        emptyDescription: (d) => (d.scope === 'completed' ? '完成课程后会显示在这里。' : '排课后会显示上课时间和地点。'),
        hasMore: (d) => hasNextPage(d.pagination),
        state: (d) => pageState({ error: d.errorMessage, items: d.lessons, loading: d.loading }),
    },
    onLoad(query) {
        this.set({ courseId: query.courseId || '' });
    },
    onShow() {
        this.loadLessons();
    },
    onPullDownRefresh() {
        return this.loadLessons(true);
    },
    onReachBottom() {
        this.loadMore();
    },
    methods: {
        retry() {
            return this.loadLessons(true);
        },
        async changeScope(event) {
            await this.set({ scope: event.detail.value });
            this.loadLessons(true);
        },
        goLesson(event) {
            nav.to(lessonDetailUrl(event.detail.lessonId));
        },
        query(page, perPage = 20) {
            const { courseId, scope } = this.data;
            return { page, perPage, scope, ...(courseId ? { courseId } : {}) };
        },
        async loadLessons(force = false) {
            if (this.data.loading && !force) return;
            await this.set({ loading: true, errorMessage: '' });
            try {
                const pagination = normalizePage(await Api.listLearningLessons(this.query(1)), normalizeLesson);
                await this.set({ pagination, lessons: pagination.items });
            } catch (error) {
                await this.set({ errorMessage: learningErrorMessage(error) });
            } finally {
                await this.set({ loading: false });
            }
        },
        async loadMore() {
            if (!this.data.hasMore || this.data.loadingMore) return;
            await this.set({ loadingMore: true });
            try {
                const { pagination } = this.data;
                const next = normalizePage(await Api.listLearningLessons(this.query(pagination.page + 1, pagination.perPage)), normalizeLesson);
                await this.set({ lessons: mergePage(this.data.lessons, next.items), pagination: next });
            } catch (error) {
                ui.toast(learningErrorMessage(error));
            } finally {
                await this.set({ loadingMore: false });
            }
        },
    },
});
