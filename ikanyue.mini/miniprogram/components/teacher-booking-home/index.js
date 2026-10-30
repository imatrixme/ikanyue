import { defineComponent } from '../../kit/component.js';
import { nav, ui } from '../../kit/api.js';
import {
    appointmentDetailUrl, availabilityUrl, bookingErrorMessage, normalizeTeacherDashboard,
} from '../../core/appointments.js';
import { teacherRenewalRows } from '../../core/home.js';
import {
    confirmLessonPayload, filterLessonsByTeacher, normalizePendingLessons, teacherFilterOptions,
    workbenchErrorMessage, workbenchSections,
} from '../../core/workbench.js';
import { Api } from '../../services/apis.js';
import { withCommandKey } from '../../services/commandKeys.js';

const offeringRow = (offering) => ({
    ...offering,
    description: [offering.course.durationMinutes ? `${offering.course.durationMinutes} 分钟` : '', offering.location]
        .filter(Boolean).join(' · '),
});

// Teacher workbench on the home tab. The page refreshes it: this.selectComponent('#teacherHome').refresh(force).
// Owner sections (waiting lessons, students) follow /v1/workbench/summary; without it the original workbench stays.
defineComponent({
    options: { virtualHost: false },
    data: () => ({
        dashboard: normalizeTeacherDashboard(), errorMessage: '', loading: false, renewals: [],
        sections: workbenchSections(null), lessons: [], teacherFilter: '',
        confirming: null, absentIds: [], showConfirm: false, actionLoading: false,
        substituting: null, showSubstitute: false,
    }),
    computed: {
        state: (d) => {
            if (d.loading) return 'loading';
            if (d.errorMessage) return 'error';
            const hasContent = d.dashboard.pending.length || d.dashboard.confirmed.length || d.dashboard.offerings.length;
            return hasContent ? 'ready' : 'empty';
        },
        offerings: (d) => d.dashboard.offerings.map(offeringRow),
        renewalRows: (d) => d.renewals.map((row) => ({ ...row, initial: row.title.slice(0, 1) })),
        teacherOptions: (d) => teacherFilterOptions(d.lessons),
        teacherIndex: (d) => Math.max(0, teacherFilterOptions(d.lessons).findIndex((option) => option.value === d.teacherFilter)),
        showTeacherFilter: (d) => d.sections.showTeachers && d.sections.allLessons && d.lessons.length > 0,
        visibleLessons: (d) => filterLessonsByTeacher(d.lessons, d.teacherFilter),
        confirmRows: (d) => (d.confirming?.students || []).map((student) => ({
            ...student, absent: d.absentIds.includes(student.sessionStudentId),
        })),
    },
    lifetimes: {
        created() {
            this.requestSerial = 0;
        },
        attached() {
            this.refresh();
        },
    },
    methods: {
        goPending() {
            nav.to('/pages/appointments/index', { status: 'pending' });
        },
        goDetail(event) {
            nav.to(appointmentDetailUrl(event.detail.appointmentId));
        },
        goAvailability(event) {
            nav.to(availabilityUrl(event.detail.id));
        },
        goStudents() {
            nav.to('/pages/workbenchStudents/index');
        },
        goTeachers() {
            nav.to('/pages/workbenchTeachers/index');
        },
        openSubstitute(event) {
            const lesson = this.data.lessons.find((item) => item.sessionId === event.currentTarget.dataset.id);
            if (lesson) this.set({ substituting: lesson, showSubstitute: true });
        },
        closeSubstitute() {
            this.set({ showSubstitute: false });
        },
        async substituted() {
            await this.set({ showSubstitute: false });
            await this.loadWorkbench();
        },
        retry() {
            return this.refresh(true);
        },
        refresh(force = false) {
            const upcoming = this.selectComponent('#upcoming');
            return Promise.all([this.loadDashboard(force), this.loadRenewals(), this.loadWorkbench(), upcoming?.refresh(force)]);
        },
        // Read-only and optional: without the list the workbench still works.
        async loadRenewals() {
            try {
                await this.set({ renewals: teacherRenewalRows(await Api.listTeacherRenewals()) });
            } catch {
                await this.set({ renewals: [] });
            }
        },
        // Optional too: an older server answers 404 and the original workbench stays as it was.
        async loadWorkbench() {
            try {
                const sections = workbenchSections(await Api.getWorkbenchSummary());
                const lessons = sections.teach
                    ? normalizePendingLessons(await Api.listWorkbenchPendingLessons(), { showTeachers: sections.showTeachers })
                    : [];
                await this.set({ sections, lessons });
            } catch {
                await this.set({ sections: workbenchSections(null), lessons: [] });
            }
        },
        changeTeacherFilter(event) {
            const option = this.data.teacherOptions[Number(event.detail.value)];
            this.set({ teacherFilter: option?.value || '' });
        },
        openConfirm(event) {
            const lesson = this.data.lessons.find((item) => item.sessionId === event.currentTarget.dataset.id);
            if (lesson) this.set({ confirming: lesson, absentIds: [], showConfirm: true });
        },
        closeConfirm() {
            this.set({ showConfirm: false });
        },
        toggleAbsent(event) {
            const id = event.currentTarget.dataset.id;
            const { absentIds } = this.data;
            this.set({ absentIds: absentIds.includes(id) ? absentIds.filter((item) => item !== id) : [...absentIds, id] });
        },
        async submitConfirm() {
            const { actionLoading, absentIds, confirming } = this.data;
            if (actionLoading || !confirming) return;
            const payload = confirmLessonPayload(absentIds);
            const id = confirming.sessionId;
            await this.set({ actionLoading: true });
            try {
                await withCommandKey(`confirm-lesson:${id}:${(payload.absentSessionStudentIds || []).join(',')}`,
                    (key) => Api.confirmWorkbenchLesson(id, payload, key));
                ui.toast('已确认上课', { kind: 'success' });
                await this.set({ showConfirm: false });
                await this.loadWorkbench();
            } catch (error) {
                ui.toast(workbenchErrorMessage(error, '确认上课失败，请重试'), { duration: 2600 });
            } finally {
                await this.set({ actionLoading: false });
            }
        },
        async loadDashboard(force = false) {
            if (this.data.loading && !force) return;
            const requestId = this.requestSerial + 1;
            this.requestSerial = requestId;
            await this.set({ loading: true, errorMessage: '' });
            try {
                const response = await Api.getTeacherBookingDashboard();
                if (requestId === this.requestSerial) await this.set({ dashboard: normalizeTeacherDashboard(response) });
            } catch (error) {
                if (requestId === this.requestSerial) {
                    await this.set({ errorMessage: bookingErrorMessage(error, '教师工作台暂时无法加载') });
                }
            } finally {
                if (requestId === this.requestSerial) await this.set({ loading: false });
            }
        },
    },
});
