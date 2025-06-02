<template>
    <view class="audio-page">
        <!-- Tab切换 -->
        <AudioTabs v-model="activeTab" @change="onTabChange" />

        <!-- 加载状态 -->
        <LoadingStates
            v-if="shouldShowState"
            :type="currentStateType"
            :empty-description="emptyDescription"
            @retry="loadCurrentTabData"
        />

        <!-- 音频列表 -->
        <scroll-view
            v-else
            class="audio-list"
            scroll-y
            @scrolltolower="loadMore"
            :enable-flex="true"
            :scroll-with-animation="true"
            :key="`scroll-${activeTab}`"
        >
            <AudioListItem
                v-for="audio in audioList"
                :key="`${activeTab}-${audio.id}`"
                :audio="audio"
                @click="goToDetail"
            />

            <!-- 加载更多指示器 (仅"全部材料"标签页显示) -->
            <view v-if="activeTab === 'all' && hasMore && audioList.length > 0" class="load-more" :key="'load-more'">
                <text v-if="loadingMore">正在加载...</text>
                <text v-else>上拉加载更多</text>
            </view>

            <view v-else-if="activeTab === 'all' && !hasMore && audioList.length > 0" class="no-more" :key="'no-more'">
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
import AudioTabs from './components/AudioTabs.vue';
import AudioListItem from './components/AudioListItem.vue';
import LoadingStates from './components/LoadingStates.vue';

// 响应式数据
const audioList = ref([]);
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
    return activeTab.value === 'all' ? '暂无音频材料' : '暂无收藏的音频材料';
});

const shouldShowState = computed(() => {
    return (
        loading.value || networkError.value || (!loading.value && !networkError.value && audioList.value.length === 0)
    );
});

const currentStateType = computed(() => {
    if (loading.value) return 'loading';
    if (networkError.value) return 'error';
    if (!audioList.value.length) return 'empty';
    return 'loading';
});

// 页面生命周期
onMounted(async () => {
    console.log('[AudioMaterial] 页面开始加载');
    try {
        await loadCurrentTabData();
        await loadFavoriteStatus();
        console.log('[AudioMaterial] 页面加载完成');
    } catch (error) {
        console.error('[AudioMaterial] 页面加载失败:', error);
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
        console.error('刷新音频材料失败:', error);
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
    console.log('[AudioMaterial] Tab切换到:', value);

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
    console.log('[AudioMaterial] 开始加载数据，当前Tab:', activeTab.value);
    if (activeTab.value === 'all') {
        await loadAllAudioData();
    } else {
        await loadFavoriteAudioData();
    }
};

// 加载全部音频数据
const loadAllAudioData = async () => {
    console.log('[AudioMaterial] 开始加载全部音频数据');
    loading.value = true;
    networkError.value = false;

    try {
        const params = {
            page: 1,
            perPage: pageSize.value,
            status: 'published',
            sort: '-sequence',
        };
        console.log('[AudioMaterial] API请求参数:', params);

        const res = await Api.findAudioMaterials(params);
        console.log('[AudioMaterial] API返回数据:', res);

        audioList.value = res.items || [];
        total.value = res.totalItems || 0;
        currentPage.value = 1;
        hasMore.value = (res.items || []).length >= pageSize.value;

        console.log(`[AudioMaterial] 加载了 ${audioList.value.length} 条音频数据`);

        // 加载完成后更新收藏状态
        await loadFavoriteStatus();
    } catch (error) {
        console.error('[AudioMaterial] 加载音频数据失败:', error);
        networkError.value = true;

        Taro.showToast({
            title: '加载失败，请重试',
            icon: 'none',
            duration: 2000,
        });
    } finally {
        loading.value = false;
        console.log('[AudioMaterial] 加载完成，loading设为false');
    }
};

// 加载收藏的音频数据
const loadFavoriteAudioData = async () => {
    console.log('[AudioMaterial] 开始加载收藏音频数据');
    loading.value = true;
    networkError.value = false;

    try {
        const favoriteAudios = await favoriteManager.getFavoriteAudios();
        console.log('[AudioMaterial] 收藏音频数据:', favoriteAudios);

        // 按收藏时间倒序排列
        audioList.value = favoriteAudios.sort((a, b) => {
            return new Date(b.favoriteTime) - new Date(a.favoriteTime);
        });

        console.log(`[AudioMaterial] 加载了 ${audioList.value.length} 条收藏数据`);

        // 加载完成后更新收藏状态
        await loadFavoriteStatus();
    } catch (error) {
        console.error('[AudioMaterial] 加载收藏数据失败:', error);
        networkError.value = true;
    } finally {
        loading.value = false;
        console.log('[AudioMaterial] 收藏数据加载完成，loading设为false');
    }
};

// 加载更多数据 (仅适用于"全部材料")
const loadMore = () => {
    if (activeTab.value !== 'all' || !hasMore.value || loadingMore.value) {
        return;
    }

    loadingMore.value = true;

    const nextPage = currentPage.value + 1;

    Api.findAudioMaterials({
        page: nextPage,
        perPage: pageSize.value,
        status: 'published',
        sort: '-sequence',
    })
        .then(async (res) => {
            const newItems = res.items || [];
            audioList.value.push(...newItems);
            currentPage.value = nextPage;
            hasMore.value = newItems.length >= pageSize.value;

            // 更新新加载项目的收藏状态
            await loadFavoriteStatus();
        })
        .catch((error) => {
            console.error('加载更多数据失败:', error);
            Taro.showToast({
                title: '加载更多失败',
                icon: 'none',
                duration: 2000,
            });
        })
        .finally(() => {
            loadingMore.value = false;
        });
};

// 加载收藏状态
const loadFavoriteStatus = async () => {
    try {
        const favoriteIds = await favoriteManager.getFavoriteIds();

        // 清空之前的状态
        Object.keys(favoriteStatus).forEach((key) => {
            delete favoriteStatus[key];
        });

        // 设置当前音频的收藏状态
        audioList.value.forEach((audio) => {
            favoriteStatus[audio.id] = favoriteIds.includes(audio.id);
        });
    } catch (error) {
        console.error('加载收藏状态失败:', error);
    }
};

const goToDetail = (audio) => {
    Taro.navigateTo({
        url: `/pages/audioMaterial/detail/index?id=${audio.id}`,
    });
};
</script>

<style lang="scss">
@import './index.scss';
</style>
