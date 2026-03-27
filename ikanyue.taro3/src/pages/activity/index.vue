<template>
    <view class="page-wrapper">
        <!-- 左侧日期列表 -->
        <view class="date-column">
            <scroll-view scroll-y="true" :style="{ height: scrollHeight + 'px' }" show-scrollbar="false" enhanced>
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
            </scroll-view>
        </view>

        <!-- 右侧活动列表 -->
        <view class="activity-column">
            <scroll-view
                scroll-y="true"
                :style="{ height: scrollHeight + 'px' }"
                show-scrollbar="false"
                enhanced
                @scrolltolower="onScrollToLower"
            >
                <view v-if="loading" class="status-box">
                    <nut-icon name="loading" size="20"></nut-icon>
                    <text class="loading-text">加载中...</text>
                </view>

                <view v-else-if="networkError" class="status-box">
                    <nut-empty description="网络错误，点击重试"></nut-empty>
                    <nut-button type="primary" size="small" @click="loadAllActivities" style="margin-top: 10px">
                        重新加载
                    </nut-button>
                </view>

                <view v-else-if="!activities.length" class="status-box">
                    <nut-empty description="暂无活动"></nut-empty>
                </view>

                <view v-else class="activity-list">
                    <view
                        v-for="activity in activities"
                        :key="activity.id"
                        class="activity-card"
                        @tap="goToDetail(activity.id)"
                    >
                        <image :src="activity.coverImageUrl" class="activity-image" mode="aspectFill" />
                        <view class="activity-info">
                            <text class="activity-title">{{ activity.title }}</text>
                            <view class="activity-meta">
                                <view class="meta-item">
                                    <nut-icon name="clock" size="14"></nut-icon>
                                    <text>{{ formatDateOnly(activity.startTime) }}</text>
                                    <text style="margin-left: 8px">{{ formatTimeOnly(activity.startTime) }}</text>
                                    <text v-if="activity.endTime" style="margin-left: 4px">
                                        - {{ formatTimeOnly(activity.endTime) }}
                                    </text>
                                </view>
                                <view class="meta-item">
                                    <nut-icon name="location" size="14"></nut-icon>
                                    <text>{{ activity.location }}</text>
                                </view>
                            </view>
                            <view class="activity-bottom">
                                <view class="tag-list">
                                    <text v-for="(tag, idx) in activity.tags.split(',')" :key="idx" class="tag">
                                        {{ tag.trim() }}
                                    </text>
                                </view>
                                <view class="price-container" v-if="activity.price > 0">
                                    <text class="price-symbol">¥</text>
                                    <text class="price-amount">{{ (activity.price / 100.0).toFixed(2) }}</text>
                                </view>
                                <view class="price-free" v-else>免费</view>
                            </view>
                        </view>
                    </view>
                </view>
            </scroll-view>
        </view>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';

const IMAGE_DETAIL_URLS = {
    about: 'https://kyoss.abcmem.com/ikanyue-public/guanyu-kanyue.JPG',
    learnWhat: 'https://kyoss.abcmem.com/ikanyue-public/zai-kanyue-xue-shenme.JPG',
};

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

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
            // 网络错误状态
            networkError: false,
            // 滚动区域高度
            scrollHeight: 600,
        };
    },
    onLoad() {
        // 计算页面高度并设置滚动区域高度
        this.setScrollHeight();

        // 加载数据
        this.generateDateGroups();
        this.loadAllActivities();
    },
    onShow() {
        // 每次显示页面时重新计算高度
        this.setScrollHeight();

        // 每次显示页面时自动刷新数据，但保持当前筛选条件
        if (this.allActivities.length > 0) {
            this.refreshActivities();
        }
    },
    onReady() {
        // 页面渲染完成后再次确认高度
        this.setScrollHeight();
    },
    // 添加下拉刷新的生命周期方法
    onPullDownRefresh() {
        // 重新加载数据，保持当前的筛选条件，并显示提示
        this.refreshActivitiesWithToast();
    },
    methods: {
        // 设置滚动高度
        setScrollHeight() {
            try {
                const res = Taro.getSystemInfoSync();
                // 设置滚动区域高度为窗口高度
                this.scrollHeight = res.windowHeight;
                console.log('设置滚动高度:', this.scrollHeight);
            } catch (e) {
                console.error('获取系统信息失败:', e);
            }
        },

        // 滚动到底部
        onScrollToLower() {
            console.log('滚动到底部');
            // 加载更多的逻辑
        },

        // 手动下拉刷新时使用，带提示
        async refreshActivitiesWithToast() {
            // 记住当前的筛选索引
            const currentIndex = this.selectedGroupIndex;

            try {
                // 重新加载全部数据，不显示加载动画
                await this.loadAllActivities(false);

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
                // 停止下拉刷新动画
                Taro.stopPullDownRefresh();
            }
        },

        // 自动刷新使用，无提示
        async refreshActivities() {
            // 记住当前的筛选索引
            const currentIndex = this.selectedGroupIndex;

            try {
                // 重新加载全部数据
                await this.loadAllActivities(false); // 不显示加载提示

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
                // 计算时间范围 - 扩大范围以包含历史数据
                const now = new Date();
                // 从2020年开始，覆盖所有可能的历史活动
                const startDate = new Date('2020-01-01');
                // 到未来一年，覆盖所有可能的未来活动
                const endDate = new Date(now.getFullYear() + 1, 11, 31);

                const params = {
                    start_time_gte: startDate.toISOString(),
                    start_time_lte: endDate.toISOString(),
                    perPage: 1000,
                };

                const res = await Api.findActivities(params);
                console.log('获取活动数据:', res);

                // 保存所有活动数据
                this.allActivities = res.items || [];
                // 筛选当前选择的日期的活动
                this.filterActivitiesByDate();
            } catch (error) {
                console.error('加载活动列表失败:', error);
                this.networkError = true;
                if (showLoading) {
                    Taro.showToast({
                        title: '加载失败，请点击重试',
                        icon: 'none',
                    });
                }
            } finally {
                this.loading = false;
            }
        },

        // 生成日期分组
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
                title: WEEKDAY_LABELS[tomorrow.getDay()],
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
                title: WEEKDAY_LABELS[dayAfterTomorrow.getDay()],
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
                groups.push({
                    title: WEEKDAY_LABELS[date.getDay()],
                    dateText: `${date.getMonth() + 1}月${date.getDate()}日`,
                    date: date,
                    type: 'day',
                    startTime: date,
                    endTime: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999),
                });
            }

            groups.push({
                title: '',
                dateText: '看乐教学',
                type: 'navigation',
                action: 'navigate-image',
                imageUrl: IMAGE_DETAIL_URLS.learnWhat,
                detailTitle: '看乐教学',
            });

            groups.push({
                title: '',
                dateText: '关于看乐',
                type: 'navigation',
                action: 'navigate-image',
                imageUrl: IMAGE_DETAIL_URLS.about,
                detailTitle: '关于看乐',
            });

            this.dateGroups = groups;
        },

        // 只格式化日期部分 (月日)
        formatDateOnly(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return '';
            const month = (date.getMonth() + 1).toString();
            const day = date.getDate().toString();
            return `${month}月${day}日`;
        },

        // 只格式化时间部分 (时分)
        formatTimeOnly(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return '';
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
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

            if (!group || !this.allActivities.length) {
                this.activities = [];
                return;
            }

            if (group.action === 'navigate-image') {
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
                if (!activity.startTime) {
                    return false;
                }

                // 解析活动开始时间
                const activityDate = new Date(activity.startTime);
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
                return activityUtc >= groupStartUtc && activityUtc <= groupEndUtc;
            });
        },

        // 跳转到详情页
        goToDetail(id) {
            Taro.navigateTo({
                url: `/pages/activityDetail/index?id=${id}`,
            });
        },

        goToImageDetail(group) {
            if (!group?.imageUrl) {
                return;
            }

            const params = [`imageUrl=${encodeURIComponent(group.imageUrl)}`];

            if (group.detailTitle) {
                params.push(`title=${encodeURIComponent(group.detailTitle)}`);
            }

            Taro.navigateTo({
                url: `/pages/imageDetail/index?${params.join('&')}`,
            });
        },
    },
};
</script>

<style lang="scss">
@import './index.scss';
</style>
