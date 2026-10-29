import { defineComponent } from '../../kit/component.js';
import { nav } from '../../kit/api.js';
import { lessonDetailUrl } from '../../core/courses.js';
import { normalizeUpcomingResponse, teacherLessonDetailUrl } from '../../core/schedule.js';
import { Api } from '../../services/apis.js';
import { RoleManager } from '../../services/rolemanager.js';
import { ScheduleManager } from '../../services/schedulemanager.js';
import { UserManager } from '../../services/usermanager.js';

// The parent refreshes it: this.selectComponent('#upcoming').refresh(force).
defineComponent({
    options: { virtualHost: false },
    data: () => ({ errorMessage: '', items: [], loading: false, role: 'student' }),
    computed: {
        actionLabel: (d) => (d.role === 'teacher' ? '查看日历' : '全部日程'),
        subtitle: (d) => (d.role === 'teacher' ? '最近 3 节已安排课程' : '接下来 3 节课程安排'),
        visible: (d) => Boolean(d.items.length || d.errorMessage),
    },
    lifetimes: {
        created() {
            this.requestSerial = 0;
        },
    },
    methods: {
        goFullSchedule() {
            if (this.data.role === 'teacher') nav.tab('/pages/appointmentBooking/index');
            else nav.to('/pages/courseLessons/index');
        },
        goLesson(event) {
            const lesson = event.detail;
            if (!lesson.lessonId) return;
            nav.to(this.data.role === 'teacher' ? teacherLessonDetailUrl(lesson) : lessonDetailUrl(lesson.lessonId));
        },
        retry() {
            return this.refresh(true);
        },
        async refresh(force = false) {
            const user = UserManager.getUserInfo();
            const role = RoleManager.getRole();
            await this.set({ role });
            if (!user.token) {
                await this.set({ items: [], errorMessage: '' });
                return;
            }
            const scope = ScheduleManager.scopeFor({ ...user, role });
            const cached = force ? null : ScheduleManager.get(scope, 'upcoming');
            if (cached) await this.set({ items: normalizeUpcomingResponse(cached).items });
            if (this.data.loading) return;
            const requestId = this.requestSerial + 1;
            this.requestSerial = requestId;
            await this.set({ loading: true, errorMessage: '' });
            try {
                const response = await Api.getUpcomingSchedule({ limit: 3 });
                if (requestId !== this.requestSerial) return;
                ScheduleManager.set(scope, 'upcoming', response);
                await this.set({ items: normalizeUpcomingResponse(response).items });
            } catch (error) {
                if (requestId === this.requestSerial && !this.data.items.length) await this.set({ errorMessage: error?.message || '加载失败' });
            } finally {
                if (requestId === this.requestSerial) await this.set({ loading: false });
            }
        },
    },
});
