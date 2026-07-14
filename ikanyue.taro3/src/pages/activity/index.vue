<template>
    <view class="activity-page">
        <view class="page-wrapper">
        <!-- 左侧日期列表 -->
        <view class="date-column">
            <view class="date-scroll">
                <view
                    v-for="(group, index) in dateGroups"
                    :key="index"
                    class="date-item"
                    :class="{
                        active: selectedGroupIndex === index,
                        'date-item--navigation': group.action === 'navigate-image',
                    }"
                    @tap="selectDateGroup(index)"
                >
                    <text class="day">{{ group.dateText }}</text>
                    <text v-if="group.title" class="date">{{ group.title }}</text>
                </view>
            </view>
        </view>

        <!-- 右侧活动列表 -->
        <view class="activity-column">
            <view v-if="loading" class="status-box">
                <view class="loading-spinner" />
                <text class="loading-text">加载中...</text>
            </view>

            <view v-else-if="networkError" class="activity-state">
                <empty-state
                    action-label="重新加载"
                    compact
                    description="请检查网络连接后重试。"
                    kind="network"
                    title="活动暂时无法加载"
                    @action="loadAllActivities"
                />
            </view>

            <view v-else-if="!activities.length" class="activity-state">
                <empty-state
                    compact
                    description="新的活动发布后会显示在这里。"
                    kind="activities"
                    title="暂无近期活动"
                />
            </view>

            <view v-else class="activity-list">
                <view
                    v-for="activity in activities"
                    :key="activity.id"
                    class="activity-card"
                    @tap="goToDetail(activity.id)"
                >
                    <view class="activity-media">
                        <image
                            v-if="canShowCover(activity)"
                            :src="activity.coverImageUrl"
                            class="activity-image"
                            mode="aspectFill"
                            @error="markCoverFailed(activity.id)"
                        />
                        <view v-else class="activity-image-fallback">
                            <text class="activity-image-fallback__mark">{{ activity.title.slice(0, 1) }}</text>
                        </view>
                    </view>
                    <view class="activity-info">
                        <text class="activity-title">{{ activity.title }}</text>
                        <view class="activity-meta">
                            <view class="meta-item">
                                <app-icon class="meta-item__icon" name="clock-muted" :size="14" />
                                <text>{{ formatDateOnly(activity.startTime) }}</text>
                                <text style="margin-left: 8px">{{ formatTimeOnly(activity.startTime) }}</text>
                                <text v-if="activity.endTime" style="margin-left: 4px">
                                    - {{ formatTimeOnly(activity.endTime) }}
                                </text>
                            </view>
                            <view class="meta-item">
                                <app-icon class="meta-item__icon" name="location-muted" :size="14" />
                                <text>{{ activity.location }}</text>
                            </view>
                        </view>
                        <view class="activity-bottom">
                            <view class="tag-list">
                                <text v-for="(tag, idx) in activity.tags.split(',').slice(0, 2)" :key="idx" class="tag">
                                    {{ tag.trim() }}
                                </text>
                            </view>
                            <view class="activity-card__end">
                                <view class="price-container" v-if="activity.price > 0">
                                    <text class="price-symbol">¥</text>
                                    <text class="price-amount">{{ (activity.price / 100.0).toFixed(2) }}</text>
                                </view>
                                <view class="price-free" v-else>免费</view>
                                <app-icon class="activity-card__arrow" name="chevron-red" :size="15" />
                            </view>
                        </view>
                    </view>
                </view>
            </view>
        </view>
    </view>
</view>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import AppIcon from '../../components/AppIcon.vue';
import EmptyState from '../../components/EmptyState.vue';
import {
    buildImageDetailUrl,
    createActivityQueryParams,
    createDateGroups,
    filterActivitiesByDateGroup,
    formatDateOnly as formatActivityDateOnly,
    formatTimeOnly as formatActivityTimeOnly,
} from './pageLogic';

export default {
    components: { AppIcon, EmptyState },
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
    onLoad() {
        this.generateDateGroups();
        this.loadAllActivities();
    },
    onShow() {
        // 每次显示页面时自动刷新数据，但保持当前筛选条件
        if (this.allActivities.length > 0) {
            this.refreshActivities();
        }
    },
    async onPullDownRefresh() {
        await this.refreshActivitiesWithToast();
    },
    methods: {
        canShowCover(activity) {
            return Boolean(activity?.coverImageUrl) && !this.failedCoverIds[activity.id];
        },
        markCoverFailed(id) {
            this.failedCoverIds = { ...this.failedCoverIds, [id]: true };
        },
        // 手动下拉刷新时使用，带提示
        async refreshActivitiesWithToast() {
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
                Taro.stopPullDownRefresh();
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
            } finally {
                // 确保停止可能的下拉刷新动画
                Taro.stopPullDownRefresh();
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
