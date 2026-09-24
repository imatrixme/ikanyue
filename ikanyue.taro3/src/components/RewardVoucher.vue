<template>
    <view class="reward-voucher" :class="{ 'reward-voucher--ready': redeemable }" @tap="$emit('select')">
        <media-thumb
            class="reward-voucher__media"
            fallback-icon="account-rewards"
            :show-image="showImage"
            :src="item.image"
            @error="$emit('image-error', item.id)"
        />
        <view class="reward-voucher__body">
            <text class="reward-voucher__name">{{ item.name }}</text>
            <text v-if="description" class="reward-voucher__description">{{ description }}</text>
            <view class="reward-voucher__price">
                <text>{{ item.pointsPrice }}</text>
                <text class="reward-voucher__unit">PT</text>
            </view>
        </view>
        <view class="reward-voucher__status" :class="{ 'reward-voucher__status--ready': redeemable }">
            {{ redeemable ? readyLabel : lockedLabel }}
        </view>
    </view>
</template>

<script>
import MediaThumb from './MediaThumb.vue';

export default {
    components: { MediaThumb },
    emits: ['image-error', 'select'],
    props: {
        description: { type: String, default: '' },
        item: { type: Object, required: true },
        lockedLabel: { type: String, default: '未解锁' },
        readyLabel: { type: String, default: '可领取' },
        redeemable: { type: Boolean, default: false },
        showImage: { type: Boolean, default: false },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.reward-voucher {
    align-items: center;
    background: $ky-surface;
    border: 1px solid $ky-line;
    border-radius: $ky-radius-lg;
    box-sizing: border-box;
    display: flex;
    min-height: 82px;
    overflow: hidden;
    padding: $ky-space-2 $ky-space-3 $ky-space-2 $ky-space-2;
    position: relative;
}

.reward-voucher + .reward-voucher {
    margin-top: $ky-space-2;
}

.reward-voucher::after {
    border-left: 1px dashed $ky-primary-line;
    bottom: $ky-space-2;
    content: '';
    position: absolute;
    right: 86px;
    top: $ky-space-2;
}

.reward-voucher--ready {
    border-color: $ky-success-line;
}

.reward-voucher__media {
    align-items: center;
    background: $ky-secondary-surface;
    border-radius: $ky-radius-md;
    color: $ky-primary-strong;
    display: flex;
    flex: 0 0 68px;
    font-size: $ky-font-size-display-sm;
    font-weight: $ky-font-weight-black;
    height: 62px;
    justify-content: center;
    overflow: hidden;
    width: 68px;
}

.reward-voucher__body {
    flex: 1;
    min-width: 0;
    padding: 0 96px 0 $ky-space-3;
}

.reward-voucher__name,
.reward-voucher__description {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.reward-voucher__name {
    color: $ky-ink-strong;
    font-size: $ky-font-size-body-lg;
    font-weight: $ky-font-weight-black;
}

.reward-voucher__description {
    color: $ky-text-muted;
    font-size: $ky-font-size-xs;
    margin-top: $ky-space-1;
}

.reward-voucher__price {
    color: $ky-gold;
    font-size: $ky-font-size-subtitle;
    font-weight: $ky-font-weight-black;
    margin-top: $ky-space-1;
}

.reward-voucher__unit {
    font-size: $ky-font-size-2xs;
    margin-left: 3px;
}

.reward-voucher__status {
    align-items: center;
    border: 1px solid $ky-primary-line;
    border-radius: $ky-radius-sm;
    color: $ky-text-secondary;
    display: flex;
    font-size: $ky-font-size-xs;
    font-weight: $ky-font-weight-bold;
    height: 28px;
    justify-content: center;
    position: absolute;
    right: $ky-space-3;
    top: 50%;
    transform: translateY(-50%);
    width: 64px;
}

.reward-voucher__status--ready {
    background: $ky-primary-strong;
    border-color: $ky-primary-strong;
    color: $ky-on-primary;
}

@media (max-width: 350px) {
    .reward-voucher__media {
        flex-basis: 60px;
        height: 58px;
        width: 60px;
    }

    .reward-voucher__body {
        padding-left: $ky-space-2;
        padding-right: 84px;
    }

    .reward-voucher__status {
        right: $ky-space-2;
        width: 58px;
    }

    .reward-voucher::after {
        right: 74px;
    }
}
</style>
