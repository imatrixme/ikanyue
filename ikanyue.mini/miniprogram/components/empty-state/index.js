import { defineComponent } from '../../kit/component.js';

// Line icons drawn in design/icons/; any other kind falls back to the plain tray.
const KINDS = new Set(['account', 'activities', 'error', 'image', 'network', 'points', 'rewards']);

defineComponent({
    props: {
        actionLabel: { type: String, value: '' },
        compact: { type: Boolean, value: false },
        description: { type: String, value: '' },
        kind: { type: String, value: 'activities' },
        title: { type: String, value: '' },
    },
    computed: {
        iconName: (d) => `empty-${KINDS.has(d.kind) ? d.kind : 'default'}`,
    },
    methods: {
        onAction() {
            this.emit('action');
        },
    },
});
