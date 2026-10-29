import { defineComponent } from '../../kit/component.js';

// A row of icon shortcuts (at least four columns, so short rows stay left-aligned);
// each entry is { key, label, icon, url, tab } and is echoed back on select.
defineComponent({
    props: {
        entries: { type: Array, value: [] },
    },
    methods: {
        onTap(event) {
            const entry = this.data.entries.find((item) => item.key === event.currentTarget.dataset.key);
            if (entry) this.emit('select', entry);
        },
    },
});
