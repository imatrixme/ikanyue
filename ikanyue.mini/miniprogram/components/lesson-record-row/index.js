import { defineComponent } from '../../kit/component.js';
import { formatDateTime, recordQuantityText } from '../../core/courses.js';

defineComponent({
    props: {
        record: { type: Object, value: {} },
    },
    computed: {
        occurredText: (d) => formatDateTime(d.record.occurredAt),
        quantityText: (d) => recordQuantityText(d.record),
    },
});
