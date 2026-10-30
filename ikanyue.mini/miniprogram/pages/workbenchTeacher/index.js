import { definePage } from '../../kit/page.js';
import { nav, ui } from '../../kit/api.js';
import {
    handoverSummary, normalizeHandoverPreview, normalizeTeacherLessons, normalizeTeachers, substituteOptions,
    workbenchErrorMessage,
} from '../../core/workbench.js';
import { Api } from '../../services/apis.js';
import { withCommandKey } from '../../services/commandKeys.js';

// One teacher for the owner: their unconfirmed lessons (each can be substituted) and, for a
// teacher who is leaving, a previewed handover to another teacher. Students keep their lessons.
definePage({
    data: () => ({
        teacherId: '', teacher: { teacherId: '', name: '', isAdmin: false }, lessons: [], teachers: [],
        loading: false, errorMessage: '', substituting: null, showSubstitute: false,
        showHandover: false, receiverId: '', preview: null, previewLoading: false, reason: '', actionLoading: false,
    }),
    computed: {
        state: (d) => {
            if (d.loading && !d.teacher.teacherId) return 'loading';
            if (d.errorMessage) return 'error';
            return 'ready';
        },
        receivers: (d) => substituteOptions(d.teachers, d.teacherId).map((option) => ({
            ...option, picked: option.value === d.receiverId,
        })),
        receiverName: (d) => d.teachers.find((teacher) => teacher.teacherId === d.receiverId)?.name || '',
        handoverReady: (d) => Boolean(d.preview?.canSubmit) && d.reason.trim().length >= 4 && !d.actionLoading && !d.previewLoading,
    },
    onLoad(query) {
        this.set({ teacherId: query.id || '' });
    },
    onShow() {
        this.loadData();
    },
    onPullDownRefresh() {
        return this.loadData();
    },
    methods: {
        retry() {
            return this.loadData();
        },
        async loadData() {
            if (!this.data.teacherId) {
                await this.set({ errorMessage: '缺少老师编号' });
                return;
            }
            await this.set({ loading: true, errorMessage: '' });
            try {
                const [lessons, teachers] = await Promise.all([
                    Api.listWorkbenchTeacherLessons(this.data.teacherId), Api.listWorkbenchTeachers(),
                ]);
                const { teacher, lessons: rows } = normalizeTeacherLessons(lessons);
                await this.set({ teacher, lessons: rows, teachers: normalizeTeachers(teachers) });
            } catch (error) {
                await this.set({ errorMessage: workbenchErrorMessage(error, '老师的课暂时无法加载') });
            } finally {
                await this.set({ loading: false });
            }
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
            await this.loadData();
            if (this.data.showHandover && this.data.receiverId) await this.loadPreview();
        },
        openHandover() {
            const receivers = substituteOptions(this.data.teachers, this.data.teacherId);
            this.set({ showHandover: true, preview: null, reason: '', receiverId: '' });
            if (receivers.length === 1) this.pickReceiver({ currentTarget: { dataset: { id: receivers[0].value } } });
        },
        closeHandover() {
            this.set({ showHandover: false });
        },
        async pickReceiver(event) {
            await this.set({ receiverId: event.currentTarget.dataset.id, preview: null });
            await this.loadPreview();
        },
        async loadPreview() {
            const { teacherId, receiverId } = this.data;
            await this.set({ previewLoading: true });
            try {
                const preview = normalizeHandoverPreview(await Api.previewWorkbenchHandover(teacherId, receiverId));
                if (receiverId === this.data.receiverId) await this.set({ preview });
            } catch (error) {
                ui.toast(workbenchErrorMessage(error, '交接预览暂时无法加载'), { duration: 2600 });
            } finally {
                await this.set({ previewLoading: false });
            }
        },
        async submitHandover() {
            const { handoverReady, preview, receiverId, receiverName, reason, teacher, teacherId } = this.data;
            if (!handoverReady) return;
            const confirmed = await ui.confirm({
                title: `${teacher.name}离职交接`, content: handoverSummary(preview, teacher.name, receiverName), okText: '确认交接',
            });
            if (!confirmed) return;
            await this.set({ actionLoading: true });
            try {
                await withCommandKey(`handover:${teacherId}:${receiverId}`,
                    (key) => Api.handoverWorkbenchTeacher(teacherId, { toTeacherId: receiverId, reason: reason.trim() }, key));
                ui.toast('交接完成', { kind: 'success' });
                await this.set({ showHandover: false });
                nav.back();
            } catch (error) {
                ui.toast(workbenchErrorMessage(error, '交接失败，请重试'), { duration: 2600 });
                if (error?.errorCode === 'HANDOVER_CONFLICTS') await this.loadPreview();
            } finally {
                await this.set({ actionLoading: false });
            }
        },
    },
});
