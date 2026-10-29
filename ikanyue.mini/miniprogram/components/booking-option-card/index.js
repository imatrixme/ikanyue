import { defineComponent } from '../../kit/component.js';

defineComponent({
    props: {
        option: { type: Object, value: { course: {}, teacher: {} } },
    },
    computed: {
        detail: (d) => {
            const minutes = d.option.course?.durationMinutes;
            return [minutes ? `${minutes} 分钟` : '', d.option.location].filter(Boolean).join(' · ') || '一对一课程';
        },
    },
    methods: {
        onTap() {
            this.emit('select', this.data.option);
        },
    },
});
