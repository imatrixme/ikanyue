import { definePage } from '../../kit/page.js';
import { nav, ui } from '../../kit/api.js';
import {
    appointmentDetailUrl, bookingDateRange, bookingErrorMessage, groupSlots, normalizeBookingOption,
} from '../../core/appointments.js';
import { Api } from '../../services/apis.js';
import { withCommandKey } from '../../services/commandKeys.js';
import { UserManager } from '../../services/usermanager.js';

const SLOT_GONE = ['BOOKING_SLOT_TAKEN', 'BOOKING_SLOT_UNAVAILABLE'];

definePage({
    data: () => ({
        errorMessage: '', loading: false, note: '', offeringId: '', option: normalizeBookingOption(),
        selectedSlot: null, slotGroups: [], submitting: false,
    }),
    computed: {
        canSubmit: (d) => Boolean(d.selectedSlot && !d.submitting && UserManager.getRole() === 'student'),
        optionMeta: (d) => {
            const duration = d.option.course.durationMinutes ? `${d.option.course.durationMinutes} 分钟` : '';
            return [duration, d.option.location].filter(Boolean).join(' · ') || '一对一课程';
        },
        selectedStartAt: (d) => d.selectedSlot?.startAt || '',
        state: (d) => {
            if (d.loading) return 'loading';
            if (d.errorMessage) return 'error';
            return d.slotGroups.length ? 'ready' : 'empty';
        },
        stateDescription: (d) => d.errorMessage || '未来 30 天暂时没有可预约时间，请稍后再看或联系老师。',
        stateTitle: (d) => (d.errorMessage ? '时间加载失败' : '暂无可预约时间'),
        submitLabel: (d) => {
            if (d.submitting) return '正在提交';
            return d.selectedSlot ? `申请 ${d.selectedSlot.label}` : '请选择预约时间';
        },
    },
    onLoad(query) {
        this.requestSerial = 0;
        const offeringId = query.offeringId || '';
        this.set({
            offeringId,
            option: normalizeBookingOption({
                offeringId,
                course: { name: query.courseName || '课程' },
                teacher: { name: query.teacherName || '授课教师' },
                location: query.location || '',
            }),
        });
    },
    onShow() {
        this.loadSlots();
    },
    onPullDownRefresh() {
        return this.loadSlots(true);
    },
    methods: {
        retry() {
            return this.loadSlots(true);
        },
        selectSlot(event) {
            if (this.data.submitting) return;
            const { group, slot } = event.currentTarget.dataset;
            this.set({ selectedSlot: this.data.slotGroups[group].slots[slot] });
        },
        async loadSlots(force = false) {
            if (!UserManager.isLogin() || UserManager.getRole() !== 'student') {
                this.requestSerial += 1;
                await this.set({ loading: false, errorMessage: '请先登录并切换到学员身份', slotGroups: [] });
                return;
            }
            if (!this.data.offeringId) {
                await this.set({ errorMessage: '缺少课程预约信息' });
                return;
            }
            if (this.data.loading && !force) return;
            const requestId = this.requestSerial + 1;
            this.requestSerial = requestId;
            await this.set({ loading: true, errorMessage: '' });
            try {
                const response = await Api.listStudentBookingSlots({
                    offeringId: this.data.offeringId,
                    ...bookingDateRange(),
                });
                if (requestId !== this.requestSerial) return;
                const slotGroups = groupSlots(response?.slots);
                const selected = this.data.selectedSlot;
                const stillOpen = selected && slotGroups.some((group) => group.slots.some((slot) => slot.startAt === selected.startAt));
                await this.set({
                    option: normalizeBookingOption(response?.offering || this.data.option),
                    slotGroups,
                    selectedSlot: stillOpen ? selected : null,
                });
            } catch (error) {
                if (requestId === this.requestSerial) {
                    await this.set({ errorMessage: bookingErrorMessage(error, '可预约时间暂时无法加载') });
                }
            } finally {
                if (requestId === this.requestSerial) await this.set({ loading: false });
            }
        },
        async submitBooking() {
            if (!this.data.canSubmit) return;
            await this.set({ submitting: true });
            const { note, offeringId, selectedSlot: slot } = this.data;
            try {
                const result = await withCommandKey(`request-appointment:${offeringId}:${slot.startAt}`,
                    (key) => Api.createStudentAppointment({
                        offeringId,
                        startAt: slot.startAt,
                        endAt: slot.endAt,
                        note: note.trim(),
                    }, key));
                if (!result?.appointmentId) throw new Error('预约已提交，但未返回预约编号');
                ui.toast('预约申请已发送', { kind: 'success' });
                setTimeout(() => nav.redirect(appointmentDetailUrl(result.appointmentId)), 350);
            } catch (error) {
                ui.toast(bookingErrorMessage(error, '预约提交失败，请重试'), { duration: 2600 });
                if (SLOT_GONE.includes(error?.errorCode)) {
                    await this.set({ selectedSlot: null });
                    await this.loadSlots(true);
                }
            } finally {
                await this.set({ submitting: false });
            }
        },
    },
});
