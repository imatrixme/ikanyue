import { definePage } from '../../kit/page.js';
import { nav, notify, page, system, ui } from '../../kit/api.js';
import { learningErrorMessage, normalizeOverview } from '../../core/courses.js';
import { homeCourseRows, homeState, normalizeReminders } from '../../core/home.js';
import { venueFacts } from '../../core/venues.js';
import { Api } from '../../services/apis.js';
import { RoleManager } from '../../services/rolemanager.js';
import { UserManager } from '../../services/usermanager.js';
import { VenueManager } from '../../services/venuemanager.js';

definePage({
    data: () => ({
        coverFailed: false, errorMessage: '', isLogin: false, loading: false, overview: normalizeOverview(), reminder: null,
        navBar: system.navBar(), role: 'student', subscribeTemplateId: '', venue: null,
    }),
    computed: {
        courseRows: (d) => homeCourseRows(d.overview.courses),
        state: (d) => homeState({ courses: d.overview.courses, error: d.errorMessage, isLogin: d.isLogin, loading: d.loading }),
        closed: (d) => VenueManager.venueClosed(d.venue),
        coverShown: (d) => Boolean(d.venue?.coverUrl) && !d.coverFailed,
        venueRows: (d) => venueFacts(d.venue || {}),
    },
    onLoad() {
        this.requestSerial = 0;
    },
    async onShow() {
        const role = RoleManager.getRole();
        RoleManager.applyTabBar(role);
        await this.set({ role });
        if (role === 'teacher') {
            page.title('工作台');
            this.selectComponent('#teacherHome')?.refresh();
            return;
        }
        this.loadVenue();
        this.loadData();
    },
    onPullDownRefresh() {
        if (this.data.role === 'teacher') return this.selectComponent('#teacherHome')?.refresh(true);
        return Promise.all([this.loadVenue(), this.loadData(true)]);
    },
    methods: {
        callVenue() {
            VenueManager.callVenue(this.data.venue);
        },
        goBooking() {
            nav.tab('/pages/appointmentBooking/index');
        },
        goCourses() {
            nav.to('/pages/courses/index');
        },
        goProfile() {
            nav.tab('/pages/profile/index');
        },
        goShop() {
            nav.to('/pages/courseShop/index');
        },
        goVenues() {
            nav.to('/pages/venues/index');
        },
        // A broken cover falls back to the pale wash instead of an empty frame.
        markCoverFailed() {
            this.set({ coverFailed: true });
        },
        retry() {
            return this.loadData(true);
        },
        // Reminders are a side note: a failed load never blocks the lesson balance.
        async loadReminders() {
            try {
                const { reminder, subscribeTemplateId } = normalizeReminders(await Api.listRenewalReminders());
                await this.set({ reminder, subscribeTemplateId });
            } catch {
                await this.set({ reminder: null });
            }
        },
        openReminder() {
            this.set({ reminder: null });
            Api.readRenewalReminders().catch(() => {});
            this.goShop();
        },
        // One-time subscribe: every accepted prompt allows one WeChat reminder.
        async subscribeReminders() {
            const templateId = this.data.subscribeTemplateId;
            try {
                const accepted = await notify.subscribe([templateId]);
                if (!accepted[templateId]) return;
                await Api.subscribeRenewalReminders();
                ui.toast('已开启微信提醒', { kind: 'success' });
            } catch (error) {
                ui.toast(error?.message || '暂时无法开启微信提醒');
            }
        },
        async loadVenue() {
            const venue = (await VenueManager.loadVenues()).current;
            await this.set({ coverFailed: false, venue });
            page.title(venue?.name || '看乐艺术');
        },
        async loadData(force = false) {
            const isLogin = UserManager.isLogin();
            if (!isLogin) {
                this.requestSerial += 1;
                await this.set({
                    isLogin, loading: false, errorMessage: '', overview: normalizeOverview(), reminder: null, subscribeTemplateId: '',
                });
                return;
            }
            await this.set({ isLogin });
            this.selectComponent('#upcoming')?.refresh(force);
            this.loadReminders();
            if (this.data.loading && !force) return;
            const requestId = this.requestSerial + 1;
            this.requestSerial = requestId;
            await this.set({ loading: true, errorMessage: '' });
            try {
                const overview = normalizeOverview(await Api.getLearningOverview());
                if (requestId === this.requestSerial) await this.set({ overview });
            } catch (error) {
                if (requestId === this.requestSerial) await this.set({ errorMessage: learningErrorMessage(error) });
            } finally {
                if (requestId === this.requestSerial) await this.set({ loading: false });
            }
        },
    },
});
