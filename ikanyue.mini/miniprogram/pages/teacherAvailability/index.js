import { definePage } from '../../kit/page.js';
import { page, ui } from '../../kit/api.js';
import { academyDateKey } from '../../core/academyTime.js';
import {
    bookingErrorMessage, buildAvailabilityOverride, createOverrideDraft,
    formatAppointmentTime, minutesToTime, normalizeAvailability, timeToMinutes,
    validateAvailabilityRules, weekdayName, weeklySnapshot,
} from '../../core/appointments.js';
import { Api } from '../../services/apis.js';
import { withCommandKey } from '../../services/commandKeys.js';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

definePage({
    data: () => ({
        availability: normalizeAvailability(), errorMessage: '', loading: false, mode: 'default',
        offeringId: '', overrideCancellingId: '', overrideForm: createOverrideDraft(),
        overrideSaving: false, rules: [], saved: '', saving: false, showOverride: false,
        today: academyDateKey(Date.now()), weekdays: WEEKDAYS,
    }),
    computed: {
        state: (d) => {
            if (d.loading) return 'loading';
            if (d.errorMessage) return 'error';
            return d.offeringId ? 'ready' : 'error';
        },
        policyWindowLabel: (d) => {
            const windows = d.availability.policy.defaultWindows;
            return windows.length
                ? windows.map((window) => `${minutesToTime(window.startMinute)}-${minutesToTime(window.endMinute)}`).join(' · ')
                : '09:00-11:00 · 14:00-19:00';
        },
        dirty: (d) => Boolean(d.saved) && weeklySnapshot(d.mode, d.rules) !== d.saved,
        ruleRows: (d) => d.rules.map((rule) => ({
            localId: rule.localId,
            weekdayIndex: rule.weekday - 1,
            weekdayLabel: weekdayName(rule.weekday),
            startLabel: minutesToTime(rule.startMinute),
            endLabel: minutesToTime(rule.endMinute),
        })),
        overrideRows: (d) => d.availability.overrides.map((item) => ({
            id: item.id,
            icon: item.type === 'available' ? 'booking-confirm' : 'booking-decline',
            title: item.type === 'available' ? '临时开放' : '临时关闭',
            meta: formatAppointmentTime(item.startAt, item.endAt),
            reason: item.reason,
        })),
    },
    onLoad(query) {
        this.set({ offeringId: query.offeringId || '' });
    },
    onShow() {
        if (!this.data.dirty) this.loadData();
    },
    onPullDownRefresh() {
        return this.loadData(true);
    },
    methods: {
        retry() {
            return this.loadData(true);
        },
        // Weekly edits go through here so the leave prompt follows the unsaved state.
        async setWeekly(patch) {
            const wasDirty = this.data.dirty;
            await this.set(patch);
            if (this.data.dirty === wasDirty) return;
            // Back navigation cannot be intercepted, so the platform prompt guards unsaved weekly edits.
            if (this.data.dirty) page.guardLeave('每周可预约时间还没保存，确定离开吗？');
            else page.unguardLeave();
        },
        setMode(event) {
            const { mode } = event.currentTarget.dataset;
            const rules = mode === 'custom' && !this.data.rules.length ? [this.newRule()] : this.data.rules;
            this.setWeekly({ mode, rules });
        },
        newRule() {
            return { localId: `rule-${Date.now()}-${this.data.rules.length}`, weekday: 1, startMinute: 540, endMinute: 660 };
        },
        addRule() {
            this.setWeekly({ rules: [...this.data.rules, this.newRule()] });
        },
        removeRule(event) {
            const { index } = event.currentTarget.dataset;
            this.setWeekly({ rules: this.data.rules.filter((_, position) => position !== index) });
        },
        patchRule(index, patch) {
            this.setWeekly({ rules: this.data.rules.map((rule, position) => (position === index ? { ...rule, ...patch } : rule)) });
        },
        updateWeekday(event) {
            this.patchRule(event.currentTarget.dataset.index, { weekday: Number(event.detail.value) + 1 });
        },
        updateRuleTime(event) {
            const { field, index } = event.currentTarget.dataset;
            const minute = timeToMinutes(event.detail.value);
            if (minute !== null) this.patchRule(index, { [field]: minute });
        },
        openOverride() {
            this.set({ overrideForm: createOverrideDraft(), showOverride: true });
        },
        closeOverride() {
            this.set({ showOverride: false });
        },
        // <picker|input data-key="date" bindchange="updateOverride" />; the segment passes its value in data-value.
        updateOverride(event) {
            const { key, value } = event.currentTarget.dataset;
            this.set({ overrideForm: { ...this.data.overrideForm, [key]: value ?? event.detail.value } });
        },
        async loadData(force = false) {
            if (this.data.loading && !force) return;
            if (!this.data.offeringId) {
                await this.set({ errorMessage: '缺少课程预约配置' });
                return;
            }
            await this.set({ loading: true, errorMessage: '' });
            try {
                const availability = normalizeAvailability(await Api.getTeacherAvailability(this.data.offeringId));
                await this.set({ availability });
                // Reloading after an override keeps unsaved weekly edits on screen.
                if (!this.data.dirty) {
                    const rules = availability.rules.map((rule, index) => ({ ...rule, localId: rule.id || `rule-${index}` }));
                    const mode = rules.length ? 'custom' : 'default';
                    await this.setWeekly({ rules, mode, saved: weeklySnapshot(mode, rules) });
                }
            } catch (error) {
                await this.set({ errorMessage: bookingErrorMessage(error, '可预约时间暂时无法加载') });
            } finally {
                await this.set({ loading: false });
            }
        },
        async saveWeekly() {
            if (this.data.saving) return;
            const { availability, mode, offeringId } = this.data;
            const rules = mode === 'default' ? [] : this.data.rules.map(({ weekday, startMinute, endMinute }) => ({
                weekday, startMinute, endMinute,
            }));
            const validationError = mode === 'custom'
                ? validateAvailabilityRules(rules, availability.policy.defaultWindows)
                : '';
            if (validationError) {
                ui.toast(validationError);
                return;
            }
            await this.set({ saving: true });
            try {
                await withCommandKey(`save-availability:${offeringId}`,
                    (key) => Api.saveTeacherAvailability(offeringId, { mode, rules }, key));
                await this.setWeekly({ saved: weeklySnapshot(mode, this.data.rules) });
                ui.toast('可预约时间已保存', { kind: 'success' });
                await this.loadData(true);
            } catch (error) {
                ui.toast(bookingErrorMessage(error, '保存失败'));
            } finally {
                await this.set({ saving: false });
            }
        },
        async submitOverride() {
            if (this.data.overrideSaving) return;
            const { availability, offeringId, overrideForm } = this.data;
            const result = buildAvailabilityOverride(overrideForm, availability.policy.defaultWindows);
            if (result.error) {
                ui.toast(result.error);
                return;
            }
            await this.set({ overrideSaving: true });
            try {
                const { payload } = result;
                await withCommandKey(`availability-override:${offeringId}:${payload.startAt}:${payload.endAt}`,
                    (key) => Api.createTeacherAvailabilityOverride(offeringId, payload, key));
                await this.set({ showOverride: false });
                ui.toast('临时调整已保存', { kind: 'success' });
                await this.loadData(true);
            } catch (error) {
                ui.toast(bookingErrorMessage(error, '保存失败'));
            } finally {
                await this.set({ overrideSaving: false });
            }
        },
        async cancelOverride(event) {
            if (this.data.overrideCancellingId) return;
            const { id } = event.currentTarget.dataset;
            const confirmed = await ui.confirm({
                title: '撤销临时调整',
                content: '撤销后将重新按照每周可预约时间计算该时段。',
            });
            if (!confirmed) return;
            await this.set({ overrideCancellingId: id });
            try {
                await withCommandKey(`cancel-availability-override:${id}`,
                    (key) => Api.cancelTeacherAvailabilityOverride(id, key));
                ui.toast('临时调整已撤销', { kind: 'success' });
                await this.loadData(true);
            } catch (error) {
                ui.toast(bookingErrorMessage(error, '撤销失败'));
            } finally {
                await this.set({ overrideCancellingId: '' });
            }
        },
    },
});
