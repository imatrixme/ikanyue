import { definePage } from '../../kit/page.js';
import { lessonStatusLabel, pageState } from '../../core/courses.js';
import {
    dayRange, formatScheduleTime, normalizeScheduleEntry, normalizeTeacherSchedule, scheduleErrorMessage,
} from '../../core/schedule.js';
import { Api } from '../../services/apis.js';
import { ScheduleManager } from '../../services/schedulemanager.js';
import { UserManager } from '../../services/usermanager.js';

definePage({
    data: () => ({ date: '', errorMessage: '', lesson: normalizeScheduleEntry(), lessonId: '', loading: false }),
    computed: {
        state: (d) => pageState({ error: d.errorMessage, items: d.lesson.lessonId ? [d.lesson] : [], loading: d.loading }),
        timeLabel: (d) => formatScheduleTime(d.lesson.startAt, d.lesson.endAt),
        statusLabel: (d) => lessonStatusLabel(d.lesson.status),
    },
    onLoad(query) {
        this.set({ lessonId: query.id || '', date: query.date || '' });
    },
    onShow() {
        this.loadLesson();
    },
    onPullDownRefresh() {
        return this.loadLesson(true);
    },
    methods: {
        retry() {
            return this.loadLesson(true);
        },
        async loadLesson(force = false) {
            const { date, lessonId } = this.data;
            if (!lessonId || !date || (this.data.loading && !force)) return;
            const scope = ScheduleManager.scopeFor({ ...UserManager.getUserInfo(), role: 'teacher' });
            const cacheKey = `teacher-lesson:${lessonId}:${date}`;
            const cached = force ? null : ScheduleManager.get(scope, cacheKey);
            if (cached) await this.set({ lesson: normalizeScheduleEntry(cached) });
            await this.set({ loading: true, errorMessage: '' });
            try {
                const response = normalizeTeacherSchedule(await Api.getTeacherSchedule(dayRange(date)));
                const lesson = response.items.find((item) => item.lessonId === lessonId);
                if (!lesson) throw Object.assign(new Error('未找到这节课'), { errorCode: 'LEARNING_LESSON_NOT_FOUND' });
                await this.set({ lesson });
                ScheduleManager.set(scope, cacheKey, lesson);
            } catch (error) {
                if (!this.data.lesson.lessonId) await this.set({ errorMessage: scheduleErrorMessage(error, '课堂信息暂时无法加载') });
            } finally {
                await this.set({ loading: false });
            }
        },
    },
});
