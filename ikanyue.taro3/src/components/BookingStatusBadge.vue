<template>
    <text class="booking-status" :class="`booking-status--${meta.tone}`">{{ meta.label }}</text>
</template>

<script>
import { statusMeta } from '../pages/appointments/pageLogic';

export default {
    name: 'BookingStatusBadge',
    props: { status: { type: String, default: 'pending' } },
    computed: { meta() { return statusMeta(this.status); } },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.booking-status {
    border: 1px solid $ky-line;
    border-radius: $ky-radius-pill;
    box-sizing: border-box;
    display: inline-flex;
    font-size: $ky-font-size-xs;
    font-weight: $ky-font-weight-bold;
    line-height: 1;
    padding: 5px $ky-space-2;
    white-space: nowrap;
}

.booking-status--pending {
    background: $ky-yellow-soft;
    border-color: $ky-gold-line;
    color: $ky-gold-foreground;
}

.booking-status--success {
    background: $ky-success-soft;
    border-color: $ky-success-line;
    color: $ky-success;
}

.booking-status--danger {
    background: $ky-danger-soft;
    border-color: $ky-danger-line;
    color: $ky-danger;
}

.booking-status--muted {
    background: $ky-muted-surface;
    color: $ky-text-secondary;
}
</style>
