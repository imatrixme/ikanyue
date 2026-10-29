import { defineComponent } from '../../kit/component.js';

// <segmented-control value="{{filter}}" options="{{filters}}" bind:change="onFilterChange" />; detail is { value }.
defineComponent({
    props: {
        value: { type: null, value: '' },
        options: { type: Array, value: [] },
        extClass: { type: String, value: '' },
    },
    methods: {
        onSelect(event) {
            const { value } = event.currentTarget.dataset;
            if (value !== this.data.value) this.emit('change', { value });
        },
    },
});
