import { definePage } from '../../kit/page.js';
import { ui } from '../../kit/api.js';
import {
    hasNextPage, learningErrorMessage, mergePage, normalizePage, normalizeRecord, pageState,
} from '../../core/courses.js';
import { Api } from '../../services/apis.js';

definePage({
    data: () => ({
        courseId: '', errorMessage: '', loading: false, loadingMore: false, pagination: normalizePage(), records: [],
    }),
    computed: {
        hasMore: (d) => hasNextPage(d.pagination),
        state: (d) => pageState({ error: d.errorMessage, items: d.records, loading: d.loading }),
    },
    onLoad(query) {
        this.set({ courseId: query.courseId || '' });
    },
    onShow() {
        this.loadRecords();
    },
    onPullDownRefresh() {
        return this.loadRecords(true);
    },
    onReachBottom() {
        this.loadMore();
    },
    methods: {
        retry() {
            return this.loadRecords(true);
        },
        query(page) {
            const { courseId } = this.data;
            return { page, perPage: 20, ...(courseId ? { courseId } : {}) };
        },
        async loadRecords(force = false) {
            if (this.data.loading && !force) return;
            await this.set({ loading: true, errorMessage: '' });
            try {
                const pagination = normalizePage(await Api.listLearningRecords(this.query(1)), normalizeRecord);
                await this.set({ pagination, records: pagination.items });
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
                const next = normalizePage(await Api.listLearningRecords(this.query(this.data.pagination.page + 1)), normalizeRecord);
                await this.set({ records: mergePage(this.data.records, next.items, 'recordId'), pagination: next });
            } catch (error) {
                ui.toast(learningErrorMessage(error));
            } finally {
                await this.set({ loadingMore: false });
            }
        },
    },
});
