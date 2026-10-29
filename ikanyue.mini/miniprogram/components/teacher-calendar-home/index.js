import { defineComponent } from '../../kit/component.js';
import { nav } from '../../kit/api.js';
import {
    availabilityForDate, buildSevenDayStrip, dateKey, formatScheduleTime, lessonsForDate,
    normalizeTeacherSchedule, scheduleErrorMessage, shiftWeek, teacherLessonDetailUrl, weekRange,
} from '../../core/schedule.js';
import { Api } from '../../services/apis.js';
import { ScheduleManager } from '../../services/schedulemanager.js';
import { UserManager } from '../../services/usermanager.js';
import { themeColors } from '../../styles/theme.js';

// Teacher calendar on the booking tab. The page refreshes it: this.selectComponent('#teacherCalendar').refresh(force).
defineComponent({
    options: { virtualHost: false },
    data: () => ({
        errorMessage: '', hasLoaded: false, loading: false, primaryColor: themeColors.primaryStrong,
        schedule: normalizeTeacherSchedule(), selectedDate: dateKey(), showAvailability: false,
    }),
    computed: {
        dailyAvailability: (d) => availabilityForDate(d.schedule.availability, d.selectedDate).map((window) => ({
            ...window,
            key: `${window.offeringId}-${window.startAt}`,
            timeText: formatScheduleTime(window.startAt, window.endAt),
        })),
        dailyLessons: (d) => lessonsForDate(d.schedule.items, d.selectedDate),
        days: (d) => buildSevenDayStrip(d.selectedDate),
        selectedDateLabel: (d) => {
            const selected = d.days.find((day) => day.isSelected);
            return selected ? `${selected.month}${selected.day}日 · ${selected.weekday}` : '';
        },
        state: (d) => {
            if (d.loading && !d.hasLoaded) return 'loading';
            if (d.errorMessage && !d.hasLoaded) return 'error';
            return 'ready';
        },
        weekLabel: (d) => {
            const first = d.days[0];
            const last = d.days[6];
            return first && last ? `${first.month}${first.day}日 - ${last.month}${last.day}日` : '';
        },
    },
    lifetimes: {
        created() {
            this.requestSerial = 0;
        },
        attached() {
            this.set({ selectedDate: dateKey() });
        },
    },
    methods: {
        goDetail(event) {
            nav.to(teacherLessonDetailUrl(event.detail));
        },
        previousWeek() {
            return this.moveWeek(-1);
        },
        nextWeek() {
            return this.moveWeek(1);
        },
        async moveWeek(amount) {
            await this.set({ selectedDate: shiftWeek(this.data.selectedDate, amount) });
            return this.loadWeek();
        },
        retry() {
            return this.refresh(true);
        },
        refresh(force = false) {
            return this.loadWeek(force);
        },
        selectDate(event) {
            return this.set({ selectedDate: event.currentTarget.dataset.date });
        },
        toggleAvailability(event) {
            return this.set({ showAvailability: Boolean(event.detail.value) });
        },
        async loadWeek(force = false) {
            if (this.data.loading && !force) return;
            const user = UserManager.getUserInfo();
            const scope = ScheduleManager.scopeFor({ ...user, role: 'teacher' });
            const range = weekRange(this.data.selectedDate);
            const cacheKey = `teacher-week:${range.from}`;
            const cached = force ? null : ScheduleManager.get(scope, cacheKey);
            if (cached) await this.set({ schedule: normalizeTeacherSchedule(cached), hasLoaded: true });
            const requestId = this.requestSerial + 1;
            this.requestSerial = requestId;
            await this.set({ loading: true, errorMessage: '' });
            try {
                const response = await Api.getTeacherSchedule({ ...range, includeAvailability: true });
                if (requestId !== this.requestSerial) return;
                ScheduleManager.set(scope, cacheKey, response);
                await this.set({ schedule: normalizeTeacherSchedule(response), hasLoaded: true });
            } catch (error) {
                if (requestId === this.requestSerial) await this.set({ errorMessage: scheduleErrorMessage(error) });
            } finally {
                if (requestId === this.requestSerial) await this.set({ loading: false });
            }
        },
    },
});
