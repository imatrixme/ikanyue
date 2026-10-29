import { defineComponent } from '../../kit/component.js';

defineComponent({
    props: {
        balance: { type: null, value: 0 },
        caption: { type: String, value: '' },
        compact: { type: Boolean, value: false },
        label: { type: String, value: '可用积分' },
    },
    data: { staffLines: [1, 2, 3, 4, 5] },
});
