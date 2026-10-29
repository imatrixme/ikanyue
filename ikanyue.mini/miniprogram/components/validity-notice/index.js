import { defineComponent } from '../../kit/component.js';

defineComponent({
    props: {
        description: { type: String, value: '' },
        icon: { type: String, value: '' },
        title: { type: String, value: '' },
        tone: { type: String, value: 'info' },
    },
    computed: {
        iconName: (d) => d.icon || (d.tone === 'warning' ? 'course-alert' : 'course-validity'),
    },
});
