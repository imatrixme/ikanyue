import { defineComponent } from '../../kit/component.js';

defineComponent({
    props: {
        coverUrl: { type: String, value: '' },
        dateText: { type: String, value: '' },
        featured: { type: Boolean, value: false },
        location: { type: String, value: '' },
        priceLabel: { type: String, value: '' },
        showImage: { type: Boolean, value: false },
        tags: { type: Array, value: [] },
        timeText: { type: String, value: '' },
        title: { type: String, value: '' },
        // Echoed back as detail.id so a list can tell tickets apart.
        itemId: { type: null, value: '' },
    },
    data: { barcodeLines: [1, 2, 3, 4, 5, 6, 7, 8] },
    computed: {
        fallbackLabel: (d) => String(d.title || '乐').slice(0, 1),
        visibleTags: (d) => (d.tags || []).filter(Boolean).slice(0, 2),
    },
    methods: {
        onTap() {
            this.emit('select', { id: this.data.itemId });
        },
        onImageError() {
            this.emit('imageerror', { id: this.data.itemId });
        },
    },
});
