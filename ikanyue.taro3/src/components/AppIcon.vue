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
const ICON_SOURCES = {
    'chevron-blue': require('../imgs/icons/chevron-blue.png'),
    'chevron-red': require('../imgs/icons/chevron-red.png'),
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
            type: Number,
            default: 20,
        },
    },
    computed: {
        source() {
            return ICON_SOURCES[this.name] || '';
        },
        iconStyle() {
            const size = `${this.size}px`;
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
