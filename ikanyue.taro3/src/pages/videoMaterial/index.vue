<template>
    <view class="video-page">
        <!-- Tab切换 -->
        <VideoTabs v-model="activeTab" @change="onTabChange" />

        <!-- 加载状态 -->
        <LoadingStates
            v-if="shouldShowState"
            :type="currentStateType"
            :empty-description="emptyDescription"
            @retry="loadCurrentTabData"
        />

        <!-- 视频列表 -->
        <scroll-view
            v-else
            class="video-list"
            scroll-y
            @scrolltolower="loadMore"
            :enable-flex="true"
            :scroll-with-animation="true"
            :key="`scroll-${activeTab}`"
        >
            <VideoListItem
                v-for="video in videoList"
                :key="`${activeTab}-${video.id}`"
                :video="video"
                @click="goToDetail"
            />

            <!-- 加载更多指示器 (仅"全部材料"标签页显示) -->
            <view v-if="activeTab === 'all' && hasMore && videoList.length > 0" class="load-more" :key="'load-more'">
                <text v-if="loadingMore">正在加载...</text>
                <text v-else>上拉加载更多</text>
            </view>

            <view v-else-if="activeTab === 'all' && !hasMore && videoList.length > 0" class="no-more" :key="'no-more'">
                <text>没有更多内容了</text>
            </view>
        </scroll-view>
    </view>
</template>

<script setup>
import { ref, computed, onMounted, reactive } from 'vue';
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import favoriteManager from '../../../utils/favoriteManager';

// 导入组件
import VideoTabs from './components/VideoTabs.vue';
import VideoListItem from './components/VideoListItem.vue';
import LoadingStates from './components/LoadingStates.vue';

// 响应式数据
const videoList = ref([]);
const loading = ref(true);
const loadingMore = ref(false);
const networkError = ref(false);
const activeTab = ref('all'); // 'all' | 'favorites'
const favoriteStatus = reactive({}); // 收藏状态缓存

// 分页相关 (仅适用于"全部材料")
const currentPage = ref(1);
const pageSize = ref(20);
const hasMore = ref(true);
const total = ref(0);

// 计算属性
const emptyDescription = computed(() => {
    return activeTab.value === 'all' ? '暂无视频材料' : '暂无收藏的视频材料';
});

const shouldShowState = computed(() => {
    return (
        loading.value || networkError.value || (!loading.value && !networkError.value && videoList.value.length === 0)
    );
});

const currentStateType = computed(() => {
    if (loading.value) return 'loading';
    if (networkError.value) return 'error';
    if (!videoList.value.length) return 'empty';
    return 'loading';
});

// 页面生命周期
onMounted(async () => {
    console.log('[VideoMaterial] 页面开始加载');
    try {
        await loadCurrentTabData();
        await loadFavoriteStatus();
        console.log('[VideoMaterial] 页面加载完成');
    } catch (error) {
        console.error('[VideoMaterial] 页面加载失败:', error);
    }
});

// 页面下拉刷新
const onPullDownRefresh = async () => {
    try {
        await loadCurrentTabData();
        await loadFavoriteStatus();
        Taro.showToast({
            title: '刷新成功',
            icon: 'success',
            duration: 1500,
        });
    } catch (error) {
        console.error('刷新视频材料失败:', error);
    } finally {
        Taro.stopPullDownRefresh();
    }
};

// 定义页面事件
defineExpose({
    onPullDownRefresh,
});

// Tab切换事件
const onTabChange = async (value) => {
    console.log('[VideoMaterial] Tab切换到:', value);

    // 先设置loading状态
    loading.value = true;
    activeTab.value = value;

    // 短暂延迟确保DOM更新完成
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 然后加载数据
    await loadCurrentTabData();
};

// 加载当前Tab对应的数据
const loadCurrentTabData = async () => {
    console.log('[VideoMaterial] 开始加载数据，当前Tab:', activeTab.value);
    if (activeTab.value === 'all') {
        await loadAllVideoData();
    } else {
        await loadFavoriteVideoData();
    }
};

// 加载全部视频数据
const loadAllVideoData = async () => {
    console.log('[VideoMaterial] 开始加载全部视频数据');
    loading.value = true;
    networkError.value = false;

    try {
        const params = {
            page: 1,
            perPage: pageSize.value,
            status: 'published',
            sort: '-sequence',
        };
        console.log('[VideoMaterial] API请求参数:', params);

        const res = await Api.findVideoMaterials(params);
        console.log('[VideoMaterial] API返回数据:', res);

        videoList.value = res.items || [];
        total.value = res.totalItems || 0;
        currentPage.value = 1;
        hasMore.value = (res.items || []).length >= pageSize.value;

        console.log(`[VideoMaterial] 加载了 ${videoList.value.length} 条视频数据`);

        // 加载完成后更新收藏状态
        await loadFavoriteStatus();
    } catch (error) {
        console.error('[VideoMaterial] 加载视频数据失败:', error);
        networkError.value = true;

        Taro.showToast({
            title: '加载失败，请重试',
            icon: 'none',
            duration: 2000,
        });
    } finally {
        loading.value = false;
        console.log('[VideoMaterial] 加载完成，loading设为false');
    }
};

// 加载收藏的视频数据
const loadFavoriteVideoData = async () => {
    console.log('[VideoMaterial] 开始加载收藏视频数据');
    loading.value = true;
    networkError.value = false;

    try {
        const favoriteVideos = await favoriteManager.getFavoriteVideos();
        console.log('[VideoMaterial] 收藏视频数据:', favoriteVideos);

        // 按收藏时间倒序排列
        videoList.value = favoriteVideos.sort((a, b) => {
            return new Date(b.favoriteTime) - new Date(a.favoriteTime);
        });

        console.log(`[VideoMaterial] 加载了 ${videoList.value.length} 条收藏视频数据`);

        // 加载完成后更新收藏状态
        await loadFavoriteStatus();
    } catch (error) {
        console.error('[VideoMaterial] 加载收藏视频数据失败:', error);
        networkError.value = true;

        Taro.showToast({
            title: '加载收藏失败',
            icon: 'none',
            duration: 2000,
        });
    } finally {
        loading.value = false;
    }
};

// 加载更多数据
const loadMore = async () => {
    if (activeTab.value !== 'all' || loadingMore.value || !hasMore.value) {
        return;
    }

    console.log('[VideoMaterial] 开始加载更多数据');
    loadingMore.value = true;

    try {
        const nextPage = currentPage.value + 1;
        const params = {
            page: nextPage,
            perPage: pageSize.value,
            status: 'published',
            sort: '-sequence',
        };

        const res = await Api.findVideoMaterials(params);
        const newItems = res.items || [];

        if (newItems.length > 0) {
            videoList.value.push(...newItems);
            currentPage.value = nextPage;
            console.log(`[VideoMaterial] 加载了 ${newItems.length} 条更多数据`);
        }

        hasMore.value = newItems.length >= pageSize.value;

        // 更新新加载项目的收藏状态
        await loadFavoriteStatus();
    } catch (error) {
        console.error('[VideoMaterial] 加载更多数据失败:', error);
        Taro.showToast({
            title: '加载更多失败',
            icon: 'none',
            duration: 2000,
        });
    } finally {
        loadingMore.value = false;
    }
};

// 加载收藏状态
const loadFavoriteStatus = async () => {
    try {
        const favoriteVideos = await favoriteManager.getFavoriteVideos();
        const favoriteMap = {};
        favoriteVideos.forEach((video) => {
            favoriteMap[video.id] = true;
        });
        Object.assign(favoriteStatus, favoriteMap);
    } catch (error) {
        console.error('[VideoMaterial] 加载收藏状态失败:', error);
    }
};

// 跳转到详情页
const goToDetail = (video) => {
    console.log('[VideoMaterial] 跳转到视频详情:', video.id);
    Taro.navigateTo({
        url: `/pages/videoMaterial/detail/index?id=${video.id}`,
    });
};
</script>

<style lang="scss" src="./index.scss"></style>
