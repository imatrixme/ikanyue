import { definePage } from '../../kit/page.js';
import { nav, page } from '../../kit/api.js';
import {
    courseDetailUrl, courseListUrl, learningErrorMessage, lessonDetailUrl, normalizeOverview, pageState,
} from '../../core/courses.js';
import { Api } from '../../services/apis.js';
import { RoleManager } from '../../services/rolemanager.js';
import { UserManager } from '../../services/usermanager.js';

const sum = (courses, field) => courses.reduce((total, course) => total + course[field], 0);

definePage({
    data: () => ({ errorMessage: '', isLogin: false, loading: false, overview: normalizeOverview(), role: 'student' }),
    computed: {
        remainingLessons: (d) => sum(d.overview.courses, 'remainingLessons'),
        scheduledLessons: (d) => sum(d.overview.courses, 'scheduledLessons'),
        state: (d) => pageState({
            error: d.errorMessage,
            items: d.overview.courses.length ? d.overview.courses : d.overview.upcomingLessons,
            loading: d.loading,
        }),
    },
    async onShow() {
        const role = RoleManager.getRole();
        RoleManager.applyTabBar(role);
        page.title(role === 'teacher' ? '工作台' : '我的课程');
        await this.set({ role });
        if (role === 'teacher') this.selectComponent('#teacherHome')?.refresh();
        else this.loadData();
    },
    onPullDownRefresh() {
        if (this.data.role === 'teacher') return this.selectComponent('#teacherHome')?.refresh(true);
        return this.loadData(true);
    },
    methods: {
        retry() {
            return this.loadData(true);
        },
        goShop() {
            nav.to('/pages/courseShop/index');
        },
        goCourse(event) {
            nav.to(courseDetailUrl(event.detail.courseId));
        },
        openLesson(lessonId) {
            if (lessonId) nav.to(lessonDetailUrl(lessonId));
        },
        goLesson(event) {
            this.openLesson(event.detail.lessonId);
        },
        goWarning(event) {
            this.openLesson(event.currentTarget.dataset.lessonId);
        },
        goLessons() {
            nav.to(courseListUrl('courseLessons'));
        },
        goRecords() {
            nav.to(courseListUrl('courseRecords'));
        },
        goProfile() {
            nav.tab('/pages/profile/index');
        },
        async loadData(force = false) {
            if (this.data.loading && !force) return;
            const isLogin = UserManager.isLogin();
            if (!isLogin) {
                await this.set({ isLogin, overview: normalizeOverview(), errorMessage: '' });
                return;
            }
            await this.set({ isLogin, loading: true, errorMessage: '' });
            try {
                await this.set({ overview: normalizeOverview(await Api.getLearningOverview()) });
            } catch (error) {
                await this.set({ errorMessage: learningErrorMessage(error) });
            } finally {
                await this.set({ loading: false });
            }
        },
    },
});
