import { definePage } from '../../kit/page.js';
import { nav } from '../../kit/api.js';
import {
    courseListUrl, courseValidityText, formatDate, learningErrorMessage, lessonDetailUrl,
    normalizeCourseDetail, pageState, sourceValidityText,
} from '../../core/courses.js';
import { Api } from '../../services/apis.js';

definePage({
    data: () => ({ course: normalizeCourseDetail(), courseId: '', errorMessage: '', loading: false }),
    computed: {
        state: (d) => pageState({ error: d.errorMessage, items: d.course.courseId ? [d.course] : [], loading: d.loading }),
        validityText: (d) => courseValidityText(d.course),
        sourceRows: (d) => d.course.sources.map((source, index) => ({
            ...source,
            key: `${source.grantedAt}-${index}`,
            validityText: sourceValidityText(source),
            grantedLabel: formatDate(source.grantedAt),
        })),
    },
    onLoad(query) {
        this.set({ courseId: query.id || '' });
    },
    onShow() {
        this.loadCourse();
    },
    onPullDownRefresh() {
        return this.loadCourse();
    },
    methods: {
        goLesson(event) {
            nav.to(lessonDetailUrl(event.detail.lessonId));
        },
        goLessons() {
            nav.to(courseListUrl('courseLessons', this.data.courseId));
        },
        goRecords() {
            nav.to(courseListUrl('courseRecords', this.data.courseId));
        },
        async loadCourse() {
            if (!this.data.courseId || this.data.loading) return;
            await this.set({ loading: true, errorMessage: '' });
            try {
                await this.set({ course: normalizeCourseDetail(await Api.getLearningCourse(this.data.courseId)) });
            } catch (error) {
                await this.set({ errorMessage: learningErrorMessage(error) });
            } finally {
                await this.set({ loading: false });
            }
        },
    },
});
