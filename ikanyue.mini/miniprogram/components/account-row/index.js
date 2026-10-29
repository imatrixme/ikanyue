import { defineComponent } from '../../kit/component.js';

defineComponent({
    props: {
        description: { type: String, value: '' },
        icon: { type: String, value: '' },
        iconText: { type: String, value: '' },
        interactive: { type: Boolean, value: false },
        title: { type: String, value: '' },
        value: { type: null, value: '' },
        // Echoed back as detail.id so a list can tell rows apart.
        itemId: { type: null, value: '' },
    },
    methods: {
        onTap() {
            if (this.data.interactive) this.emit('select', { id: this.data.itemId });
        },
    },
});
