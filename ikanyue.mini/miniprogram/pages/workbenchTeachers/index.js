import { definePage } from '../../kit/page.js';
import { nav } from '../../kit/api.js';
import { pageState } from '../../core/courses.js';
import { normalizeTeachers, teacherUrl, workbenchErrorMessage } from '../../core/workbench.js';
import { Api } from '../../services/apis.js';

// Owner's teachers: who still has unconfirmed lessons or booking requests; open one to substitute or hand over.
definePage({
    data: () => ({ teachers: [], loading: false, errorMessage: '' }),
    computed: {
        state: (d) => pageState({ error: d.errorMessage, items: d.teachers, loading: d.loading && !d.teachers.length }),
    },
    onShow() {
        this.loadTeachers();
    },
    onPullDownRefresh() {
        return this.loadTeachers();
    },
    methods: {
        retry() {
            return this.loadTeachers();
        },
        goTeacher(event) {
            nav.to(teacherUrl(event.detail.id));
        },
        async loadTeachers() {
            await this.set({ loading: true, errorMessage: '' });
            try {
                await this.set({ teachers: normalizeTeachers(await Api.listWorkbenchTeachers()) });
            } catch (error) {
                await this.set({ errorMessage: workbenchErrorMessage(error, '老师列表暂时无法加载') });
            } finally {
                await this.set({ loading: false });
            }
        },
    },
});
