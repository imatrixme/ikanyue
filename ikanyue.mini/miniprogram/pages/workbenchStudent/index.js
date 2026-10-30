import { definePage } from '../../kit/page.js';
import { nav, ui } from '../../kit/api.js';
import {
    grantUrl, normalizeLedger, workbenchErrorMessage, workbenchSections,
} from '../../core/workbench.js';
import { Api } from '../../services/apis.js';
import { withCommandKey } from '../../services/commandKeys.js';

// One student's lessons for the owner: remaining lessons, granting, confirmed lessons to undo and records.
definePage({
    data: () => ({
        studentId: '', ledger: normalizeLedger(), sections: workbenchSections(null), loading: false, errorMessage: '',
        undoing: null, reason: '', showUndo: false, actionLoading: false,
    }),
    computed: {
        state: (d) => {
            if (d.loading && !d.ledger.student.studentId) return 'loading';
            if (d.errorMessage) return 'error';
            return 'ready';
        },
        undoReady: (d) => !d.actionLoading && d.reason.trim().length >= 4,
    },
    onLoad(query) {
        this.set({ studentId: query.id || '' });
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
        goGrant() {
            nav.to(grantUrl(this.data.ledger.student));
        },
        openUndo(event) {
            const lesson = this.data.ledger.confirmedLessons.find((item) => item.sessionId === event.currentTarget.dataset.id);
            if (lesson) this.set({ undoing: lesson, reason: '', showUndo: true });
        },
        closeUndo() {
            this.set({ showUndo: false });
        },
        async loadData() {
            if (!this.data.studentId) {
                await this.set({ errorMessage: '缺少学员编号' });
                return;
            }
            await this.set({ loading: true, errorMessage: '' });
            try {
                const [summary, ledger] = await Promise.all([
                    Api.getWorkbenchSummary(), Api.getWorkbenchStudentLedger(this.data.studentId),
                ]);
                await this.set({ sections: workbenchSections(summary), ledger: normalizeLedger(ledger) });
            } catch (error) {
                await this.set({ errorMessage: workbenchErrorMessage(error, '学员课时暂时无法加载') });
            } finally {
                await this.set({ loading: false });
            }
        },
        async submitUndo() {
            const { actionLoading, reason, undoing } = this.data;
            if (actionLoading || !undoing) return;
            if (reason.trim().length < 4) {
                ui.toast('请填写至少 4 个字的撤销原因');
                return;
            }
            await this.set({ actionLoading: true });
            try {
                await withCommandKey(`undo-lesson:${undoing.sessionId}`,
                    (key) => Api.undoWorkbenchLesson(undoing.sessionId, { reason: reason.trim() }, key));
                ui.toast('已撤销，课时已退回', { kind: 'success' });
                await this.set({ showUndo: false });
                await this.loadData();
            } catch (error) {
                ui.toast(workbenchErrorMessage(error, '撤销失败，请重试'), { duration: 2600 });
            } finally {
                await this.set({ actionLoading: false });
            }
        },
    },
});
