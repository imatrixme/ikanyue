import { definePage } from '../../kit/page.js';
import { nav, ui } from '../../kit/api.js';
import { normalizeOverview } from '../../core/courses.js';
import { memberCards } from '../../core/memberCards.js';
import { normalizePointSummary } from '../../core/points.js';
import { greeting, profileEntries, profileStats } from '../../core/profile.js';
import { Api } from '../../services/apis.js';
import { loginGate } from '../../services/loginGate.js';
import { RoleManager } from '../../services/rolemanager.js';
import { UserManager } from '../../services/usermanager.js';
import { VenueManager } from '../../services/venuemanager.js';

definePage({
    data: () => ({
        isLogin: false,
        // null while unknown: stats show a dash and cards a neutral line instead of zero.
        courses: null,
        coverUrl: '',
        points: null,
        showLogin: false,
        showRolePopup: false,
        avatarFailed: false,
        userInfo: {},
        role: 'student',
        roleOptions: [],
        roleSelecting: false,
    }),
    computed: {
        displayName: (d) => d.userInfo.nickName || d.userInfo.nickname || d.userInfo.realName
            || d.userInfo.cellphone || (d.role === 'teacher' ? '看乐教师' : '看乐学员'),
        displayInitial: (d) => d.displayName.slice(0, 1),
        greetingText: () => greeting(new Date().getHours()),
        maskedPhone: (d) => {
            const cellphone = String(d.userInfo.cellphone || '');
            if (cellphone.length < 7) return cellphone || '已登录账号';
            return `${cellphone.slice(0, 3)}****${cellphone.slice(-4)}`;
        },
        avatarUrl: (d) => d.userInfo.avatarUrl || d.userInfo.avatar || '',
        canSwitchRole: (d) => d.roleOptions.length > 1,
        stats: (d) => profileStats({ courses: d.courses, points: d.points }),
        cards: (d) => memberCards({ role: d.role, courses: d.courses, coverUrl: d.coverUrl }),
        entries: (d) => profileEntries({ role: d.role, canSwitchRole: d.canSwitchRole }),
        roleRows: (d) => d.roleOptions.map((option) => {
            const current = option.role === d.role;
            return {
                key: `${option.role}:${option.id}`,
                role: option.role,
                name: option.name,
                current,
                icon: option.role === 'teacher' ? 'teacher-role' : 'course-book',
                title: option.role === 'teacher' ? '教师身份' : '学员身份',
            };
        }),
    },
    onShow() {
        return this.refreshUserInfo();
    },
    onPullDownRefresh() {
        return this.refreshUserInfo();
    },
    methods: {
        ...loginGate,
        async refreshUserInfo() {
            const role = UserManager.getRole();
            const isLogin = UserManager.isLogin();
            await this.set({ avatarFailed: false, userInfo: UserManager.getUserInfo(), role, isLogin });
            RoleManager.applyTabBar(role);
            if (!isLogin) {
                await this.set({ courses: null, points: null, roleOptions: [] });
                return;
            }
            this.loadMine();
            try {
                await Api.refreshLogin();
                const refreshedRole = UserManager.getRole();
                await this.set({ userInfo: UserManager.getUserInfo(), role: refreshedRole, isLogin: UserManager.isLogin() });
                RoleManager.applyTabBar(refreshedRole);
            } catch {
                await this.set({ userInfo: UserManager.getUserInfo() });
            }
            const roleOptions = await Api.listWechatRoles().catch(() => []);
            await this.set({ roleOptions: Array.isArray(roleOptions) ? roleOptions : [] });
        },
        // The user's own numbers and the card cover; each part fails on its own and shows a dash.
        async loadMine() {
            const student = UserManager.getRole() !== 'teacher';
            const [overview, summary, venues] = await Promise.all([
                student ? Api.getLearningOverview().then(normalizeOverview).catch(() => null) : null,
                student ? Api.getMyPointSummary({ page: 1, perPage: 1 }).then(normalizePointSummary).catch(() => null) : null,
                VenueManager.loadVenues(),
            ]);
            const cover = venues.current?.coverUrl || venues.venues.find((venue) => venue.coverUrl)?.coverUrl || '';
            await this.set({ courses: overview ? overview.courses : null, coverUrl: cover, points: summary ? summary.balance : null });
        },
        markAvatarFailed() {
            this.set({ avatarFailed: true });
        },
        openEntry(event) {
            const { account, key, url } = event.detail;
            const open = () => (key === 'role' ? this.openRoleSwitcher() : url && nav.to(url));
            if (account) this.withAccount(open);
            else open();
        },
        openStat(event) {
            const { url } = event.currentTarget.dataset;
            this.withAccount(() => nav.to(url));
        },
        openCard(event) {
            nav.to(`/pages/memberCard/index?id=${encodeURIComponent(event.detail.id)}`);
        },
        modifyInfo() {
            if (UserManager.isLogin()) nav.to('/pages/userinfo/index');
        },
        openLogin() {
            return this.withAccount();
        },
        openRoleSwitcher() {
            if (this.data.canSwitchRole) this.set({ showRolePopup: true });
        },
        closeRoleSwitcher() {
            if (this.data.roleSelecting) return;
            this.set({ showRolePopup: false });
        },
        async selectRole(event) {
            const { role } = event.currentTarget.dataset;
            if (this.data.roleSelecting || role === this.data.role) return;
            await this.set({ roleSelecting: true });
            try {
                await Api.switchWechatRole(role);
                await this.set({ showRolePopup: false });
                await this.refreshUserInfo();
                ui.toast(role === 'teacher' ? '已切换为教师' : '已切换为学员', { kind: 'success' });
            } catch (error) {
                ui.toast(error?.message || '身份切换失败');
            } finally {
                await this.set({ roleSelecting: false });
            }
        },
    },
});
