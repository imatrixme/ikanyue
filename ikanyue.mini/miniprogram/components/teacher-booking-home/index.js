import { defineComponent } from '../../kit/component.js';
import { nav } from '../../kit/api.js';
import {
    appointmentDetailUrl, availabilityUrl, bookingErrorMessage, normalizeTeacherDashboard,
} from '../../core/appointments.js';
import { teacherRenewalRows } from '../../core/home.js';
import { Api } from '../../services/apis.js';

const offeringRow = (offering) => ({
    ...offering,
    description: [offering.course.durationMinutes ? `${offering.course.durationMinutes} 分钟` : '', offering.location]
        .filter(Boolean).join(' · '),
});

// Teacher workbench on the home tab. The page refreshes it: this.selectComponent('#teacherHome').refresh(force).
defineComponent({
    options: { virtualHost: false },
    data: () => ({ dashboard: normalizeTeacherDashboard(), errorMessage: '', loading: false, renewals: [] }),
    computed: {
        state: (d) => {
            if (d.loading) return 'loading';
            if (d.errorMessage) return 'error';
            const hasContent = d.dashboard.pending.length || d.dashboard.confirmed.length || d.dashboard.offerings.length;
            return hasContent ? 'ready' : 'empty';
        },
        offerings: (d) => d.dashboard.offerings.map(offeringRow),
        renewalRows: (d) => d.renewals.map((row) => ({ ...row, initial: row.title.slice(0, 1) })),
    },
    lifetimes: {
        created() {
            this.requestSerial = 0;
        },
        attached() {
            this.refresh();
        },
    },
    methods: {
        goPending() {
            nav.to('/pages/appointments/index', { status: 'pending' });
        },
        goDetail(event) {
            nav.to(appointmentDetailUrl(event.detail.appointmentId));
        },
        goAvailability(event) {
            nav.to(availabilityUrl(event.detail.id));
        },
        retry() {
            return this.refresh(true);
        },
        refresh(force = false) {
            const upcoming = this.selectComponent('#upcoming');
            return Promise.all([this.loadDashboard(force), this.loadRenewals(), upcoming?.refresh(force)]);
        },
        // Read-only and optional: without the list the workbench still works.
        async loadRenewals() {
            try {
                await this.set({ renewals: teacherRenewalRows(await Api.listTeacherRenewals()) });
            } catch {
                await this.set({ renewals: [] });
            }
        },
        async loadDashboard(force = false) {
            if (this.data.loading && !force) return;
            const requestId = this.requestSerial + 1;
            this.requestSerial = requestId;
            await this.set({ loading: true, errorMessage: '' });
            try {
                const response = await Api.getTeacherBookingDashboard();
                if (requestId === this.requestSerial) await this.set({ dashboard: normalizeTeacherDashboard(response) });
            } catch (error) {
                if (requestId === this.requestSerial) {
                    await this.set({ errorMessage: bookingErrorMessage(error, '教师工作台暂时无法加载') });
                }
            } finally {
                if (requestId === this.requestSerial) await this.set({ loading: false });
            }
        },
    },
});
