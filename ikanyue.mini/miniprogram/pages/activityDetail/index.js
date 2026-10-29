import { definePage } from '../../kit/page.js';
import { nav, system, ui } from '../../kit/api.js';
import { activityTicket, mapActivityDetail } from '../../core/activity.js';
import { getSafeHtml } from '../../core/html.js';
import { Api } from '../../services/apis.js';

const EMPTY_ACTIVITY = Object.freeze({
    id: 0, title: '', description: '', coverImage: '', images: [], startTime: 0, endTime: 0, location: '',
    price: 0, externalLink: '', tags: [], maxParticipants: 0, currentParticipants: 0,
});

definePage({
    data: () => ({
        activityId: '', errorMessage: '', coverError: false, activity: { ...EMPTY_ACTIVITY }, loading: true, safeHtmlContent: '',
    }),
    computed: {
        ticket: (d) => activityTicket(d.activity, '免费活动'),
        canShowCover: (d) => Boolean(d.activity.coverImage) && !d.coverError,
        remainingSeats: (d) => (d.activity.maxParticipants && d.activity.currentParticipants
            ? d.activity.maxParticipants - d.activity.currentParticipants
            : 0),
        // Show "only N seats left" once ten or fewer remain.
        hasLimitedSeats: (d) => Boolean(d.activity.maxParticipants && d.activity.currentParticipants && d.remainingSeats <= 10),
    },
    onLoad(query) {
        if (!query.id) {
            ui.toast('参数错误');
            setTimeout(() => nav.back(), 1500);
            return;
        }
        this.set({ activityId: query.id });
        this.fetchActivityDetail(query.id);
    },
    onPullDownRefresh() {
        if (this.data.activityId) return this.fetchActivityDetail(this.data.activityId, false);
        return undefined;
    },
    methods: {
        async fetchActivityDetail(id, showLoading = true) {
            await this.set({ loading: showLoading, errorMessage: '' });
            try {
                const activity = mapActivityDetail(this.data.activity, await Api.findActivities({ id }));
                if (activity) {
                    await this.set({
                        activity,
                        coverError: false,
                        safeHtmlContent: activity.description ? getSafeHtml(activity.description) : '',
                    });
                } else {
                    await this.set({ errorMessage: '没有找到这场活动，它可能已经更新或下架。' });
                }
            } catch (error) {
                console.error('activity detail load failed', error);
                if (this.data.activity.title) ui.toast('刷新失败，请稍后重试');
                else await this.set({ errorMessage: '检查网络后返回活动页重试。' });
            } finally {
                await this.set({ loading: false });
            }
        },
        markCoverFailed() {
            this.set({ coverError: true });
        },
        previewImage(event) {
            system.previewImage(this.data.activity.images, event.currentTarget.dataset.src);
        },
        goBack() {
            nav.back().catch(() => nav.tab('/pages/home/index'));
        },
        register() {
            const { externalLink, title } = this.data.activity;
            if (!externalLink) {
                ui.toast('暂未开放报名');
                return;
            }
            nav.to('/pages/webview/index', { url: externalLink, title });
        },
    },
});
