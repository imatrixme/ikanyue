import { definePage } from '../../kit/page.js';
import { DASHBOARD_PERIODS, normalizeReconciliation, workbenchErrorMessage } from '../../core/workbench.js';
import { Api } from '../../services/apis.js';

// One teacher's confirmed lessons for a period, so the owner can settle up with them. Lessons
// and credits only; how much to pay is the owner's own business.
definePage({
    data: () => ({ periods: DASHBOARD_PERIODS, teacherId: '', period: 'today', month: '', view: null, loading: false, errorMessage: '' }),
    computed: {
        state: (d) => {
            if (d.loading && !d.view) return 'loading';
            if (d.errorMessage) return 'error';
            return 'ready';
        },
    },
    onLoad(query) {
        const period = DASHBOARD_PERIODS.some((item) => item.value === query.period) ? query.period : 'today';
        this.set({ teacherId: query.id || '', period, month: period === 'month' ? query.month || '' : '' });
    },
    onShow() {
        this.loadLessons();
    },
    onPullDownRefresh() {
        return this.loadLessons();
    },
    methods: {
        retry() {
            return this.loadLessons();
        },
        async selectPeriod(event) {
            await this.set({ period: event.detail.value, month: '' });
            await this.loadLessons();
        },
        // Steps to the month in data-month; next is empty in the current month.
        async stepMonth(event) {
            const { month } = event.currentTarget.dataset;
            if (!month) return;
            await this.set({ month });
            await this.loadLessons();
        },
        async loadLessons() {
            const { teacherId, period, month } = this.data;
            if (!teacherId) {
                await this.set({ errorMessage: '缺少老师编号' });
                return;
            }
            await this.set({ loading: true, errorMessage: '' });
            try {
                const view = normalizeReconciliation(await Api.getWorkbenchTeacherReconciliation(teacherId, period, period === 'month' ? month : ''));
                if (period === this.data.period && month === this.data.month) await this.set({ view });
            } catch (error) {
                await this.set({ errorMessage: workbenchErrorMessage(error, '上课明细暂时无法加载') });
            } finally {
                await this.set({ loading: false });
            }
        },
    },
});
