import { definePage } from '../../kit/page.js';
import { nav, ui } from '../../kit/api.js';
import { pageState } from '../../core/courses.js';
import {
    normalizeStudentPage, studentLedgerUrl, validateNewStudent, workbenchErrorMessage,
} from '../../core/workbench.js';
import { Api } from '../../services/apis.js';

const emptyDraft = () => ({ realName: '', cellphone: '' });

// Owner students: search, add a student, open a student's lessons.
definePage({
    data: () => ({
        keyword: '', students: [], page: 1, totalPages: 0, loading: false, errorMessage: '',
        showAdd: false, draft: emptyDraft(), actionLoading: false,
    }),
    computed: {
        state: (d) => pageState({ error: d.errorMessage, items: d.students, loading: d.loading && !d.students.length }),
        addReady: (d) => !d.actionLoading && Boolean(d.draft.realName.trim()) && d.draft.cellphone.trim().length === 11,
    },
    onLoad() {
        this.requestSerial = 0;
    },
    onShow() {
        this.loadStudents(1);
    },
    onPullDownRefresh() {
        return this.loadStudents(1);
    },
    onReachBottom() {
        if (this.data.page < this.data.totalPages) this.loadStudents(this.data.page + 1);
    },
    methods: {
        retry() {
            return this.loadStudents(1);
        },
        search() {
            return this.loadStudents(1);
        },
        goStudent(event) {
            nav.to(studentLedgerUrl(event.detail.id));
        },
        openAdd() {
            this.set({ draft: emptyDraft(), showAdd: true });
        },
        closeAdd() {
            this.set({ showAdd: false });
        },
        async loadStudents(page) {
            const requestId = this.requestSerial + 1;
            this.requestSerial = requestId;
            await this.set({ loading: true, errorMessage: '' });
            try {
                const params = { page, perPage: 20, ...(this.data.keyword.trim() ? { q: this.data.keyword.trim() } : {}) };
                const result = normalizeStudentPage(await Api.listWorkbenchStudents(params));
                if (requestId !== this.requestSerial) return;
                await this.set({
                    students: page === 1 ? result.items : [...this.data.students, ...result.items],
                    page: result.page, totalPages: result.totalPages,
                });
            } catch (error) {
                if (requestId === this.requestSerial) await this.set({ errorMessage: workbenchErrorMessage(error, '学员列表暂时无法加载') });
            } finally {
                if (requestId === this.requestSerial) await this.set({ loading: false });
            }
        },
        async submitAdd() {
            if (this.data.actionLoading) return;
            const { error, payload } = validateNewStudent(this.data.draft);
            if (error) {
                ui.toast(error);
                return;
            }
            await this.set({ actionLoading: true });
            try {
                const created = await Api.addWorkbenchStudent(payload);
                ui.toast('学员已添加', { kind: 'success' });
                await this.set({ showAdd: false });
                nav.to(studentLedgerUrl(created?.id));
            } catch (error) {
                ui.toast(workbenchErrorMessage(error, '添加学员失败，请重试'), { duration: 2600 });
            } finally {
                await this.set({ actionLoading: false });
            }
        },
    },
});
