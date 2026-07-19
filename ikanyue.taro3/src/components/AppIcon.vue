<template>
    <image
        v-if="source"
        class="app-icon"
        :src="source"
        :style="iconStyle"
        mode="aspectFit"
    />
</template>

<script>
import { iconSizes } from '../styles/theme.mjs';

const ICON_SOURCES = {
    'account-about': require('../imgs/icons/account-about.png'),
    'account-name': require('../imgs/icons/account-name.png'),
    'account-phone': require('../imgs/icons/account-phone.png'),
    'account-points': require('../imgs/icons/account-points.png'),
    'account-profile': require('../imgs/icons/account-profile.png'),
    'account-rewards': require('../imgs/icons/account-rewards.png'),
    'account-teaching': require('../imgs/icons/account-teaching.png'),
    'chevron-primary': require('../imgs/icons/chevron-primary.png'),
    'clock-muted': require('../imgs/icons/clock-muted.png'),
    'empty-account': require('../imgs/icons/empty-account.png'),
    'empty-activities': require('../imgs/icons/empty-activities.png'),
    'empty-image': require('../imgs/icons/empty-image.png'),
    'empty-network': require('../imgs/icons/empty-network.png'),
    'empty-points': require('../imgs/icons/empty-points.png'),
    'empty-rewards': require('../imgs/icons/empty-rewards.png'),
    'info-blue': require('../imgs/icons/info-blue.png'),
    'location-muted': require('../imgs/icons/location-muted.png'),
    'logout-red': require('../imgs/icons/logout-red.png'),
    'people-muted': require('../imgs/icons/people-muted.png'),
};

export default {
    name: 'AppIcon',
    props: {
        name: {
            type: String,
            required: true,
        },
        size: {
            type: String,
            default: 'lg',
            validator: (value) => Object.prototype.hasOwnProperty.call(iconSizes, value),
        },
    },
    computed: {
        source() {
            return ICON_SOURCES[this.name] || '';
        },
        iconStyle() {
            const size = `${iconSizes[this.size] || iconSizes.lg}px`;
            return { height: size, width: size };
        },
    },
};
</script>

<style scoped>
.app-icon {
    display: block;
    flex: 0 0 auto;
}
</style>
