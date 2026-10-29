import { definePage } from '../../kit/page.js';
import { nav, page, ui } from '../../kit/api.js';
import {
    activityTicket, createActivityQueryParams, createDateGroups, daysWithActivities,
    filterActivitiesByDateGroup, nextDayWithActivities,
} from '../../core/activity.js';
import { Api } from '../../services/apis.js';
import { RoleManager } from '../../services/rolemanager.js';

definePage({
    data: () => ({
        allActivities: [], dateGroups: [], selectedGroupIndex: 0, loading: true, networkError: false, failedCoverIds: {},
    }),
    computed: {
        calendarMonth: (d) => d.dateGroups[0]?.month || '',
        markedDays: (d) => daysWithActivities(d.dateGroups, d.allActivities),
        nextDayIndex: (d) => nextDayWithActivities(d.dateGroups, d.allActivities, d.selectedGroupIndex),
        activities: (d) => filterActivitiesByDateGroup(d.allActivities, d.dateGroups[d.selectedGroupIndex]),
        dayRows: (d) => d.dateGroups.map((group, index) => {
            const marked = d.markedDays.includes(index);
            return {
                dateKey: group.dateKey,
                title: group.title,
                day: group.day,
                active: index === d.selectedGroupIndex,
                marked,
                ariaLabel: `${group.dateText}${marked ? '，有活动' : ''}`,
            };
        }),
        ticketRows: (d) => d.activities.map((activity, index) => ({
            ...activityTicket(activity),
            id: activity.id,
            coverUrl: activity.coverImageUrl,
            featured: index === 0,
            location: activity.location,
            showImage: Boolean(activity.coverImageUrl) && !d.failedCoverIds[activity.id],
            title: activity.title,
        })),
        emptyActionLabel: (d) => (d.nextDayIndex >= 0 ? `查看${d.dateGroups[d.nextDayIndex].dateText}的活动` : ''),
        emptyDescription: (d) => (d.nextDayIndex >= 0 ? '最近的活动在后面几天。' : '新的活动发布后会显示在这里。'),
        emptyTitle: (d) => (d.markedDays.length ? '这天没有活动' : '近 7 天暂无活动'),
    },
    onLoad() {
        this.set({ dateGroups: createDateGroups() });
        this.loadAllActivities();
    },
    onShow() {
        RoleManager.applyTabBar(RoleManager.getRole());
        page.title('活动');
        this.selectComponent('#upcomingLessons')?.refresh();
        // Refresh on every visit, keeping the selected day.
        if (this.data.allActivities.length > 0) this.loadAllActivities(false);
    },
    onPullDownRefresh() {
        return Promise.all([
            this.refreshWithToast(),
            this.selectComponent('#upcomingLessons')?.refresh(true),
        ]);
    },
    methods: {
        retry() {
            return this.loadAllActivities();
        },
        markCoverFailed(event) {
            this.set({ failedCoverIds: { ...this.data.failedCoverIds, [event.detail.id]: true } });
        },
        async refreshWithToast() {
            const loaded = await this.loadAllActivities(false);
            ui.toast(loaded ? '刷新成功' : '刷新失败', { kind: loaded ? 'success' : 'none', duration: 1500 });
        },
        async loadAllActivities(showLoading = true) {
            await this.set({ networkError: false, ...(showLoading ? { loading: true } : {}) });
            try {
                const res = await Api.findActivities(createActivityQueryParams());
                await this.set({ allActivities: res.items || [] });
                return true;
            } catch (error) {
                console.error('activity list load failed', error);
                await this.set({ networkError: true });
                if (showLoading) ui.toast('加载失败，请点击重试');
                return false;
            } finally {
                await this.set({ loading: false });
            }
        },
        selectDay(event) {
            this.selectDateGroup(event.currentTarget.dataset.index);
        },
        showNextDay() {
            this.selectDateGroup(this.data.nextDayIndex);
        },
        selectDateGroup(index) {
            if (this.data.dateGroups[index]) this.set({ selectedGroupIndex: index });
        },
        goToDetail(event) {
            nav.to('/pages/activityDetail/index', { id: event.detail.id });
        },
    },
});
