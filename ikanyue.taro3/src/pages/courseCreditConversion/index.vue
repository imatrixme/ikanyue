<template>
    <page-chrome class="course-credit-page" tone="immersive">
        <page-header
            eyebrow="CONVERSION DESK"
            subtitle="兑换前会显示数量、激活方式、有效期和是否可撤回。"
            title="课程点兑换"
        />
        <view class="course-credit-content">
            <view v-if="state !== 'ready'" class="course-credit-state">
                <async-state
                    :action-label="state === 'error' ? '重新加载' : ''"
                    :description="state === 'error' ? errorMessage : '当前没有可使用的课程点兑换规则。'"
                    :kind="state === 'error' ? 'network' : 'points'"
                    :state="state"
                    :title="state === 'empty' ? '暂无兑换规则' : ''"
                    @action="loadData"
                />
            </view>
            <template v-else>
                <view class="course-credit-note">不同课程点价值不同，兑换只按当前发布规则进行，不能直接混用。</view>
                <ticket-section subtitle="输入兑换份数后先查看权威预览" title="可用规则">
                    <view v-for="rule in rules" :key="rule.id" class="conversion-rule">
                        <view class="conversion-rule__header">
                            <text class="conversion-rule__title">{{ conversionRuleText(rule) }}</text>
                            <text class="conversion-rule__version">V{{ rule.version }}</text>
                        </view>
                        <text class="conversion-rule__meta">{{ expiryPolicyLabel(rule.expiryPolicy) }} · {{ activationModeLabel(rule.activationMode) }}</text>
                        <view class="conversion-rule__controls">
                            <text class="conversion-rule__balance">当前 {{ sourceBalance(rule) }} 点</text>
                            <input
                                class="conversion-rule__input"
                                type="number"
                                :value="stepsByRule[rule.id] || 1"
                                @input="setSteps(rule.id, $event)"
                            />
                            <view class="conversion-rule__preview" @tap="previewRule(rule)">预览</view>
                        </view>
                    </view>
                </ticket-section>
            </template>
        </view>

        <nut-popup position="bottom" :visible="Boolean(preview)" @close="closePreview" @click-overlay="closePreview">
            <view v-if="preview" class="course-credit-popup">
                <text class="course-credit-popup__eyebrow">AUTHORITATIVE PREVIEW</text>
                <text class="course-credit-popup__title">确认兑换课程点</text>
                <text class="course-credit-popup__description">{{ conversionRuleText(activeRule) }}</text>
                <view class="course-credit-facts conversion-preview-facts">
                    <view v-for="fact in facts" :key="fact.label" class="course-credit-fact">
                        <text class="course-credit-fact__label">{{ fact.label }}</text>
                        <text class="course-credit-fact__value">{{ fact.value }}</text>
                    </view>
                </view>
                <view class="course-credit-popup__actions">
                    <view class="course-credit-secondary-button" @tap="closePreview">取消</view>
                    <view
                        class="course-credit-primary-button"
                        :class="{ 'course-credit-primary-button--disabled': submitting }"
                        @tap="confirmConversion"
                    >{{ submitting ? '正在兑换' : '确认兑换' }}</view>
                </view>
            </view>
        </nut-popup>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import AsyncState from '../../components/AsyncState.vue';
import PageChrome from '../../components/PageChrome.vue';
import PageHeader from '../../components/PageHeader.vue';
import TicketSection from '../../components/TicketSection.vue';
import {
    activationModeLabel, conversionRuleText, courseCreditErrorMessage, createIdempotencyKey,
    expiryPolicyLabel, normalizeSummary, pageState, previewFacts, sourceQuantityForSteps,
} from '../courseCredits/pageLogic';
import './index.scss';

export default {
    components: { AsyncState, PageChrome, PageHeader, TicketSection },
    data() {
        return {
            activeRule: {}, errorMessage: '', loading: false, preview: null,
            rules: [], stepsByRule: {}, submitting: false, summary: normalizeSummary(),
        };
    },
    computed: {
        facts() { return previewFacts(this.preview || {}); },
        state() { return pageState({ error: this.errorMessage, items: this.rules, loading: this.loading }); },
    },
    mounted() { this.loadData(); },
    async onPullDownRefresh() { try { await this.loadData(); } finally { Taro.stopPullDownRefresh(); } },
    methods: {
        activationModeLabel, conversionRuleText, expiryPolicyLabel,
        sourceBalance(rule) {
            const item = this.summary.items.find((entry) => entry.creditType.id === rule.sourceCreditType?.id);
            return item ? item.availableQuantity + item.unactivatedQuantity : 0;
        },
        setSteps(ruleId, event) {
            const value = Math.max(1, Math.floor(Number(event?.detail?.value) || 1));
            this.stepsByRule = { ...this.stepsByRule, [ruleId]: value };
        },
        async loadData() {
            this.loading = true;
            this.errorMessage = '';
            try {
                const [rules, summary] = await Promise.all([
                    Api.listCourseCreditConversionRules(), Api.getCourseCreditSummary(),
                ]);
                this.rules = Array.isArray(rules) ? rules : [];
                this.summary = normalizeSummary(summary);
            } catch (error) { this.errorMessage = courseCreditErrorMessage(error, '兑换规则暂时无法加载'); }
            finally { this.loading = false; }
        },
        async previewRule(rule) {
            this.activeRule = rule;
            try {
                this.preview = await Api.previewCourseCreditConversion({
                    ruleId: rule.id,
                    sourceQuantity: sourceQuantityForSteps(rule, this.stepsByRule[rule.id] || 1),
                });
            } catch (error) { Taro.showToast({ title: courseCreditErrorMessage(error, '无法生成兑换预览'), icon: 'none' }); }
        },
        closePreview() { if (!this.submitting) { this.preview = null; this.activeRule = {}; } },
        async confirmConversion() {
            if (!this.preview || this.submitting) return;
            this.submitting = true;
            try {
                await Api.convertCourseCredits({
                    previewAt: this.preview.previewAt,
                    previewHash: this.preview.previewHash,
                    ruleId: this.preview.rule.id,
                    sourceQuantity: this.preview.sourceQuantity,
                }, createIdempotencyKey('convert'));
                this.preview = null;
                this.activeRule = {};
                await this.loadData();
                Taro.showToast({ title: '兑换成功', icon: 'success' });
            } catch (error) { Taro.showToast({ title: courseCreditErrorMessage(error, '兑换失败'), icon: 'none' }); }
            finally { this.submitting = false; }
        },
    },
};
</script>
