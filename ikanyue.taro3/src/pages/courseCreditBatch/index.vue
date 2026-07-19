<template>
    <page-chrome class="course-credit-page" tone="immersive">
        <page-header eyebrow="BATCH DETAIL" :subtitle="batchStatusLabel(batch.status)" :title="batch.creditType?.name || '课程点批次'">
            <view v-if="batch.id" class="course-credit-batch-hero">
                <text class="course-credit-batch-hero__number">{{ batch.availableQuantity }}</text>
                <text class="course-credit-batch-hero__caption">当前可用课程点</text>
            </view>
        </page-header>
        <view class="course-credit-content">
            <view v-if="state !== 'ready'" class="course-credit-state">
                <async-state
                    :action-label="state === 'error' ? '重新加载' : ''"
                    :description="state === 'error' ? errorMessage : '未找到该课程点批次。'"
                    :kind="state === 'error' ? 'network' : 'points'"
                    :state="state"
                    :title="state === 'empty' ? '批次不存在' : ''"
                    @action="loadBatch"
                />
            </view>
            <template v-else>
                <ticket-section subtitle="数量始终在批次内守恒" title="数量状态">
                    <view class="course-credit-facts">
                        <view class="course-credit-fact"><text class="course-credit-fact__label">原始数量</text><text class="course-credit-fact__value">{{ batch.originalQuantity }} 点</text></view>
                        <view class="course-credit-fact"><text class="course-credit-fact__label">预约冻结</text><text class="course-credit-fact__value">{{ batch.frozenQuantity }} 点</text></view>
                        <view class="course-credit-fact"><text class="course-credit-fact__label">已使用</text><text class="course-credit-fact__value">{{ batch.consumedQuantity }} 点</text></view>
                        <view class="course-credit-fact"><text class="course-credit-fact__label">已过期</text><text class="course-credit-fact__value">{{ batch.expiredQuantity }} 点</text></view>
                        <view class="course-credit-fact"><text class="course-credit-fact__label">已冲正</text><text class="course-credit-fact__value">{{ batch.reversedQuantity }} 点</text></view>
                    </view>
                </ticket-section>
                <ticket-section subtitle="激活后按有效期规则使用" title="激活与有效期">
                    <view class="course-credit-facts">
                        <view class="course-credit-fact"><text class="course-credit-fact__label">激活方式</text><text class="course-credit-fact__value">{{ activationModeLabel(batch.activationMode) }}</text></view>
                        <view class="course-credit-fact"><text class="course-credit-fact__label">激活时间</text><text class="course-credit-fact__value">{{ batch.activatedAt ? formatDate(batch.activatedAt) : '尚未激活' }}</text></view>
                        <view class="course-credit-fact"><text class="course-credit-fact__label">激活截止</text><text class="course-credit-fact__value">{{ batch.activationDeadline ? formatDate(batch.activationDeadline) : '无截止日期' }}</text></view>
                        <view class="course-credit-fact"><text class="course-credit-fact__label">当前有效期</text><text class="course-credit-fact__value">{{ formatDate(batch.effectiveExpiresAt) }}</text></view>
                        <view class="course-credit-fact"><text class="course-credit-fact__label">原始有效期</text><text class="course-credit-fact__value">{{ formatDate(batch.originalExpiresAt) }}</text></view>
                    </view>
                    <view class="course-credit-note course-credit-batch-note">{{ batchRestrictionText(batch) }}</view>
                </ticket-section>
                <ticket-section subtitle="用于核对发放和补偿来源" title="追溯信息">
                    <view class="course-credit-facts">
                        <view class="course-credit-fact"><text class="course-credit-fact__label">批次编号</text><text class="course-credit-fact__value">{{ batch.id }}</text></view>
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
    courseCreditErrorMessage, formatDate, pageState,
} from '../courseCredits/pageLogic';
import './index.scss';

export default {
    components: { AsyncState, PageChrome, PageHeader, TicketSection },
    data() { return { batch: {}, batchId: '', errorMessage: '', loading: false }; },
    computed: { state() { return pageState({ error: this.errorMessage, items: this.batch.id ? [this.batch] : [], loading: this.loading }); } },
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
            catch (error) { this.errorMessage = courseCreditErrorMessage(error, '批次详情暂时无法加载'); }
            finally { this.loading = false; }
        },
    },
};
</script>
