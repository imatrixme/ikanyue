<template>
    <page-chrome class="activity-page">
        <view class="activity-calendar">
            <view class="activity-calendar__month">{{ calendarMonth }}</view>
            <view class="activity-calendar__days">
                <view
                    v-for="(group, index) in dayGroups"
                    :key="index"
                    class="activity-day"
                    :class="{ 'activity-day--active': selectedGroupIndex === index }"
                    @tap="selectDateGroup(index)"
                >
                    <text class="activity-day__weekday">{{ group.title }}</text>
                    <text class="activity-day__number">{{ getCalendarDay(group) }}</text>
                </view>
            </view>
        </view>

        <view class="activity-upcoming">
            <upcoming-lessons ref="upcomingLessons" />
        </view>

        <view class="activity-content">
            <async-state v-if="loading" compact state="loading" title="正在加载活动" />

            <view v-else-if="networkError" class="activity-state">
                <async-state
                    action-label="重新加载"
                    compact
                    description="请检查网络连接后重试。"
                    kind="network"
                    state="error"
                    title="活动暂时无法加载"
                    @action="loadAllActivities"
                />
            </view>

            <view v-else-if="!activities.length" class="activity-state">
                <async-state
                    compact
                    description="新的活动发布后会显示在这里。"
                    kind="activities"
                    state="empty"
                    title="暂无近期活动"
                />
            </view>

            <view v-else class="activity-list">
                <activity-ticket
                    v-for="(activity, index) in activities"
                    :key="activity.id"
                    :cover-url="activity.coverImageUrl"
                    :date-text="formatDateOnly(activity.startTime)"
                    :featured="index === 0"
                    :location="activity.location"
                    :price-label="formatPriceLabel(activity.price)"
                    :show-image="canShowCover(activity)"
                    :tags="getActivityTags(activity)"
                    :time-text="formatActivityTimeRange(activity)"
                    :title="activity.title"
                    @image-error="markCoverFailed(activity.id)"
                    @select="goToDetail(activity.id)"
                />
            </view>
        </view>

        <view class="activity-links">
            <view
                v-for="group in navigationGroups"
                :key="group.dateText"
                class="activity-link"
                @tap="goToImageDetail(group)"
            >
                <text>{{ group.dateText }}</text>
                <app-icon name="chevron-primary" size="sm" />
            </view>
        </view>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import ActivityTicket from '../../components/ActivityTicket.vue';
import AppIcon from '../../components/AppIcon.vue';
import AsyncState from '../../components/AsyncState.vue';
import PageChrome from '../../components/PageChrome.vue';
import UpcomingLessons from '../../components/UpcomingLessons.vue';
import { RoleManager } from '../../../utils/rolemanager';
import {
    buildImageDetailUrl,
    createActivityQueryParams,
    createDateGroups,
    filterActivitiesByDateGroup,
    formatDateOnly as formatActivityDateOnly,
    formatTimeOnly as formatActivityTimeOnly,
} from './pageLogic';

export default {
    components: { ActivityTicket, AppIcon, AsyncState, PageChrome, UpcomingLessons },
    data() {
        return {
            // 原始活动数据
            allActivities: [],
            // 当前显示的活动数据（根据日期筛选）
            activities: [],
            // 日期分组列表
            dateGroups: [],
            // 选中的日期组索引
            selectedGroupIndex: 0,
            // 加载状态
            loading: true,
            // 网络错误状态
            networkError: false,
            failedCoverIds: {},
        };
    },
    computed: {
        calendarMonth() {
            const date = this.dayGroups[0]?.date;
            return date ? `${String(date.getMonth() + 1).padStart(2, '0')}月` : '';
        },
        dayGroups() {
            return this.dateGroups.filter((group) => group.type === 'day');
        },
        navigationGroups() {
            return this.dateGroups.filter((group) => group.action === 'navigate-image');
        },
    },
    onLoad() {
        this.generateDateGroups();
        this.loadAllActivities();
    },
    onShow() {
        RoleManager.applyTabBar(RoleManager.getRole());
        Taro.setNavigationBarTitle({ title: '活动' });
        this.$nextTick(() => this.$refs.upcomingLessons?.refresh());
        // 每次显示页面时自动刷新数据，但保持当前筛选条件
        if (this.allActivities.length > 0) {
            this.refreshActivities();
        }
    },
    async onPullDownRefresh() {
        try {
            await Promise.all([
                this.refreshActivitiesWithToast(false),
                this.$refs.upcomingLessons?.refresh(true),
            ]);
        } finally {
            Taro.stopPullDownRefresh();
        }
    },
    methods: {
        canShowCover(activity) {
            return Boolean(activity?.coverImageUrl) && !this.failedCoverIds[activity.id];
        },
        markCoverFailed(id) {
            this.failedCoverIds = { ...this.failedCoverIds, [id]: true };
        },
        // 手动下拉刷新时使用，带提示
        async refreshActivitiesWithToast(stopRefresh = true) {
            // 记住当前的筛选索引
            const currentIndex = this.selectedGroupIndex;

            try {
                // 重新加载全部数据，不显示加载动画
                const loaded = await this.loadAllActivities(false);
                if (!loaded) {
                    throw new Error('活动刷新失败');
                }

                // 恢复之前的筛选条件
                this.selectedGroupIndex = currentIndex;
                this.filterActivitiesByDate();

                // 显示成功提示
                Taro.showToast({
                    title: '刷新成功',
                    icon: 'success',
                    duration: 1500,
                });
            } catch (error) {
                console.error('刷新活动失败:', error);
                Taro.showToast({
                    title: '刷新失败',
                    icon: 'none',
                    duration: 1500,
                });
            } finally {
                if (stopRefresh) Taro.stopPullDownRefresh();
            }
        },

        // 自动刷新使用，无提示
        async refreshActivities() {
            // 记住当前的筛选索引
            const currentIndex = this.selectedGroupIndex;

            try {
                // 重新加载全部数据
                const loaded = await this.loadAllActivities(false); // 不显示加载提示
                if (!loaded) {
                    return;
                }

                // 恢复之前的筛选条件
                this.selectedGroupIndex = currentIndex;
                this.filterActivitiesByDate();
            } catch (error) {
                console.error('自动刷新活动失败:', error);
            }
        },

        // 一次性加载所有活动数据
        async loadAllActivities(showLoading = true) {
            if (showLoading) {
                this.loading = true;
            }
            this.networkError = false;

            try {
                const res = await Api.findActivities(createActivityQueryParams());
                console.log('获取活动数据:', res);

                // 保存所有活动数据
                this.allActivities = res.items || [];
                // 筛选当前选择的日期的活动
                this.filterActivitiesByDate();
                return true;
            } catch (error) {
                console.error('加载活动列表失败:', error);
                this.networkError = true;
                if (showLoading) {
                    Taro.showToast({
                        title: '加载失败，请点击重试',
                        icon: 'none',
                    });
                }
                return false;
            } finally {
                this.loading = false;
            }
        },

        // 生成日期分组
        generateDateGroups() {
            this.dateGroups = createDateGroups();
        },

        // 只格式化日期部分 (月日)
        formatDateOnly(timestamp) {
            return formatActivityDateOnly(timestamp);
        },

        // 只格式化时间部分 (时分)
        formatTimeOnly(timestamp) {
            return formatActivityTimeOnly(timestamp);
        },

        formatActivityTimeRange(activity) {
            const start = this.formatTimeOnly(activity.startTime);
            const end = this.formatTimeOnly(activity.endTime);
            return end ? `${start} - ${end}` : start;
        },

        formatPriceLabel(price) {
            return Number(price || 0) > 0 ? `¥${(price / 100).toFixed(2)}` : '免费';
        },

        getActivityTags(activity) {
            return String(activity?.tags || '')
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean);
        },

        getCalendarDay(group) {
            return group?.date ? String(group.date.getDate()).padStart(2, '0') : '';
        },

        // 选择日期组
        selectDateGroup(index) {
            const group = this.dateGroups[index];

            if (!group) {
                return;
            }

            if (group.action === 'navigate-image') {
                this.goToImageDetail(group);
                return;
            }

            this.selectedGroupIndex = index;
            this.filterActivitiesByDate();
        },

        // 根据选中的日期筛选活动
        filterActivitiesByDate() {
            const group = this.dateGroups[this.selectedGroupIndex];
            this.activities = filterActivitiesByDateGroup(this.allActivities, group);
        },

        // 跳转到详情页
        goToDetail(id) {
            Taro.navigateTo({
                url: `/pages/activityDetail/index?id=${id}`,
            });
        },

        goToImageDetail(group) {
            const url = buildImageDetailUrl(group);
            if (!url) {
                return;
            }

            Taro.navigateTo({
                url,
            });
        },
    },
};
</script>

<style lang="scss">
@import './index.scss';
</style>
