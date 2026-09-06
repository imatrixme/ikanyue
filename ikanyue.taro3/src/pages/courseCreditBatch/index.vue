<template>
    <page-chrome class="course-credit-page" tone="immersive">
        <page-header eyebrow="CREDIT SOURCE" :subtitle="batchStatusLabel(batch.status)" :title="creditName">
            <view v-if="batch.id" class="course-credit-batch-hero">
                <text class="course-credit-batch-hero__number">{{ batch.availableQuantity }}</text>
                <text class="course-credit-batch-hero__caption">当前可用课时</text>
            </view>
        </page-header>
        <view class="course-credit-content">
            <view v-if="state !== 'ready'" class="course-credit-state">
                <async-state
                    :action-label="state === 'error' ? '重新加载' : ''"
                    :description="state === 'error' ? errorMessage : '未找到这笔课时来源。'"
                    :kind="state === 'error' ? 'network' : 'points'"
                    :state="state"
                    :title="state === 'empty' ? '课时来源不存在' : ''"
                    @action="loadBatch"
                />
            </view>
            <template v-else>
                <ticket-section subtitle="查看这笔课时目前如何分配" title="课时状态">
                    <view class="course-credit-facts">
                        <view class="course-credit-fact"><text class="course-credit-fact__label">获得课时</text><text class="course-credit-fact__value">{{ batch.originalQuantity }} 课时</text></view>
                        <view class="course-credit-fact"><text class="course-credit-fact__label">未来课程占用</text><text class="course-credit-fact__value">{{ batch.frozenQuantity }} 课时</text></view>
                        <view class="course-credit-fact"><text class="course-credit-fact__label">已经使用</text><text class="course-credit-fact__value">{{ batch.consumedQuantity }} 课时</text></view>
                        <view class="course-credit-fact"><text class="course-credit-fact__label">已经过期</text><text class="course-credit-fact__value">{{ batch.expiredQuantity }} 课时</text></view>
                        <view class="course-credit-fact"><text class="course-credit-fact__label">已经更正</text><text class="course-credit-fact__value">{{ batch.reversedQuantity }} 课时</text></view>
                    </view>
                </ticket-section>
                <ticket-section subtitle="生效后按有效期优先使用" title="生效与有效期">
                    <view class="course-credit-facts">
                        <view class="course-credit-fact"><text class="course-credit-fact__label">何时生效</text><text class="course-credit-fact__value">{{ activationModeLabel(batch.activationMode) }}</text></view>
                        <view class="course-credit-fact"><text class="course-credit-fact__label">生效时间</text><text class="course-credit-fact__value">{{ batch.activatedAt ? formatDate(batch.activatedAt) : '尚未生效' }}</text></view>
                        <view class="course-credit-fact"><text class="course-credit-fact__label">最晚生效日期</text><text class="course-credit-fact__value">{{ batch.activationDeadline ? formatDate(batch.activationDeadline) : '无截止日期' }}</text></view>
                        <view class="course-credit-fact"><text class="course-credit-fact__label">当前有效期</text><text class="course-credit-fact__value">{{ formatDate(batch.effectiveExpiresAt) }}</text></view>
                        <view class="course-credit-fact"><text class="course-credit-fact__label">原始有效期</text><text class="course-credit-fact__value">{{ formatDate(batch.originalExpiresAt) }}</text></view>
                    </view>
                    <view class="course-credit-note course-credit-batch-note">{{ batchRestrictionText(batch) }}</view>
                </ticket-section>
                <view class="course-credit-note course-credit-batch-note" @tap="showTrace = !showTrace">{{ showTrace ? '收起技术信息' : '查看技术信息' }}</view>
                <ticket-section v-if="showTrace" subtitle="用于客服核对到账和补偿记录" title="技术信息">
                    <view class="course-credit-facts">
                        <view class="course-credit-fact"><text class="course-credit-fact__label">课时来源编号</text><text class="course-credit-fact__value">{{ batch.id }}</text></view>
                        <view class="course-credit-fact"><text class="course-credit-fact__label">来源操作</text><text class="course-credit-fact__value">{{ batch.sourceOperationId || '无' }}</text></view>
                        <view class="course-credit-fact"><text class="course-credit-fact__label">补偿来源</text><text class="course-credit-fact__value">{{ batch.compensationSourceBatchId || '无' }}</text></view>
                    </view>
                </ticket-section>
            </template>
        </view>
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
    activationModeLabel, batchRestrictionText, batchStatusLabel,
    courseCreditErrorMessage, formatDate, normalizeCreditType, pageState,
} from '../courseCredits/pageLogic';
import './index.scss';

export default {
    components: { AsyncState, PageChrome, PageHeader, TicketSection },
    data() { return { batch: {}, batchId: '', errorMessage: '', loading: false, showTrace: false }; },
    computed: {
        creditName() { return normalizeCreditType(this.batch.creditType).name; },
        state() { return pageState({ error: this.errorMessage, items: this.batch.id ? [this.batch] : [], loading: this.loading }); },
    },
    mounted() {
        this.batchId = Taro.getCurrentInstance()?.router?.params?.id || '';
        this.loadBatch();
    },
    async onPullDownRefresh() {
        try { await this.loadBatch(); } finally { Taro.stopPullDownRefresh(); }
    },
    methods: {
        activationModeLabel, batchRestrictionText, batchStatusLabel, formatDate,
        async loadBatch() {
            if (!this.batchId) return;
            this.loading = true;
            this.errorMessage = '';
            try { this.batch = await Api.getCourseCreditBatch(this.batchId); }
            catch (error) { this.errorMessage = courseCreditErrorMessage(error, '课时来源暂时无法加载'); }
            finally { this.loading = false; }
        },
    },
};
</script>
