import { definePage } from '../../kit/page.js';
import { nav, page } from '../../kit/api.js';
import { normalizePointSummary, normalizeRewardAvailability, pointEventRow } from '../../core/points.js';
import { Api } from '../../services/apis.js';
import { loginGate } from '../../services/loginGate.js';
import { RoleManager } from '../../services/rolemanager.js';
import { UserManager } from '../../services/usermanager.js';

const VISIBLE_VOUCHERS = 3;
const EMPTY_PAGINATION = { page: 1, perPage: 2, totalItems: 0, totalPages: 1 };

definePage({
    data: () => ({
        balance: 0, errorMessage: '', failedImages: {}, isLogin: false, loading: false, lockedRewards: [],
        pointEvents: [], pointEventsPagination: { ...EMPTY_PAGINATION }, redeemableRewards: [], role: 'student',
        showLogin: false, skeletons: [0, 1, 2],
    }),
    computed: {
        rewardCount: (d) => d.redeemableRewards.length + d.lockedRewards.length,
        passCaption: (d) => `${d.redeemableRewards.length} 件可领取 · ${d.lockedRewards.length} 件待解锁`,
        catalogSubtitle: (d) => `${d.redeemableRewards.length} 件已解锁 · ${d.lockedRewards.length} 件继续积累`,
        catalogTitle: (d) => `${d.rewardCount} 件实物`,
        balanceLabel: (d) => `${d.balance} PT`,
        pointEventTotal: (d) => d.pointEventsPagination.totalItems || d.pointEvents.length,
        historyActionLabel: (d) => (d.pointEventTotal > d.pointEvents.length ? `全部 ${d.pointEventTotal} 条` : ''),
        eventRows: (d) => d.pointEvents.map(pointEventRow),
        voucherRows: (d) => d.redeemableRewards.slice(0, VISIBLE_VOUCHERS).map((item) => ({
            id: item.id, item, showImage: Boolean(item.image && !d.failedImages[item.id]),
        })),
        redeemableHiddenCount: (d) => Math.max(0, d.redeemableRewards.length - VISIBLE_VOUCHERS),
    },
    async onShow() {
        const role = RoleManager.getRole();
        RoleManager.applyTabBar(role);
        page.title(role === 'teacher' ? '课程日历' : '积分账户');
        await this.set({ role });
        if (role === 'teacher') this.selectComponent('#teacherCalendar')?.refresh();
        else this.loadPointsLiteData();
    },
    onPullDownRefresh() {
        if (this.data.role === 'teacher') return this.selectComponent('#teacherCalendar')?.refresh(true);
        return this.loadPointsLiteData();
    },
    methods: {
        ...loginGate,
        markImageFailed(event) {
            this.set({ failedImages: { ...this.data.failedImages, [event.detail]: true } });
        },
        // Signing in reloads this page with the student's points.
        openMine() {
            this.withAccount();
        },
        goPointHistory() {
            nav.to('/pages/pointsHistory/index');
        },
        goRedeemable() {
            nav.to('/pages/rewardCatalog/index', { view: 'redeemable' });
        },
        goCatalog() {
            nav.to('/pages/rewardCatalog/index', { view: 'all' });
        },
        async loadPointsLiteData() {
            if (this.data.loading) return;
            const isLogin = UserManager.isLogin();
            if (!isLogin) {
                await this.set({
                    isLogin, balance: 0, redeemableRewards: [], lockedRewards: [], pointEvents: [],
                    pointEventsPagination: { ...EMPTY_PAGINATION }, errorMessage: '',
                });
                return;
            }
            await this.set({ isLogin, loading: true, errorMessage: '' });
            try {
                const [summaryPayload, rewardsPayload] = await Promise.all([
                    Api.getMyPointSummary({ page: 1, perPage: 2 }),
                    Api.listRewardItems(),
                ]);
                const summary = normalizePointSummary(summaryPayload);
                const rewards = normalizeRewardAvailability(rewardsPayload);
                await this.set({
                    balance: summary.balance,
                    pointEvents: summary.events,
                    pointEventsPagination: summary.pagination,
                    redeemableRewards: rewards.redeemable,
                    lockedRewards: rewards.locked,
                    failedImages: {},
                });
            } catch (error) {
                await this.set({ errorMessage: error?.message || '请检查网络后重试。' });
            } finally {
                await this.set({ loading: false });
            }
        },
    },
});
