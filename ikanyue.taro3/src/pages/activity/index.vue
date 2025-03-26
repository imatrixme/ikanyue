<template>
    <view class="activity-list">
        <view class="activity-container">
            <!-- 日期选择器 - 左侧 -->
            <scroll-view scroll-y class="date-scroll">
                <view
                    v-for="(group, index) in dateGroups"
                    :key="index"
                    class="date-item"
                    :class="{ active: selectedGroupIndex === index }"
                    @tap="selectDateGroup(index)"
                >
                    <text class="day">{{ group.dateText }}</text>
                    <text class="date">{{ group.title }}</text>
                </view>
            </scroll-view>

            <!-- 活动列表 - 右侧 -->
            <view class="content-area">
                <scroll-view
                    scroll-y
                    class="activity-scroll"
                    @refresherrefresh="onRefresh"
                    refresher-enabled
                    :refresher-triggered="refreshing"
                >
                    <view v-if="loading" class="loading-container">
                        <nut-icon name="loading" size="20"></nut-icon>
                        <text class="loading-text">加载中...</text>
                    </view>

                    <view v-else-if="networkError" class="empty-container">
                        <nut-empty description="网络错误，请下拉刷新"></nut-empty>
                    </view>

                    <view v-else-if="!activities.length" class="empty-container">
                        <nut-empty description="暂无活动"></nut-empty>
                    </view>

                    <view v-else class="activity-cards">
                        <view
                            v-for="activity in activities"
                            :key="activity.id"
                            class="activity-card"
                            @tap="goToDetail(activity.id)"
                        >
                            <image :src="activity.cover_image" class="activity-image" mode="aspectFill" />
                            <view class="activity-info">
                                <text class="activity-title">{{ activity.title }}</text>
                                <view class="activity-meta">
                                    <view class="meta-item">
                                        <nut-icon name="clock" size="14"></nut-icon>
                                        <text>{{ formatDateTime(activity.start_time) }}</text>
                                    </view>
                                    <view class="meta-item">
                                        <nut-icon name="location" size="14"></nut-icon>
                                        <text>{{ activity.location }}</text>
                                    </view>
                                </view>
                                <view class="activity-bottom">
                                    <view class="tag-list">
                                        <text v-for="(tag, idx) in activity.tags" :key="idx" class="tag">{{
                                            tag
                                        }}</text>
                                    </view>
                                    <view class="price" v-if="activity.price > 0">¥{{ activity.price }}</view>
                                    <view class="price free" v-else>免费</view>
                                </view>
                            </view>
                        </view>
                    </view>
                </scroll-view>
            </view>
        </view>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';

export default {
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
            // 刷新状态
            refreshing: false,
            // 网络错误状态
            networkError: false,
        };
    },
    mounted() {
        // 先生成日期分组选择器（不依赖网络）
        this.generateDateGroups();
        // 再加载活动数据
        this.loadAllActivities();
    },
    methods: {
        // 一次性加载所有活动数据
        async loadAllActivities() {
            this.loading = true;
            this.networkError = false;

            try {
                // 计算时间范围
                const now = new Date();

                // 上个月的第一天
                const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

                // 三个月后的最后一天
                const threeMonthsLater = new Date(now.getFullYear(), now.getMonth() + 4, 0);

                const params = {
                    start_time_gte: lastMonth.toISOString(),
                    start_time_lte: threeMonthsLater.toISOString(),
                    status: 'all', // 获取所有状态的活动
                    sort: 'startTime',
                    perPage: 1000, // 设置较大的数量，以一次获取所有数据
                };

                const res = await Api.findActivities(params);

                // 保存所有活动数据
                this.allActivities = res.items || [];

                // 筛选当前选择的日期的活动
                this.filterActivitiesByDate();
            } catch (error) {
                console.error('加载活动列表失败:', error);
                this.networkError = true;
                Taro.showToast({
                    title: '加载失败，请下拉刷新',
                    icon: 'none',
                });
            } finally {
                this.loading = false;
                this.refreshing = false;
            }
        },

        // 生成日期分组 - 固定生成，不依赖网络数据
        generateDateGroups() {
            const groups = [];
            const now = new Date();
            now.setHours(0, 0, 0, 0);

            // 今天
            const today = new Date(now);
            groups.push({
                title: '今天',
                dateText: `${today.getMonth() + 1}月${today.getDate()}日`,
                date: today,
                type: 'day',
                startTime: today,
                endTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999),
            });

            // 明天
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            groups.push({
                title: '明天',
                dateText: `${tomorrow.getMonth() + 1}月${tomorrow.getDate()}日`,
                date: tomorrow,
                type: 'day',
                startTime: tomorrow,
                endTime: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59, 999),
            });

            // 后天
            const dayAfterTomorrow = new Date(now);
            dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
            groups.push({
                title: '后天',
                dateText: `${dayAfterTomorrow.getMonth() + 1}月${dayAfterTomorrow.getDate()}日`,
                date: dayAfterTomorrow,
                type: 'day',
                startTime: dayAfterTomorrow,
                endTime: new Date(
                    dayAfterTomorrow.getFullYear(),
                    dayAfterTomorrow.getMonth(),
                    dayAfterTomorrow.getDate(),
                    23,
                    59,
                    59,
                    999
                ),
            });

            // 剩余的一周内的日期（第4天到第7天）
            for (let i = 3; i < 7; i++) {
                const date = new Date(now);
                date.setDate(date.getDate() + i);
                const dayOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
                groups.push({
                    title: dayOfWeek,
                    dateText: `${date.getMonth() + 1}月${date.getDate()}日`,
                    date: date,
                    type: 'day',
                    startTime: date,
                    endTime: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999),
                });
            }

            // 一周后的所有活动
            const oneWeekLater = new Date(now);
            oneWeekLater.setDate(oneWeekLater.getDate() + 7);

            const threeMonthsLater = new Date(now.getFullYear(), now.getMonth() + 4, 0);

            groups.push({
                title: '更晚',
                dateText: `一周后`,
                type: 'range',
                startTime: oneWeekLater,
                endTime: threeMonthsLater,
            });

            // 已过期的活动（上个月到昨天）
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(23, 59, 59, 999);

            groups.push({
                title: '过往',
                dateText: '已结束',
                type: 'range',
                startTime: lastMonth,
                endTime: yesterday,
            });

            this.dateGroups = groups;
        },

        // 格式化时间显示
        formatDateTime(timestamp) {
            if (!timestamp) return '';

            // 处理ISO格式的日期字符串
            const date = new Date(timestamp);

            // 检查日期是否有效
            if (isNaN(date.getTime())) return '';

            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');

            return `${month}/${day} ${hours}:${minutes}`;
        },

        // 选择日期组
        selectDateGroup(index) {
            this.selectedGroupIndex = index;
            this.filterActivitiesByDate();
        },

        // 根据选中的日期筛选活动
        filterActivitiesByDate() {
            const group = this.dateGroups[this.selectedGroupIndex];

            if (!group || !this.allActivities.length) {
                this.activities = [];
                return;
            }

            // 转换日期组的开始和结束时间为UTC格式，便于比较
            const groupStartDate = new Date(group.startTime);
            const groupEndDate = new Date(group.endTime);
            const groupStartUtc = Date.UTC(
                groupStartDate.getFullYear(),
                groupStartDate.getMonth(),
                groupStartDate.getDate(),
                groupStartDate.getHours(),
                groupStartDate.getMinutes(),
                groupStartDate.getSeconds()
            );
            const groupEndUtc = Date.UTC(
                groupEndDate.getFullYear(),
                groupEndDate.getMonth(),
                groupEndDate.getDate(),
                groupEndDate.getHours(),
                groupEndDate.getMinutes(),
                groupEndDate.getSeconds()
            );

            this.activities = this.allActivities.filter((activity) => {
                if (!activity.startTime) return false;

                // 解析活动开始时间
                const activityDate = new Date(activity.startTime);

                // 检查日期是否有效
                if (isNaN(activityDate.getTime())) {
                    return false;
                }

                // 将活动时间转换为UTC时间以便比较
                const activityUtc = Date.UTC(
                    activityDate.getFullYear(),
                    activityDate.getMonth(),
                    activityDate.getDate(),
                    activityDate.getHours(),
                    activityDate.getMinutes(),
                    activityDate.getSeconds()
                );

                // 判断活动时间是否在范围内
                const inRange = activityUtc >= groupStartUtc && activityUtc <= groupEndUtc;
                return inRange;
            });
        },

        // 下拉刷新 - 重新从网络加载数据
        onRefresh() {
            this.refreshing = true;
            this.loadAllActivities();
        },

        // 跳转到详情页
        goToDetail(id) {
            Taro.navigateTo({
                url: `/pages/activityDetail/index?id=${id}`,
            });
        },
    },
};
</script>

<style lang="scss">
@import './index.scss';
</style>
