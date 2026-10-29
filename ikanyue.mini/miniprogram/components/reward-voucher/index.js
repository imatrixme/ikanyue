import { defineComponent } from '../../kit/component.js';

defineComponent({
    props: {
        description: { type: String, value: '' },
        item: { type: Object, value: {} },
        lockedLabel: { type: String, value: '未解锁' },
        readyLabel: { type: String, value: '可领取' },
        redeemable: { type: Boolean, value: false },
        showImage: { type: Boolean, value: false },
    },
    methods: {
        onTap() {
            this.emit('select');
        },
        onImageError() {
            this.emit('imageerror', this.data.item.id);
        },
    },
});
