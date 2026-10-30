import { defineComponent } from '../../kit/component.js';
import { ui } from '../../kit/api.js';
import { normalizeTeachers, substituteOptions, workbenchErrorMessage } from '../../core/workbench.js';
import { Api } from '../../services/apis.js';
import { withCommandKey } from '../../services/commandKeys.js';

// Owner-only sheet that moves one lesson to another teacher. Students and their lessons stay as they are.
// <substitute-teacher visible="{{…}}" lesson="{{lesson}}" bind:close="…" bind:done="…" />
defineComponent({
    props: {
        visible: { type: Boolean, value: false },
        lesson: { type: Object, value: null },
    },
    data: () => ({ teachers: [], loaded: false, selected: '', reason: '', actionLoading: false }),
    computed: {
        options: (d) => substituteOptions(d.teachers, d.lesson?.leadTeacherId).map((option) => ({
            ...option, picked: option.value === d.selected,
        })),
        ready: (d) => Boolean(d.selected) && !d.actionLoading,
    },
    observers: {
        visible(visible) {
            if (visible) this.open();
        },
    },
    methods: {
        async open() {
            await this.set({ selected: '', reason: '' });
            try {
                const teachers = normalizeTeachers(await Api.listWorkbenchTeachers());
                const options = substituteOptions(teachers, this.data.lesson?.leadTeacherId);
                await this.set({ teachers, loaded: true, selected: options.length === 1 ? options[0].value : '' });
            } catch (error) {
                await this.set({ loaded: true });
                ui.toast(workbenchErrorMessage(error, '老师列表暂时无法加载'), { duration: 2600 });
            }
        },
        pick(event) {
            this.set({ selected: event.currentTarget.dataset.id });
        },
        close() {
            this.emit('close');
        },
        async submit() {
            const { lesson, selected, reason, ready } = this.data;
            if (!ready || !lesson) return;
            await this.set({ actionLoading: true });
            try {
                const payload = { teacherId: selected, ...(reason.trim() ? { reason: reason.trim() } : {}) };
                await withCommandKey(`substitute:${lesson.sessionId}:${selected}`,
                    (key) => Api.substituteWorkbenchTeacher(lesson.sessionId, payload, key));
                ui.toast('已换老师', { kind: 'success' });
                this.emit('done', { sessionId: lesson.sessionId });
            } catch (error) {
                ui.toast(workbenchErrorMessage(error, '换老师失败，请重试'), { duration: 2600 });
            } finally {
                await this.set({ actionLoading: false });
            }
        },
    },
});
