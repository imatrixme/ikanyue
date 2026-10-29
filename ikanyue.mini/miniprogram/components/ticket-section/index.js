import { defineComponent } from '../../kit/component.js';

defineComponent({
    props: {
        actionLabel: { type: String, value: '' },
        subtitle: { type: String, value: '' },
        title: { type: String, value: '' },
        extClass: { type: String, value: '' },
    },
    methods: {
        onAction() {
            this.emit('action');
        },
    },
});
