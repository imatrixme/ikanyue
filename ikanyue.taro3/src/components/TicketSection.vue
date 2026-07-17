<template>
    <view class="ticket-section">
        <section-header
            class="ticket-section__header"
            :action-label="actionLabel"
            :subtitle="subtitle"
            :title="title"
            @action="$emit('action')"
        />
        <slot />
    </view>
</template>

<script>
import SectionHeader from './SectionHeader.vue';

export default {
    components: { SectionHeader },
    emits: ['action'],
    props: {
        actionLabel: { type: String, default: '' },
        subtitle: { type: String, default: '' },
        title: { type: String, required: true },
    },
};
</script>

<style lang="scss">
@import '../styles/tokens';

.ticket-section {
    margin-top: $ky-space-6;
}

.ticket-section__header {
    margin-bottom: $ky-space-3;
}

@media (max-width: 350px) {
    :deep(.section-header__subtitle) {
        max-width: 210px;
    }
}
</style>
