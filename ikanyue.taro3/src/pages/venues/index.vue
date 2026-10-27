<template>
    <page-chrome class="venues-page">
        <view class="venues-content">
            <view v-if="loading" class="venues-state">
                <async-state compact state="loading" title="正在加载场馆" />
            </view>
            <view v-else-if="!cards.length" class="venues-state">
                <async-state
                    action-label="重新加载"
                    compact
                    description="请检查网络后重试。"
                    kind="network"
                    state="error"
                    title="场馆暂时无法加载"
                    @action="loadData"
                />
            </view>
            <view v-else class="venues-list">
                <view
                    v-for="card in cards"
                    :key="card.id"
                    class="venue-card"
                    :class="{ 'venue-card--current': card.current }"
                    aria-role="button"
                    :aria-label="`切换到${card.name}`"
                    @tap="select(card.id)"
                >
                    <view class="venue-card__header">
                        <text class="venue-card__name">{{ card.name }}</text>
                        <text v-if="card.current" class="venue-card__current">当前场馆</text>
                    </view>
                    <text v-if="card.intro" class="venue-card__intro">{{ card.intro }}</text>
                    <view v-for="row in card.facts" :key="row.key" class="venue-card__fact">
                        <app-icon :name="row.icon" size="sm" />
                        <text>{{ row.text }}</text>
                    </view>
                    <text class="venue-card__booking">{{ card.bookingText }}</text>
                </view>
            </view>
        </view>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { VenueManager } from '../../../utils/venuemanager';
import AppIcon from '../../components/AppIcon.vue';
import AsyncState from '../../components/AsyncState.vue';
import PageChrome from '../../components/PageChrome.vue';
import { venueCards } from './pageLogic';
import './index.scss';

export default {
    components: { AppIcon, AsyncState, PageChrome },
    data() {
        return { currentId: '', loading: true, venues: [] };
    },
    computed: {
        cards() { return venueCards(this.venues, this.currentId); },
    },
    onShow() {
        this.loadData();
    },
    async onPullDownRefresh() {
        try { await this.loadData(); } finally { Taro.stopPullDownRefresh(); }
    },
    methods: {
        async loadData() {
            this.loading = true;
            const { current, venues } = await VenueManager.loadVenues();
            this.venues = venues;
            this.currentId = current?.id || '';
            this.loading = false;
        },
        select(venueId) {
            VenueManager.rememberVenue(venueId);
            this.currentId = venueId;
            // Opened from home or the booking tab in normal use; fall back to home when it is the only page.
            if (Taro.getCurrentPages().length > 1) Taro.navigateBack();
            else Taro.switchTab({ url: '/pages/home/index' });
        },
    },
};
</script>
