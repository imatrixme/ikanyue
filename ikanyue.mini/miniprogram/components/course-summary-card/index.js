import { defineComponent } from '../../kit/component.js';
import { courseValidityText } from '../../core/courses.js';

const DELIVERY = { group: '班级课程', one_on_one: '一对一课程', private: '一对一课程' };

defineComponent({
    props: {
        course: { type: Object, value: {} },
    },
    computed: {
        deliveryText: (d) => DELIVERY[d.course.deliveryMode] || '声乐课程',
        validityText: (d) => courseValidityText(d.course),
    },
    methods: {
        onTap() {
            this.emit('select', this.data.course);
        },
    },
});
