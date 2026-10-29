import { definePage } from '../../kit/page.js';
import { auth, nav, ui } from '../../kit/api.js';
import { normalizeOverview } from '../../core/courses.js';
import { memberCards } from '../../core/memberCards.js';
import { normalizePointSummary } from '../../core/points.js';
import {
    AGREEMENT_REQUIRED_MESSAGE, LOGIN_MODE_OPTIONS, agreementUrl, normalizeCellphone, profileEntries, profileStats, validatePasswordLogin,
} from '../../core/profile.js';
import { Api } from '../../services/apis.js';
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
        loginMode: 'wechat',
        loginModeOptions: LOGIN_MODE_OPTIONS,
        passwordCellphone: '',
        passwordLoginLoading: false,
        passwordValue: '',
        showLogin: false,
        showRolePopup: false,
        avatarFailed: false,
        userInfo: {},
        wechatLoginLoading: false,
        agreed: false,
        role: 'student',
        roleChallenge: null,
        roleOptions: [],
        roleSelecting: false,
    }),
    computed: {
        displayName: (d) => d.userInfo.nickName || d.userInfo.nickname || d.userInfo.realName
            || d.userInfo.cellphone || (d.role === 'teacher' ? '看乐教师' : '看乐学员'),
        displayInitial: (d) => d.displayName.slice(0, 1),
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
        roleRows: (d) => (d.roleChallenge?.roles || d.roleOptions).map((option) => {
            const current = !d.roleChallenge && option.role === d.role;
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
        this.refreshUserInfo();
    },
    onPullDownRefresh() {
        return this.refreshUserInfo();
    },
    methods: {
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
            const { key, url } = event.detail;
            if (key === 'role') this.openRoleSwitcher();
            else if (url) nav.to(url);
        },
        openStat(event) {
            nav.to(event.currentTarget.dataset.url);
        },
        openCard(event) {
            nav.to(`/pages/memberCard/index?id=${encodeURIComponent(event.detail.id)}`);
        },
        modifyInfo() {
            if (UserManager.isLogin()) nav.to('/pages/userinfo/index');
        },
        showLoginPopup() {
            this.set({ showLogin: true });
        },
        handleLoginPopupClose() {
            this.set({ showLogin: false, ...this.resetAuthState() });
        },
        changeLoginMode(event) {
            this.set({ loginMode: event.detail.value });
        },
        toggleAgreed() {
            this.set({ agreed: !this.data.agreed });
        },
        openRoleSwitcher() {
            if (this.data.canSwitchRole) this.set({ showRolePopup: true });
        },
        closeRoleSwitcher() {
            if (this.data.roleChallenge || this.data.roleSelecting) return;
            this.set({ showRolePopup: false });
        },
        // Password fields are cleared whenever the login sheet closes.
        resetAuthState() {
            return { wechatLoginLoading: false, passwordCellphone: '', passwordLoginLoading: false, passwordValue: '' };
        },
        handlePasswordCellphoneInput(event) {
            this.set({ passwordCellphone: normalizeCellphone(event.detail.value) });
        },
        async handlePasswordLogin() {
            if (this.data.passwordLoginLoading) return;
            if (!this.data.agreed) {
                this.requireAgreement();
                return;
            }
            const { credentials, error } = validatePasswordLogin({
                cellphone: this.data.passwordCellphone,
                password: this.data.passwordValue,
            });
            if (error) {
                ui.toast(error);
                return;
            }
            await this.set({ passwordLoginLoading: true });
            try {
                await Api.loginWithPassword(credentials.cellphone, credentials.password);
                await this.set({ showLogin: false, ...this.resetAuthState() });
                await this.refreshUserInfo();
                ui.toast('登录成功', { kind: 'success' });
            } catch (loginError) {
                ui.toast(loginError?.message || '登录失败，请重试');
            } finally {
                await this.set({ passwordLoginLoading: false });
            }
        },
        requireAgreement() {
            ui.toast(AGREEMENT_REQUIRED_MESSAGE);
        },
        openAgreement(event) {
            nav.to(agreementUrl(event.currentTarget.dataset.type));
        },
        async handleWechatPhone(event) {
            if (this.data.wechatLoginLoading) return;
            const detail = event.detail || {};
            if (detail.errMsg !== 'getPhoneNumber:ok') {
                ui.toast('未获取到手机号');
                return;
            }
            if (!detail.encryptedData || !detail.iv) {
                ui.toast('微信未返回手机号信息');
                return;
            }
            await this.set({ wechatLoginLoading: true });
            try {
                const result = await Api.loginWithWechat({
                    code: await auth.login(),
                    phone: { encryptedData: detail.encryptedData, iv: detail.iv },
                });
                if (result?.requiresRoleSelection) {
                    await this.set({ roleChallenge: result, showLogin: false, showRolePopup: true, wechatLoginLoading: false });
                    return;
                }
                await this.set({ showLogin: false, wechatLoginLoading: false });
                await this.refreshUserInfo();
                ui.toast('登录成功', { kind: 'success' });
            } catch (error) {
                ui.toast(error?.message || '登录失败，请重试');
            } finally {
                await this.set({ wechatLoginLoading: false });
            }
        },
        async selectRole(event) {
            const { role } = event.currentTarget.dataset;
            const { roleChallenge } = this.data;
            if (this.data.roleSelecting || (!roleChallenge && role === this.data.role)) return;
            await this.set({ roleSelecting: true });
            try {
                if (roleChallenge) await Api.completeWechatRoleLogin(roleChallenge.challenge, role);
                else await Api.switchWechatRole(role);
                await this.set({ roleChallenge: null, showRolePopup: false });
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
