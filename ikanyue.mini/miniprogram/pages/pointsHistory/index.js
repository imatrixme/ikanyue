import { definePage } from '../../kit/page.js';
import { nav, ui } from '../../kit/api.js';
import { mergePointEvents, normalizePointSummary, pointEventRow } from '../../core/points.js';
import { Api } from '../../services/apis.js';
import { UserManager } from '../../services/usermanager.js';

const EMPTY_PAGINATION = { page: 1, perPage: 20, totalItems: 0, totalPages: 1 };

definePage({
    data: () => ({
        balance: 0, errorMessage: '', events: [], loading: true, loadingMore: false, pagination: { ...EMPTY_PAGINATION },
    }),
    computed: {
        hasMore: (d) => d.pagination.page < d.pagination.totalPages,
        caption: (d) => `${d.pagination.totalItems} 条积分记录`,
        eventRows: (d) => d.events.map(pointEventRow),
    },
    onLoad() {
        this.refreshEvents();
    },
    onPullDownRefresh() {
        return this.refreshEvents();
    },
    onReachBottom() {
        this.loadMoreEvents();
    },
    methods: {
        async refreshEvents() {
            if (!UserManager.isLogin()) {
                nav.tab('/pages/profile/index');
                return;
            }
            await this.set({ loading: true, errorMessage: '' });
            try {
                const summary = normalizePointSummary(await Api.getMyPointSummary({ page: 1, perPage: 20 }));
                await this.set({ balance: summary.balance, events: summary.events, pagination: summary.pagination });
            } catch (error) {
                await this.set({ errorMessage: error?.message || '请检查网络后重试。' });
            } finally {
                await this.set({ loading: false });
            }
        },
        async loadMoreEvents() {
            if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
            await this.set({ loadingMore: true });
            try {
                const nextPage = this.data.pagination.page + 1;
                const summary = normalizePointSummary(await Api.getMyPointSummary({ page: nextPage, perPage: 20 }));
                await this.set({
                    balance: summary.balance,
                    events: mergePointEvents(this.data.events, summary.events),
                    pagination: summary.pagination,
                });
            } catch (error) {
                ui.toast(error?.message || '记录加载失败');
            } finally {
                await this.set({ loadingMore: false });
            }
        },
    },
});
