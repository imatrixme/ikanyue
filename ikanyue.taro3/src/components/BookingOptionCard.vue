<template>
    <view class="booking-option" @tap="$emit('select', option)">
        <view class="booking-option__icon">
            <app-icon name="booking-request" size="xl" />
        </view>
        <view class="booking-option__copy">
            <text class="booking-option__course">{{ option.course.name }}</text>
            <text class="booking-option__teacher">{{ option.teacher.name }}</text>
            <text class="booking-option__meta">{{ detail }}</text>
        </view>
        <view class="booking-option__action">
            <text>选时间</text>
            <app-icon name="chevron-primary" size="sm" />
        </view>
    </view>
</template>

<script>
import AppIcon from './AppIcon.vue';

export default {
    name: 'BookingOptionCard',
    components: { AppIcon },
    emits: ['select'],
    props: { option: { type: Object, required: true } },
    computed: {
        detail() {
            const duration = this.option.course.durationMinutes ? `${this.option.course.durationMinutes} 分钟` : '';
            return [duration, this.option.location].filter(Boolean).join(' · ') || '一对一课程';
        },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.booking-option {
    align-items: center;
    background: $ky-surface;
    border: 1px solid $ky-line;
    border-radius: $ky-radius-lg;
    box-shadow: $ky-shadow-card;
    display: flex;
    min-height: 88px;
    padding: $ky-space-4;
}

.booking-option + .booking-option {
    margin-top: $ky-space-3;
}

.booking-option:active {
    background: $ky-primary-wash;
    border-color: $ky-primary-line;
}

.booking-option__icon {
    align-items: center;
    background: $ky-secondary-surface;
    border-radius: $ky-radius-md;
    display: flex;
    flex: 0 0 48px;
    height: 48px;
    justify-content: center;
    width: 48px;
}

.booking-option__icon .app-icon {
    transform: scale(1.42);
}

.booking-option__copy {
    flex: 1;
    min-width: 0;
    padding-left: $ky-space-3;
}

.booking-option__course,
.booking-option__teacher,
.booking-option__meta {
    display: block;
}

.booking-option__course {
    color: $ky-ink-strong;
    font-size: $ky-font-size-subtitle;
    font-weight: $ky-font-weight-black;
}

.booking-option__teacher {
    color: $ky-primary-strong;
    font-size: $ky-font-size-body-sm;
    font-weight: $ky-font-weight-bold;
    margin-top: 4px;
}

.booking-option__meta {
    color: $ky-text-muted;
    font-size: $ky-font-size-xs;
    margin-top: 3px;
}

.booking-option__action {
    align-items: center;
    color: $ky-primary-strong;
    display: flex;
    flex-shrink: 0;
    font-size: $ky-font-size-body-sm;
    font-weight: $ky-font-weight-bold;
    gap: 3px;
    margin-left: $ky-space-2;
}
</style>
