<template>
    <view class="venue-handoff">
        <text class="venue-handoff__title">{{ venue.name }}暂未开放在线约课</text>
        <text class="venue-handoff__description">可以电话咨询上课时间，或切换到其他场馆。</text>
        <nut-button v-if="venue.phone" block type="primary" class="venue-handoff__call" @click="call">电话咨询</nut-button>
        <view class="venue-handoff__links">
            <account-row icon="location-muted" interactive title="切换场馆" @select="switchVenue" />
        </view>
    </view>
</template>

<script>
import Taro from '@tarojs/taro';
import { VenueManager } from '../../utils/venuemanager';
import AccountRow from './AccountRow.vue';

// Shown wherever booking would start when the current venue does not take online bookings.
export default {
    components: { AccountRow },
    props: {
        venue: { type: Object, required: true },
    },
    methods: {
        call() { VenueManager.callVenue(this.venue); },
        switchVenue() { Taro.navigateTo({ url: '/pages/venues/index' }); },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.venue-handoff {
    background: $ky-surface;
    border: 1px solid $ky-line-tinted;
    border-radius: $ky-radius-lg;
    display: flex;
    flex-direction: column;
    gap: $ky-space-2;
    padding: $ky-space-5 $ky-space-4;
}

.venue-handoff__title {
    color: $ky-ink-strong;
    font-size: $ky-font-size-title;
    font-weight: $ky-font-weight-black;
}

.venue-handoff__description {
    color: $ky-text-secondary;
    font-size: $ky-font-size-body-sm;
    line-height: $ky-leading-readable;
    margin-bottom: $ky-space-2;
}

.venue-handoff__call {
    --nut-primary-color: #{$ky-primary-strong};
    --nut-primary-color-end: #{$ky-primary-strong};
    background: $ky-primary-strong !important;
    border-color: $ky-primary-strong !important;
    border-radius: $ky-radius-md;
    color: $ky-on-primary !important;
    font-weight: $ky-font-weight-black;
    min-height: 48px;
}

.venue-handoff__links {
    border: 1px solid $ky-line;
    border-radius: $ky-radius-lg;
    margin-top: $ky-space-1;
    overflow: hidden;
}
</style>
