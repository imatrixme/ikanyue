<template>
    <view class="appointment-row" @tap="$emit('select', appointment)">
        <view class="appointment-row__icon">
            <app-icon :name="statusIcon" size="xl" />
        </view>
        <view class="appointment-row__body">
            <view class="appointment-row__heading">
                <text class="appointment-row__title">{{ title }}</text>
                <booking-status-badge :status="appointment.status" />
            </view>
            <text class="appointment-row__time">{{ formatAppointmentTime(appointment.startAt, appointment.endAt) }}</text>
            <text class="appointment-row__meta">{{ meta }}</text>
        </view>
        <app-icon class="appointment-row__arrow" name="chevron-primary" size="sm" />
    </view>
</template>

<script>
import AppIcon from './AppIcon.vue';
import BookingStatusBadge from './BookingStatusBadge.vue';
import { formatAppointmentTime } from '../pages/appointments/pageLogic';

export default {
    name: 'AppointmentRow',
    components: { AppIcon, BookingStatusBadge },
    emits: ['select'],
    props: {
        appointment: { type: Object, required: true },
        perspective: { type: String, default: 'student' },
    },
    computed: {
        title() {
            return this.perspective === 'teacher'
                ? `${this.appointment.student?.name || '学员'} · ${this.appointment.course?.name || '课程'}`
                : this.appointment.course?.name || '课程预约';
        },
        meta() {
            const person = this.perspective === 'teacher'
                ? this.appointment.student?.name || '学员'
                : this.appointment.teacher?.name || '授课教师';
            return [person, this.appointment.location].filter(Boolean).join(' · ');
        },
        statusIcon() {
            if (['confirmed', 'rescheduled', 'fulfilled'].includes(this.appointment.status)) return 'booking-confirm';
            if (['declined', 'expired', 'slot_taken', 'eligibility_lost'].includes(this.appointment.status)) {
                return 'booking-decline';
            }
            return 'booking-request';
        },
    },
    methods: { formatAppointmentTime },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.appointment-row {
    align-items: center;
    background: $ky-surface;
    display: flex;
    min-height: 84px;
    padding: $ky-space-3 $ky-space-4;
}

.appointment-row + .appointment-row {
    border-top: 1px solid $ky-line;
}

.appointment-row:active {
    background: $ky-primary-wash;
}

.appointment-row__icon {
    align-items: center;
    background: $ky-secondary-surface;
    border-radius: $ky-radius-md;
    display: flex;
    flex: 0 0 44px;
    height: 44px;
    justify-content: center;
    width: 44px;
}

.appointment-row__icon .app-icon {
    transform: scale(1.32);
}

.appointment-row__body {
    flex: 1;
    min-width: 0;
    padding-left: $ky-space-3;
}

.appointment-row__heading {
    align-items: center;
    display: flex;
    gap: $ky-space-2;
    justify-content: space-between;
}

.appointment-row__title,
.appointment-row__time,
.appointment-row__meta {
    display: block;
}

.appointment-row__title {
    color: $ky-ink-strong;
    flex: 1;
    font-size: $ky-font-size-body-lg;
    font-weight: $ky-font-weight-bold;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.appointment-row__time {
    color: $ky-text-secondary;
    font-size: $ky-font-size-body-sm;
    margin-top: 5px;
}

.appointment-row__meta {
    color: $ky-text-muted;
    font-size: $ky-font-size-xs;
    margin-top: 3px;
}

.appointment-row__arrow {
    flex-shrink: 0;
    margin-left: $ky-space-2;
}
</style>
