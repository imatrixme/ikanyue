<template>
    <page-chrome class="availability-page">
        <view class="availability-summary">
            <view class="availability-summary__icon"><app-icon name="booking-availability" size="xl" /></view>
            <view class="availability-summary__copy">
                <text class="availability-summary__title">{{ availability.offering.course.name }}</text>
                <text class="availability-summary__meta">{{ availability.offering.location || '授课地点待定' }}</text>
                <text class="availability-summary__meta">机构开放 {{ policyWindowLabel }}</text>
            </view>
        </view>

        <view v-if="state !== 'ready'" class="availability-state">
            <async-state
                :action-label="state === 'error' ? '重新加载' : ''"
                :description="errorMessage || '正在读取当前可预约时间。'"
                :kind="state === 'error' ? 'network' : 'default'"
                :state="state"
                :title="state === 'error' ? '时间设置加载失败' : ''"
                @action="loadData(true)"
            />
        </view>

        <template v-else>
            <view class="availability-section">
                <view class="availability-section__heading">
                    <view>
                        <text class="availability-section__title">每周可预约时间</text>
                        <text class="availability-section__subtitle">未自定义时使用机构默认开放时段</text>
                    </view>
                    <view class="availability-mode">
                        <view class="availability-mode__item" :class="{ 'availability-mode__item--active': mode === 'default' }" @tap="setMode('default')">默认</view>
                        <view class="availability-mode__item" :class="{ 'availability-mode__item--active': mode === 'custom' }" @tap="setMode('custom')">自定义</view>
                    </view>
                </view>

                <view v-if="mode === 'default'" class="availability-default">
                    <app-icon name="booking-confirm" size="xl" />
                    <view>
                        <text class="availability-default__title">使用机构开放时间</text>
                        <text class="availability-default__meta">每天 {{ policyWindowLabel }}，已有课程会自动排除。</text>
                    </view>
                </view>

                <view v-else class="availability-rules">
                    <view v-for="(rule, index) in rules" :key="rule.localId" class="availability-rule">
                        <picker mode="selector" :range="weekdays" :value="rule.weekday - 1" @change="updateWeekday(index, $event)">
                            <view class="availability-rule__control">{{ weekdayName(rule.weekday) }}</view>
                        </picker>
                        <picker mode="time" :value="minutesToTime(rule.startMinute)" @change="updateRuleTime(index, 'startMinute', $event)">
                            <view class="availability-rule__control">{{ minutesToTime(rule.startMinute) }}</view>
                        </picker>
                        <text class="availability-rule__dash">至</text>
                        <picker mode="time" :value="minutesToTime(rule.endMinute)" @change="updateRuleTime(index, 'endMinute', $event)">
                            <view class="availability-rule__control">{{ minutesToTime(rule.endMinute) }}</view>
                        </picker>
                        <view class="availability-rule__remove" aria-label="移除时段" @tap="removeRule(index)">×</view>
                    </view>
                    <view class="availability-add" @tap="addRule">添加每周时段</view>
                </view>

                <view class="availability-save" :class="{ 'availability-save--disabled': saving }" @tap="saveWeekly">
                    {{ saving ? '正在保存' : '保存每周时间' }}
                </view>
            </view>

            <view class="availability-section">
                <view class="availability-section__heading">
                    <view>
                        <text class="availability-section__title">临时调整</text>
                        <text class="availability-section__subtitle">为特定日期临时开放或关闭一段时间</text>
                    </view>
                    <view class="availability-add-small" @tap="openOverride">新增</view>
                </view>
                <view v-if="availability.overrides.length" class="availability-overrides">
                    <view v-for="item in availability.overrides" :key="item.id" class="availability-override">
                        <view class="availability-override__icon">
                            <app-icon :name="item.type === 'available' ? 'booking-confirm' : 'booking-decline'" size="xl" />
                        </view>
                        <view class="availability-override__copy">
                            <text class="availability-override__title">{{ item.type === 'available' ? '临时开放' : '临时关闭' }}</text>
                            <text class="availability-override__meta">{{ formatAppointmentTime(item.startAt, item.endAt) }}</text>
                            <text v-if="item.reason" class="availability-override__reason">{{ item.reason }}</text>
                        </view>
                        <view class="availability-override__cancel" @tap="cancelOverride(item)">撤销</view>
                    </view>
                </view>
                <view v-else class="availability-default">
                    <app-icon name="booking-availability" size="xl" />
                    <view>
                        <text class="availability-default__title">暂无临时调整</text>
                        <text class="availability-default__meta">请假或临时加开时间时可在这里设置。</text>
                    </view>
                </view>
            </view>
        </template>

        <nut-popup position="bottom" :visible="showOverride" class="availability-popup-shell" @close="showOverride = false">
            <view class="availability-popup">
                <view class="availability-popup__bar" />
                <text class="availability-popup__title">新增临时调整</text>
                <view class="availability-popup__segment">
                    <view :class="{ active: overrideForm.type === 'unavailable' }" @tap="overrideForm.type = 'unavailable'">临时关闭</view>
                    <view :class="{ active: overrideForm.type === 'available' }" @tap="overrideForm.type = 'available'">临时开放</view>
                </view>
                <view class="availability-popup__field">
                    <text>日期</text>
                    <picker mode="date" :start="today" :value="overrideForm.date" @change="overrideForm.date = $event.detail.value">
                        <view>{{ overrideForm.date }}</view>
                    </picker>
                </view>
                <view class="availability-popup__field">
                    <text>开始</text>
                    <picker mode="time" :value="overrideForm.startTime" @change="overrideForm.startTime = $event.detail.value">
                        <view>{{ overrideForm.startTime }}</view>
                    </picker>
                </view>
                <view class="availability-popup__field">
                    <text>结束</text>
                    <picker mode="time" :value="overrideForm.endTime" @change="overrideForm.endTime = $event.detail.value">
                        <view>{{ overrideForm.endTime }}</view>
                    </picker>
                </view>
                <input v-model="overrideForm.reason" class="availability-popup__input" maxlength="120" placeholder="原因（选填）" />
                <view class="availability-popup__submit" :class="{ disabled: overrideSaving }" @tap="submitOverride">
                    {{ overrideSaving ? '正在保存' : '保存临时调整' }}
                </view>
            </view>
        </nut-popup>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import { academyDateKey } from '../../../utils/academyTime';
import { withCommandKey } from '../../../utils/commandKeys';
import AppIcon from '../../components/AppIcon.vue';
import AsyncState from '../../components/AsyncState.vue';
import PageChrome from '../../components/PageChrome.vue';
import {
    bookingErrorMessage, buildAvailabilityOverride, createOverrideDraft,
    formatAppointmentTime, minutesToTime, normalizeAvailability, timeToMinutes,
    validateAvailabilityRules, weekdayName,
} from '../appointments/pageLogic';
import './index.scss';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export default {
    components: { AppIcon, AsyncState, PageChrome },
    data() {
        return {
            availability: normalizeAvailability(), errorMessage: '', loading: false, mode: 'default',
            offeringId: '', overrideCancellingId: '', overrideForm: createOverrideDraft(),
            overrideSaving: false, rules: [], saving: false, showOverride: false, weekdays: WEEKDAYS,
        };
    },
    computed: {
        state() {
            if (this.loading) return 'loading';
            if (this.errorMessage) return 'error';
            return this.offeringId ? 'ready' : 'error';
        },
        policyWindowLabel() {
            const windows = this.availability.policy.defaultWindows;
            return windows.length
                ? windows.map((window) => `${minutesToTime(window.startMinute)}-${minutesToTime(window.endMinute)}`).join(' · ')
                : '09:00-11:00 · 14:00-19:00';
        },
        today() { return academyDateKey(Date.now()); },
    },
    onLoad() { this.offeringId = Taro.getCurrentInstance()?.router?.params?.offeringId || ''; },
    onShow() { this.loadData(); },
    async onPullDownRefresh() {
        try { await this.loadData(true); } finally { Taro.stopPullDownRefresh(); }
    },
    methods: {
        formatAppointmentTime, minutesToTime, weekdayName,
        setMode(mode) {
            this.mode = mode;
            if (mode === 'custom' && !this.rules.length) this.addRule();
        },
        addRule() {
            this.rules.push({ localId: `rule-${Date.now()}-${this.rules.length}`, weekday: 1, startMinute: 540, endMinute: 660 });
        },
        removeRule(index) { this.rules.splice(index, 1); },
        updateWeekday(index, event) { this.rules[index].weekday = Number(event.detail.value) + 1; },
        updateRuleTime(index, field, event) {
            const minute = timeToMinutes(event.detail.value);
            if (minute !== null) this.rules[index][field] = minute;
        },
        openOverride() {
            this.overrideForm = createOverrideDraft();
            this.showOverride = true;
        },
        async loadData(force = false) {
            if (this.loading && !force) return;
            if (!this.offeringId) {
                this.errorMessage = '缺少课程预约配置';
                return;
            }
            this.loading = true;
            this.errorMessage = '';
            try {
                this.availability = normalizeAvailability(await Api.getTeacherAvailability(this.offeringId));
                this.rules = this.availability.rules.map((rule, index) => ({ ...rule, localId: rule.id || `rule-${index}` }));
                this.mode = this.rules.length ? 'custom' : 'default';
            } catch (error) {
                this.errorMessage = bookingErrorMessage(error, '可预约时间暂时无法加载');
            } finally { this.loading = false; }
        },
        async saveWeekly() {
            if (this.saving) return;
            const rules = this.mode === 'default' ? [] : this.rules.map(({ weekday, startMinute, endMinute }) => ({
                weekday, startMinute, endMinute,
            }));
            const validationError = this.mode === 'custom'
                ? validateAvailabilityRules(rules, this.availability.policy.defaultWindows)
                : '';
            if (validationError) {
                Taro.showToast({ title: validationError, icon: 'none' });
                return;
            }
            this.saving = true;
            try {
                await withCommandKey(`save-availability:${this.offeringId}`,
                    (key) => Api.saveTeacherAvailability(this.offeringId, { mode: this.mode, rules }, key));
                Taro.showToast({ title: '可预约时间已保存', icon: 'success' });
                await this.loadData(true);
            } catch (error) {
                Taro.showToast({ title: bookingErrorMessage(error, '保存失败'), icon: 'none' });
            } finally { this.saving = false; }
        },
        async submitOverride() {
            if (this.overrideSaving) return;
            const result = buildAvailabilityOverride(
                this.overrideForm, this.availability.policy.defaultWindows
            );
            if (result.error) {
                Taro.showToast({ title: result.error, icon: 'none' });
                return;
            }
            this.overrideSaving = true;
            try {
                const { payload } = result;
                await withCommandKey(`availability-override:${this.offeringId}:${payload.startAt}:${payload.endAt}`,
                    (key) => Api.createTeacherAvailabilityOverride(this.offeringId, payload, key));
                this.showOverride = false;
                Taro.showToast({ title: '临时调整已保存', icon: 'success' });
                await this.loadData(true);
            } catch (error) {
                Taro.showToast({ title: bookingErrorMessage(error, '保存失败'), icon: 'none' });
            } finally { this.overrideSaving = false; }
        },
        async cancelOverride(item) {
            if (this.overrideCancellingId) return;
            const modal = await Taro.showModal({
                title: '撤销临时调整',
                content: '撤销后将重新按照每周可预约时间计算该时段。',
            });
            if (!modal.confirm) return;
            this.overrideCancellingId = item.id;
            try {
                await withCommandKey(`cancel-availability-override:${item.id}`,
                    (key) => Api.cancelTeacherAvailabilityOverride(item.id, key));
                Taro.showToast({ title: '临时调整已撤销', icon: 'success' });
                await this.loadData(true);
            } catch (error) {
                Taro.showToast({ title: bookingErrorMessage(error, '撤销失败'), icon: 'none' });
            } finally { this.overrideCancellingId = ''; }
        },
    },
};

</script>
