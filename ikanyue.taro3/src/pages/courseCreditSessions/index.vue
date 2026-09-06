<template>
    <page-chrome class="course-credit-page" tone="immersive">
        <page-header
            eyebrow="LESSON ELIGIBILITY"
            subtitle="预约时只会占用所需课时；课程完成后才会记为已使用。"
            title="课程与预约"
        />
        <view class="course-credit-content">
            <view v-if="state !== 'ready'" class="course-credit-state">
                <async-state
                    :action-label="state === 'error' ? '重新加载' : ''"
                    :description="state === 'error' ? errorMessage : '加入班级并排课后，课次会显示在这里。'"
                    :kind="state === 'error' ? 'network' : 'activities'"
                    :state="state"
                    :title="state === 'empty' ? '暂无关联课次' : ''"
                    @action="refresh"
                />
            </view>
            <template v-else>
                <view class="course-credit-note course-credit-session-note">可用课时不足时不会扣减；可以兑换时，会先展示兑换结果并由你确认。</view>
                <view class="course-credit-list">
                    <course-credit-session-row
                        v-for="record in items"
                        :key="record.sessionStudentId"
                        :record="record"
                        @action="handleSessionAction"
                    />
                </view>
                <pagination-state
                    :has-more="hasMore"
                    :loaded="items.length"
                    :loading="loadingMore"
                    :total="pagination.totalItems"
                />
            </template>
        </view>

        <nut-popup position="bottom" :visible="Boolean(preview)" @close="closeConsent" @click-overlay="closeConsent">
            <view v-if="preview" class="course-credit-popup">
                <text class="course-credit-popup__eyebrow">CURRENT CONSENT</text>
                <text class="course-credit-popup__title">兑换后预约本次课程</text>
                <text class="course-credit-popup__description">
                    {{ activeSession.session?.title }}需要 {{ activeSession.requiredQuantity }} 课时。
                </text>
                <view class="course-credit-facts course-credit-consent-facts">
                    <view v-for="fact in facts" :key="fact.label" class="course-credit-fact">
                        <text class="course-credit-fact__label">{{ fact.label }}</text>
                        <text class="course-credit-fact__value">{{ fact.value }}</text>
                    </view>
                </view>
                <view class="course-credit-popup__actions">
                    <view class="course-credit-secondary-button" @tap="closeConsent">暂不兑换</view>
                    <view
                        class="course-credit-primary-button"
                        :class="{ 'course-credit-primary-button--disabled': submitting }"
                        @tap="confirmConsentAndReserve"
                    >{{ submitting ? '正在预约' : '同意并预约' }}</view>
                </view>
            </view>
        </nut-popup>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import { Api } from '../../../utils/apis';
import AsyncState from '../../components/AsyncState.vue';
import CourseCreditSessionRow from '../../components/CourseCreditSessionRow.vue';
import PageChrome from '../../components/PageChrome.vue';
import PageHeader from '../../components/PageHeader.vue';
import PaginationState from '../../components/PaginationState.vue';
import {
    buildAuthorizationPayload, courseCreditErrorMessage, createIdempotencyKey,
    findConversionRule, hasNextPage, mergePage, normalizePage, pageState, previewFacts,
} from '../courseCredits/pageLogic';
import './index.scss';

export default {
    components: { AsyncState, CourseCreditSessionRow, PageChrome, PageHeader, PaginationState },
    data() {
        return {
            activeSession: {}, errorMessage: '', items: [], loading: false,
            loadingMore: false, pagination: normalizePage(), preview: null, rules: [],
            submitting: false, workingSessionId: '',
        };
    },
    computed: {
        facts() { return previewFacts(this.preview || {}); },
        hasMore() { return hasNextPage(this.pagination); },
        state() { return pageState({ error: this.errorMessage, items: this.items, loading: this.loading }); },
    },
    mounted() { this.refresh(); },
    async onPullDownRefresh() { try { await this.refresh(); } finally { Taro.stopPullDownRefresh(); } },
    onReachBottom() { this.loadMore(); },
    methods: {
        async refresh() {
            this.loading = true;
            this.errorMessage = '';
            try {
                const [sessions, rules] = await Promise.all([
                    Api.listCourseCreditSessions({ page: 1, perPage: 20 }),
                    Api.listCourseCreditConversionRules(),
                ]);
                this.pagination = normalizePage(sessions);
                this.items = this.pagination.items;
                this.rules = Array.isArray(rules) ? rules : [];
            } catch (error) { this.errorMessage = courseCreditErrorMessage(error, '课次状态暂时无法加载'); }
            finally { this.loading = false; }
        },
        async loadMore() {
            if (!this.hasMore || this.loadingMore) return;
            this.loadingMore = true;
            try {
                const page = normalizePage(await Api.listCourseCreditSessions({
                    page: this.pagination.page + 1, perPage: 20,
                }));
                this.items = mergePage(this.items, page.items, 'sessionStudentId');
                this.pagination = page;
            } catch (error) { Taro.showToast({ title: courseCreditErrorMessage(error), icon: 'none' }); }
            finally { this.loadingMore = false; }
        },
        async handleSessionAction(record) {
            if (this.workingSessionId) return;
            this.workingSessionId = record.sessionStudentId;
            try {
                const result = await Api.reserveCourseCredit(
                    record.sessionStudentId, {}, createIdempotencyKey('reserve')
                );
                if (result.creditStatus === 'conversion_required') {
                    await this.openConsent(record, result.conversion || {});
                    return;
                }
                if (result.creditStatus !== 'reserved') {
                    throw Object.assign(new Error('当前可用课时不足，请先兑换或联系老师'), { errorCode: 'CREDIT_INSUFFICIENT' });
                }
                Taro.showToast({ title: '预约成功，课时已占用', icon: 'success' });
                await this.refresh();
            } catch (error) { Taro.showToast({ title: courseCreditErrorMessage(error, '预约失败'), icon: 'none' }); }
            finally { this.workingSessionId = ''; }
        },
        async openConsent(record, conversion) {
            const rule = findConversionRule(this.rules, conversion, record);
            if (!rule) throw new Error('没有可用的课时兑换方式');
            const preview = await Api.previewCourseCreditConversion({
                ruleId: rule.id,
                sourceQuantity: Number(conversion.sourceQuantity || rule.minSourceQuantity || rule.sourceQuantity),
            });
            this.activeSession = record;
            this.preview = preview;
        },
        closeConsent() {
            if (this.submitting) return;
            this.preview = null;
            this.activeSession = {};
        },
        async confirmConsentAndReserve() {
            if (!this.preview || this.submitting) return;
            this.submitting = true;
            try {
                const authorization = await Api.authorizeCourseCreditConversion(
                    buildAuthorizationPayload(this.preview, this.activeSession),
                    createIdempotencyKey('authorize-conversion')
                );
                const result = await Api.reserveCourseCredit(
                    this.activeSession.sessionStudentId,
                    { authorizationId: authorization.authorizationId },
                    createIdempotencyKey('reserve-with-conversion')
                );
                if (result.creditStatus !== 'reserved') throw new Error('兑换后仍未完成预约');
                this.preview = null;
                this.activeSession = {};
                await this.refresh();
                Taro.showToast({ title: '兑换并预约成功', icon: 'success' });
            } catch (error) { Taro.showToast({ title: courseCreditErrorMessage(error, '兑换预约失败'), icon: 'none' }); }
            finally { this.submitting = false; }
        },
    },
};
</script>
