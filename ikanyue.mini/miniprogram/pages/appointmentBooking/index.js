import { definePage } from '../../kit/page.js';
import { nav, page } from '../../kit/api.js';
import {
    appointmentDetailUrl, bookingErrorMessage, bookingSlotsUrl, normalizeAppointmentPage, normalizeBookingOption,
} from '../../core/appointments.js';
import { Api } from '../../services/apis.js';
import { RoleManager } from '../../services/rolemanager.js';
import { UserManager } from '../../services/usermanager.js';
import { VenueManager } from '../../services/venuemanager.js';

definePage({
    data: () => ({
        errorMessage: '', isLogin: false, loading: false, options: [], recentAppointments: [], role: 'student', venue: null,
    }),
    computed: {
        closed: (d) => VenueManager.venueClosed(d.venue),
        pageState: (d) => {
            if (d.loading) return 'loading';
            if (!d.isLogin) return 'empty';
            if (d.errorMessage) return 'error';
            return d.options.length || d.recentAppointments.length ? 'ready' : 'empty';
        },
        stateAction: (d) => {
            if (!d.isLogin) return '去登录';
            return d.errorMessage ? '重新加载' : '';
        },
        stateDescription: (d) => {
            if (!d.isLogin) return '登录后可以使用当前课程的剩余课时发起预约。';
            return d.errorMessage || '报课后，或老师开放可预约时间后，可预约的课程会显示在这里。';
        },
        stateTitle: (d) => {
            if (!d.isLogin) return '登录后预约课程';
            return d.errorMessage ? '预约信息加载失败' : '暂无可预约课程';
        },
    },
    onLoad() {
        this.requestSerial = 0;
    },
    async onShow() {
        const role = RoleManager.getRole();
        RoleManager.applyTabBar(role);
        page.title(role === 'teacher' ? '课程日历' : '约课');
        await this.set({ role });
        if (role === 'teacher') this.selectComponent('#teacherCalendar')?.refresh();
        else this.loadVenueAndData();
    },
    onPullDownRefresh() {
        if (this.data.role === 'teacher') return this.selectComponent('#teacherCalendar')?.refresh(true);
        return this.loadVenueAndData(true);
    },
    methods: {
        goSlots(event) {
            nav.to(bookingSlotsUrl(event.detail));
        },
        goAppointments() {
            nav.to('/pages/appointments/index');
        },
        goAppointment(event) {
            nav.to(appointmentDetailUrl(event.detail.appointmentId));
        },
        handleStateAction() {
            if (!this.data.isLogin) {
                nav.tab('/pages/profile/index');
                return;
            }
            this.loadData(true);
        },
        async loadVenueAndData(force = false) {
            await this.set({ venue: (await VenueManager.loadVenues()).current });
            if (!this.data.closed) await this.loadData(force);
        },
        async loadData(force = false) {
            const isLogin = UserManager.isLogin();
            const role = UserManager.getRole();
            if (!isLogin || role !== 'student') {
                this.requestSerial += 1;
                await this.set({ isLogin, role, loading: false, options: [], recentAppointments: [] });
                return;
            }
            await this.set({ isLogin, role });
            if (this.data.loading && !force) return;
            const requestId = this.requestSerial + 1;
            this.requestSerial = requestId;
            await this.set({ loading: true, errorMessage: '' });
            try {
                const [options, appointments] = await Promise.all([
                    Api.listStudentBookingOptions(),
                    Api.listStudentAppointments({ page: 1, perPage: 2 }),
                ]);
                if (requestId !== this.requestSerial) return;
                await this.set({
                    options: (Array.isArray(options) ? options : []).map(normalizeBookingOption),
                    recentAppointments: normalizeAppointmentPage(appointments).items,
                });
            } catch (error) {
                if (requestId === this.requestSerial) await this.set({ errorMessage: bookingErrorMessage(error) });
            } finally {
                if (requestId === this.requestSerial) await this.set({ loading: false });
            }
        },
    },
});
