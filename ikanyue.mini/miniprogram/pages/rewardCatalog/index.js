import { definePage } from '../../kit/page.js';
import { nav } from '../../kit/api.js';
import { getRewardProgress, getRewardStateText, normalizeRewardAvailability } from '../../core/points.js';
import { Api } from '../../services/apis.js';
import { UserManager } from '../../services/usermanager.js';

const VIEWS = ['all', 'locked', 'redeemable'];
const CATALOG_OPTIONS = Object.freeze([
    { label: '全部', value: 'all' },
    { label: '可领取', value: 'redeemable' },
    { label: '未解锁', value: 'locked' },
]);

definePage({
    data: () => ({
        activeView: 'redeemable', catalogOptions: CATALOG_OPTIONS, balance: 0, errorMessage: '',
        failedImages: {}, loading: true, lockedRewards: [], redeemableRewards: [],
    }),
    computed: {
        caption: (d) => `${d.redeemableRewards.length} 件可领取 · ${d.lockedRewards.length} 件待解锁`,
        activeItems: (d) => {
            if (d.activeView === 'locked') return d.lockedRewards;
            if (d.activeView === 'redeemable') return d.redeemableRewards;
            return [...d.redeemableRewards, ...d.lockedRewards]
                .sort((left, right) => left.pointsPrice - right.pointsPrice || left.sortOrder - right.sortOrder);
        },
        voucherRows: (d) => d.activeItems.map((item) => ({
            id: item.id,
            item,
            description: item.description || `当前进度 ${getRewardProgress(item, d.balance)}%`,
            lockedLabel: getRewardStateText(item, d.balance),
            redeemable: Number(item.pointsPrice || 0) <= Number(d.balance || 0),
            showImage: Boolean(item.image && !d.failedImages[item.id]),
        })),
        activeViewSubtitle: (d) => {
            if (d.activeView === 'all') return '所有可领取与继续积累中的实物';
            if (d.activeView === 'locked') return '继续积累积分即可解锁';
            return '到前台领取时由老师确认扣分';
        },
        activeViewTitle: (d) => {
            if (d.activeView === 'all') return '全部实物';
            return d.activeView === 'locked' ? '未解锁' : '现在可领取';
        },
        emptyStateDescription: (d) => {
            if (d.activeView === 'all') return '实物上架后会显示在这里。';
            if (d.activeView === 'redeemable') return '继续积累积分，达到所需积分后即可线下领取。';
            return '当前积分已经满足所有上架实物。';
        },
        emptyStateTitle: (d) => {
            if (d.activeView === 'all') return '暂无实物';
            return d.activeView === 'redeemable' ? '暂无可领取实物' : '已解锁全部实物';
        },
    },
    onLoad(query) {
        this.set({ activeView: VIEWS.includes(query.view) ? query.view : 'redeemable' });
        this.loadRewards();
    },
    onPullDownRefresh() {
        return this.loadRewards();
    },
    methods: {
        markImageFailed(event) {
            this.set({ failedImages: { ...this.data.failedImages, [event.detail]: true } });
        },
        setActiveView(event) {
            this.set({ activeView: event.detail.value });
        },
        async loadRewards() {
            if (!UserManager.isLogin()) {
                nav.tab('/pages/profile/index');
                return;
            }
            await this.set({ loading: true, errorMessage: '' });
            try {
                const rewards = normalizeRewardAvailability(await Api.listRewardItems());
                await this.set({
                    balance: rewards.currentPoints,
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
