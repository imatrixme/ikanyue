import { defineComponent } from '../../kit/component.js';
import { formatLessonTime, lessonStatusLabel } from '../../core/courses.js';
import { dateKey } from '../../core/schedule.js';

function dateParts(startAt) {
    if (!startAt) return null;
    const [, month, day] = dateKey(startAt).split('-');
    return { day, month: `${Number(month)}月` };
}

defineComponent({
    props: {
        compact: { type: Boolean, value: false },
        // Inside a single course's pages the course name would only repeat the page title.
        hideCourse: { type: Boolean, value: false },
        lesson: { type: Object, value: { course: {} } },
        perspective: { type: String, value: 'student' },
        prominent: { type: Boolean, value: false },
    },
    computed: {
        contextLabel: (d) => {
            const summaries = d.perspective === 'teacher'
                ? [d.lesson.classSummary, d.lesson.participantSummary]
                : [d.lesson.teacherSummary, d.lesson.classSummary];
            return summaries.map((summary) => summary?.label).filter(Boolean).join(' · ');
        },
        day: (d) => dateParts(d.lesson.startAt)?.day || '--',
        month: (d) => dateParts(d.lesson.startAt)?.month || '待定',
        statusText: (d) => lessonStatusLabel(d.lesson.status),
        timeText: (d) => formatLessonTime(d.lesson.startAt, d.lesson.endAt),
    },
    methods: {
        onTap() {
            this.emit('select', this.data.lesson);
        },
    },
});
