import { defineComponent } from '../../kit/component.js';

defineComponent({
    props: {
        actionLabel: { type: String, value: '' },
        compact: { type: Boolean, value: false },
        description: { type: String, value: '' },
        kind: { type: String, value: 'activities' },
        state: { type: String, value: '' },
        title: { type: String, value: '' },
    },
    methods: {
        onAction() {
            this.emit('action');
        },
    },
});
