import { defineComponent } from '../../kit/component.js';
import { iconSizes } from '../../styles/theme.js';

// Exported from design/icons/ by scripts/export-icons.mjs; tab icons are loaded by the tab bar instead.
const ICONS = new Set([
    'account-about', 'account-phone', 'account-points', 'account-profile', 'account-rewards', 'account-teaching',
    'booking-availability', 'booking-confirm', 'booking-decline', 'booking-request', 'chevron-primary',
    'clock-muted', 'course-alert', 'course-book', 'course-calendar', 'course-history', 'course-validity',
    'empty-account', 'empty-activities', 'empty-default', 'empty-error', 'empty-image', 'empty-network',
    'empty-points', 'empty-rewards', 'info-blue', 'location-muted', 'teacher-role',
    'teacher-workbench',
]);

defineComponent({
    props: {
        name: { type: String, value: '' },
        size: { type: String, value: 'lg' },
        extClass: { type: String, value: '' },
    },
    computed: {
        source: (d) => (ICONS.has(d.name) ? `/imgs/icons/${d.name}.png` : ''),
        // Inline sizes stay in px, as they did under Taro (pxtransform never touched inline styles).
        iconStyle: (d) => {
            const size = `${iconSizes[d.size] || iconSizes.lg}px`;
            return `height: ${size}; width: ${size};`;
        },
    },
});
