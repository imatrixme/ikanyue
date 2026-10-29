import { defineComponent } from '../../kit/component.js';

defineComponent({
    props: {
        fallback: { type: String, value: '乐' },
        fallbackIcon: { type: String, value: '' },
        showImage: { type: Boolean, value: false },
        size: { type: String, value: 'md' },
        src: { type: String, value: '' },
        extClass: { type: String, value: '' },
    },
    methods: {
        onError() {
            this.emit('error');
        },
    },
});
