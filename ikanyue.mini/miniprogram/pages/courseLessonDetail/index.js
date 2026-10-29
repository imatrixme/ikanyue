import { definePage } from '../../kit/page.js';
import {
    attendanceLabel, formatLessonTime, learningErrorMessage, lessonHourLabel, lessonStatusLabel,
    normalizeLesson, pageState,
} from '../../core/courses.js';
import { Api } from '../../services/apis.js';

definePage({
    data: () => ({ errorMessage: '', lesson: normalizeLesson(), lessonId: '', loading: false }),
    computed: {
        state: (d) => pageState({ error: d.errorMessage, items: d.lesson.lessonId ? [d.lesson] : [], loading: d.loading }),
        facts: (d) => ({
            time: formatLessonTime(d.lesson.startAt, d.lesson.endAt),
            status: lessonStatusLabel(d.lesson.status),
            attendance: attendanceLabel(d.lesson.attendanceResult),
            lessonHour: lessonHourLabel(d.lesson.lessonHourResult),
        }),
    },
    onLoad(query) {
        this.set({ lessonId: query.id || '' });
    },
    onShow() {
        this.loadLesson();
    },
    onPullDownRefresh() {
        return this.loadLesson();
    },
    methods: {
        async loadLesson() {
            if (!this.data.lessonId || this.data.loading) return;
            await this.set({ loading: true, errorMessage: '' });
            try {
                await this.set({ lesson: normalizeLesson(await Api.getLearningLesson(this.data.lessonId)) });
            } catch (error) {
                await this.set({ errorMessage: learningErrorMessage(error) });
            } finally {
                await this.set({ loading: false });
            }
        },
    },
});
