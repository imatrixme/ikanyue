import { definePage } from '../../kit/page.js';
import { nav, page, ui } from '../../kit/api.js';
import {
    appointmentDetailUrl, bookingErrorMessage, hasNextPage, mergeAppointmentPage, normalizeAppointmentPage,
} from '../../core/appointments.js';
import { Api } from '../../services/apis.js';
import { RoleManager } from '../../services/rolemanager.js';

const FILTERS = Object.freeze([
    { label: '全部', value: '' },
    { label: '待确认', value: 'pending' },
    { label: '已确认', value: 'confirmed,rescheduled' },
    { label: '已结束', value: 'fulfilled,declined,withdrawn,cancelled,expired,slot_taken,eligibility_lost' },
]);

definePage({
    data: () => ({
        errorMessage: '', filters: FILTERS, items: [], loading: false, loadingMore: false,
        pagination: { page: 1, perPage: 20, totalItems: 0, totalPages: 0 },
        role: 'student', statusFilter: '',
    }),
    computed: {
        emptyDescription: (d) => (d.role === 'teacher'
            ? '当前筛选下没有需要处理或已确认的预约。'
            : '发起课程预约后，申请状态会显示在这里。'),
        hasMore: (d) => hasNextPage(d.pagination),
        state: (d) => {
            if (d.loading) return 'loading';
            if (d.errorMessage) return 'error';
            return d.items.length ? 'ready' : 'empty';
        },
    },
    onLoad(query) {
        this.requestSerial = 0;
        const status = query.status || '';
        if (FILTERS.some((item) => item.value === status)) this.set({ statusFilter: status });
    },
    onShow() {
        const role = RoleManager.getRole();
        RoleManager.applyTabBar(role);
        page.title(role === 'teacher' ? '预约管理' : '我的预约');
        this.set({ role });
        this.loadPage(true);
    },
    onPullDownRefresh() {
        return this.loadPage(true);
    },
    onReachBottom() {
        if (this.data.hasMore) this.loadPage(false);
    },
    methods: {
        retry() {
            return this.loadPage(true);
        },
        goDetail(event) {
            nav.to(appointmentDetailUrl(event.detail.appointmentId));
        },
        selectFilter(event) {
            const { value } = event.detail;
            if (value === this.data.statusFilter) return;
            this.set({ statusFilter: value });
            this.loadPage(true);
        },
        async loadPage(reset = false) {
            if ((this.data.loading || this.data.loadingMore) && !reset) return;
            const requestId = reset ? this.requestSerial + 1 : this.requestSerial;
            if (reset) this.requestSerial = requestId;
            const pageNumber = reset ? 1 : this.data.pagination.page + 1;
            if (reset) await this.set({ loading: true, loadingMore: false, errorMessage: '' });
            else await this.set({ loadingMore: true });
            try {
                const params = { page: pageNumber, perPage: 20 };
                if (this.data.statusFilter) params.status = this.data.statusFilter;
                const response = this.data.role === 'teacher'
                    ? await Api.listTeacherAppointments(params)
                    : await Api.listStudentAppointments(params);
                if (requestId !== this.requestSerial) return;
                const normalized = normalizeAppointmentPage(response);
                await this.set({
                    items: reset ? normalized.items : mergeAppointmentPage(this.data.items, normalized.items),
                    pagination: {
                        page: normalized.page,
                        perPage: normalized.perPage,
                        totalItems: normalized.totalItems,
                        totalPages: normalized.totalPages,
                    },
                });
            } catch (error) {
                if (requestId !== this.requestSerial) return;
                if (reset) await this.set({ errorMessage: bookingErrorMessage(error, '预约记录暂时无法加载') });
                else ui.toast(bookingErrorMessage(error, '加载失败'));
            } finally {
                if (requestId === this.requestSerial) await this.set({ loading: false, loadingMore: false });
            }
        },
    },
});
