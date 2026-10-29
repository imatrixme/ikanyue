import { defineComponent } from '../../kit/component.js';
import { statusMeta } from '../../core/appointments.js';

defineComponent({
    props: {
        status: { type: String, value: 'pending' },
    },
    computed: {
        meta: (d) => statusMeta(d.status),
    },
});
