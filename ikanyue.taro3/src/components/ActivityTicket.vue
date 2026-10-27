<template>
    <view class="activity-ticket" :class="{ 'activity-ticket--featured': featured }" @tap="$emit('select')">
        <media-thumb
            v-if="featured"
            class="activity-ticket__media"
            :fallback="fallbackLabel"
            :show-image="showImage"
            size="lg"
            :src="coverUrl"
            @error="$emit('image-error')"
        />
        <view class="activity-ticket__body">
            <text class="activity-ticket__title">{{ title }}</text>
            <view class="activity-ticket__meta">
                <text>{{ dateText }}</text>
                <text v-if="timeText">{{ timeText }}</text>
            </view>
            <view v-if="location" class="activity-ticket__location">
                <app-icon name="location-muted" size="sm" />
                <text>{{ location }}</text>
            </view>
            <view class="activity-ticket__footer">
                <view class="activity-ticket__tags">
                    <text v-for="tag in visibleTags" :key="tag" class="activity-ticket__tag">{{ tag }}</text>
                </view>
                <text v-if="priceLabel" class="activity-ticket__price">{{ priceLabel }}</text>
            </view>
        </view>
        <view class="activity-ticket__stub">
            <text>ADMIT ONE</text>
            <view class="activity-ticket__barcode" aria-hidden="true">
                <view v-for="line in 8" :key="line" class="activity-ticket__barcode-line" />
            </view>
        </view>
    </view>
</template>

<script>
import AppIcon from './AppIcon.vue';
import MediaThumb from './MediaThumb.vue';

export default {
    components: { AppIcon, MediaThumb },
    emits: ['image-error', 'select'],
    props: {
        coverUrl: { type: String, default: '' },
        dateText: { type: String, default: '' },
        featured: { type: Boolean, default: false },
        location: { type: String, default: '' },
        priceLabel: { type: String, default: '' },
        showImage: { type: Boolean, default: false },
        tags: { type: Array, default: () => [] },
        timeText: { type: String, default: '' },
        title: { type: String, required: true },
    },
    computed: {
        fallbackLabel() {
            return String(this.title || '乐').slice(0, 1);
        },
        visibleTags() {
            return this.tags.filter(Boolean).slice(0, 2);
        },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.activity-ticket {
    background: $ky-surface;
    border: 1px solid $ky-primary-line;
    border-radius: $ky-radius-lg;
    box-sizing: border-box;
    display: flex;
    min-height: 120px;
    overflow: hidden;
    position: relative;
}

.activity-ticket + .activity-ticket {
    margin-top: $ky-space-3;
}

.activity-ticket:active {
    background: $ky-primary-wash;
}

.activity-ticket__media {
    background: $ky-secondary-surface;
    flex: 0 0 104px;
    min-height: 144px;
    overflow: hidden;
    width: 104px;
}

.activity-ticket__body {
    flex: 1;
    min-width: 0;
    padding: $ky-space-3 52px $ky-space-3 $ky-space-4;
}

.activity-ticket__title {
    color: $ky-ink-strong;
    display: -webkit-box;
    font-size: $ky-font-size-title-sm;
    font-weight: $ky-font-weight-black;
    line-height: $ky-leading-compact;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
}

.activity-ticket__meta {
    color: $ky-text-secondary;
    display: flex;
    font-size: $ky-font-size-body-sm;
    gap: $ky-space-2;
    margin-top: $ky-space-2;
}

.activity-ticket__location {
    align-items: center;
    color: $ky-text-muted;
    display: flex;
    font-size: $ky-font-size-xs;
    gap: $ky-space-1;
    margin-top: $ky-space-2;
    min-width: 0;
}

.activity-ticket__location text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.activity-ticket__footer {
    align-items: center;
    display: flex;
    justify-content: space-between;
    margin-top: $ky-space-3;
}

.activity-ticket__tags {
    display: flex;
    flex-wrap: wrap;
    gap: $ky-space-1;
    min-width: 0;
}

.activity-ticket__tag {
    background: $ky-primary-soft;
    border-radius: $ky-radius-sm;
    color: $ky-primary-strong;
    font-size: $ky-font-size-2xs;
    font-weight: $ky-font-weight-semibold;
    padding: 3px 6px;
}

.activity-ticket__price {
    color: $ky-primary-strong;
    flex-shrink: 0;
    font-size: $ky-font-size-sm;
    font-weight: $ky-font-weight-black;
    margin-left: $ky-space-2;
}

.activity-ticket__stub {
    align-items: center;
    background: $ky-primary-strong;
    border-left: 1px dashed $ky-on-primary-divider;
    bottom: 0;
    color: $ky-on-primary;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: $ky-space-2 $ky-space-1;
    position: absolute;
    right: 0;
    top: 0;
    width: 34px;
}

.activity-ticket__stub > text {
    font-size: $ky-font-size-2xs;
    font-weight: $ky-font-weight-bold;
    transform: rotate(90deg);
    white-space: nowrap;
}

.activity-ticket__barcode {
    display: flex;
    gap: 2px;
    height: 28px;
}

.activity-ticket__barcode-line {
    border-left: 1px solid $ky-on-primary;
}

.activity-ticket--featured {
    min-height: 144px;
}

@media (max-width: 350px) {
    .activity-ticket__media {
        flex-basis: 88px;
        width: 88px;
    }

    .activity-ticket__body {
        padding-left: $ky-space-3;
    }
}
</style>
