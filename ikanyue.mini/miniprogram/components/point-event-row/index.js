import { defineComponent } from '../../kit/component.js';

defineComponent({
    props: {
        balance: { type: null, value: 0 },
        delta: { type: String, value: '' },
        meta: { type: String, value: '' },
        reason: { type: String, value: '' },
        remark: { type: String, value: '' },
        spending: { type: Boolean, value: false },
        title: { type: String, value: '' },
    },
});
