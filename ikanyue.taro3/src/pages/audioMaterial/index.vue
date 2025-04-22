<template>
    <view class="audio-page">
        <!-- 筛选栏 -->
        <view class="filter-bar">
            <view class="filter-label">音频类型</view>
            <nut-popover v-model="showTypeFilter" :list="typeFilterOptions" @choose="onChooseType" />
        </view>

        <!-- 加载中提示 -->
        <view v-if="loading" class="empty-container">
            <nut-icon name="loading" size="30"></nut-icon>
            <text style="margin-top: 10px; font-size: 14px; color: #666">加载中...</text>
        </view>

        <!-- 网络错误提示 -->
        <view v-else-if="networkError" class="empty-container">
            <nut-empty description="网络错误，请点击重试"></nut-empty>
            <nut-button type="primary" size="small" @click="loadAudioMaterials" style="margin-top: 16px">
                重新加载
            </nut-button>
        </view>

        <!-- 空数据提示 -->
        <view v-else-if="!audioList.length" class="empty-container">
            <nut-empty description="暂无音频材料"></nut-empty>
        </view>

        <!-- 音频列表 -->
        <view v-else class="audio-list">
            <view v-for="audio in audioList" :key="audio.id" class="audio-card" @tap="goToDetail(audio.id)">
                <view class="audio-cover">
                    <image :src="audio.coverImage || defaultCoverImage" mode="aspectFill" class="audio-cover-image" />
                    <view class="audio-duration">{{ formatDuration(audio.duration) }}</view>
                </view>
                <view class="audio-info">
                    <text class="audio-title">{{ audio.title }}</text>
                    <text class="audio-description">{{ audio.description }}</text>

                    <view class="meta-info">
                        <text>{{ audio.type }}</text>
                        <text>{{ formatDate(audio.publishedAt) }}</text>
                    </view>

                    <view class="tags" v-if="audio.tags && audio.tags.length">
                        <text v-for="(tag, index) in audio.tags" :key="index" class="tag">
                            {{ tag }}
                        </text>
                    </view>
                </view>
            </view>
        </view>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';

export default {
    name: 'AudioMaterialList',
    data() {
        return {
            audioList: [],
            loading: true,
            networkError: false,
            defaultCoverImage: 'https://img.yzcdn.cn/vant/cat.jpeg',
            showTypeFilter: false,
            typeFilterOptions: [
                { text: '全部类型', value: '' },
                { text: '课程讲解', value: '课程讲解' },
                { text: '听力练习', value: '听力练习' },
                { text: '音乐', value: '音乐' },
            ],
            selectedType: '',
            allAudioList: [],
        };
    },
    onLoad() {
        this.loadAudioMaterials();
    },
    onPullDownRefresh() {
        this.refreshAudioMaterials();
    },
    methods: {
        async loadAudioMaterials() {
            this.loading = true;
            this.networkError = false;

            try {
                const params = {};
                if (this.selectedType) {
                    params.type = this.selectedType;
                }

                const res = await Api.findAudioMaterials(params);
                console.log('获取音频材料数据:', res);

                this.allAudioList = res.items || [];
                this.filterAudioList();
            } catch (error) {
                console.error('加载音频材料列表失败:', error);
                this.networkError = true;
                Taro.showToast({
                    title: '加载失败，请重试',
                    icon: 'none',
                    duration: 2000,
                });
            } finally {
                this.loading = false;
            }
        },

        async refreshAudioMaterials() {
            try {
                await this.loadAudioMaterials();
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
        },

        filterAudioList() {
            if (!this.selectedType) {
                this.audioList = [...this.allAudioList];
            } else {
                this.audioList = this.allAudioList.filter((audio) => audio.type === this.selectedType);
            }
        },

        onChooseType(option) {
            this.selectedType = option.value;
            this.filterAudioList();
        },

        goToDetail(id) {
            Taro.navigateTo({
                url: `/pages/audioMaterial/detail/index?id=${id}`,
            });
        },

        formatDuration(seconds) {
            if (!seconds) return '00:00';
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.floor(seconds % 60);
            return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        },

        formatDate(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date
                .getDate()
                .toString()
                .padStart(2, '0')}`;
        },
    },
};
</script>

<style lang="scss">
@import './index.scss';
</style>
