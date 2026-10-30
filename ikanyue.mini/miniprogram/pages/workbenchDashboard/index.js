import { definePage } from '../../kit/page.js';
import { nav } from '../../kit/api.js';
import {
    DASHBOARD_PERIODS, dashboardTeacherUrl, normalizeDashboard, studentLedgerUrl, workbenchErrorMessage,
} from '../../core/workbench.js';
import { Api } from '../../services/apis.js';

// The owner's dashboard: today, this week or this month at a glance, lessons by teacher for
// reconciling with them, and students who need a word (running low, or not coming).
definePage({
    data: () => ({ periods: DASHBOARD_PERIODS, period: 'today', month: '', view: null, loading: false, errorMessage: '' }),
    computed: {
        state: (d) => {
            if (d.loading && !d.view) return 'loading';
            if (d.errorMessage) return 'error';
            return 'ready';
        },
    },
    onShow() {
        this.loadDashboard();
    },
    onPullDownRefresh() {
        return this.loadDashboard();
    },
    methods: {
        retry() {
            return this.loadDashboard();
        },
        async selectPeriod(event) {
            await this.set({ period: event.detail.value, month: '' });
            await this.loadDashboard();
        },
        // Steps to the month in data-month; next is empty in the current month.
        async stepMonth(event) {
            const { month } = event.currentTarget.dataset;
            if (!month) return;
            await this.set({ month });
            await this.loadDashboard();
        },
        goTeacher(event) {
            nav.to(dashboardTeacherUrl(event.detail.id, this.data.period, this.data.view?.month));
        },
        goStudent(event) {
            nav.to(studentLedgerUrl(event.detail.id));
        },
        async loadDashboard() {
            const { period, month } = this.data;
            await this.set({ loading: true, errorMessage: '' });
            try {
                const view = normalizeDashboard(await Api.getWorkbenchDashboard(period, period === 'month' ? month : ''));
                // A slower answer for a period or month the owner already left must not overwrite the current one.
                if (period === this.data.period && month === this.data.month) await this.set({ view });
            } catch (error) {
                await this.set({ errorMessage: workbenchErrorMessage(error, '数据看板暂时无法加载') });
            } finally {
                await this.set({ loading: false });
            }
        },
    },
});
