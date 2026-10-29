import { defineComponent } from '../../kit/component.js';

defineComponent({
    props: {
        completeLabel: { type: String, value: '已显示全部内容' },
        hasMore: { type: Boolean, value: false },
        loaded: { type: Number, value: 0 },
        loading: { type: Boolean, value: false },
        total: { type: Number, value: 0 },
        visible: { type: Boolean, value: true },
    },
});
