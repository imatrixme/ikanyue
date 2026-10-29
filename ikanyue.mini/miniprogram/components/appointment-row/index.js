import { defineComponent } from '../../kit/component.js';
import { formatAppointmentTime, statusIcon } from '../../core/appointments.js';

defineComponent({
    props: {
        appointment: { type: Object, value: {} },
        perspective: { type: String, value: 'student' },
    },
    computed: {
        title: (d) => (d.perspective === 'teacher'
            ? `${d.appointment.student?.name || '学员'} · ${d.appointment.course?.name || '课程'}`
            : d.appointment.course?.name || '课程预约'),
        meta: (d) => {
            const person = d.perspective === 'teacher'
                ? d.appointment.student?.name || '学员'
                : d.appointment.teacher?.name || '授课教师';
            return [person, d.appointment.location].filter(Boolean).join(' · ');
        },
        statusIcon: (d) => statusIcon(d.appointment.status),
        timeText: (d) => formatAppointmentTime(d.appointment.startAt, d.appointment.endAt),
    },
    methods: {
        onTap() {
            this.emit('select', this.data.appointment);
        },
    },
});
