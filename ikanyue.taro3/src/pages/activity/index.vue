<template>
    <view class="activity-list">
        <view class="activity-container">
            <!-- 日期选择器 - 左侧 -->
            <scroll-view scroll-y class="date-scroll">
                <view
                    v-for="(date, index) in dateList"
                    :key="index"
                    class="date-item"
                    :class="{ active: selectedDateIndex === index }"
                    @tap="selectDate(index)"
                >
                    <text class="day">{{ formatDay(date) }}</text>
                    <text class="date">{{ formatDate(date) }}</text>
                </view>
            </scroll-view>

            <!-- 活动列表 - 右侧 -->
            <view class="content-area">
                <scroll-view
                    scroll-y
                    class="activity-scroll"
                    @scrolltolower="loadMore"
                    @refresherrefresh="onRefresh"
                    refresher-enabled
                    :refresher-triggered="refreshing"
                >
                    <view v-if="loading && !activities.length" class="loading-container">
                        <nut-icon name="loading" size="20"></nut-icon>
                        <text class="loading-text">加载中...</text>
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

                        <view v-if="hasMore" class="load-more">
                            <nut-icon name="loading" size="16"></nut-icon>
                            <text>加载更多</text>
                        </view>
                        <view v-else class="no-more">— 没有更多活动了 —</view>
                    </view>
                </scroll-view>
            </view>
        </view>
    </view>
</template>

<script>
import { reactive, toRefs, onMounted } from 'vue';
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';

export default {
    setup() {
        const state = reactive({
            dateList: [],
            selectedDateIndex: 0,
            activities: [],
            page: 1,
            perPage: 10,
            hasMore: true,
            loading: false,
            refreshing: false,
        });

        // 生成未来15天的日期列表
        const generateDateList = () => {
            const dates = [];
            const today = new Date();

            for (let i = 0; i < 15; i++) {
                const date = new Date();
                date.setDate(today.getDate() + i);
                dates.push(date);
            }

            state.dateList = dates;
        };

        // 格式化日期显示
        const formatDay = (date) => {
            const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            const today = new Date();

            if (
                date.getDate() === today.getDate() &&
                date.getMonth() === today.getMonth() &&
                date.getFullYear() === today.getFullYear()
            ) {
                return '今天';
            }

            const tomorrow = new Date();
            tomorrow.setDate(today.getDate() + 1);

            if (
                date.getDate() === tomorrow.getDate() &&
                date.getMonth() === tomorrow.getMonth() &&
                date.getFullYear() === tomorrow.getFullYear()
            ) {
                return '明天';
            }

            return days[date.getDay()];
        };

        const formatDate = (date) => {
            return `${date.getMonth() + 1}/${date.getDate()}`;
        };

        const formatDateTime = (timestamp) => {
            const date = new Date(timestamp);
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            return `${formatDate(date)} ${hours}:${minutes}`;
        };

        // 选择日期
        const selectDate = (index) => {
            state.selectedDateIndex = index;
            state.page = 1;
            state.activities = [];
            state.hasMore = true;
            loadActivities();
        };

        // 加载活动列表
        const loadActivities = async () => {
            if (!state.hasMore || state.loading) return;

            state.loading = true;

            try {
                const selectedDate = state.dateList[state.selectedDateIndex];
                // 设置日期范围为选定日期的当天
                const startDate = new Date(selectedDate);
                startDate.setHours(0, 0, 0, 0);

                const endDate = new Date(selectedDate);
                endDate.setHours(23, 59, 59, 999);

                const params = {
                    page: state.page,
                    perPage: state.perPage,
                    start_time_gte: startDate.getTime(),
                    start_time_lte: endDate.getTime(),
                    status: 'active',
                    sort: 'start_time',
                };

                const res = await Api.findActivities(params);

                if (state.page === 1) {
                    state.activities = res.data;
                } else {
                    state.activities = [...state.activities, ...res.data];
                }

                state.hasMore = res.data.length === state.perPage;
                state.page += 1;
            } catch (error) {
                console.error('加载活动列表失败:', error);
                Taro.showToast({
                    title: '加载失败',
                    icon: 'none',
                });
            } finally {
                state.loading = false;
                state.refreshing = false;
            }
        };

        // 加载更多
        const loadMore = () => {
            loadActivities();
        };

        // 下拉刷新
        const onRefresh = () => {
            state.refreshing = true;
            state.page = 1;
            state.activities = [];
            state.hasMore = true;
            loadActivities();
        };

        // 跳转到详情页
        const goToDetail = (id) => {
            Taro.navigateTo({
                url: `/pages/activityDetail/index?id=${id}`,
            });
        };

        onMounted(() => {
            generateDateList();
            loadActivities();
        });

        return {
            ...toRefs(state),
            formatDay,
            formatDate,
            formatDateTime,
            selectDate,
            loadMore,
            onRefresh,
            goToDetail,
        };
    },
};
</script>

<style lang="scss">
@import './index.scss';
</style>
